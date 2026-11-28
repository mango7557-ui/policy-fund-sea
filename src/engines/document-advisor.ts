import { CompanyProfile, profileAssessment } from "./company-profile";
import { diagnoseBranch, BranchAnswers } from "./business-branches";
import bank from "../data/master/question-bank.json";
import rules from "../data/master/rules.json";

export const DOCUMENT_VERSION = "2026-11-01";
export const QUESTION_BANK = bank;
export const POLICY_REFERENCES = rules.Institution_Rule_Index.slice(1).map(({ cells, row }) => ({ id: cells[0], institution: cells[1], subject: cells[2], criteria: cells[5], status: cells[6], date: cells[8], url: cells[9], note: cells[10], row }));
export const PREFERENCE_REFERENCES = rules.Preferential_Factors.slice(1).map(({ cells }) => ({ id: cells[0], name: cells[2], evidence: cells[3], condition: cells[5], caution: cells[9] }));
export type AnswerKey = "purpose" | "entity" | "operation" | "tax" | "overdue" | "credit" | "industry" | "ceo" | "related" | "finance" | "documents";
export type Answers = Partial<Record<AnswerKey, string>> & { profile?: CompanyProfile; branch?: BranchAnswers };
export type Question = { key: AnswerKey; text: string; choices: { value: string; label: string }[] };
const q = (key: AnswerKey, text: string, options: [string, string][]): Question => ({ key, text, choices: options.map(([value, label]) => ({ value, label })) });
export const DIAGNOSIS_QUESTIONS: Question[] = [
  q("purpose", "자금을 어디에 쓰실 예정이에요?", [["working", "운영비"], ["facility", "기계·시설 구입"], ["refinance", "대출 갈아타기"], ["unknown", "잘 모르겠어요"]]),
  q("entity", "개인사업자세요, 법인사업자세요?", [["sole", "개인"], ["corporation", "법인"], ["prestartup", "창업 준비 중"]]),
  q("operation", "지금도 사업장을 운영하고 계세요?", [["active", "영업 중이에요"], ["dormant", "잠시 쉬고 있어요"], ["closed", "폐업했어요"]]),
  q("tax", "아직 못 낸 세금이 있나요?", [["none", "없어요"], ["exception", "나눠 내는 중이에요"], ["active", "있어요"], ["unknown", "잘 모르겠어요"]]),
  q("overdue", "지금 밀린 대출금이나 카드값이 있나요?", [["none", "없어요"], ["cleared", "지금은 다 갚았어요"], ["active", "있어요"], ["unknown", "잘 모르겠어요"]]),
  q("credit", "신용회복이나 개인회생을 신청한 적이 있나요?", [["none", "없어요"], ["review", "있어요"], ["unknown", "잘 모르겠어요"]]),
  q("industry", "어떤 일을 하세요?", [["eligible", "제조·음식점·판매 등"], ["excluded", "부동산 임대·유흥 등"], ["unknown", "잘 모르겠어요"]]),
  q("ceo", "사업을 직접 운영하세요?", [["yes", "직접 운영해요"], ["review", "따로 설명할게요"], ["unknown", "잘 모르겠어요"]]),
  q("related", "대표님 이름으로 된 다른 사업장도 있나요?", [["none", "없어요"], ["yes", "있어요"], ["unknown", "잘 모르겠어요"]]),
  q("finance", "요즘 사업 형편은 어떤가요?", [["normal", "꾸준한 편이에요"], ["weak", "적자나 빚이 부담돼요"], ["unknown", "잘 모르겠어요"]]),
  q("documents", "매출을 확인할 서류를 준비할 수 있나요?", [["ready", "준비할 수 있어요"], ["missing", "도움이 필요해요"], ["unknown", "잘 모르겠어요"]]),
];
export function nextQuestion(answers: Answers) {
  return DIAGNOSIS_QUESTIONS.find(item => answers[item.key] === undefined) ?? null;
}
export function answerQuestion(answers: Answers, key: AnswerKey, value: string): Answers {
  const question = nextQuestion(answers);
  if (question?.key !== key || !question.choices.some(c => c.value === value)) return answers;
  return { ...answers, [key]: value };
}

/**
 * 대표님이 채팅창에 자연어로 말씀하신 내용에서 진단 항목을 자동으로 추출·누적하여
 * 이미 답한 질문을 다시 묻지 않고 대화가 계속 다음 단계로 이어지게 한다.
 */
