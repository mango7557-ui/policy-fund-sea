import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Answers,
  DOCUMENT_VERSION,
  ensureEndsWithFollowUpQuestion,
  extractAnswersFromText,
  formatHumanFollowUpQuestion,
  freeDiagnosis,
  nextQuestion,
  POLICY_REFERENCES,
  PREFERENCE_REFERENCES,
  referenceReply,
  searchQuestions,
  summarizeKnownFacts,
} from "../../../engines/document-advisor";
import { containsForbiddenCompliancePhrase } from "../../../engines/diagnostic-engine";
import {
  buildEvolutionPromptContext,
  evolveFromUserMessage,
  INITIAL_EVOLUTION_STATE,
  JeongchaegiEvolutionState,
} from "../../../engines/self-learning";

const LEARNED_MEMORY_FILE = path.join(
  process.cwd(),
  "src",
  "data",
  "learned-memory.json"
);

function loadServerEvolutionState(): JeongchaegiEvolutionState {
  try {
    if (fs.existsSync(LEARNED_MEMORY_FILE)) {
      return JSON.parse(fs.readFileSync(LEARNED_MEMORY_FILE, "utf8"));
    }
  } catch {
    // Ignore read error
  }
  return INITIAL_EVOLUTION_STATE;
}

function saveServerEvolutionState(state: JeongchaegiEvolutionState): void {
  try {
    fs.mkdirSync(path.dirname(LEARNED_MEMORY_FILE), { recursive: true });
    fs.writeFileSync(
      LEARNED_MEMORY_FILE,
      JSON.stringify(state, null, 2),
      "utf8"
    );
  } catch {
    // Ignore write error in read-only environments
  }
}

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-goog-api-key",
  "Access-Control-Allow-Private-Network": "true",
};

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:latest";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function jsonWithCors(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: CORS_HEADERS });
}

async function checkOllamaStatus(): Promise<{
  available: boolean;
  model: string;
  models: string[];
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { available: false, model: OLLAMA_MODEL, models: [] };
    const data = await res.json();
    const names: string[] = Array.isArray(data?.models)
      ? data.models.map((m: { name?: string }) => String(m?.name ?? ""))
      : [];
    const preferred =
      names.find((n) => n.startsWith("gemma4")) ||
      names[0] ||
      OLLAMA_MODEL;
    return {
      available: names.length > 0,
      model: preferred,
      models: names,
    };
  } catch {
    return { available: false, model: OLLAMA_MODEL, models: [] };
  }
}

function resolveGeminiConfig(clientKey?: string): {
  apiKey: string | null;
  baseUrl: string;
  model: string;
} {
  if (clientKey && clientKey.trim().startsWith("AIza")) {
    return {
      apiKey: clientKey.trim(),
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-2.5-flash",
    };
  }

  const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

  if (process.env.GEMINI_API_KEY) {
    return {
      apiKey: process.env.GEMINI_API_KEY,
      baseUrl:
        process.env.GEMINI_BASE_URL ||
        "https://generativelanguage.googleapis.com/v1beta",
      model,
    };
  }

  let gskKey = process.env.GSK_API_KEY || null;
  let gskBase = "https://www.genspark.ai";

  if (!gskKey) {
    try {
      const cfgPath =
        process.env.GSK_CONFIG ||
        path.join(os.homedir(), ".genspark-tool-cli", "config.json");
      if (fs.existsSync(cfgPath)) {
        const parsed = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
        if (parsed.apiKey) gskKey = parsed.apiKey;
        if (parsed.baseUrl) gskBase = String(parsed.baseUrl).replace(/\/$/, "");
      }
    } catch {
      // Ignore config read error
    }
  }

  return {
    apiKey: gskKey,
    baseUrl:
      process.env.GEMINI_BASE_URL || `${gskBase}/api/llm_proxy/gemini/v1beta`,
    model,
  };
}

export async function GET() {
  const ollama = await checkOllamaStatus();
  const gemini = resolveGeminiConfig();
  return jsonWithCors({
    connected: ollama.available || Boolean(gemini.apiKey),
    provider: ollama.available ? "ollama" : gemini.apiKey ? "gemini" : "rule-fallback",
    model: ollama.available ? ollama.model : gemini.apiKey ? gemini.model : null,
    ollamaAvailable: ollama.available,
    ollamaModel: ollama.model,
    ollamaModels: ollama.models,
    geminiAvailable: Boolean(gemini.apiKey),
    geminiModel: gemini.model,
  });
}

