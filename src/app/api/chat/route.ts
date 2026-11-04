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

    // 가벼운 인사말("안녕하세요", "반갑습니다", "계세요?" 등)은 진짜 사람처럼 즉시 짧고 다정하게 인사 응답
    const compactMsg = message.replace(/[!?.~,\s]/g, "");
    const isCasualGreeting =
      /^(안녕하세요|안녕|반갑습니다|반가워요|여보세요|계세요|저기요|하이|선생님|상담사님|정책이님|정책아)$/.test(
        compactMsg
      );

    if (isCasualGreeting) {
      const nextFollowUp = formatHumanFollowUpQuestion(answers);
      return jsonWithCors({
        text: `네, 안녕하세요 대표님! 무엇을 도와드릴까요?\n\n${nextFollowUp}`,
        source: preferredEngine === "ollama" ? `Ollama (${OLLAMA_MODEL})` : "Gemini",
        coreId: null,
        links: [],
        isGreeting: false,
        updatedAnswers: answers,
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
      "당신은 10년 경력의 따뜻하고 유능한 정책자금 전문 상담사 '정책이'입니다.",
      "지금 대표님과 1:1 메신저(카카오톡 같은 채팅창)로 실시간 대화하고 있습니다.",
      "",
      "[진짜 사람처럼 대화하는 말투 규칙 - 매우 중요]",
      isFirstTurn
        ? "1. 첫 인사는 '아, 대표님 반갑습니다!'처럼 짧고 다정하게 건네되, 회사 소개나 딱딱한 자기소개('프라임경영기술의 AI 비서입니다' 등)는 절대 하지 마세요."
        : "1. 이미 대화가 진행 중이므로 '반갑습니다 대표님', '정책이입니다' 같은 인사를 절대 반복하지 마세요. 바로 대표님 말씀에 맞장구치며 이어서 말하세요.",
      "2. 번호 매기기(1., 2., ①, ②), 불릿 기호(-, •), 볼드체(**) 같은 보고서 서식을 절대 쓰지 마세요. 실제 사람이 카톡으로 답장하듯 자연스러운 문장으로만 쓰세요.",
      "3. 먼저 대표님의 질문이나 상황에 한 문장으로 공감('아, 설비 늘리시려고 하시는군요!', '맞아요, 그 부분 많이 헷갈려 하세요.')한 뒤 핵심 답변을 2~3문장으로 쉽게 설명하세요.",
      "4. 문단 사이에는 빈 줄(\\n\\n)을 하나 넣어 2개의 짧은 말풍선으로 나뉘어 보일 수 있게 작성하고, 마지막 문장에서는 대화를 이어가는 쉬운 질문 딱 1개만 자연스럽게 물어보세요.",
      "",
      "[전문가로서 지켜야 할 사실 원칙]",
      "- '90% 승인', '무조건 승인', '확정 금액' 같은 단정 표현은 쓰지 마세요.",
      "- 대표님이 다른 사업체를 더 운영하시더라도 그쪽 대출을 우리 회사 부채에 단순 합산하지 않고 기관별로 따로 본다고 안심시켜 드리세요.",
      "- 여성기업·특허·연구소 같은 우대는 확인서 유효기간과 신청할 공고의 인정 조건을 같이 봐야 실제 혜택이 적용된다고 설명하세요.",
      "- 세금 체납이나 연체가 있어도 분납·유예 승인을 받았거나 완납 예정이면 예외 검토가 가능하니 포기하지 않으셔도 된다고 안내하세요.",
      "",
      `[지금까지 대화로 파악된 대표님 정보 (절대 중복해서 다시 묻지 말 것!)]`,
      `- 이미 확인된 정보: ${knownSummary}`,
      `- 현재 판정 상태: ${diag.status} (${diag.direction})`,
      upcomingQ
        ? `- 이번 답변의 맨 마지막 문장에서 자연스럽게 이어갈 다음 질문: "${upcomingQ.text}"`
        : "- 모든 기본 질문이 확인되었으므로 대표님께 맞춤 방향과 준비 서류를 정리해 드리고 추가로 궁금한 점을 물어보세요.",
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