export function extractAnswersFromText(current: Answers, rawText: string, previousReply = ""): Answers {
  const original = rawText.trim();
  const t = original.replace(/^[^.!?]*(?:말고|아니라|아니고)\s*(?=\S)/, "");
  if (!t) return current;
  // 질문에 등장한 조건을 고객이 사실로 진술한 것으로 기록하지 않는다.
  if (/[?？]|무엇|뭐가|어떻게|어떤|가능한가|필요한가|되나요|있나요|할까요/.test(t)) {
    // Preserve an explicit self-introduction before the question, not hypothetical eligibility.
    if (/^(?:(?:저는|제가|저)\s*)?개인\s*사업자(?:인데|이고)[,\s]/.test(t)) return { ...current, entity: "sole" };
    return current;
  }
  const next: Answers = { ...current };

  const pending = nextQuestion(current);
  const prompted = pending && previousReply.endsWith(pending.text);
  if (pending?.key === "purpose" && /^(운영|운영비|운영자금)(이요|이야|요)?[.!~ ]*$/.test(t)) return { ...current, purpose: "working" };
  if (prompted) {
    const short = t.replace(/[.!~\s]/g, "");
    const choice = pending.choices.find(c => c.label.replace(/\s/g, "") === short);
    if (choice) return { ...current, [pending.key]: choice.value };

    if (["tax", "overdue", "credit", "related"].includes(pending.key)) {
      if (/^(없어|없음|아니|아니요|아뇨)$/.test(short)) return { ...current, [pending.key]: "none" };
      if (/^(네|예|응|있어|있음)$/.test(short)) return { ...current, [pending.key]: {tax:"active",overdue:"active",credit:"review",related:"yes"}[pending.key as "tax" | "overdue" | "credit" | "related"] };
    }
  }

  // 1. 자금 용도 (purpose)
  if (/시설|설비|기계|공장|확장|리뉴얼|인테리어|매입|신축/.test(t)) {
    next.purpose = "facility";
  } else if (/대환|갈아타|고금리/.test(t)) {
    next.purpose = "refinance";
  } else if (/운전자금|운영비|운영자금|인건비|급여|월급|원재료|재료비|자재|임대료|월세|재고/.test(t)) {
    next.purpose = "working";
  }

  // A bare "개인" identifies the business only in response to a business-form question.
  const short = t.replace(/[.!~\s]/g, "").replace(/(?:이에요|이예요|이요|입니다|이야|요)$/, "");
  const askedAboutEntity = /개인\s*사업자|사업자\s*(형태|유형)|법인으로/.test(previousReply);
  if (askedAboutEntity && /^(개인|개인사업)$/.test(short)) next.entity = "sole";

  // 2. 사업자 형태 (entity)
  if (/법인|주식회사|\(주\)|㈜/.test(t)) {
    next.entity = "corporation";
  } else if (/개인사업자|개인\s*사업|자영업|1인\s*사업/.test(t)) {
    next.entity = "sole";
  } else if (/예비\s*창업|창업\s*준비|사업자\s*내기\s*전/.test(t)) {
    next.entity = "prestartup";
  }

  // 3. 영업 상태 (operation)
  if (/폐업/.test(t)) {
    next.operation = "closed";
  } else if (/휴업/.test(t)) {
    next.operation = "dormant";
  } else if (/정상\s*영업|영업\s*중|운영\s*중|가동\s*중|하고\s*있|년\s*됐|년차|매출/.test(t)) {
    next.operation = "active";
  }

  // 4. 세금 체납 (tax)
  if (/분납|징수\s*유예|유예|완납\s*예정/.test(t)) {
    next.tax = "exception";
  } else if (/체납.*(없|아뇨|아니|완납)|세금.*(잘\s*내|밀린\s*거\s*없|문제\s*없|완납)/.test(t)) {
    next.tax = "none";
  } else if (/체납.*(있|중|밀렸|못\s*냈)/.test(t)) {
    next.tax = "active";
  }

  // 5. 금융 연체 (overdue)
  if (/연체.*(해소|갚았|정리)/.test(t)) {
    next.overdue = "cleared";
  } else if (/연체.*(없|아뇨|아니|정상)/.test(t)) {
    next.overdue = "none";
  } else if (/연체.*(있|중)/.test(t)) {
    next.overdue = "active";
  }

  // 6. 업종 적격성 (industry)
  if (/유흥|사행|도박|부동산\s*임대/.test(t)) {
    next.industry = "excluded";
  } else if (/제조|식품|한식|음식|식당|카페|도소매|유통|물류|IT|소프트웨어|개발|서비스|건설|운수|가공/.test(t)) {
    next.industry = next.industry ?? "eligible";
  }

  // 7. 대표자 직접 경영 (ceo)
  if (/직접\s*경영|제가\s*직접|혼자\s*운영|본인이\s*직접/.test(t)) {
    next.ceo = "yes";
  } else if (/공동\s*대표|가족\s*명의|실경영자/.test(t)) {
    next.ceo = "review";
  }

  // 8. 타 사업체 보유 (related)
  if (/다른\s*사업자.*없|하나만\s*운영|타\s*사업장.*없/.test(t)) {
    next.related = "none";
  } else if (/다른\s*개인사업자|타\s*사업체|사업자.*하나\s*더|관계\s*법인|복수\s*사업/.test(t)) {
    next.related = "yes";
  }

  // 9. 현재 질문(nextQuestion)에 대해 짧은 긍정/부정으로 답한 경우 문맥 반영
  const currentPending = nextQuestion(current);
  if (currentPending && previousReply.includes(formatHumanFollowUpQuestion(current))) {
    if (/^(잘\s*)?(모르겠|모르겠어|모르|몰라|건너뛰|패스|확인해\s*봐야)/.test(t)) {
      next[currentPending.key] = "unknown";
      return next;
    }
    if (currentPending.key === "finance" && /적자|부채가 많/.test(t)) next.finance = "weak";
    if (currentPending.key === "credit" && /회생|신용회복/.test(t) && !/없/.test(t)) next.credit = "review";
    if (currentPending.key === "operation" && (/^(네|예|응|맞아(?:요)?|영업\s*중(?:이(?:에요|야)|이에요)?)[.!~ ]*$/.test(t) || /정상\s*영업|잘\s*돌아가요/.test(t))) {
      next.operation = "active";
    } else if (currentPending.key === "tax" && /^(없어요|없습니다|깨끗해요|완납)/.test(t)) {
      next.tax = "none";
    } else if (currentPending.key === "overdue" && /^(없어요|없습니다|정상)/.test(t)) {
      next.overdue = "none";
    } else if (currentPending.key === "credit" && /^(없어요|없습니다|해당\s*없)/.test(t)) {
      next.credit = "none";
    } else if (currentPending.key === "ceo" && /^(네|예|맞아요|직접|제가)/.test(t)) {
      next.ceo = "yes";
    } else if (currentPending.key === "related" && /^(아니오|아뇨|없어요|없습니다|하나뿐)/.test(t)) {
      next.related = "none";
    } else if (currentPending.key === "related" && /^(네|있어요|있습니다|하나\s*더)/.test(t)) {
      next.related = "yes";
    } else if (currentPending.key === "finance" && /^(없어요|없습니다|괜찮아요|흑자|정상)/.test(t)) {
      next.finance = "normal";
    } else if (currentPending.key === "documents" && /^(네|가능해요|있습니다|준비)/.test(t)) {
      next.documents = "ready";
    }
  }

  return next;
}

