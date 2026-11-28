import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { matchTraining, parseTrainingStore, trainingPrompt, TrainingEntry } from "../../../engines/training";
import { readTraining } from "../../../server/training-store";
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
  conversationReply,
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
  return new NextResponse(null, { status: 204, headers: process.env.NODE_ENV === "development" ? CORS_HEADERS : {} });
}

function jsonWithCors(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: process.env.NODE_ENV === "development" ? CORS_HEADERS : {} });
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
    return {
      available: names.includes(OLLAMA_MODEL),
      model: OLLAMA_MODEL,
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

  if (!gskKey && (process.env.GSK_CONFIG || process.env.NODE_ENV === "development")) {
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
  stream?: boolean;
}): Promise<string | Response | null> {
  const { model, systemInstruction, history, message } = params;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 110000);

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: params.stream === true,
        think: false,
        keep_alive: "30m",
        options: {
          num_ctx: 4096,
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
    if (params.stream && res.body) return new Response(res.body, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no", "X-Chat-Model": model } });
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
          num_ctx: 4096,
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
  if (process.env.NODE_ENV === "production") {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin && origin !== `${req.nextUrl.protocol}//${req.headers.get("host")}`) {
      return NextResponse.json({ error: "사이트에서 상담을 시작해 주세요." }, { status: 403 });
    }
    if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return NextResponse.json({ error: "JSON 요청이 필요합니다." }, { status: 415 });
    }
  }
  try {
    const body = await req.json();
    const message = String(body?.message ?? "").trim();
    const history: ChatTurn[] = Array.isArray(body?.history)
      ? body.history.slice(-8)
      : [];
    const rawAnswers: Answers =
      body?.answers && typeof body.answers === "object" ? body.answers : {};
    // 대화 히스토리와 이번 메시지에서 파악된 기업 조건을 자동으로 누적 추출
    const answers = extractAnswersFromText(rawAnswers, message, history.at(-1)?.text);

    const clientApiKey =
      typeof body?.clientApiKey === "string" ? body.clientApiKey : undefined;
    const preferredEngine: "ollama" | "gemini" =
      body?.engine === "gemini" ? "gemini" : "ollama";

    if (!message) {
      return jsonWithCors({ error: "질문 내용을 입력해 주세요." }, 400);
    }

    if (body.mode === "interview") {
      const question = formatHumanFollowUpQuestion(rawAnswers);
      const lead = await callOllamaChat({
        model: OLLAMA_MODEL, history: history.slice(-3), message,
        systemInstruction: "한국어 자금 상담 중입니다. 사용자가 방금 알려준 사실을 일상적인 존댓말 한 문장으로만 받아 주세요. 질문이나 추천은 쓰지 마세요. 직전 질문을 다시 묻지 마세요. 확인된 상황: " + summarizeKnownFacts(rawAnswers),
      });
      const acknowledgement = typeof lead === "string" ? lead.trim().split(/[?？]/)[0].match(/^[^.!?？\n]+[.!](?:\s|$)/)?.[0].trim() : "";
      if (acknowledgement && acknowledgement.length <= 55) return jsonWithCors({ mode: "interview", provider: "ollama", model: OLLAMA_MODEL,
        source: "Ollama (" + OLLAMA_MODEL + ")", text: acknowledgement + " " + question });
      return jsonWithCors({ mode: "interview", provider: "rule-fallback" });
    }

    // Personal memory remains per browser; only authenticated published knowledge is shared.
    const baseEvoState: JeongchaegiEvolutionState =
      body?.evolutionState && typeof body.evolutionState === "object"
        ? body.evolutionState
        : INITIAL_EVOLUTION_STATE;
    const { nextState: evolvedState, newlyLearned } = body?.evolutionState
      ? { nextState: baseEvoState, newlyLearned: null }
      : evolveFromUserMessage(baseEvoState, message);
    let sessionTraining: TrainingEntry[] = [];
    try { sessionTraining = parseTrainingStore({ version: 1, revision: 0, entries: body?.trainingEntries ?? [] }).entries; } catch { /* Ignore malformed session knowledge. */ }
    let serverTraining: TrainingEntry[] = [];
    try { serverTraining = readTraining().entries; } catch { /* Keep base consultation available. */ }
    const training = [...new Map([...sessionTraining, ...serverTraining].map(e => [e.id, e])).values()].filter(e => e.status === "published");
    const learnedMatches = matchTraining(training, message);

    // 가벼운 인사말("안녕하세요", "반갑습니다", "계세요?" 등)은 진짜 사람처럼 한 말풍선으로 다정하게 인사 응답
    const compactMsg = message.replace(/[!?.~,\s]/g, "");
    const isCasualGreeting =
      /^(안녕하세요|안녕|반갑습니다|반가워요|여보세요|계세요|저기요|하이|선생님|상담사님|정책이님|정책아)$/.test(
        compactMsg
      );

    if (isCasualGreeting) {
      return jsonWithCors({
        text: `네, 안녕하세요 대표님! 반갑습니다 😊 무엇을 도와드릴까요? 요즘 사업하시면서 자금 쪽으로 어떤 고민이 있으신지 편하게 말씀해 주세요~`,
        source: "정책이 상담 가이드",
        coreId: null,
        links: [],
        isGreeting: true,
        updatedAnswers: answers,
        evolutionState: evolvedState,
        newlyLearned,
        provider: "rule-fallback",
      });
    }

    const conversational = conversationReply(message, answers, history);
    if (conversational) return jsonWithCors({ text: conversational, source: "정책이 상담", links: [], updatedAnswers: answers, evolutionState: evolvedState, provider: "rule-fallback" });
    const fallback = referenceReply(message, answers, history);
    const hits = searchQuestions(message);
    const diag = freeDiagnosis(answers);
    const upcomingQ = nextQuestion(answers);
    const knownSummary = summarizeKnownFacts(answers);

    const matchedContext = hits.slice(0, 2)
      .map(
        ({ core }) =>
          `- 관련 주제(${core.category}): "${core.question}" / 핵심 포인트: ${core.intent} / 다음에 물어볼 만한 질문: ${core.nextQuestion} / 관련기관: ${core.institutions}`
      )
      .join("\n");

    const ruleSummary = fallback.references
      .map((r) => `- ${r.institution}(${r.subject}): ${r.criteria}`)
      .join("\n");

    const prefSummary = PREFERENCE_REFERENCES.filter(p => message.includes(p.name)).slice(0, 3)
      .map((p) => `- ${p.name}: ${p.condition} (${p.caution})`)
      .join("\n");

    const isFirstTurn = history.length === 0;

    const systemInstruction = [
      "당신은 정책자금 상담을 돕는 AI 도우미 '정책이'입니다. 첫 문장에서 방금 들은 구체적인 사정이나 걱정을 짧게 받아 주세요. 감정을 단정하지 말고 질문에 답한 뒤 필요한 한 가지만 물어보세요. 실제 사람이나 특정 경력의 전문가라고 주장하지 마세요.",
      "쉬운 일상말로 짧게 답하세요. 질문은 한 번에 한 가지 사실만 물으세요. 업종과 규모처럼 두 가지를 합쳐 묻지 마세요. 직전 질문을 기준으로 짧은 답의 뜻을 이해하고, 사용자가 정정한 사실을 우선하세요. 용어를 되묻거나 화제를 바꾸면 지금 요청한 내용을 먼저 답하세요. 공감을 위한 감탄사나 마무리 질문은 반복하지 마세요.",
      buildEvolutionPromptContext(evolvedState),
      trainingPrompt(training, message),
      "",
      "[전문가로서 지켜야 할 사실 원칙]",
      "- '90% 승인', '무조건 승인', '확정 금액' 같은 단정 표현은 쓰지 마세요.",
      "- 다른 사업체를 더 운영하시더라도 그쪽 대출을 우리 회사 부채에 단순 합산하지 않고 기관별로 따로 본다고 안심시켜 드리세요.",
      "- 여성기업·특허·연구소 같은 우대는 확인서 유효기간과 신청할 공고의 인정 조건을 같이 봐야 실제 혜택이 적용된다고 설명하세요.",
      "- 체납이나 연체의 취급은 기관과 공고별로 다르므로 예외나 지원 가능 여부를 단정하지 마세요.",
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
          stream: body.stream === true,
        });
        if (ollamaReply instanceof Response) return ollamaReply;
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
          stream: body.stream === true,
        });
        if (ollamaReply instanceof Response) return ollamaReply;
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
      text: learnedMatches.length ? learnedMatches[0].content : fallback.text,
      source: learnedMatches.length ? `등록된 학습 지식 · ${learnedMatches[0].title}` : `정책이 상담 가이드 (${DOCUMENT_VERSION})`,
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
