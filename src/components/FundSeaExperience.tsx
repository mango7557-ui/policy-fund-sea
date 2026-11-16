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
import {
  buildEvolutionPromptContext,
  evolveFromUserMessage,
  INITIAL_EVOLUTION_STATE,
  JeongchaegiEvolutionState,
  rewardPositiveFeedback,
} from "../engines/self-learning";
import { QuestionLibrary, ReportSamples } from "./DocumentTools";
import { ThemeToggle } from "./ThemeToggle";
import { MascotMotion } from "./MascotMotion";
import { FundingNavigator } from "./FundingNavigator";
import { FundingNeeds } from "./FundingNeeds";
import { matchTraining, parseTrainingStore, readLocalTraining, trainingPrompt, TrainingEntry, TRAINING_EVENT } from "../engines/training";

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
    a: "바른 자금은 민간 진단·자문 서비스예요. 정책기관의 공식 접수창구가 아니며 기관별 최신 공식 공고와 심사 기준을 별도로 확인해야 합니다.",
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
  // 2개 말풍선으로 나뉘어 어색해지지 않도록 한 호흡의 자연스러운 단일 말풍선으로 정리
  const singleBubble = fullText
    .replace(/\*\*/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return [singleBubble];
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
  const [evolution, setEvolution] = useState<JeongchaegiEvolutionState>(
    INITIAL_EVOLUTION_STATE
  );
  const [learnToast, setLearnToast] = useState<string | null>(null);
  const [teachInput, setTeachInput] = useState<string>("");
  const [training, setTraining] = useState<TrainingEntry[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      let local: TrainingEntry[] = [];
      try { local = readLocalTraining().entries; } catch { /* Keep consultation available if storage is unavailable. */ }
      if (active) setTraining(local);
      try {
        const res = await fetch("/api/knowledge", { signal: AbortSignal.timeout(4000) });
        if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
          const remote = parseTrainingStore(await res.json());
          if (active) setTraining([...new Map([...local, ...remote.entries].map(e => [e.id, e])).values()]);
        }
      } catch { /* Static deployments use this browser's published knowledge. */ }
    };
    void load();
    window.addEventListener(TRAINING_EVENT, load);
    window.addEventListener("storage", load);
    return () => { active = false; window.removeEventListener(TRAINING_EVENT, load); window.removeEventListener("storage", load); };
  }, []);

  const question = nextQuestion(answers);
  const result = freeDiagnosis(answers);
  const field = useRef<HTMLTextAreaElement>(null);
  const stream = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const responseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRunId = useRef<number>(0);

  useEffect(() => {
    try {
      const savedKey =
        localStorage.getItem("bareunfund-gemini-key") ??
        localStorage.getItem("fundsea-gemini-key");
      if (savedKey) setCustomApiKey(savedKey);
      const savedEvo =
        localStorage.getItem("bareunfund-evolution-state") ??
        localStorage.getItem("bareunfund-evolution-state");
      if (savedEvo) {
        const parsed = JSON.parse(savedEvo);
        if (parsed && typeof parsed.level === "number") {
          setEvolution(parsed);
        }
      }
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
    if (activeRunId.current === runId) setBusy(false);
  };

  const requestAIReply = async (
    userText: string,
    historySnapshot: { role: "user" | "assistant"; text: string }[],
    currentAnswers: Answers,
    currentEvo: JeongchaegiEvolutionState
  ) => {
    const compact = userText.replace(/[!?.~,\s]/g, "");
    if (
      /^(안녕하세요|안녕|반갑습니다|반가워요|여보세요|계세요|저기요|하이|선생님|상담사님|정책이님|정책아)$/.test(
        compact
      )
    ) {
      return {
        text: historySnapshot.length ? "네, 듣고 있어요. 이어서 궁금하신 점을 말씀해 주세요." : "안녕하세요. 정책자금에 관해 궁금하신 점을 편하게 말씀해 주세요.",
        source: "정책이 상담 가이드",
        links: [],
        isGreeting: true,
      };
    }

    const fallback = referenceReply(userText, currentAnswers, historySnapshot);
    const trimmedKey = customApiKey.trim();
    const knownSummary = summarizeKnownFacts(currentAnswers);
    const evoContext = `${buildEvolutionPromptContext(currentEvo)}\n${trainingPrompt(training, userText)}`;
    const learnedMatches = matchTraining(training, userText);

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
                    text: `당신은 정책자금 상담 도우미 '정책이'입니다. 사용자의 마지막 질문에 먼저 구체적으로 답하고, 대화 맥락을 이어가세요. 모르는 내용은 모른다고 말하고 승인이나 금액을 단정하지 마세요. 과장된 공감이나 반복 인사 없이 간결하고 자연스러운 존댓말을 쓰세요. 답에 필요한 경우에만 질문을 하나 하세요. 이미 파악된 정보(${knownSummary})는 다시 묻지 마세요. 참고할 다음 진단 항목: ${upcoming?.text ?? "없음"}.\n${evoContext}`,
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
    const apiEndpoints = window.location.hostname.endsWith("github.io") ? [] : API_ENDPOINTS;
    for (const apiUrl of apiEndpoints) {
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
            evolutionState: currentEvo,
            trainingEntries: training.filter(e => e.status === "published"),
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
            if (data.evolutionState && typeof data.evolutionState === "object") {
              setEvolution(data.evolutionState);
              try {
                localStorage.setItem(
                  "bareunfund-evolution-state",
                  JSON.stringify(data.evolutionState)
                );
              } catch {
                // Ignore
              }
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
                content: `당신은 다정하고 인간적인 정책자금 전문 상담사 '정책이'입니다. 문단을 나누지 말고 하나의 자연스러운 말풍선(3~4문장) 안에서 대표님 말씀에 공감하고 쉽게 설명한 뒤 마지막 문장에서 다음 질문("${upcoming?.text ?? "추가로 궁금하신 점이 있으신가요?"}")을 부드럽게 물어보세요. 이미 확인된 정보(${knownSummary})는 중복해서 묻지 마세요. 현재 상태: ${diag.status}\n${evoContext}`,
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
      text: learnedMatches.length ? learnedMatches[0].content : fallback.text,
      source: learnedMatches.length ? `등록된 학습 지식 · ${learnedMatches[0].title}` : `정책이 상담 가이드`,
      links: fallback.references,
    };
  };

  const start = () => {
    setDiagnosisStarted(true);
    setMenu(false);
    document
      .getElementById("consultation")
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

    const { nextState: nextEvo, newlyLearned } = evolveFromUserMessage(
      evolution,
      label
    );
    setEvolution(nextEvo);
    try {
      localStorage.setItem("bareunfund-evolution-state", JSON.stringify(nextEvo));
    } catch {
      // Ignore
    }
    if (newlyLearned) {
      setLearnToast(`🧠 정책이가 새로 기억했어요: ${newlyLearned}`);
      setTimeout(() => setLearnToast(null), 4000);
    }

    const reply = await requestAIReply(
      label,
      historySnapshot,
      updated,
      nextEvo
    );
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
    setAnswers(updatedAnswers);

    const { nextState: nextEvo, newlyLearned } = evolveFromUserMessage(
      evolution,
      text
    );
    setEvolution(nextEvo);
    try {
      localStorage.setItem("bareunfund-evolution-state", JSON.stringify(nextEvo));
    } catch {
      // Ignore
    }
    if (newlyLearned) {
      setLearnToast(`🧠 정책이가 스스로 학습했어요: ${newlyLearned}`);
      setTimeout(() => setLearnToast(null), 4200);
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

    const reply = await requestAIReply(
      text,
      historySnapshot,
      updatedAnswers,
      nextEvo
    );
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
      `바른 자금 · 상담 메모\n${new Date().toLocaleDateString(
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
    anchor.download = "바른 자금-상담메모.txt";
    anchor.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  };

  return (
    <div className="sea-app">
      <a className="skip-link" href="#main-content">본문으로 바로가기</a>
      <header className="sea-header">
        <a href="#" className="sea-brand" aria-label="바른 자금 홈">
          <span className="brand-mark">
            <Waves size={24} />
          </span>
          <span>
            바른 <span className="brand-light">자금</span>
            <small>BAREUN FUND</small>
          </span>
        </a>
        <nav className="desktop-nav" aria-label="주 메뉴">
          <a className="active" href="#diagnosis">
            AI 자금진단
          </a>
          <a href="#how">이용 방법</a>
          <a href="#plans">진단 서비스</a>
          <a href="#cases">상담 사례</a>
          <a href="#success-cases">성공 사례</a>
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
          <a onClick={() => setMenu(false)} href="#cases">상담 사례</a>
          <a onClick={() => setMenu(false)} href="#success-cases">성공 사례</a>
          <a onClick={() => setMenu(false)} href="#faq">
            자주 묻는 질문
          </a>
        </nav>
      )}
      <main id="main-content" tabIndex={-1}>
        <section className="sea-hero" id="diagnosis">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-content">
            <div className="eyebrow">
              <span /> 사업의 다음 항로를 함께
            </div>
            <h1>
              사업에 집중하세요.
              <br />
              <span>자금의 길을 찾겠습니다.</span>
            </h1>
            <p className="hero-description">
              공고를 읽는 시간보다, 사업을 키우는 시간이 더 많아지도록.
              <br /> 지금 필요한 자금부터 준비 순서까지 차근차근 정리해 드립니다.
            </p>
            <div className="hero-actions">
              <button onClick={start}>우리 기업의 자금 방향 찾기 <ArrowUpRight size={19} /></button>
              <a href="#how">어떻게 진행되나요? <ArrowRight size={16} /></a>
            </div>
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
            <div className="funding-chart" aria-hidden="true"><svg viewBox="0 0 360 260" fill="none"><path className="chart-contour" d="M-20 180C65 80 160 255 240 150S365 35 390 90M-20 200C65 100 160 275 240 170S365 55 390 110M-20 220C65 120 160 295 240 190S365 75 390 130M-20 240C65 140 160 315 240 210S365 95 390 150" /><path className="chart-route" d="M38 180C85 180 88 88 155 96S242 185 304 60" /><circle cx="38" cy="180" r="5" /><circle cx="155" cy="96" r="5" /><circle cx="304" cy="60" r="7" /></svg><span className="chart-label chart-label-start">지금의 사업</span><span className="chart-label chart-label-end">다음 성장</span></div>
            <span className="mascot-speech">
              대표님, 함께 찾아볼까요? <Sparkles size={13} />
            </span>
            <MascotMotion />
            <span className="mascot-label">
              복잡한 이야기도 편하게. <b>정책이</b>
            </span>
          </div>
          <div className="workspace-label"><span><i /> 정책이 상담실</span><p>대표님의 이야기가, 진단의 시작입니다.</p><span>무료 사전 진단</span></div>
          <div className="workspace" id="consultation">
            <section className="sea-chat" aria-label="정책이와 상담">
              <div className="chat-top">
                <div className="assistant-profile">
                  <span className="avatar">
                    <img src="/jeongchaegi.svg" alt="정책이" width={40} height={40} />
                  </span>
                  <div>
                    <strong>
                      정책이{" "}
                      <span className="ai-badge">
                        자금 상담 파트너
                      </span>
                    </strong>
                    <small>
                      <i />{" "}
                      {busy
                        ? "답장을 입력하고 있어요..."
                        : "기업의 상황에 맞춰, 하나씩 함께 살펴봐요"}
                    </small>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setModal("정책이 학습노트")}
                    aria-label="정책이 학습노트"
                    title="정책이 자가학습·진화 메모리 보기"
                    style={{
                      width: "auto",
                      padding: "0 10px",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    상담 기억 {evolution.learnedFacts.length}
                  </button>
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
              {learnToast && (
                <div
                  role="status"
                  style={{
                    padding: "7px 18px",
                    fontSize: "11px",
                    fontWeight: 700,
                    background: "rgba(21, 126, 132, 0.16)",
                    color: "#72d5ca",
                    borderBottom: "1px solid rgba(72, 196, 193, 0.25)",
                  }}
                >
                  {learnToast}
                </div>
              )}
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
                              <img src="/jeongchaegi.svg" alt="" width={28} height={28} />
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
                              <button
                                type="button"
                                onClick={() => {
                                  const nextEvo = rewardPositiveFeedback(
                                    evolution,
                                    m.text
                                  );
                                  setEvolution(nextEvo);
                                  try {
                                    localStorage.setItem(
                                      "bareunfund-evolution-state",
                                      JSON.stringify(nextEvo)
                                    );
                                  } catch {
                                    // Ignore
                                  }
                                  setLearnToast(
                                    `✨ 대표님이 좋아하신 말투를 정책이가 학습했어요! (Lv.${nextEvo.level} · EXP ${nextEvo.exp}/${nextEvo.nextLevelExp})`
                                  );
                                  setTimeout(() => setLearnToast(null), 3500);
                                }}
                                title="이 답변 스타일을 정책이에게 학습시키기"
                                style={{
                                  border: 0,
                                  background: "transparent",
                                  color: "inherit",
                                  fontSize: "10px",
                                  padding: 0,
                                  opacity: 0.75,
                                }}
                              >
                                👍 공감돼요
                              </button>
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
                <span className="mini-label">상담 진행 상황</span>
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
          <FundingNeeds />
          <details className="document-tools"><summary>바른자금의 진단과 AI 이용 원칙</summary><div className="document-tool-body"><p>기업이 제공한 정보와 진단 규칙을 바탕으로 검토 방향과 근거를 정리합니다. AI는 결과를 이해하기 쉽게 설명하는 보조 도구이며, 자금 승인이나 신용등급을 결정하지 않습니다.</p><p>현재 입력 정보는 증빙 확인 전입니다. 외부 데이터 조회, NICE D&amp;B 연계, 자료 업로드와 전문가 연결은 아직 제공되지 않습니다. 체납, 자본잠식, 거절 이력이나 복잡한 조달은 전문가의 별도 검토가 필요합니다.</p><p>내부 진단은 금융기관의 심사나 신용평가 등급이 아니며, 실제 자격과 승인 여부는 해당 기관의 최신 기준과 심사로 결정됩니다.</p></div></details>
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
        <FundingNavigator onStart={prompt => { start(); void send(prompt); }} />
        <section className="how-section section-shell" id="how">
          <div className="section-heading">
              <span className="mini-label">진행 방법</span>
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
              <span className="mini-label">진단 서비스</span>
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
        <div className="section-shell report-section">
          <div className="section-heading"><span className="mini-label">상담 이후에 남는 것</span><h2>대화는 편하게.<br />결과는 구체적으로.</h2><p>어떤 방향을 검토하고, 무엇부터 준비할지.<br />가상 기업의 예시 리포트로 먼저 살펴보세요.</p></div>
          <div className="report-preview">
            <div className="report-preview-header"><span>BAREUN FUND</span><span>예시 리포트 / SAMPLE</span></div>
            <h3>우리 기업의 다음 한 걸음</h3>
            <div className="report-preview-row"><span>01</span><div><strong>검토할 자금 방향</strong><p>기업 상황에 맞는 기관과 자금 유형</p></div><Compass size={18} /></div>
            <div className="report-preview-row"><span>02</span><div><strong>확인해야 할 조건</strong><p>신청 자격, 제한 요건과 보완할 정보</p></div><ShieldCheck size={18} /></div>
            <div className="report-preview-row"><span>03</span><div><strong>바로 시작할 준비</strong><p>필요한 자료와 다음 행동의 우선순위</p></div><FileText size={18} /></div>
            <ReportSamples />
          </div>
        </div>
        <section className="cases-section section-shell" id="cases" aria-labelledby="cases-title">
          <div className="section-heading"><span className="mini-label">상담 사례</span><h2 id="cases-title">기업마다 다른 고민,<br />확인할 방향도 다릅니다.</h2><p>제공된 테스트 자료를 바탕으로 구성한 가상 사례입니다.<br />실제 상담이나 승인 결과를 뜻하지 않습니다.</p></div>
          <div className="case-list">
            <article><span>01 / 창업 소상공인</span><h3>인건비가 필요한 초기 사업자</h3><p>운영자금이 필요한 상황에서 업력과 기존 대출, 청년 우대 요건을 함께 확인합니다.</p><strong>확인할 것</strong><p>매출 자료 · 기존 대출 · 공고별 우대 조건</p></article>
            <article><span>02 / 시설 투자</span><h3>여러 사업체를 운영하며 설비를 늘릴 때</h3><p>시설 투자 계획과 관계 사업체의 채무를 구분해 확인하고 필요한 증빙을 정리합니다.</p><strong>확인할 것</strong><p>설비 견적 · 사업체별 차입 · 투자 계획</p></article>
            <article><span>03 / 재무 개선</span><h3>자금 신청 전 재무 상황을 살펴야 할 때</h3><p>재무·신용 상태가 취약한 가상 기업의 경우 추가 차입보다 현금흐름과 개선 방안을 먼저 검토합니다.</p><strong>확인할 것</strong><p>재무자료 · 상환 부담 · 전문가 검토 필요성</p></article>
          </div>
          <button className="cases-action" onClick={start}>우리 기업 상황 상담하기 <ArrowUpRight size={16} /></button>
        </section>
        <section className="success-section section-shell" id="success-cases" aria-labelledby="success-title">
          <div className="section-heading"><span className="mini-label">성공 사례</span><h2 id="success-title">확인된 성과를<br />투명하게 전하겠습니다.</h2><p>현재 공개 가능한 실제 자금조달 성공 사례는 준비 중입니다.<br />기업의 동의와 결과 확인을 거친 사례를 소개하겠습니다.</p></div>
          <div className="success-note"><ShieldCheck size={24} aria-hidden="true" /><div><strong>사실을 확인한 사례만 소개합니다</strong><p>가상 테스트 사례와 실제 승인·실행 결과를 구분합니다. 자금조달 결과는 기업 상황과 기관 심사에 따라 달라집니다.</p></div></div>
        </section>
        <section className="faq-section section-shell" id="faq">
          <div className="section-heading">
            <span className="mini-label">자주 묻는 질문</span>
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
            <span className="mini-label">바른 자금과 함께</span>
            <h2>
              다음 성장에는,
              <br />
              든든한 방향이 필요하니까.
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
            <span>바른 자금</span>
          </a>
          <div>
            <a className="admin-entry" href="#admin">학습 관리 <ArrowUpRight size={13} /></a>
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
            © {new Date().getFullYear()} 바른 자금. All rights reserved.
          </span>
          <span>기업의 가능성에, 바른 기준을.</span>
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
            {modal === "정책이 학습노트" ? (
              <div style={{ display: "grid", gap: "12px", fontSize: "12px" }}>
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    background: "rgba(21, 126, 132, 0.14)",
                    border: "1px solid rgba(72, 196, 193, 0.3)",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: "13px" }}>
                    Lv.{evolution.level} {evolution.stageTitle} (EXP{" "}
                    {evolution.exp}/{evolution.nextLevelExp})
                  </div>
                  <div style={{ marginTop: "4px", opacity: 0.85 }}>
                    누적 대화 {evolution.totalConversations}회 · 공감 피드백{" "}
                    {evolution.positiveFeedbacks}회 · 현재 말투:{" "}
                    {evolution.preferredTone}
                  </div>
                </div>

                <div
                  style={{
                    maxHeight: "180px",
                    overflowY: "auto",
                    display: "grid",
                    gap: "6px",
                  }}
                >
                  {evolution.learnedFacts.map((fact) => (
                    <div
                      key={fact.id}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "9px",
                        border: "1px solid rgba(139, 185, 183, 0.25)",
                        fontSize: "11px",
                      }}
                    >
                      <strong>• {fact.summary}</strong>{" "}
                      <span style={{ opacity: 0.65, fontSize: "10px" }}>
                        ({fact.learnedAt})
                      </span>
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!teachInput.trim()) return;
                    const { nextState } = evolveFromUserMessage(
                      evolution,
                      `기억해: ${teachInput.trim()}`
                    );
                    setEvolution(nextState);
                    try {
                      localStorage.setItem(
                        "bareunfund-evolution-state",
                        JSON.stringify(nextState)
                      );
                    } catch {
                      // Ignore
                    }
                    setTeachInput("");
                    setLearnToast(
                      `🧠 새로운 지침을 정책이가 학습해 진화했습니다! (Lv.${nextState.level})`
                    );
                    setTimeout(() => setLearnToast(null), 4000);
                  }}
                  style={{ display: "flex", gap: "6px" }}
                >
                  <input
                    value={teachInput}
                    onChange={(e) => setTeachInput(e.target.value)}
                    placeholder="정책이에게 직접 가르치기 (예: 더 친근하고 짧게 말해줘)"
                    style={{
                      flex: 1,
                      padding: "9px 11px",
                      borderRadius: "9px",
                      border: "1px solid rgba(139, 185, 183, 0.35)",
                      background: "transparent",
                      color: "inherit",
                      fontSize: "12px",
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      padding: "9px 12px",
                      borderRadius: "9px",
                      border: 0,
                      background: "#16868b",
                      color: "#fff",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    학습시키기
                  </button>
                </form>
              </div>
            ) : (
              <p>
                {modal === "자료 제출 안내"
                  ? "지금은 서류 없이 대화로 시작할 수 있어요. 파일 업로드와 공공 마이데이터 연결은 아직 제공되지 않습니다. 필요한 서류가 궁금하시면 정책이에게 물어보세요."
                  : modal === "개인정보 안내"
                  ? "대화 화면은 새로고침하면 초기화됩니다. 상담에서 추출한 기억과 선호 말투는 이 브라우저에 저장되어 다음 상담에 활용됩니다. AI 연결 시 입력 내용과 상담 기억이 해당 AI 제공자에게 전달됩니다. 상담 메모는 기기에 내려받을 수 있습니다."
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
            )}
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