export function summarizeKnownFacts(answers: Answers): string {
  const facts = DIAGNOSIS_QUESTIONS.flatMap(q => {
    const answer = answers[q.key];
    if (!answer) return [];
    return [q.text + " → " + (q.choices.find(c => c.value === answer)?.label || "추가 확인 필요")];
  });
  return facts.join(", ") || "아직 파악된 기본정보 없음";
}

export function freeDiagnosis(answers: Answers) {
  const missing = DIAGNOSIS_QUESTIONS.filter(q => !answers[q.key] || answers[q.key] === "unknown").map(q => q.text);
  const blocked = answers.tax === "active" || answers.overdue === "active" || answers.operation === "closed" || answers.operation === "dormant" || answers.industry === "excluded";
  const profile = answers.profile || {};
  const assessment = profileAssessment(profile);
  const sector = /영농|농업회사/.test(profile.form || "") ? "농업·농식품" : /영어조합|어업회사/.test(profile.form || "") ? "어업·수산" : undefined;
  const branchInputs = { ...answers.branch, businessType: sector || answers.branch?.businessType };
  const initialBranch = diagnoseBranch({ ...branchInputs, recovery: answers.finance === "weak" ? "지속적 영업적자" : answers.branch?.recovery }, blocked || answers.credit === "review");
  const branch = assessment.hold ? { stage: "신청주체·증빙 전문가 확인", hold: true, expert: true, routes: [] as string[], missing: initialBranch?.missing || [],
    reason: assessment.notes.join(" "), action: "등록·회계 자료를 확인한 뒤 다시 진단하세요.", notice: "사용자 입력 기준 사전 검토", source: "추가설계서 v5.3·v5.4" } : initialBranch;
  const structure = answers.finance === "weak" || Boolean(branch?.hold);
  const exceptional = answers.tax === "exception" || answers.overdue === "cleared" || answers.credit === "review" || answers.ceo === "review" || answers.related === "yes" || answers.entity === "prestartup" || answers.documents === "missing";
  const status = blocked ? "현재 곤란" : missing.length || exceptional || structure ? "추가 확인" : "검토 가능";
  const reasons: string[] = [...assessment.notes];
  if (blocked) reasons.push("현재 응답에 제한 요인이 있어 일반 자금 신청 전 해소·예외 여부를 확인해야 합니다.");
  if (answers.tax === "exception") reasons.push("분납·유예·완납예정은 즉시 종결하지 않고 기관별 예외요건을 확인합니다.");
  if (answers.ceo === "review") reasons.push("공동·가족경영 관계와 실제 경영 참여 방식을 추가 확인합니다.");
  if (answers.related === "yes") reasons.push("다른 사업체 채무는 대상기업 부채에 단순 합산하지 않고 사업체·기관별로 분리합니다.");
  if (answers.finance === "weak" || initialBranch?.hold) reasons.push("자본잠식·영업적자 등 재무취약 상태는 신규 차입금액 제시보다 현금흐름·구조개선 검토를 우선합니다.");
  if (answers.documents === "missing") reasons.push("자동조회 장애·자료 누락은 진단 중단 대신 누락 자료만 대체 제출합니다.");
  if (!reasons.length) reasons.push(missing.length ? "아직 확인하지 않은 핵심 정보가 있습니다." : "응답 기준 기본 제한요인이 확인되지 않았습니다. 증빙·최신 공고 검증은 별도로 필요합니다.");
  const direction = blocked || structure ? "제한요인 해소·재기 또는 구조개선 경로 검토" : answers.purpose === "facility" ? "시설자금 방향 — 투자견적·자기자금·설치 주소 확인" : answers.purpose === "refinance" ? "대환 전용 공고 여부와 기존 대출 조건 확인" : "운전자금 방향 — 업종·규모·금융잔액 확인";
  return { branch, status: branch?.stage || status, reasons, missing, direction: branch ? branch.stage + " — " + branch.reason : direction, structure, complete: nextQuestion(answers) === null, amount: null, source: "고객 직접입력 · 증빙 미검증", referenceDate: DOCUMENT_VERSION, action: branch ? branch.action : blocked || structure ? "부족자료와 개선사항을 먼저 정리하세요. 유료결제보다 보완이 우선입니다." : "최신 금융거래확인서·보증잔액·매출 자료와 공식 공고를 대조해 주세요." };
}