function cleanHumanSpeech(text: string): string {
  let cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\*\*/g, "")
    .replace(/^#+\s+/gm, "")
    .trim();

  if (containsForbiddenCompliancePhrase(cleaned)) {
    cleaned = cleaned
      .replace(/\d+\s*%\s*승인/g, "심사 요건 충족 여부 검토")
      .replace(/승인\s*확률\s*\d+\s*%?/g, "사전 검토 가능성")
      .replace(/100\s*%\s*보장/g, "사전 검토 안내")
      .replace(/무조건\s*승인/g, "심사 기준에 따른 검토")
      .replace(/확정\s*승인/g, "기관 심사 후 결정");
  }
  return cleaned;
}

async function callOllamaChat(params: {
  model: string;
  systemInstruction: string;
  history: ChatTurn[];
  message: string;
}): Promise<string | null> {
  const { model, systemInstruction, history, message } = params;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        keep_alive: "30m",
        options: {
          temperature: 0.55,
          num_predict: 320,
        },
        messages: [
          { role: "system", content: systemInstruction },
          ...history.map((t) => ({
            role: t.role === "assistant" ? "assistant" : "user",
            content: String(t.text ?? "").slice(0, 1200),
          })),
          { role: "user", content: message.slice(0, 1500) },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    const content = String(data?.message?.content ?? "").trim();
    return content || null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function callGeminiChat(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemInstruction: string;
  history: ChatTurn[];
  message: string;
}): Promise<string | null> {
  const { apiKey, baseUrl, model, systemInstruction, history, message } = params;
  try {
    const contents = [
      ...history.map((turn) => ({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: String(turn.text ?? "").slice(0, 1200) }],
      })),
      {
        role: "user",
        parts: [{ text: message.slice(0, 1500) }],
      },
    ];

    const endpoint = `${baseUrl.replace(/\/$/, "")}/models/${model}:generateContent`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents,
        generationConfig: {
          temperature: 0.55,
          maxOutputTokens: 420,
        },
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const rawReply =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p?.text ?? "")
        .join("")
        .trim() || null;
    return rawReply;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = String(body?.message ?? "").trim();
    const history: ChatTurn[] = Array.isArray(body?.history)
      ? body.history.slice(-8)
      : [];
    const rawAnswers: Answers =
      body?.answers && typeof body.answers === "object" ? body.answers : {};
    // 대화 히스토리와 이번 메시지에서 파악된 기업 조건을 자동으로 누적 추출
    let answers: Answers = { ...rawAnswers };
    for (const h of history) {
      if (h.role === "user") {
        answers = extractAnswersFromText(answers, h.text);
      }
    }
    answers = extractAnswersFromText(answers, message);

    const clientApiKey =
      typeof body?.clientApiKey === "string" ? body.clientApiKey : undefined;
    const preferredEngine: "ollama" | "gemini" =
      body?.engine === "gemini" ? "gemini" : "ollama";

    if (!message) {
      return jsonWithCors({ error: "질문 내용을 입력해 주세요." }, 400);
    }

    // 정책이 자가학습·진화 업데이트
    const baseEvoState: JeongchaegiEvolutionState =
      body?.evolutionState && typeof body.evolutionState === "object"
        ? body.evolutionState
        : loadServerEvolutionState();
    const { nextState: evolvedState, newlyLearned } = evolveFromUserMessage(
      baseEvoState,
      message
    );
    saveServerEvolutionState(evolvedState);

    // 가벼운 인사말("안녕하세요", "반갑습니다", "계세요?" 등)은 진짜 사람처럼 한 말풍선으로 다정하게 인사 응답
    const compactMsg = message.replace(/[!?.~,\s]/g, "");
    const isCasualGreeting =
      /^(안녕하세요|안녕|반갑습니다|반가워요|여보세요|계세요|저기요|하이|선생님|상담사님|정책이님|정책아)$/.test(
        compactMsg
      );

    if (isCasualGreeting) {
      return jsonWithCors({
        text: `네, 안녕하세요 대표님! 반갑습니다 😊 무엇을 도와드릴까요? 요즘 사업하시면서 자금 쪽으로 어떤 고민이 있으신지 편하게 말씀해 주세요~`,
        source: preferredEngine === "ollama" ? `Ollama (${OLLAMA_MODEL})` : "Gemini",
        coreId: null,
        links: [],
        isGreeting: true,
        updatedAnswers: answers,
        evolutionState: evolvedState,
        newlyLearned,
        provider: preferredEngine,
      });
    }

    const fallback = referenceReply(message, answers);
    const hits = searchQuestions(message);
    const diag = freeDiagnosis(answers);
    const upcomingQ = nextQuestion(answers);
    const knownSummary = summarizeKnownFacts(answers);

    const matchedContext = hits
      .map(
        ({ core }) =>
          `- 관련 주제(${core.category}): "${core.question}" / 핵심 포인트: ${core.intent} / 다음에 물어볼 만한 질문: ${core.nextQuestion} / 관련기관: ${core.institutions}`
      )
      .join("\n");

    const ruleSummary = POLICY_REFERENCES.slice(0, 6)
      .map((r) => `- ${r.institution}(${r.subject}): ${r.criteria}`)
      .join("\n");

    const prefSummary = PREFERENCE_REFERENCES.slice(0, 6)
      .map((p) => `- ${p.name}: ${p.condition} (${p.caution})`)
      .join("\n");

    const isFirstTurn = history.length === 0;

    const systemInstruction = [
      "당신은 대표님의 마음을 누구보다 잘 헤아리는 따뜻하고 인간미 넘치는 10년 차 정책자금 상담사 '정책이'입니다.",
      "딱딱한 AI 챗봇이나 콜센터 상담원이 아니라, 오랜 단골 대표님과 차 한잔 마시며 카톡으로 다정하게 이야기 나누는 진짜 사람처럼 대화하세요.",
      "",
      "[인간적인 대화를 위한 핵심 규칙]",
      isFirstTurn
        ? "1. 처음 인사는 '아, 대표님 반갑습니다!'처럼 다정하게 시작하되, 회사 이름이나 직함을 대는 기계적인 자기소개는 절대 하지 마세요."
        : "1. 이미 대화가 진행 중이니 '안녕하세요', '정책이입니다' 같은 인사는 절대 반복하지 말고 바로 대표님 말씀에 따뜻하게 맞장구치세요.",
      "2. 너무 직선적이거나 사무적인 말투('~를 알려주세요', '~를 확인해야 합니다', '검토가 가능합니다') 대신, 사람 냄새 나는 부드러운 구어체('아, 그러셨군요!', '그 부분 때문에 마음고생 꽤 하셨겠어요', '~보시면 훨씬 수월하실 거예요', '혹시 ~는 어떠세요?')로 말씀하세요.",
      "3. 번호 매기기(1., 2.), 불릿 기호(-, •), 굵은 글씨(**)는 절대 쓰지 마세요.",
      "4. 문단을 2개로 쪼개지 말고, 하나의 자연스러운 말풍선(3~4문장) 안에서 대표님 상황에 먼저 진심으로 공감하고 핵심 조언을 쉽게 풀어드린 뒤, 마지막 문장에서 대화가 이어지도록 부드러운 질문을 하나 건네세요. ('아, 그러시군요!' 같은 추임새를 문장 중간에 중복해서 쓰지 마세요.)",
      "",
      buildEvolutionPromptContext(evolvedState),
      "",
      "[전문가로서 지켜야 할 사실 원칙]",
      "- '90% 승인', '무조건 승인', '확정 금액' 같은 단정 표현은 쓰지 마세요.",
      "- 다른 사업체를 더 운영하시더라도 그쪽 대출을 우리 회사 부채에 단순 합산하지 않고 기관별로 따로 본다고 안심시켜 드리세요.",
      "- 여성기업·특허·연구소 같은 우대는 확인서 유효기간과 신청할 공고의 인정 조건을 같이 봐야 실제 혜택이 적용된다고 설명하세요.",
      "- 세금 체납이나 연체가 있어도 분납·유예 승인을 받았거나 완납 예정이면 예외 검토가 가능하니 포기하지 않으셔도 된다고 따뜻하게 안내하세요.",
      "",
      `[지금까지 대화로 알게 된 대표님 이야기 (이미 들은 건 다시 묻지 마세요)]`,
      `- 파악된 내용: ${knownSummary}`,
      `- 현재 방향: ${diag.status} (${diag.direction})`,
      upcomingQ
        ? `- 대화 끝에 부드럽게 물어볼 다음 이야기 주제: "${upcomingQ.text}" (이 문장을 그대로 읽지 말고, 사람처럼 다정한 말투로 풀어서 물어보세요!)`
        : "- 기본 정보는 다 들었으니 대표님께 가장 잘 맞는 방향을 따뜻하게 정리해 드리고 더 궁금한 점이 있는지 여쭤보세요.",
      "",
      "[참고할 정책 지식]",
      matchedContext || "- 대표님 상황에 맞춰 업종·매출·자금 용도를 편하게 여쭤보세요.",
      ruleSummary,
      prefSummary,
    ].join("\n");

    // 1. Ollama (gemma4:latest) 우선 호출
    if (preferredEngine === "ollama") {
      const ollamaStatus = await checkOllamaStatus();
      if (ollamaStatus.available) {
        const ollamaReply = await callOllamaChat({
          model: ollamaStatus.model,
          systemInstruction,
          history,
          message,
        });
        if (ollamaReply) {
          const cleanReply = ensureEndsWithFollowUpQuestion(
            cleanHumanSpeech(ollamaReply),
            answers
          );
          return jsonWithCors({
            text: cleanReply,
            source: `Ollama (${ollamaStatus.model})`,
            coreId: fallback.coreId,
            links: fallback.references,
            updatedAnswers: answers,
            evolutionState: evolvedState,
            newlyLearned,
            provider: "ollama",
            model: ollamaStatus.model,
          });
        }
      }
    }

    // 2. Gemini 호출
    const gemini = resolveGeminiConfig(clientApiKey);
    if (gemini.apiKey) {
      const geminiReply = await callGeminiChat({
        apiKey: gemini.apiKey,
        baseUrl: gemini.baseUrl,
        model: gemini.model,
        systemInstruction,
        history,
        message,
      });
      if (geminiReply) {
        const cleanReply = ensureEndsWithFollowUpQuestion(
          cleanHumanSpeech(geminiReply),
          answers
        );
        return jsonWithCors({
          text: cleanReply,
          source: `Gemini (${gemini.model})`,
          coreId: fallback.coreId,
          links: fallback.references,
          updatedAnswers: answers,
          evolutionState: evolvedState,
          newlyLearned,
          provider: "gemini",
          model: gemini.model,
        });
      }
    }

    // 3. 백업으로 Ollama 재시도
    if (preferredEngine === "gemini") {
      const ollamaStatus = await checkOllamaStatus();
      if (ollamaStatus.available) {
        const ollamaReply = await callOllamaChat({
          model: ollamaStatus.model,
          systemInstruction,
          history,
          message,
        });
        if (ollamaReply) {
          const cleanReply = ensureEndsWithFollowUpQuestion(
            cleanHumanSpeech(ollamaReply),
            answers
          );
          return jsonWithCors({
            text: cleanReply,
            source: `Ollama (${ollamaStatus.model})`,
            coreId: fallback.coreId,
            links: fallback.references,
            updatedAnswers: answers,
            evolutionState: evolvedState,
            newlyLearned,
            provider: "ollama",
            model: ollamaStatus.model,
          });
        }
      }
    }

    return jsonWithCors({
      text: fallback.text,
      source: `정책이 상담 가이드 (${DOCUMENT_VERSION})`,
      coreId: fallback.coreId,
      links: fallback.references,
      updatedAnswers: answers,
      evolutionState: evolvedState,
      newlyLearned,
      provider: "rule-fallback",
    });
  } catch {
    const fallback = referenceReply("");
    return jsonWithCors({
      text: fallback.text,
      source: `정책이 상담 가이드`,
      coreId: null,
      links: [],
      provider: "rule-fallback",
    });
  }
}
