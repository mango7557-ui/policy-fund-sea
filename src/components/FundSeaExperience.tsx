"use client";

import { useEffect, useRef, useState } from "react";
import { usesPublicPages } from "../public-site.mjs";
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
  interviewReply,
  consultationWording,
  freeDiagnosis,
  referenceReply,
  conversationReply,
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
import { FundingEntry, SiteHeader } from "./HomepageEntry";
import { FundingNavigator } from "./FundingNavigator";
import { CompanyProfileFields } from "./CompanyProfileFields";
import { BusinessBranchFields } from "./BusinessBranchFields";
import { ConsultationReport } from "./ConsultationReport";
import guide from "../data/management-guide.json";
import { FundingNeeds } from "./FundingNeeds";
import { ConsultationCases } from "./ConsultationCases";
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

function isLocalPreview() {
  return window.location.protocol === "file:" || (
    ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname) && /\.html$/.test(window.location.pathname)
  );
}

async function chatEndpoints(): Promise<string[]> {
  if (usesPublicPages()) {
    try {
      const config = await fetch("./server-connection.json", { cache: "no-store", signal: AbortSignal.timeout(4000) });
      if (!config.ok) return [];
      const { chatOrigin } = await config.json();
      if (chatOrigin !== "https://chat.barunfund.kr") return [];
      return [chatOrigin + "/api/chat"];
    } catch {
      return [];
    }
  }
  if (!isLocalPreview()) return ["/api/chat"];
  return ["/api/chat", "http://localhost:3057/api/chat", "http://localhost:3056/api/chat", "http://localhost:3055/api/chat"];
}

async function publishedKnowledgeUrl(): Promise<string | null> {
  if (!usesPublicPages()) return "/api/knowledge";
  const response = await fetch("./server-connection.json", { cache: "no-store", signal: AbortSignal.timeout(4000) });
  if (!response.ok) return null;
  const { publishedKnowledgeOrigin } = await response.json();
  if (typeof publishedKnowledgeOrigin !== "string") return null;
  const origin = new URL(publishedKnowledgeOrigin);
  if (origin.protocol !== "https:" || origin.origin !== publishedKnowledgeOrigin) return null;
  return new URL("/api/knowledge", origin).href;
}

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
    tag: "이용 가능",
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
    tag: "출시 준비 중",
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
    tag: "출시 준비 중",
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
  {
    name: "연간 BASIC", tag: "출시 준비 중", price: "99,000", tier: "BASIC",
    sub: "기업 한 곳의 1년 자금관리",
    items: ["업종·지역에 맞는 검증 공고 알림", "분기별·주요 변화 시 재진단", "지난 진단과 매출·차입·보증 변화 비교"],
    button: "구독 구성 보기",
  },
];