const normalize = (text: string) => text.toLowerCase().replace(/[^가-힣a-z0-9]/g, "");
const grams = (text: string) => new Set(Array.from({ length: Math.max(0, text.length - 1) }, (_, i) => text.slice(i, i + 2)));
export function searchQuestions(query: string) {
  const normalized = normalize(query);
  if (normalized.length < 3) return [];
  const input = grams(normalized);
  return QUESTION_BANK.map(core => {
    const texts = [core.question, ...core.variants.map(v => v.text)];
    let score = 0;
    for (const text of texts) {
      const candidate = normalize(text);
      if (candidate === normalized) { score = 1; break; }
      const tokens = grams(candidate);
      const overlap = [...input].filter(g => tokens.has(g)).length;
      score = Math.max(score, 2 * overlap / (input.size + tokens.size || 1));
    }
    return { core, score };
  }).filter(r => r.score >= .22).sort((a, b) => b.score - a.score).slice(0, 3);
}
export function formatHumanFollowUpQuestion(currentAnswers: Answers = {}): string {
  const upcoming = nextQuestion(currentAnswers);
  return upcoming?.text || "지금까지 말씀해 주신 내용으로 정리해 볼게요.";
}

export function interviewReply(answers: Answers, previous?: Answers) {
  const next = nextQuestion(answers);
  const result = freeDiagnosis(answers);
  const changed = DIAGNOSIS_QUESTIONS.find(q => answers[q.key] && answers[q.key] !== previous?.[q.key]);
  if (!next) {
    const direction = answers.purpose === "unknown" && !result.branch && !result.direction.includes("제한요인")
      ? "자금 용도를 확인한 뒤 검토 방향을 좁힐 수 있어요." : result.direction;
    return ["지금까지 말씀해 주신 내용으로 정리해 볼게요.", direction,
      ...result.reasons, result.missing.length ? "다시 확인할 내용 · " + result.missing.join(" / ") : "",
      result.action, "상담 보고서 생성 버튼을 누르면 이 내용을 다시 보실 수 있어요."].filter(Boolean).join("\n");
  }
  let lead = "";
  if (previous && changed) {
    const value = answers[changed.key];
    if (value === "unknown") lead = "그 부분은 나중에 확인할 내용으로 남겨둘게요.";
    else if (changed.key === "entity") lead = value === "sole" ? "개인사업자로 운영하고 계시군요." : value === "corporation" ? "법인으로 운영하고 계시군요." : "창업을 준비하고 계시는군요.";
    else if (changed.key === "purpose") lead = ({ working: "운영비가 필요하시군요.", facility: "시설 투자를 준비하고 계시는군요.", refinance: "기존 대출의 이자 부담을 줄이고 싶으시군요." })[value as "working" | "facility" | "refinance"] || "";
    else if (value === "active" && ["tax", "overdue"].includes(changed.key)) lead = "말씀해 주셔서 고맙습니다. 이 부분은 신청 전에 별도로 확인하도록 표시할게요.";
  }
  return [lead, formatHumanFollowUpQuestion(answers)].filter(Boolean).join(" ");
}

