"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  ArrowRight,
  Waves,
  Plus,
  MessageCircle,
  ShieldCheck,
  FileText,
  Check,
  ChevronDown,
  X,
  Sparkles,
  Building2,
  Compass,
  Download,
  RotateCcw,
} from "lucide-react";
import {
  answerQuestion,
  Answers,
  AnswerKey,
  nextQuestion,
  freeDiagnosis,
  referenceReply,
  DOCUMENT_VERSION,
  collectionRoute,
  extractAnswersFromText,
  summarizeKnownFacts,
  formatHumanFollowUpQuestion,
  ensureEndsWithFollowUpQuestion,
} from "../engines/document-advisor";
import { QuestionLibrary, ReportSamples } from "./DocumentTools";
import { ThemeToggle } from "./ThemeToggle";
import { MascotMotion } from "./MascotMotion";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: string;
  unread?: boolean;
  source?: string;
  links?: { id: string; url: string; institution: string }[];
  followUpHead?: boolean;
};

const API_ENDPOINTS = [
  "http://localhost:3057/api/chat",
  "http://127.0.0.1:3057/api/chat",
  "http://localhost:3056/api/chat",
  "http://localhost:3055/api/chat",
  "/api/chat",
];

const starters = [
  {
    label: "우리 회사도 받을 수 있나요?",
    text: "우리 회사도 정책자금 대상이 되나요?",
    icon: Building2,
  },
  {
    label: "사업 확장 자금이 필요해요",
    text: "새 기계를 구입하려는데 시설자금을 받을 수 있나요?",
    icon: Compass,
  },
  {
    label: "어떤 서류를 준비하나요?",
    text: "정책자금 신청 서류는 무엇을 준비하나요?",
    icon: FileText,
  },
];

const plans = [
  {
    name: "무료 AI 진단",
    tag: "가능성부터 가볍게",
    price: "0",
    sub: "바로 시작할 수 있어요",
    items: [
      "기본 자격과 제한사항 확인",
      "검토할 자금 방향 안내",
      "부족한 정보와 다음 행동",
    ],
    button: "무료로 진단 시작",
    tier: "L1",
  },
  {
    name: "맞춤 방향 진단",
    tag: "우리 기업에 맞는 선택",
    price: "19,000",
    sub: "접수 후 영업일 1일 이내",
    items: [
      "추천 기관 1~3순위와 선정 근거",
      "자료 확인 후 잠정 조달 범위",
      "핵심 재무·대출·보증 요약",
    ],
    button: "제공 내용 자세히 보기",
    tier: "L2",
  },
  {
    name: "정밀 실행 전략",
    tag: "다음 행동까지 구체적으로",
    price: "59,000",
    sub: "접수 후 영업일 1~2일 이내",
    items: [
      "전문가 1차 검수 포함",
      "1안·2안·대안 조달 시나리오",
      "첫 일주일 실행 로드맵",
    ],
    button: "제공 내용 자세히 보기",
    tier: "L3",
  },
];

const faqs = [
  {
    q: "무료 진단만 이용해도 되나요?",
    a: "네. 기본 자격과 검토할 방향, 부족한 정보, 다음 행동을 무료로 안내받을 수 있어요. 더 구체적인 기관 비교나 실행계획이 필요할 때 유료 진단을 선택하시면 됩니다.",
  },
  {
    q: "진단 결과가 나오면 자금을 받을 수 있나요?",
    a: "진단은 사전 검토를 돕는 안내예요. 승인 여부와 실행금액은 해당 기관 및 금융기관의 심사로 결정되며, 이 서비스는 승인이나 특정 금액을 보장하지 않습니다.",
  },
  {
    q: "처음부터 서류를 제출해야 하나요?",
    a: "먼저 대화로 기업 상황을 확인해요. 자동조회는 이용기관 승인과 별도 동의가 확보된 경우에만 진행하며, 현재 화면은 직접 입력 기반 안내입니다. 확인하지 못한 자료만 이후에 보완하는 방식이에요.",
  },
  {
    q: "정부기관에서 운영하는 서비스인가요?",
    a: "정책 자금바다는 민간 진단·자문 서비스예요. 정책기관의 공식 접수창구가 아니며 기관별 최신 공식 공고와 심사 기준을 별도로 확인해야 합니다.",
  },
];

function nowTimeLabel(): string {
  try {
    return new Date().toLocaleTimeString("ko-KR", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "방금";
  }
}

function splitIntoHumanBubbles(fullText: string): string[] {
  const cleaned = fullText.replace(/\*\*/g, "").trim();
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length >= 2) {
    return [paragraphs.slice(0, -1).join("\n\n"), paragraphs[paragraphs.length - 1]];
  }

  // 한 문단인데 문장이 3개 이상이고 끝에 물음표 질문이 있으면 마지막 질문을 두 번째 말풍선으로 분리
  const sentences = cleaned.split(/(?<=[.?!])\s+/);
  if (sentences.length >= 3 && sentences[sentences.length - 1].includes("?")) {
    return [
      sentences.slice(0, -1).join(" "),
      sentences[sentences.length - 1],
    ];
  }

  return [cleaned];
}