const faqs = [
  {
    q: "무료 진단만 이용해도 되나요?",
    a: "네. 기본 자격과 검토할 방향, 부족한 정보, 다음 행동을 무료로 안내받을 수 있어요. 지금 바로 이용할 수 있는 것은 무료 사전 상담입니다. 유료 진단은 제공 내용을 미리 확인할 수 있어요.",
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



export default function FundSeaExperience() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [typingStatusText, setTypingStatusText] = useState("정책이가 메시지를 읽고 있어요...");
  const [modal, setModal] = useState<string | null>(null);
  const [faq, setFaq] = useState<number | null>(0);
  const [purpose, setPurpose] = useState("");
  const [saved, setSaved] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [diagnosisStarted, setDiagnosisStarted] = useState(false);
  const [aiEngine, setAiEngine] = useState<"ollama" | "gemini">("ollama");
  const [ollamaModel, setOllamaModel] = useState<string>("gemma4:latest");
  const [geminiModel, setGeminiModel] = useState<string>("gemini-3-flash-preview");
  const [aiConnected, setAiConnected] = useState(false);
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
        const url = await publishedKnowledgeUrl();
        if (!url) return;
        const res = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(4000) });
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

    let disposed = false;
    let checking = false;
    const checkConnection = async () => {
      if (checking || document.hidden) return;
      checking = true;
      try {
      for (const url of await chatEndpoints()) {
        try {
          const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
          const ct = res.headers.get("content-type") || "";
          if (res.ok && ct.includes("application/json")) {
            const info = await res.json();
            if (!disposed && info?.connected) {
              setAiConnected(true);
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
      if (!disposed) setAiConnected(false);
      } finally { checking = false; }
    };
    void checkConnection();
    const timer = window.setInterval(checkConnection, 60000);
    window.addEventListener("online", checkConnection);
    document.addEventListener("visibilitychange", checkConnection);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("online", checkConnection);
      document.removeEventListener("visibilitychange", checkConnection);
    };
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

    const text = consultationWording(reply.text.replace(/\*\*/g, "").trim());
    const characters = Array.from(text);
    const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = `ai-${runId}`;
    setMessages(prev => [...prev, {
      id, role: "assistant", text: instant ? text : "", time: nowTimeLabel(),
      source: reply.source, links: reply.links,
    }]);
    if (!instant) {
      // Short replies unfold syllable by syllable. Long replies stay readable without a long wait.
      const stride = Math.max(1, Math.ceil(characters.length / 48));
      let visible = "";
      for (let offset = 0; offset < characters.length; offset += stride) {
        if (activeRunId.current !== runId) return;
        visible += characters.slice(offset, offset + stride).join("");
        const partial = visible;
        setMessages(prev => prev.map(m => m.id === id ? { ...m, text: partial } : m));
        if (offset + stride < characters.length) {
          await new Promise(resolve => setTimeout(resolve, /[.!?。]$/.test(partial) ? 45 : 15));
        }
      }
    }
    if (activeRunId.current === runId) setBusy(false);
  };

  const requestAIReply = async (
    userText: string,
    historySnapshot: { role: "user" | "assistant"; text: string }[],
    currentAnswers: Answers,
    currentEvo: JeongchaegiEvolutionState,
    runId: number
  ) => {
    const compact = userText.replace(/[!?.~,\s]/g, "");
    if (
      /^(안녕하세요|안녕|반갑습니다|반가워요|여보세요|계세요|저기요|하이|선생님|상담사님|정책이님|정책아)$/.test(
        compact
      )
    ) {
      return {
        text: "안녕하세요! " + interviewReply(currentAnswers),
        source: "정책이 상담 가이드",
        links: [],
        isGreeting: true,
      };
    }

    const conversational = conversationReply(userText, currentAnswers, historySnapshot);
    if (conversational) return { text: conversational, source: "정책이 상담", links: [] };
    const guideTopic = guide.find(item => item.question === userText.trim());
    if (guideTopic) {
      const risk = freeDiagnosis(currentAnswers);
      return { text: guideTopic.answer + (risk.branch?.hold || risk.structure ? " 현재 상담에서 확인된 위험요인에 따라 구조개선·전문가 검토를 우선하세요." : ""),
        source: "2027 경영지원서비스 가이드북 " + guideTopic.pages + "쪽", links: [] };
    }
    const branchResult = freeDiagnosis(currentAnswers).branch;
    if (branchResult && (branchResult.hold || /진단|추천|조달 방향/.test(userText))) {
      return {
        text: [branchResult.stage, branchResult.reason, branchResult.routes.join(" · "), branchResult.action,
          branchResult.missing.length ? "다음으로 확인할 항목은 " + branchResult.missing[0] + "입니다. 기업 유형별 진단에서 알려주세요." : "",
          branchResult.notice].filter(Boolean).join(" "),
        source: branchResult.source,
        links: [],
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
                    text: `금전을 가리킬 때는 자금이라고 표현하세요. 당신은 정책자금 상담 도우미 '정책이'입니다. 첫 문장은 방금 들은 구체적인 사정이나 걱정을 짧게 받아 주세요. 이어서 질문에 직접 답하고 다음에 필요한 한 가지만 물어보세요. 감정을 짐작해 단정하거나 같은 위로를 되풀이하지 마세요. 모르는 내용은 모른다고 말하고 승인이나 금액을 단정하지 마세요. 과장된 공감이나 반복 인사 없이 간결하고 자연스러운 존댓말을 쓰세요. 답에 필요한 경우에만 질문을 하나 하세요. 이미 파악된 정보(${knownSummary})는 다시 묻지 마세요. 참고할 다음 진단 항목: ${upcoming?.text ?? "없음"}.\n${evoContext}`,
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
              .trim();
          if (!directText) throw new Error("Empty Gemini reply");
          setAiConnected(true);
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
    const endpoints = await chatEndpoints();
    for (const apiUrl of endpoints.length === 1 ? [endpoints[0], endpoints[0]] : endpoints) {
      if (activeRunId.current !== runId) break;
      try {
        const signal = AbortSignal.timeout(120000);
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stream: aiEngine === "ollama",
            message: userText,
            history: historySnapshot,
            answers: {...currentAnswers, profile: undefined},
            evolutionState: currentEvo,
            trainingEntries: training.filter(e => e.status === "published"),
            engine: aiEngine,
            clientApiKey: usesPublicPages() ? undefined : trimmedKey || undefined,
          }),
          signal,
        });

        const contentType = res.headers.get("content-type") || "";
        if (res.ok && res.body && contentType.includes("application/x-ndjson")) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          const model = res.headers.get("X-Chat-Model") || "gemma4:latest";
          const source = "Ollama (" + model + ")";
          const id = "ai-" + runId;
          const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          let text = "";
          let buffer = "";
          let complete = false;
          const render = (visible: string) => {
            if (activeRunId.current !== runId) return;
            setMessages(prev => {
              const reply: Message = { id, role: "assistant", text: visible, source, time: nowTimeLabel(), links: fallback.references };
              return prev.some(m => m.id === id)
                ? prev.map(m => m.id === id ? { ...m, text: visible } : m)
                : [...prev.map(m => m.unread ? { ...m, unread: false } : m), reply];
            });
          };
          try {
            while (!complete && activeRunId.current === runId) {
              const part = await reader.read();
              buffer += decoder.decode(part.value, { stream: !part.done });
              const lines = buffer.split("\n");
              buffer = part.done ? "" : lines.pop() || "";
              for (const line of lines.filter(line => line.trim())) {
                const event = JSON.parse(line);
                if (event.error) throw new Error("generation interrupted");
                text += event.message?.content || "";
                complete = event.done === true;
              }
              if (text && (!reducedMotion || complete)) render(consultationWording(text));
              if (part.done) break;
            }
            if (!complete || !text) throw new Error("incomplete reply");
            if (activeRunId.current === runId) { setAiConnected(true); setOllamaModel(model); }
          } catch {
            if (activeRunId.current === runId) {
              setMessages(prev => prev.filter(m => m.id !== id));
              throw new Error("retry incomplete response");
            }
          } finally {
            await reader.cancel().catch(() => {});
          }
          return { text, source, links: fallback.references, streamed: true };
        }
        if (res.ok && contentType.includes("application/json")) {
          const data = await res.json();
          if (data && typeof data.text === "string") {
            setAiConnected(
              data.provider === "ollama" || data.provider === "gemini"
            );
            if (data.provider === "ollama" && data.model) {
              setOllamaModel(String(data.model));
            } else if (data.provider === "gemini" && data.model) {
              setGeminiModel(String(data.model));
            }
            if (data.updatedAnswers && typeof data.updatedAnswers === "object") {
              setAnswers(previous => ({...data.updatedAnswers, profile: previous.profile}));
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
    if (aiEngine === "ollama" && isLocalPreview()) {
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
                content: `금전을 가리킬 때는 자금이라고 표현하세요. 당신은 다정하고 인간적인 정책자금 전문 상담사 '정책이'입니다. 마지막 발언의 의도를 먼저 살피세요. 짧은 답은 직전 질문에 연결하고, 정정하면 갱신하고, 설명을 원하면 먼저 답하세요. 추가 정보가 꼭 필요할 때만 한 가지를 물어보세요. 이미 확인된 정보(${knownSummary})는 중복해서 묻지 마세요. 현재 상태: ${diag.status}\n${evoContext}`,
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

  const openConsultation = (focusComposer: boolean) => {
    setDiagnosisStarted(true);
    const workspace = document.getElementById("consultation");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    workspace?.scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth", block: "start" });
    (focusComposer ? field.current : workspace)?.focus({ preventScroll: true });
  };
  const start = () => {
    openConsultation(true);
    if (busy || messages.at(-1)?.text.endsWith(formatHumanFollowUpQuestion(answers))) return;
    setMessages(prev => [...prev, { id: "intro-" + Date.now(), role: "assistant",
      text: interviewReply(answers), time: nowTimeLabel() }]);
  };

  const deliverInterview = async (runId: number, message: string, updated: Answers) => {
    let text = interviewReply(updated, answers);
    let source = "바른자금 기본 진단";
    const shortAnswer = /^(네|예|응|아니요?|아뇨|있어요|없어요|잘 모르겠어요)[.!~\s]*$/.test(message.trim());
    if (!shortAnswer && aiConnected && aiEngine === "ollama" && nextQuestion(updated)) {
      for (const url of await chatEndpoints()) {
        try {
          const res = await fetch(url, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "interview", engine: "ollama", message, answers: {...updated, profile: undefined},
              history: messages.slice(-4).map(({ role, text }) => ({ role, text })) }),
            signal: AbortSignal.timeout(18000),
          });
          if (!res.ok) continue;
          const data = await res.json();
          if (data.mode === "interview" && data.provider === "ollama" && data.text) {
            const lead = String(data.text).split(/[.!?？]/, 1)[0].trim();
            const repeated = lead && messages.slice(-6).some(turn => turn.role === "assistant" && turn.text.includes(lead));
            if (repeated || /^(말씀해 주셔서|알려주셔서|감사합니다|고맙습니다)/.test(lead)) break;
            text = data.text;
            source = data.source;
            break;
          }
        } catch { /* Continue with the locally calculated question. */ }
      }
    }
    await deliverHumanLikeAssistantTurn(runId, { text, source });
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

    await deliverInterview(runId, label, updated);
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

    const updatedAnswers = extractAnswersFromText(answers, text, messages.at(-1)?.text);
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

    const changed = Object.keys(updatedAnswers).some(key => updatedAnswers[key as AnswerKey] !== answers[key as AnswerKey]);
    const previousText = messages.at(-1)?.text || "";
    const responding = question && previousText.endsWith(formatHumanFollowUpQuestion(answers));
    const wantsResult = /^(?:지금까지|현재|중간)?\s*(?:결과|진단 결과)(?:를|가)?\s*(?:보여줘|알려줘|궁금해|볼래)?[요.!? ]*$/.test(text);
    if (wantsResult || (changed && !/[?？]|어떻게|왜요|뭐예요/.test(text))) {
      const diagnosis = freeDiagnosis(updatedAnswers);
      const preview = wantsResult && nextQuestion(updatedAnswers)
        ? "지금까지의 잠정 결과예요. " + diagnosis.status + " " + diagnosis.reasons.join(" ") + "\n" : "";
      if (wantsResult) await deliverHumanLikeAssistantTurn(runId, { text: preview + interviewReply(updatedAnswers, answers), source: "바른자금 기본 진단" });
      else await deliverInterview(runId, text, updatedAnswers);
      return;
    }
    if (responding && /^(네|예|아니요|아뇨|응|아니|맞아요)[.! ]*$/.test(text)) {
      await deliverHumanLikeAssistantTurn(runId, { text: "뜻을 정확히 이해하고 싶어요. 아래 선택지에서 고르셔도 돼요. " + formatHumanFollowUpQuestion(answers) });
      return;
    }
    const reply = await requestAIReply(
      text,
      historySnapshot,
      updatedAnswers,
      nextEvo,
      runId
    );
    if (!reply.isGreeting) {
      setDiagnosisStarted(true);
    }
    if ("streamed" in reply && reply.streamed) {
      if (activeRunId.current === runId) setBusy(false);
    } else await deliverHumanLikeAssistantTurn(runId, reply);
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
        .join("\n\n") +
      (result.branch ? "\n\n기업 유형별 진단\n" + JSON.stringify({ 입력: answers.branch, 결과: result.branch }, null, 2) : "");
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
      <SiteHeader onStart={start} />
      <main id="main-content" tabIndex={-1}>
        <section className="sea-hero" id="diagnosis">
          <FundingEntry onStart={start} busy={busy} onTopic={(prompt) => { openConsultation(false); void send(prompt); }} />
          <CompanyProfileFields value={answers.profile || {}} onChange={profile => {
            setAnswers(previous => ({ ...previous, profile, ...(profile.form ? {entity: /^(개인|공동)사업자$/.test(profile.form) ? "sole" : /법인/.test(profile.form) ? "corporation" : "unknown"} : {}) }));
            setDiagnosisStarted(true); setSaved(false);
          }}/>
          <BusinessBranchFields answers={answers.branch || {}} onChange={branch => { setAnswers(previous => ({ ...previous, branch })); setDiagnosisStarted(true); setSaved(false); }} />
          <div className="workspace-label"><span><i /> 정책이 상담실</span><p>대표님의 이야기가, 진단의 시작입니다.</p><span>무료 사전 진단</span></div>
          <div className="workspace" id="consultation" role="region" aria-label="자금 상담" tabIndex={-1}>
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
                      fontSize: "var(--type-caption)",
                      fontWeight: 700,
                    }}
                  >
                    상담 기억 {evolution.learnedFacts.length}
                  </button>
                  {customApiKey.trim().startsWith("AIza") ? (
                    <span className="chat-mode-label">Gemini</span>
                  ) : aiConnected ? (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setAiEngine(prev => prev === "ollama" ? "gemini" : "ollama")}
                      aria-label="사용할 AI 엔진 전환"
                    >
                      {aiEngine === "ollama" ? "Gemma 4" : "Gemini"}
                    </button>
                  ) : (
                    <span className="chat-mode-label">문서 기반</span>
                  )}
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
                    fontSize: "var(--type-caption)",
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
                    <h2>지금 어떤 일에 자금이 필요하세요?</h2>
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
                  <div className="message-list" aria-live="polite" aria-busy={busy}>
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
                              정책이 <span>{m.source?.startsWith("Ollama (") ? m.source.replace(/^Ollama \((.*)\)$/, "$1") : m.source?.startsWith("Gemini") ? m.source : "문서 기반 안내"}</span>
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
                          <p className={busy && m.role === "assistant" && m === messages[messages.length - 1] ? "reply-typing" : undefined}>{m.text}</p>
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
                                  fontSize: "var(--type-caption)",
                                  padding: 0,
                                  minHeight: "24px",
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
                    {busy && messages[messages.length - 1]?.role === "user" && (
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
              {question && !busy && messages.at(-1)?.role === "assistant" && messages.at(-1)?.text.endsWith(question.text) && (
                <div className="nbq-panel">
                  <div>
                    {question.choices.map((choice) => (
                      <button
                        key={choice.value}
                        onClick={() =>
                          chooseAnswer(question.key, choice.value, choice.label)
                        }
                      >
                        {choice.label}
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
                    placeholder="짧게 답해도 괜찮아요"
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
              {result.branch && <div className="branch-result" aria-live="polite">
                <h3>{result.branch.stage}</h3><p>{result.branch.reason}</p>
                <ul>{result.branch.routes.map(route => <li key={route}>{route}</li>)}</ul>
                <p>{result.branch.action}</p>
                {result.branch.missing.length > 0 && <p>추가 확인 · {result.branch.missing.join(" · ")}</p>}
                {result.branch.expert && <p>전문가 검토 필요 · 현재 자동 배정은 준비 중입니다.</p>}
                <small>{result.branch.source}<br />{result.branch.notice}</small>
              </div>}
              <ConsultationReport answers={answers} messages={messages} busy={busy} onRecheck={report => {
                reset();
                const profile = {...report.profile};
                for (const key of ["year","auditYear","auditReport","audit","opinion","continuity","period","sales","debt","guarantee","filing","books","adjust"]) delete profile[key];
                setAnswers({profile});
                openConsultation(true);
                setMessages([{id:"recheck-" + Date.now(),role:"assistant",source:"바른자금 기본 진단",time:nowTimeLabel(),
                  text:"이번에는 현재 상황을 알려주세요. " + interviewReply({})}]);
              }} />
              <button
                className="save-button"
                disabled={!messages.length && !result.branch}
                onClick={download}
              >
                <Download size={15} />
                {saved ? "상담 메모를 저장했어요" : "상담 메모 저장"}
              </button>
            </aside>
          </div>
          <QuestionLibrary onAsk={send} />
          <FundingNeeds />
          <details className="document-tools"><summary>경영지원 가이드 · 분야별로 질문하기</summary>
            <div className="document-tool-body"><p>프라임경영기술의 2027년 경영지원서비스 브로셔와 가이드북에서 상담 주제를 골랐습니다. 질문을 선택하면 정책이 상담과 보고서에 답변이 이어집니다.</p>
            <div className="question-results">{guide.map(item => <button type="button" key={item.topic} disabled={busy} onClick={() => { openConsultation(false); void send(item.question); }}><span>{item.topic} · 가이드북 {item.pages}쪽</span>{item.question}</button>)}</div></div>
          </details>
          <details className="document-tools"><summary>공고 확인 기준</summary><div className="document-tool-body"><p>신청 전 기관의 공식 공고와 첨부 지침에서 대상 업종·지역, 접수기간, 금리·보증료, 중복수혜 제한을 확인하세요. 예산 소진형 사업은 현재 접수 여부를 별도로 확인해야 합니다.</p><p>가이드북에 소개된 2027년 사업은 탐색용 참고자료입니다. 실시간 공고 자동수집과 담당자 검증을 거친 상품 추천은 준비 중입니다.</p></div></details>
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
        <section className="brand-services section-shell" aria-labelledby="brand-services-title">
          <div className="section-heading"><span className="mini-label">바른자금이 안내하는 영역</span><h2 id="brand-services-title">기업에 필요한 기회를<br />쉽게 살펴보세요.</h2><p>공식 정보를 확인하고, 조건과 준비사항을 이해할 수 있도록 돕습니다.</p></div>
          <div className="brand-services-grid"><article><span>01</span><h3>정책자금</h3><p>운전자금과 시설자금, 정책융자와 보증 연계 정보를 살펴봅니다.</p></article><article><span>02</span><h3>지원금</h3><p>고용과 시설개선, 사업화에 필요한 지원 기회를 확인합니다.</p></article><article><span>03</span><h3>환급금</h3><p>국세와 지방세 등의 환급 가능성과 확인 절차를 살펴봅니다.</p></article><article><span>04</span><h3>지원사업</h3><p>연구개발, 수출, 인증과 판로 등 기업을 위한 지원사업을 알아봅니다.</p></article></div>
          <p className="brand-services-status">현재 정책자금 사전 상담을 제공하며, 지원금·환급금·지원사업의 개별 공고 탐색과 자동 확인 기능은 준비 중입니다. 지원 여부는 공식 공고와 심사를 확인해야 합니다.</p>
        </section>
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
              <h2>진단 서비스 비교</h2>
              <p>무료 상담은 지금 이용할 수 있습니다. 유료 진단은 출시 예정입니다.</p>
            </div>
            <div className="plan-grid">
              {plans.map((p) => (
                <article
                  className={`plan-card ${p.tier === "L1" ? "featured" : ""}`}
                  key={p.tier}
                >
                  <span className="plan-tag">{p.tag}</span>
                  <h3>{p.name}</h3>
                  <div className="plan-price">
                    {p.price}
                    <span>{p.tier === "BASIC" ? "원 / 년" : "원"}</span>
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
                <b>신청 준비부터 도움이 필요하신가요?</b> 전문가 실행 컨설팅의 제공 예정 내용을 확인하세요.
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
        <ConsultationCases onAsk={prompt => { openConsultation(false); void send(prompt); }} />
        <div className="publication-panels section-shell">
          <section id="success-cases" aria-labelledby="success-title">
            <ShieldCheck size={23} aria-hidden="true" />
            <div><h2 id="success-title">성공 사례</h2>
              <p>현재 공개된 실제 조달 사례는 없습니다. 실행 결과와 기업의 공개 동의를 확인한 뒤 익명으로 소개합니다.</p>
            </div>
          </section>
          <section id="partners" aria-labelledby="partners-title">
            <Building2 size={23} aria-hidden="true" />
            <div><h2 id="partners-title">파트너사 · 정책자금 실행 파트너</h2><p>바른자금이 먼저 진단하고, 대표님이 원하는 경우 검증된 컨설턴트가 상담과 서류 준비를 돕습니다. 회원 보고서 보관함에서 파트너의 전문 분야와 비용을 확인한 뒤 공유에 동의할 수 있어요.</p>
              <p>운영사 제공 자료에 따르면 (사)한국중소상공인진흥협회 전문가 네트워크와 연계합니다. 재무·노무·특허·인증 등 분야별 검토가 필요한 경우 상담 범위를 먼저 확인합니다.</p>
            </div>
          </section>
        </div>
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
                <p hidden={faq !== index} id={`faq-${index}`}>{item.a}</p>
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
          <a className="sea-brand brand-guide-logo" href="#" aria-label="바른자금 홈"><img src="./bareun-brand.webp" alt="바른자금 BAREUN FUND" /></a>
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
            © {new Date().getFullYear()} 바른자금. All rights reserved.
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
              <div style={{ display: "grid", gap: "12px", fontSize: "var(--type-label)" }}>
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    background: "rgba(21, 126, 132, 0.14)",
                    border: "1px solid rgba(72, 196, 193, 0.3)",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: "var(--type-label)" }}>
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
                        fontSize: "var(--type-caption)",
                      }}
                    >
                      <strong>• {fact.summary}</strong>{" "}
                      <span style={{ opacity: 0.65, fontSize: "var(--type-caption)" }}>
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
                      fontSize: "var(--type-label)",
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
                      fontSize: "var(--type-caption)",
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
                  : modal === "연간 BASIC" ? "연 99,000원으로 설계한 상품입니다. 무료진단이나 19,000원 기본 리포트 후 이용하며, 검증된 맞춤공고와 분기 재진단을 제공합니다. 기본 리포트 제공 횟수와 할인은 출시 시 확정합니다. 59,000원 정밀전략 리포트와 실행컨설팅은 별도입니다. 현재 자동 알림과 결제는 준비 중입니다."
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