export function ensureEndsWithFollowUpQuestion(
  replyText: string,
  currentAnswers: Answers = {}
): string {
  // 여러 문단으로 나뉘어 어색해지지 않도록 한 호흡의 자연스러운 문단으로 정리
  const singleParagraph = replyText
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  const followUp = formatHumanFollowUpQuestion(currentAnswers);
  if (!singleParagraph) return followUp;

  // AI가 이미 스스로 따뜻한 질문이나 권유로 끝냈다면 그대로 한 말풍선으로 반환
  if (
    /[?？]\s*$/.test(singleParagraph) ||
    /(알려주세요|말씀해\s*주세요|들려주세요|어떠세요|있으실까요|맞으시죠)[.!~\s😊]*$/.test(
      singleParagraph
    )
  ) {
    return singleParagraph;
  }

  return singleParagraph;
}

type ConversationTurn = { role: "user" | "assistant"; text: string };

export function conversationReply(query: string, answers: Answers, history: ConversationTurn[]): string | undefined {
  const words = query.trim().replace(/[.!?~…]+$/, "");
  const previous = history.filter(m => m.role === "assistant").at(-1)?.text || "";
  const purpose = { working: "운영비", facility: "기계·시설 마련", refinance: "기존 대출의 이자 부담 줄이기" }[answers.purpose as "working" | "facility" | "refinance"];
  if (/^(고마워요?|감사합니다|고맙습니다|고마워|감사해요|잘 알겠어요)$/.test(words))
    return "도움이 됐다니 다행이에요. 나중에 궁금한 게 생기면 여기서 이어서 이야기해요.";
  if (/^(잠깐만요?|잠시만요?|나중에 할게요?|오늘은 여기까지|그만할래요?)$/.test(words))
    return "네, 여기서 잠시 멈출게요.";
  if (/(요약|정리해|정리해줘|뭐라고 했|어디까지)/.test(words) && !/서류|공고|절차|상품|준비물/.test(words)) {
    const facts = DIAGNOSIS_QUESTIONS.flatMap(q => {
      const value = q.choices.find(c => c.value === answers[q.key]);
      return value ? [q.text + " → " + value.label] : [];
    });
    return facts.length ? "지금까지 알려주신 내용을 모으면 이래요.\n" + facts.map(f => "· " + f).join("\n") : "아직 구체적으로 알려주신 사업 상황은 없어요. 궁금하신 것부터 이야기해 주세요.";
  }
  if (/말고|아니라|아니고/.test(words) && purpose && /월세|임대료|운영비|기계|설비|대환|인건비/.test(words) && !/[?？]/.test(query))
    return `알겠어요. 자금 용도는 ${purpose} 쪽으로 바로잡았어요. ${formatHumanFollowUpQuestion(answers)}`;
  if (/^(왜요|그건 왜|왜 물어봐요|왜 물어보세요|왜 궁금해요)$/.test(words)) {
    if (/체납|국세|지방세/.test(previous)) return "세금 납부 상태에 따라 먼저 확인할 공고 조건이나 준비 서류가 달라질 수 있어서 여쭤봤어요. 지금 정확히 모르시면 나중에 확인해도 괜찮아요.";
    if (/월세|운영비|기계|용도/.test(previous)) return "자금을 어디에 쓰실지 알면 필요한 서류를 좁힐 수 있어서예요. 예를 들어 기계를 살 때는 견적서를, 운영비를 마련할 때는 매출이나 지출 자료를 먼저 살펴봐요.";
  }
  const deadline = words.match(/(?:오늘|내일|모레|이번\s*주|다음\s*주|이달\s*말|이번\s*달\s*말)(?:\s*[월화수목금토일]요일)?|(?:\d{1,2}월\s*)?\d{1,2}일/);
  if (deadline && /날짜|언제까지|지급일/.test(previous) && !/[?？]/.test(query))
    return `${deadline[0]}까지 필요하시군요. 그날에 맞출 수 있을지는 접수와 심사 일정을 확인해야 해요. 지금 마련해야 하는 금액은 대략 어느 정도인가요?`;
  const amount = words.match(/(?:[\d,.]+\s*(?:천만|백만|십만|만|천|억)?|[한두세네일이삼사오육칠팔구십백천]+만)\s*원/);
  if (amount && /금액|얼마/.test(previous) && !/[?？]/.test(query))
    return `필요한 금액은 ${amount[0]} 정도군요. ${purpose ? purpose + "에 쓰실 금액으로 보고 이어갈게요." : "어디에 쓰실지에 따라 살펴볼 방향이 달라져요."} ${formatHumanFollowUpQuestion(answers)}`;
  if (/쉽게|무슨 뜻|무슨 말|뜻이 뭐/.test(words)) {
    const topic = /운전자금|시설자금|대환/.test(words) ? words : previous;
    if (/운전자금/.test(topic)) return "운전자금은 사업을 계속 돌리는 데 쓰는 자금이에요. 가게라면 이번 달 월세, 직원 급여, 재료 구입 자금이 여기에 들어가요.";
    if (/시설자금/.test(topic)) return "시설자금은 오래 쓸 장비나 시설을 갖추는 데 드는 자금이에요. 빵집에서 오븐을 새로 사는 비용을 떠올리시면 돼요.";
    if (/대환/.test(topic)) return "대환은 새 대출로 기존 대출을 갚는 거예요. 이자와 수수료를 같이 살펴봐야 실제 부담이 줄어드는지 알 수 있어요.";
  }
  if (/^(너무 |조금 |좀 )?(막막해요?|답답해요?|걱정돼요?|무서워요|힘들어요)$/.test(words))
    return purpose ? `${purpose} 문제로 마음이 무거우시군요. 지금 가장 부담되는 건 필요한 금액인가요, 자금을 마련해야 하는 날짜인가요?` : "막막할 때는 어디서부터 말해야 할지도 어렵죠. 지금 가장 마음에 걸리는 일 하나만 들려주실래요?";
  return undefined;
}