export default function FundSeaExperience() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState("");
  const [busy, setBusy] = useState(false);
  const [typingStatusText, setTypingStatusText] = useState("정책이가 메시지를 읽고 있어요...");
  const [modal, setModal] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [faq, setFaq] = useState<number | null>(0);
  const [purpose, setPurpose] = useState("");
  const [saved, setSaved] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [diagnosisStarted, setDiagnosisStarted] = useState(false);
  const [aiEngine, setAiEngine] = useState<"ollama" | "gemini">("ollama");
  const [ollamaModel, setOllamaModel] = useState<string>("gemma4:latest");
  const [geminiModel, setGeminiModel] = useState<string>("gemini-3-flash-preview");
  const [geminiConnected, setGeminiConnected] = useState<boolean>(true);
  const [customApiKey, setCustomApiKey] = useState<string>("");

  const question = nextQuestion(answers);
  const result = freeDiagnosis(answers);
  const field = useRef<HTMLTextAreaElement>(null);
  const stream = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const responseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRunId = useRef<number>(0);

  useEffect(() => {
    try {
      const savedKey = localStorage.getItem("fundsea-gemini-key");
      if (savedKey) setCustomApiKey(savedKey);
    } catch {
      // Ignore storage access errors
    }

    (async () => {
      for (const url of API_ENDPOINTS) {
        try {
          const res = await fetch(url, { method: "GET" });
          const ct = res.headers.get("content-type") || "";
          if (res.ok && ct.includes("application/json")) {
            const info = await res.json();
            if (info?.connected) {
              setGeminiConnected(true);
              if (info.ollamaModel) setOllamaModel(String(info.ollamaModel));
              if (info.geminiModel) setGeminiModel(String(info.geminiModel));
              if (info.ollamaAvailable) setAiEngine("ollama");
              else if (info.geminiAvailable) setAiEngine("gemini");
              return;
            }
          }
        } catch {
          // Try next candidate
        }
      }
    })();
  }, []);

  useEffect(() => {
    const phrase = "무엇을 도와드릴까요?";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTyping(phrase);
      return;
    }
    let index = 0;
    let reverse = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      index += reverse ? -1 : 1;
      setTyping(phrase.slice(0, index));
      let delay = reverse ? 55 : 110;
      if (index === phrase.length) {
        reverse = true;
        delay = 2200;
      }
      if (index === 0) {
        reverse = false;
        delay = 600;
      }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 450);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (stream.current) stream.current.scrollTop = stream.current.scrollHeight;
  }, [messages, busy]);

  useEffect(
    () => () => {
      if (responseTimer.current) clearTimeout(responseTimer.current);
      activeRunId.current += 1;
    },
    []
  );

  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const controls =
          dialog.current?.querySelectorAll<HTMLButtonElement>("button");
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, [modal]);

  // 사람처럼 말풍선을 순차적으로 타이핑하며 화면에 출력하는 함수
  const deliverHumanLikeAssistantTurn = async (
    runId: number,
    reply: {
      text: string;
      source?: string;
      links?: { id: string; url: string; institution: string }[];
    }
  ) => {
    if (activeRunId.current !== runId) return;

    // 1. 사용자 메시지의 '1 (안읽음)' 표시 제거 -> 읽음 처리
    setMessages((prev) =>
      prev.map((m) => (m.unread ? { ...m, unread: false } : m))
    );

    const bubbles = splitIntoHumanBubbles(reply.text);
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    for (let bIdx = 0; bIdx < bubbles.length; bIdx++) {
      if (activeRunId.current !== runId) return;
      const chunkText = bubbles[bIdx];
      const msgId = `ai-${runId}-${bIdx}`;
      const isLastBubble = bIdx === bubbles.length - 1;

      if (bIdx > 0) {
        setBusy(true);
        setTypingStatusText("정책이가 이어서 입력하고 있어요...");
        await new Promise((r) => setTimeout(r, reducedMotion ? 40 : 420));
      }

      setBusy(false);
      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          role: "assistant",
          text: reducedMotion ? chunkText : "",
          time: nowTimeLabel(),
          followUpHead: bIdx > 0,
          source: isLastBubble ? reply.source : undefined,
          links: isLastBubble ? reply.links : undefined,
        },
      ]);

      if (!reducedMotion) {
        const stepSize = Math.max(2, Math.ceil(chunkText.length / 28));
        for (let i = stepSize; i <= chunkText.length; i += stepSize) {
          if (activeRunId.current !== runId) return;
          const partial = chunkText.slice(0, i);
          setMessages((prev) =>
            prev.map((m) => (m.id === msgId ? { ...m, text: partial } : m))
          );
          await new Promise((r) => setTimeout(r, 18));
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, text: chunkText } : m))
        );
      }
    }
  };

  const requestAIReply = async (
    userText: string,
    historySnapshot: { role: "user" | "assistant"; text: string }[],
    currentAnswers: Answers
  ) => {
    const compact = userText.replace(/[!?.~,\s]/g, "");
    if (
      /^(안녕하세요|안녕|반갑습니다|반가워요|여보세요|계세요|저기요|하이|선생님|상담사님|정책이님|정책아)$/.test(
        compact
      )
    ) {
      return {
        text: `네, 안녕하세요 대표님! 반갑습니다 😊\n\n무엇을 도와드릴까요? 요즘 사업하시면서 자금 쪽으로 어떤 고민이 있으신지 편하게 말씀해 주세요~`,
        source: aiEngine === "ollama" ? `Ollama (${ollamaModel})` : `Gemini (${geminiModel})`,
        links: [],
        isGreeting: true,
      };
    }

    const fallback = referenceReply(userText, currentAnswers);
    const trimmedKey = customApiKey.trim();
    const knownSummary = summarizeKnownFacts(currentAnswers);

    // 1. 개인 Gemini API 키가 설정된 경우
    if (trimmedKey.startsWith("AIza")) {
      try {
        const diag = freeDiagnosis(currentAnswers);
        const upcoming = nextQuestion(currentAnswers);
        const directRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
            trimmedKey
          )}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: {
                parts: [
                  {
                    text: `당신은 따뜻하고 친절한 정책자금 전문 상담사 '정책이'입니다. 기계적인 번호 매기기나 자기소개를 하지 말고, 실제 사람과 카톡하듯 공감하며 2~3문장으로 답한 뒤 빈 줄(\\n\\n)을 넣고 마지막에 쉬운 질문 1개만 건네세요. 이미 파악된 정보(${knownSummary})는 다시 묻지 마세요. 현재 상태: ${diag.status}, 다음에 자연스럽게 이어갈 질문: ${upcoming?.text ?? "완료"}`,
                  },
                ],
              },
              contents: [
                ...historySnapshot.slice(-6).map((t) => ({
                  role: t.role === "assistant" ? "model" : "user",
                  parts: [{ text: t.text }],
                })),
                { role: "user", parts: [{ text: userText }] },
              ],
            }),
          }
        );
        if (directRes.ok) {
          const directJson = await directRes.json();
          const directText =
            directJson?.candidates?.[0]?.content?.parts
              ?.map((p: { text?: string }) => p?.text ?? "")
              .join("")
              .trim() || fallback.text;
          setGeminiConnected(true);
          setGeminiModel("gemini-2.5-flash");
          return {
            text: directText,
            source: `Gemini (gemini-2.5-flash)`,
            links: fallback.references,
          };
        }
      } catch {
        // Fall through
      }
    }

    // 2. 로컬/서버 AI 라우트(Ollama Gemma 4 & Gemini) 호출
    for (const apiUrl of API_ENDPOINTS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userText,
            history: historySnapshot,
            answers: currentAnswers,
            engine: aiEngine,
            clientApiKey: trimmedKey || undefined,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const contentType = res.headers.get("content-type") || "";
        if (res.ok && contentType.includes("application/json")) {
          const data = await res.json();
          if (data && typeof data.text === "string") {
            setGeminiConnected(
              data.provider === "ollama" || data.provider === "gemini"
            );
            if (data.provider === "ollama" && data.model) {
              setOllamaModel(String(data.model));
            } else if (data.provider === "gemini" && data.model) {
              setGeminiModel(String(data.model));
            }
            if (data.updatedAnswers && typeof data.updatedAnswers === "object") {
              setAnswers(data.updatedAnswers);
            }
            return {
              text: data.text,
              source: data.source,
              isGreeting: Boolean(data.isGreeting),
              links: Array.isArray(data.links)
                ? data.links
                : fallback.references,
            };
          }
        }
      } catch {
        // Try next endpoint
      }
    }

    // 3. 정적 프리뷰에서 직접 로컬 Ollama(127.0.0.1:11434) 호출
    if (aiEngine === "ollama") {
      try {
        const diag = freeDiagnosis(currentAnswers);
        const upcoming = nextQuestion(currentAnswers);
        const ollamaRes = await fetch("http://127.0.0.1:11434/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: ollamaModel,
            stream: false,
            think: false,
            keep_alive: "30m",
            messages: [
              {
                role: "system",
                content: `당신은 다정하고 유능한 정책자금 전문 상담사 '정책이'입니다. 번호 매기기나 자기소개를 빼고 실제 사람과 카톡으로 대화하듯 공감하며 2~3문장으로 쉽게 답한 뒤, 빈 줄(\\n\\n)을 넣고 마지막에 다음 질문("${upcoming?.text ?? "추가로 궁금하신 점이 있으신가요?"}")을 자연스럽게 물어보세요. 이미 확인된 정보(${knownSummary})는 중복해서 묻지 마세요. 현재 진단상태: ${diag.status} (${diag.direction})`,
              },
              ...historySnapshot.slice(-6).map((t) => ({
                role: t.role === "assistant" ? "assistant" : "user",
                content: t.text,
              })),
              { role: "user", content: userText },
            ],
          }),
        });
        if (ollamaRes.ok) {
          const ollamaJson = await ollamaRes.json();
          const replyText = String(ollamaJson?.message?.content ?? "")
            .replace(/<think>[\s\S]*?<\/think>/gi, "")
            .replace(/\*\*/g, "")
            .trim();
          if (replyText) {
            return {
              text: ensureEndsWithFollowUpQuestion(replyText, currentAnswers),
              source: `Ollama (${ollamaModel})`,
              links: fallback.references,
            };
          }
        }
      } catch {
        // Fall through
      }
    }

    return {
      text: fallback.text,
      source: `정책이 상담 가이드`,
      links: fallback.references,
    };
  };

  const start = () => {
    setDiagnosisStarted(true);
    setMenu(false);
    document
      .getElementById("diagnosis")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    field.current?.focus({ preventScroll: true });
  };

  const chooseAnswer = async (key: AnswerKey, value: string, label: string) => {
    if (busy) return;
    const updated = answerQuestion(answers, key, value);
    if (updated === answers) return;
    setAnswers(updated);
    setSaved(false);
    setBusy(true);
    setTypingStatusText("정책이가 내용을 확인하고 답장을 쓰고 있어요...");

    const runId = ++activeRunId.current;
    const historySnapshot = messages.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setMessages((prev) => [
      ...prev,
      {
        id: `usr-${runId}`,
        role: "user",
        text: label,
        time: nowTimeLabel(),
        unread: true,
      },
    ]);

    const summary = freeDiagnosis(updated);
    const followup = nextQuestion(updated);
    const promptForAI = `대표님이 방금 "${label}"라고 답하셨어요. 자기소개 없이 바로 대표님 말씀에 따뜻하게 맞장구치면서 핵심 포인트(${summary.reasons[0]})를 한두 문장으로 쉽게 설명해 주세요. 그리고 빈 줄(\\n\\n)을 넣은 뒤 ${
      followup
        ? `다음 확인 질문("${followup.text}")을 실제 상담사가 편하게 물어보듯 자연스러운 구어체로 여쭤봐 주세요.`
        : `지금까지 확인된 결과(상태: ${summary.status}, 방향: ${summary.direction}, 지금 할 일: ${summary.action})를 친절하게 정리해 주세요.`
    }`;

    const reply = await requestAIReply(promptForAI, historySnapshot, updated);
    await deliverHumanLikeAssistantTurn(runId, reply);
  };

  const send = async (value = input) => {
    const text = value.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setSaved(false);
    setTypingStatusText("정책이가 메시지를 읽고 답장을 작성 중이에요...");

    if (/시설|설비|공장|확장|기계/.test(text)) setPurpose("시설·사업 확장");
    else if (/운전|인건비|원재료|운영|월세/.test(text)) setPurpose("운영·운전자금");

    const updatedAnswers = extractAnswersFromText(answers, text);
    if (Object.keys(updatedAnswers).length !== Object.keys(answers).length) {
      setAnswers(updatedAnswers);
    }

    const runId = ++activeRunId.current;
    const historySnapshot = messages.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setMessages((prev) => [
      ...prev,
      {
        id: `usr-${runId}`,
        role: "user",
        text,
        time: nowTimeLabel(),
        unread: true,
      },
    ]);

    const reply = await requestAIReply(text, historySnapshot, updatedAnswers);
    if (!reply.isGreeting) {
      setDiagnosisStarted(true);
    }
    await deliverHumanLikeAssistantTurn(runId, reply);
  };

  const reset = () => {
    activeRunId.current += 1;
    if (responseTimer.current) clearTimeout(responseTimer.current);
    setMessages([]);
    setAnswers({});
    setDiagnosisStarted(false);
    setPurpose("");
    setInput("");
    setBusy(false);
    setSaved(false);
  };

  const download = () => {
    const text =
      `정책 자금바다 · 상담 메모\n${new Date().toLocaleDateString(
        "ko-KR"
      )}\n사전 안내이며 승인·금액을 보장하지 않습니다.\n\n` +
      messages
        .map((m) => `${m.role === "user" ? "나" : "정책이"}: ${m.text}`)
        .join("\n\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "정책자금바다-상담메모.txt";
    anchor.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  };

  return (
    <div className="sea-app">
      <header className="sea-header">
        <a href="#" className="sea-brand" aria-label="정책 자금바다 홈">
          <span className="brand-mark">
            <Waves size={24} />
          </span>
          <span>
            정책<span className="brand-light">자금바다</span>
            <small>POLICY FUND SEA</small>
          </span>
        </a>
        <nav className="desktop-nav" aria-label="주 메뉴">
          <a className="active" href="#diagnosis">
            AI 자금진단
          </a>
          <a href="#how">이용 방법</a>
          <a href="#plans">진단 서비스</a>
          <a href="#faq">자주 묻는 질문</a>
        </nav>
        <ThemeToggle />
        <button className="header-cta" onClick={start}>
          무료 진단 시작 <ArrowUpRight size={16} />
        </button>
        <button
          className="mobile-menu"
          onClick={() => setMenu(!menu)}
          aria-label="메뉴 열기"
          aria-expanded={menu}
        >
          <ChevronDown size={22} />
        </button>
      </header>
      {menu && (
        <nav className="mobile-dropdown">
          <a onClick={() => setMenu(false)} href="#how">
            이용 방법
          </a>
          <a onClick={() => setMenu(false)} href="#plans">
            진단 서비스
          </a>
          <a onClick={() => setMenu(false)} href="#faq">
            자주 묻는 질문
          </a>
        </nav>
      )}
      <main>
        <section className="sea-hero" id="diagnosis">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-content">
            <div className="eyebrow">
              <span /> 우리 기업의 다음 성장을 위한 첫걸음
            </div>
            <h1>
              복잡한 정책자금,
              <br />
              <span>대화로 길을 찾다.</span>
            </h1>
            <p className="hero-description">
              어디서부터 시작할지 막막하셨나요?
              <br className="mobile-break" /> 정책이와 함께
              <br className="desktop-break" /> 우리 기업에 맞는 자금 방향을 차근차근 알아보세요.
            </p>
            <div className="hero-pills">
              <span>
                <Check size={14} /> 무료로 시작
              </span>
              <span>
                <Check size={14} /> 필요한 질문만
              </span>
              <span>
                <Check size={14} /> 근거 있는 안내
              </span>
            </div>
          </div>
          <div className="hero-mascot">
            <span className="mascot-speech">
              대표님, 함께 찾아볼까요? <Sparkles size={13} />
            </span>
            <MascotMotion />
            <span className="mascot-label">
              기업의 성장을 돕는 AI 비서 <b>정책이</b>
            </span>
          </div>
          <div className="workspace">
            <section className="sea-chat" aria-label="정책이와 상담">
              <div className="chat-top">
                <div className="assistant-profile">
                  <span className="avatar">
                    <img src="/jeongchaegi.svg" alt="정책이" />
                  </span>
                  <div>
                    <strong>
                      정책이{" "}
                      <span className="ai-badge">
                        {aiEngine === "ollama"
                          ? `Gemma 4`
                          : `Gemini`}
                      </span>
                    </strong>
                    <small>
                      <i />{" "}
                      {busy
                        ? "답장을 입력하고 있어요..."
                        : geminiConnected
                        ? "지금 바로 대화 가능해요"
                        : "정책자금 전담 상담사"}
                    </small>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() =>
                      setAiEngine((prev) =>
                        prev === "ollama" ? "gemini" : "ollama"
                      )
                    }
                    aria-label="AI 엔진 전환"
                    title="Ollama Gemma 4 ↔ Gemini 전환"
                    style={{
                      width: "auto",
                      padding: "0 10px",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    {aiEngine === "ollama" ? "Gemma 4" : "Gemini"}
                  </button>
                  <button
                    className="icon-button"
                    onClick={reset}
                    aria-label="새 대화 시작"
                    title="새 대화"
                  >
                    <RotateCcw size={18} />
                  </button>
                </div>
              </div>
              <div
                className={`chat-stream ${messages.length ? "has-messages" : ""}`}
                ref={stream}
              >
                {messages.length === 0 ? (
                  <div className="chat-welcome">
                    <span className="welcome-symbol">
                      <Sparkles size={24} />
                    </span>
                    <p className="welcome-kicker">안녕하세요, 대표님!</p>
                    <h2 aria-label="무엇을 도와드릴까요?">
                      <span aria-hidden="true">
                        {typing}
                        <i className="typing-caret" />
                      </span>
                    </h2>
                    <p>
                      옆자리 전문 상담사에게 물어보듯 편하게 말씀해 주세요.
                      <br />
                      어려운 서류나 공고 용어는 제가 쉽게 풀어서 안내해 드릴게요.
                    </p>
                    <div className="starter-grid">
                      {starters.map(({ label, text, icon: Icon }) => (
                        <button key={label} onClick={() => send(text)}>
                          <Icon size={18} />
                          <span>{label}</span>
                          <ArrowUpRight size={14} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="message-list" aria-live="polite">
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`sea-message ${m.role} ${
                          m.followUpHead ? "followup-bubble" : ""
                        }`}
                      >
                        {m.role === "assistant" && !m.followUpHead && (
                          <div className="assistant-head">
                            <span className="mini-avatar">
                              <img src="/jeongchaegi.svg" alt="" />
                            </span>
                            <span className="message-name">
                              정책이 <span>상담사</span>
                            </span>
                          </div>
                        )}
                        <div className="bubble-row">
                          {m.role === "user" && (
                            <span className="bubble-meta user-meta">
                              {m.unread && <b className="unread-one">1</b>}
                              <time>{m.time}</time>
                            </span>
                          )}
                          <p>{m.text}</p>
                          {m.role === "assistant" && (
                            <span className="bubble-meta">
                              <time>{m.time}</time>
                            </span>
                          )}
                        </div>
                        {m.links?.length ? (
                          <div className="answer-links">
                            {m.links.map((link) => (
                              <a
                                key={link.id}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {link.institution} 공식 안내 ↗
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {busy && (
                      <div className="thinking-bubble" role="status">
                        <span className="mini-avatar">
                          <img src="/jeongchaegi.svg" alt="" />
                        </span>
                        <div className="thinking">
                          <span />
                          <span />
                          <span />
                          <small>{typingStatusText}</small>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {messages.length > 0 && question && !busy && (
                <div className="nbq-panel">
                  <div>
                    {question.choices.map((choice) => (
                      <button
                        key={choice.value}
                        onClick={() =>
                          chooseAnswer(question.key, choice.value, choice.label)
                        }
                      >
                        💬 {choice.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="composer-wrap">
                <form
                  className="sea-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send();
                  }}
                >
                  <button
                    type="button"
                    className="attach-button"
                    aria-label="자료 제출 안내"
                    onClick={() => setModal("자료 제출 안내")}
                  >
                    <Plus size={21} />
                  </button>
                  <textarea
                    ref={field}
                    value={input}
                    maxLength={2000}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={1}
                    aria-label="정책이에게 질문하기"
                    placeholder="정책이에게 편하게 말씀해 주세요 (예: 설비 늘리려는데 자금이 필요해요)"
                  />
                  <button
                    className="send-button"
                    type="submit"
                    aria-label="메시지 보내기"
                    disabled={!input.trim() || busy}
                  >
                    <ArrowUp size={20} />
                  </button>
                </form>
                <p className="composer-note">
                  <ShieldCheck size={12} /> 입력 정보는 현재 대화에 사용돼요.
                  주민등록번호 등 민감정보는 입력하지 마세요.
                </p>
              </div>
            </section>
            <aside className="journey-card" aria-label="나의 진단 현황">
              <div className="journey-heading">
                <span className="mini-label">MY DIAGNOSIS</span>
                <span className="soft-badge">
                  {diagnosisStarted ? result.status : "시작 전"}
                </span>
              </div>
              <h2>
                우리 기업의
                <br />
                가능성을 알아보세요.
              </h2>
              <p className="journey-intro">
                {diagnosisStarted
                  ? `${Object.keys(answers).length}개 항목 확인됨 · 대화 중`
                  : "대화로 정보를 모으면 검토할 방향이 조금씩 선명해져요."}
              </p>
              <ol className="journey-steps">
                <li className={messages.length ? "current" : ""}>
                  <span>01</span>
                  <div>
                    <strong>기업 이야기 듣기</strong>
                    <small>
                      {purpose || "자금 목적과 기업 상황을 알려주세요"}
                    </small>
                  </div>
                </li>
                <li className={Object.keys(answers).length > 3 ? "current" : ""}>
                  <span>02</span>
                  <div>
                    <strong>가능한 방향 살펴보기</strong>
                    <small>
                      {diagnosisStarted
                        ? result.reasons[0]
                        : "기본 자격과 확인할 조건을 정리해요"}
                    </small>
                  </div>
                </li>
                <li className={result.complete ? "current" : ""}>
                  <span>03</span>
                  <div>
                    <strong>다음 단계 안내받기</strong>
                    <small>
                      {result.complete
                        ? result.action
                        : "준비 자료와 실행 방향을 확인해요"}
                    </small>
                  </div>
                </li>
              </ol>
              <div className="journey-tip">
                <span className="tip-icon">
                  <Compass size={20} />
                </span>
                <div>
                  <strong>
                    {result.complete
                      ? "무료 진단 · 검토 방향"
                      : "금액보다, 맞는 방향부터."}
                  </strong>
                  <p>
                    {result.complete
                      ? result.direction
                      : "기업 자료와 공고 확인 전에는 승인 여부나 금액을 단정하지 않아요."}
                  </p>
                </div>
              </div>
              <button
                className="save-button"
                disabled={!messages.length}
                onClick={download}
              >
                <Download size={15} />
                {saved ? "상담 메모를 저장했어요" : "상담 메모 저장"}
              </button>
            </aside>
          </div>
          <QuestionLibrary onAsk={send} />
          <details className="document-tools">
            <summary>
              자료 확인 방법 · 자동조회가 안 되어도 계속할 수 있어요
            </summary>
            <div className="document-tool-body">
              <p>
                공공 마이데이터는 기업 증빙 확인, 정책 룰은 기관별 공고 확인에
                사용됩니다. 두 정보는 구분해서 관리합니다.
              </p>
              <ol>
                <li>
                  공공 마이데이터: 이용기관 승인과 별도 제공요구 동의 후 조회
                </li>
                <li>
                  민간 API: 계약상 조회·저장·고객노출 권한이 확보된 항목만 보완
                </li>
                <li>누락 정보: 파일 업로드 → 직접 입력 순으로 보완</li>
              </ol>
              <p>
                현재 자동조회·서버 업로드 연동은 준비 중입니다. 직접 입력으로
                계속할 수 있으며, 입력값은 자동조회 완료나 증빙확인으로 표시하지
                않습니다.
              </p>
              <button
                className="text-link"
                onClick={() => {
                  const route = collectionRoute(false, false, "failed");
                  if (route.mode === "MANUAL_FALLBACK") {
                    setDiagnosisStarted(true);
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: `sys-${Date.now()}`,
                        role: "assistant",
                        text: "네, 대표님! 서류 자동조회 없이 지금처럼 대화로만 편하게 알려주셔도 괜찮아요. 이미 말씀해 주신 내용은 기억하고 있으니 필요한 것만 하나씩 여쭤볼게요.",
                        time: nowTimeLabel(),
                      },
                    ]);
                  }
                }}
              >
                자동조회 없이 직접 입력으로 계속 →
              </button>
            </div>
          </details>
          <div className="institution-strip">
            <span>다양한 정책금융 경로를 함께 살펴봐요</span>
            <div>
              <b>중진공</b>
              <i />
              <b>소진공</b>
              <i />
              <b>신용보증기금</b>
              <i />
              <b>기술보증기금</b>
              <i />
              <b>지역신용보증재단</b>
            </div>
            <small>
              제공 문서 기준 {DOCUMENT_VERSION} · 기관별 자격·접수상태는 최신 공식
              공고 확인이 필요합니다.
            </small>
          </div>
        </section>
        <section className="how-section section-shell" id="how">
          <div className="section-heading">
            <span className="mini-label">SIMPLE, BUT THOUGHTFUL</span>
            <h2>
              시작은 가볍게.
              <br />
              준비는 더 탄탄하게.
            </h2>
            <p>모든 공고를 읽거나 서류부터 모으지 않아도 괜찮아요.</p>
          </div>
          <div className="how-grid">
            {[
              {
                n: "01",
                icon: MessageCircle,
                title: "대화로 시작해요",
                text: "자금이 필요한 이유를 들려주세요. 기업 상황을 이해하는 데 필요한 질문부터 드려요.",
              },
              {
                n: "02",
                icon: Compass,
                title: "맞는 방향을 찾아요",
                text: "기업의 강점과 확인할 조건을 정리해 검토할 수 있는 정책자금 방향을 안내해요.",
              },
              {
                n: "03",
                icon: FileText,
                title: "다음 행동을 준비해요",
                text: "추가로 필요한 자료와 준비 순서를 확인하고, 필요할 때 더 깊은 진단으로 이어가세요.",
              },
            ].map(({ n, icon: Icon, title, text }) => (
              <article key={n}>
                <div className="how-card-top">
                  <span className="how-icon">
                    <Icon size={25} />
                  </span>
                  <span>{n}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="plans-section" id="plans">
          <div className="section-shell">
            <div className="section-heading centered">
              <span className="mini-label">THE RIGHT NEXT STEP</span>
              <h2>필요한 만큼, 한 단계씩.</h2>
              <p>가능성 확인부터 전문가와 함께하는 실행 전략까지.</p>
            </div>
            <div className="plan-grid">
              {plans.map((p, index) => (
                <article
                  className={`plan-card ${index === 1 ? "featured" : ""}`}
                  key={p.tier}
                >
                  {index === 1 && (
                    <div className="plan-ribbon">
                      방향을 구체적으로 알고 싶다면
                    </div>
                  )}
                  <span className="plan-tag">{p.tag}</span>
                  <h3>{p.name}</h3>
                  <div className="plan-price">
                    {p.price}
                    <span>원</span>
                  </div>
                  <p className="plan-sla">{p.sub}</p>
                  <div className="plan-line" />
                  <ul>
                    {p.items.map((item) => (
                      <li key={item}>
                        <Check size={16} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => (p.tier === "L1" ? start() : setModal(p.name))}
                  >
                    {p.button}
                    <ArrowRight size={16} />
                  </button>
                </article>
              ))}
            </div>
            <div className="consulting-row">
              <span>
                <b>신청 준비부터 도움이 필요하신가요?</b> 전문가 실행 컨설팅은 별도
                계약으로 진행해요.
              </span>
              <button onClick={() => setModal("실행 컨설팅")}>
                서비스 안내 <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
        </section>
        <div className="section-shell">
          <ReportSamples />
        </div>
        <section className="faq-section section-shell" id="faq">
          <div className="section-heading">
            <span className="mini-label">GOOD TO KNOW</span>
            <h2>
              궁금한 점,
              <br />
              먼저 확인하세요.
            </h2>
            <p>
              정책이와 대화하기 전에
              <br />
              자주 물어보시는 내용을 모았어요.
            </p>
            <button className="text-link" onClick={start}>
              정책이에게 직접 물어보기 <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="faq-list">
            {faqs.map((item, index) => (
              <article className={faq === index ? "open" : ""} key={item.q}>
                <button
                  aria-expanded={faq === index}
                  aria-controls={`faq-${index}`}
                  onClick={() => setFaq(faq === index ? null : index)}
                >
                  <span>{item.q}</span>
                  <Plus size={18} />
                </button>
                {faq === index && <p id={`faq-${index}`}>{item.a}</p>}
              </article>
            ))}
          </div>
        </section>
        <section className="closing-section section-shell">
          <div>
            <span className="mini-label">YOUR NEXT CHAPTER</span>
            <h2>
              다음 성장을 위한 대화,
              <br />
              지금 시작해 볼까요?
            </h2>
            <button onClick={start}>
              정책이와 무료 진단 시작 <ArrowUpRight size={18} />
            </button>
          </div>
          <Waves className="closing-wave" size={190} strokeWidth={0.7} />
        </section>
      </main>
      <footer className="sea-footer section-shell">
        <div className="footer-top">
          <a className="sea-brand" href="#">
            <span className="brand-mark">
              <Waves size={22} />
            </span>
            <span>정책자금바다</span>
          </a>
          <div>
            <button onClick={() => setModal("개인정보 안내")}>
              개인정보 안내
            </button>
            <button onClick={() => setModal("서비스 이용 안내")}>
              서비스 이용 안내
            </button>
          </div>
        </div>
        <p>프라임경영기술(주) · 민간 정책자금 진단·자문 서비스</p>
        <p>
          본 서비스는 정책자금의 승인 여부 및 실행금액을 보장하지 않습니다. 최종
          결정은 각 기관의 심사에 따릅니다.
        </p>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} 정책 자금바다. All rights reserved.
          </span>
          <span>기업의 가능성에, 더 넓은 바다를.</span>
        </div>
      </footer>
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <section
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="sea-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              onClick={() => setModal(null)}
              aria-label="닫기"
            >
              <X size={20} />
            </button>
            <span className="welcome-symbol">
              <FileText size={24} />
            </span>
            <h2 id="modal-title">{modal}</h2>
            <p>
              {modal === "자료 제출 안내"
                ? "지금은 서류 없이 대화로 시작할 수 있어요. 파일 업로드와 공공 마이데이터 연결은 아직 제공되지 않습니다. 필요한 서류가 궁금하시면 정책이에게 물어보세요."
                : modal === "개인정보 안내"
                ? "이 화면에서 입력한 대화는 현재 브라우저 메모리에 보관됩니다. 새로고침하면 초기화되며, 상담 메모 저장을 선택하면 기기에 텍스트 파일로 내려받습니다. 주민등록번호·계좌 비밀번호 등 민감정보는 입력하지 마세요."
                : modal === "서비스 이용 안내"
                ? "현재는 질문은행과 AI(Gemma 4 / Gemini)를 결합한 대화형 사전 안내 버전입니다. 실시간 정책조회, 금융기관 접수 및 결제는 연결되어 있지 않습니다. 결과를 실제 신청에 활용하기 전 공식 공고와 기업 자료를 확인해야 합니다."
                : `${modal}은 ${
                    modal === "맞춤 방향 진단"
                      ? "19,000원 · 접수 후 영업일 1일 이내"
                      : modal === "정밀 실행 전략"
                      ? "59,000원 · 전문가 검수 후 영업일 1~2일 이내"
                      : "별도 견적·계약"
                  } 제공을 기준으로 설계된 서비스입니다. 현재는 결제·접수 연동 준비 중이며, 이 화면에서 결제가 발생하지 않습니다.`}
            </p>
            <button
              className="modal-action"
              onClick={() => {
                setModal(null);
                setTimeout(start, 0);
              }}
            >
              정책이와 대화하기 <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