export function referenceReply(query: string, currentAnswers: Answers = {}, history: { role: "user" | "assistant"; text: string }[] = []) {
  const updatedAnswers = extractAnswersFromText(currentAnswers, query);
  const hits = searchQuestions(query);
  const match = hits[0];
  const followUpPrompt = formatHumanFollowUpQuestion(updatedAnswers);

  const previousUser = [...history].reverse().find(message => message.role === "user")?.text ?? "";
  if (/(어디|어떻게).*(발급|떼|받)|발급.*(어디|방법)/.test(query) && /(서류|서식|증빙|준비물|증명서)/.test(`${query} ${previousUser}`)) {
    return {
      text: "서류마다 발급처가 달라요. 사업자등록증명과 국세 납세증명은 홈택스, 지방세 납세증명은 정부24나 위택스에서 발급할 수 있어요. 금융거래확인서는 거래 금융기관에 문의하시면 됩니다. 어떤 서류의 발급 방법이 궁금하신가요?",
      coreId: null,
      references: [],
    };
  }

  // 자주 묻는 실무 질문은 진단 질문보다 먼저 직접 답한다.
  if (/(서류|서식|증빙|준비물)/.test(query) && /(무엇|뭐|어떤|준비|필요|알려)/.test(query)) {
    return {
      text: "미리 서류를 챙겨 두고 싶으시군요. 신청할 기관과 자금 종류에 따라 준비물이 달라요. 보통 사업자등록증, 최근 매출을 확인할 자료, 국세·지방세 납세증명서와 기존 대출 관련 자료부터 살펴봅니다. 시설자금이라면 설비 견적서도 필요할 수 있어요. 어느 기관에 신청하실 예정인지 아시면 그에 맞춰 확인해 볼게요.",
      coreId: null,
      references: [],
    };
  }

  const extraDetail = /금리|한도|서류|조건|자격|공고|어디|대상|얼마|체납|연체|거절|폐업|신청|보증/.test(query);
  if (!extraDetail && /개인\s*사업자|자영업/.test(query) && /자금|돈|대출/.test(query) && !updatedAnswers.purpose) {
    return { text: "개인사업을 하고 계시는군요. " + DIAGNOSIS_QUESTIONS[0].text + "", coreId: null, references: [] };
  }
  if (!extraDetail && /월세|임대료|인건비|급여|재료비/.test(query)) {
    const expense = query.match(/월세|임대료|인건비|급여|재료비/)![0];
    return { text: `${expense} 마련이 먼저시군요. 지급일이 정해진 비용은 시기를 맞추는 게 중요하죠. 운전자금 방향으로 함께 살펴볼게요. ${followUpPrompt}`, coreId: null, references: [] };
  }

  // The source workbook marks answers unreviewed. It is an intent bank, not an approved answer bank.
  if (!match || match.score < .35) {
    const isQuestion = /[?？]|무엇|뭐|어떻게|왜|언제|어디|가능|알려/.test(query);
    if (isQuestion) return {
      text: "그 부분을 확인하고 다음 단계를 정하고 싶으시군요. 지금 말씀만으로는 어느 기준이 적용될지 더 살펴봐야 해요. 가장 궁금한 건 신청할 수 있는지, 아니면 어떻게 준비하는지일까요?",
      coreId: null,
      references: [],
    };
    const empathy =
      /힘들|막막|걱정|어렵|죽겠|안\s*돼|바닥|급해/.test(query)
        ? "걱정이 많으시겠어요. 현재 상황에서 먼저 확인할 수 있는 것부터 함께 살펴볼게요."
        : /시설|설비|기계|공장/.test(query)
        ? "이번에 기계나 설비를 새로 들이시려고 하시는군요! 큰맘 먹고 투자하시는 만큼 이자 부담 적고 조건 좋은 자금으로 잘 맞춰봐야죠."
        : /운전|인건비|월세|운영|원재료|식당|가게/.test(query)
        ? "맞아요, 사업하다 보면 다달이 나가는 인건비랑 재료비, 월세 챙기는 게 제일 큰일이죠. 숨통이 좀 트이실 수 있게 운전자금 쪽부터 같이 찾아봐요."
        : /개인사업자|자영업|소상공인|카페/.test(query)
        ? "개인사업자로 운영하고 계시는군요! 혼자 다 챙기시려면 신경 쓸 게 한두 가지가 아니실 텐데, 소진공이나 지역신보 쪽으로 잘 맞는지 제가 바로 봐드릴게요."
        : /법인/.test(query)
        ? "법인으로 운영 중이시군요! 법인은 매출 흐름이랑 기술·인증 같은 강점을 잘 살리면 중진공이나 기보·신보에서 꽤 든든하게 길을 찾을 수 있어요."
        : /없어요|없습니다|깨끗|정상/.test(query)
        ? "정말 다행이네요 대표님! 그런 기본 조건이 깔끔하면 우리가 골라볼 수 있는 정책자금 선택지가 훨씬 넓어지거든요."
        : "말씀해 주셔서 고맙습니다. 상황에 맞는 방향을 살펴볼게요.";

    return {
      text: `${empathy} ${followUpPrompt}`,
      coreId: null,
      references: [],
    };
  }

  const category = match.core.category;
  const guidance = /우대|기술/.test(category)
    ? "특허나 연구소, 여성기업 같은 인증은 정말 든든한 무기가 될 수 있어요! 다만 가지고 계신 것만으로 바로 반영되진 않고, 유효한 증빙(확인서)이 있는지랑 우리가 넣을 공고에서 그걸 인정해 주는지 같이 맞춰봐야 실제 혜택으로 들어갑니다."
    : /복수|기존대출/.test(category)
    ? "그 부분 정말 많이 걱정하시는데요, 대표님 명의로 다른 사업장이 하나 더 있다고 해서 그쪽 대출을 무조건 우리 회사 빚에 합쳐서 계산하진 않아요. 사업장별로, 또 기관별로 따로따로 나눠서 보니까 미리 겁먹지 않으셔도 괜찮습니다."
    : /지역/.test(category)
    ? "본점이랑 실제 일하시는 사업장, 공장 주소가 다르면 어디를 기준으로 보는지 헷갈리시죠? 보통은 주소마다 역할을 나눠서 보는데, 특히 시설 투자나 지자체 자금은 실제로 설비를 놓고 일하시는 지역이 훨씬 중요하게 작용해요."
    : /체납|신용/.test(category)
    ? "세금 체납이나 연체가 있다면 현재 상태와 처리 내역을 먼저 확인해 보세요. 분납이나 유예 상태의 인정 여부는 신청할 기관과 공고에 따라 다르므로 해당 기관에 직접 확인해야 해요."
    : /시설/.test(category)
    ? "새 기계나 시설 들일 때는 견적서랑 설치할 장소, 그리고 대표님이 보태실 자기자금 계획을 같이 보면서 퍼즐 맞추듯 설계해요. 금액이 꽤 크다면 정책자금이랑 보증서를 똑똑하게 나눠서 준비하는 게 훨씬 수월합니다."
    : "우리 회사 업종이랑 규모, 그리고 기존에 쓰시던 대출이 어느 기관 건지만 잘 살펴봐도 갈 수 있는 길이 훨씬 선명해져요. 서류를 직접 보기 전에는 섣불리 금액을 단정 짓지 않고 가장 안전한 경로부터 차근차근 짚어드릴게요.";

  const institutions = match.core.institutions.split(" / ");
  return {
    text: `${guidance} ${followUpPrompt}`,
    coreId: match.core.id,
    references: POLICY_REFERENCES.filter(r => institutions.includes(r.institution)).slice(0, 3),
  };
}

export function collectionRoute(consent: boolean, approved: boolean, response: "success" | "partial" | "failed", privateAllowed = false) {
  if (!consent || !approved) return { mode: "MANUAL_FALLBACK", preserveCollected: true, steps: ["Upload", "Manual"], reason: !consent ? "동의 거부·철회" : "이용기관 연동 미승인" };
  if (response === "success") return { mode: "MYDATA", preserveCollected: true, steps: ["MyData"], reason: "승인 범위 내 조회" };
  return { mode: "MISSING_ONLY", preserveCollected: true, steps: privateAllowed ? ["API", "Upload", "Manual"] : ["Upload", "Manual"], reason: "성공 필드 보존, 누락 필드만 보완" };
}
export function reportReadiness(tier: "L1" | "L2" | "L3", dataReady: boolean, policyVerified: boolean, expertReviewed: boolean) {
  if (tier === "L1") return { status: "FREE_SUMMARY", showAmount: false };
  if (!dataReady || !policyVerified) return { status: "NEEDS_EVIDENCE", showAmount: false };
  if (tier === "L3" && !expertReviewed) return { status: "EXPERT_REVIEW_PENDING", showAmount: false };
  return { status: "READY_FOR_REPORT", showAmount: true };
}

export function consultationWording(text: string): string {
  return text.replace(/(?<![가-힣A-Za-z0-9])돈(?=(?:으로|처럼|까지|부터|이라|이에|이었|이|을|은|도|만|에|과)?(?:[\s.,!?…)"'”]|$))/gu, "자금");
}
