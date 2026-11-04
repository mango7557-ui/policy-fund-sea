import bank from "../data/master/question-bank.json";
import rules from "../data/master/rules.json";

export const DOCUMENT_VERSION = "2026-11-01";
export const QUESTION_BANK = bank;
export const POLICY_REFERENCES = rules.Institution_Rule_Index.slice(1).map(({ cells, row }) => ({ id: cells[0], institution: cells[1], subject: cells[2], criteria: cells[5], status: cells[6], date: cells[8], url: cells[9], note: cells[10], row }));
export const PREFERENCE_REFERENCES = rules.Preferential_Factors.slice(1).map(({ cells }) => ({ id: cells[0], name: cells[2], evidence: cells[3], condition: cells[5], caution: cells[9] }));
export type AnswerKey = "purpose" | "entity" | "operation" | "tax" | "overdue" | "credit" | "industry" | "ceo" | "related" | "finance" | "documents";
export type Answers = Partial<Record<AnswerKey, string>>;
export type Question = { key: AnswerKey; text: string; choices: { value: string; label: string }[] };
const q = (key: AnswerKey, text: string, options: [string, string][]): Question => ({ key, text, choices: options.map(([value, label]) => ({ value, label })) });
export const DIAGNOSIS_QUESTIONS: Question[] = [
  q("purpose", "어떤 용도로 자금이 필요하신가요?", [["working", "운영비·인건비·원재료"], ["facility", "시설·설비·사업장 확장"], ["refinance", "기존 대출 대환"], ["unknown", "아직 정하지 못했어요"]]),
  q("entity", "현재 사업자 형태는 어떻게 되시나요?", [["sole", "개인사업자"], ["corporation", "법인사업자"], ["prestartup", "예비창업자"]]),
  q("operation", "현재 사업장의 영업 상태를 알려주세요.", [["active", "정상 영업 중"], ["dormant", "휴업 중"], ["closed", "폐업 상태"]]),
  q("tax", "현재 국세·지방세 납세 상태는 어떠신가요?", [["none", "두 세금 모두 체납 없음"], ["exception", "분납·유예 승인 또는 완납 예정"], ["active", "체납이 남아 있고 해소 계획 없음"], ["unknown", "확인이 필요해요"]]),
  q("overdue", "현재 금융기관 연체 상태는 어떠신가요?", [["none", "연체 없음"], ["cleared", "과거 연체가 있었지만 해소됨"], ["active", "현재 연체 중"], ["unknown", "확인이 필요해요"]]),
  q("credit", "신용회복·회생 등 별도 확인이 필요한 신용 이슈가 있나요?", [["none", "없어요"], ["review", "신용회복·회생 등 확인 필요"], ["unknown", "잘 모르겠어요"]]),
  q("industry", "주업종의 정책자금 지원제외 여부를 확인하셨나요?", [["eligible", "주업종 기준으로 제외대상이 아님을 확인"], ["excluded", "지원제외 업종에 해당"], ["unknown", "업종코드와 공고 확인 필요"]]),
  q("ceo", "등록상 대표자 본인이 직접 경영하고 계신가요?", [["yes", "네, 직접 경영해요"], ["review", "공동·가족경영 등 추가 확인 필요"], ["unknown", "확인이 필요해요"]]),
  q("related", "대표자 명의의 다른 개인사업자나 관계법인이 있나요?", [["none", "없어요"], ["yes", "있어요 — 사업체별 금융내역 확인 필요"], ["unknown", "확인이 필요해요"]]),
  q("finance", "자본잠식·영업적자 등 재무구조 확인이 필요한 상황인가요?", [["normal", "현재 파악한 문제는 없어요"], ["weak", "자본잠식·적자 등 구조개선 검토 필요"], ["unknown", "재무자료 확인 필요"]]),
  q("documents", "최신 대출·보증잔액과 매출 증빙을 확인할 수 있나요?", [["ready", "자료를 준비할 수 있어요"], ["missing", "조회 장애·자료 누락으로 보완 필요"], ["unknown", "아직 확인 전이에요"]]),
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
export function extractAnswersFromText(current: Answers, rawText: string): Answers {
  const t = rawText.trim();
  if (!t) return current;
  const next: Answers = { ...current };

  // 1. 자금 용도 (purpose)
  if (/시설|설비|기계|공장|확장|리뉴얼|인테리어|매입|신축/.test(t)) {
    next.purpose = "facility";
  } else if (/대환|갈아타|고금리/.test(t)) {
    next.purpose = "refinance";
  } else if (/운전|운영|인건비|급여|월급|원재료|자재|임대료|월세|재고/.test(t)) {
    next.purpose = "working";
  }

  // 2. 사업자 형태 (entity)
  if (/법인|주식회사|\(주\)|㈜/.test(t)) {
    next.entity = "corporation";
  } else if (/개인사업자|개인\s*사업|자영업|1인\s*사업|소상공인|식당|카페|매장|가게/.test(t)) {
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
    next.operation = next.operation ?? "active";
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
  if (currentPending) {
    if (currentPending.key === "operation" && /^(네|예|정상|잘\s*돌아가요|영업중이에요)/.test(t)) {
      next.operation = "active";
    } else if (currentPending.key === "tax" && /^(네|없어요|없습니다|깨끗해요|완납)/.test(t)) {
      next.tax = "none";
    } else if (currentPending.key === "overdue" && /^(네|없어요|없습니다|정상)/.test(t)) {
      next.overdue = "none";
    } else if (currentPending.key === "credit" && /^(네|없어요|없습니다|해당\s*없)/.test(t)) {
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
  const parts: string[] = [];
  if (answers.purpose) {
    parts.push(
      `자금용도=${
        answers.purpose === "facility"
          ? "시설·설비자금"
          : answers.purpose === "refinance"
          ? "대환자금"
          : "운전자금"
      }`
    );
  }
  if (answers.entity) {
    parts.push(
      `사업자형태=${
        answers.entity === "corporation"
          ? "법인사업자"
          : answers.entity === "sole"
          ? "개인사업자"
          : "예비창업자"
      }`
    );
  }
  if (answers.operation) {
    parts.push(
      `영업상태=${
        answers.operation === "active"
          ? "정상영업"
          : answers.operation === "dormant"
          ? "휴업"
          : "폐업"
      }`
    );
  }
  if (answers.tax) {
    parts.push(
      `세금납부=${
        answers.tax === "none"
          ? "체납없음"
          : answers.tax === "exception"
          ? "분납·유예(예외검토)"
          : "체납중"
      }`
    );
  }
  if (answers.overdue) {
    parts.push(
      `금융연체=${
        answers.overdue === "none"
          ? "연체없음"
          : answers.overdue === "cleared"
          ? "단기연체해소"
          : "연체중"
      }`
    );
  }
  if (answers.related) {
    parts.push(
      `타사업체=${answers.related === "yes" ? "보유(분리검토)" : "없음"}`
    );
  }
  return parts.length ? parts.join(", ") : "아직 파악된 기본정보 없음";
}

export function freeDiagnosis(answers: Answers) {
  const missing = DIAGNOSIS_QUESTIONS.filter(q => !answers[q.key] || answers[q.key] === "unknown").map(q => q.text);
  const blocked = answers.tax === "active" || answers.overdue === "active" || answers.operation === "closed" || answers.operation === "dormant" || answers.industry === "excluded";
  const structure = answers.finance === "weak";
  const exceptional = answers.tax === "exception" || answers.overdue === "cleared" || answers.credit === "review" || answers.ceo === "review" || answers.related === "yes" || answers.entity === "prestartup" || answers.documents === "missing";
  const status = blocked ? "현재 곤란" : missing.length || exceptional || structure ? "추가 확인" : "검토 가능";
  const reasons: string[] = [];
  if (blocked) reasons.push("현재 응답에 제한 요인이 있어 일반 자금 신청 전 해소·예외 여부를 확인해야 합니다.");
  if (answers.tax === "exception") reasons.push("분납·유예·완납예정은 즉시 종결하지 않고 기관별 예외요건을 확인합니다.");
  if (answers.ceo === "review") reasons.push("공동·가족경영 관계와 실제 경영 참여 방식을 추가 확인합니다.");
  if (answers.related === "yes") reasons.push("다른 사업체 채무는 대상기업 부채에 단순 합산하지 않고 사업체·기관별로 분리합니다.");
  if (structure) reasons.push("자본잠식·영업적자 등 재무취약 상태는 신규 차입금액 제시보다 현금흐름·구조개선 검토를 우선합니다.");
  if (answers.documents === "missing") reasons.push("자동조회 장애·자료 누락은 진단 중단 대신 누락 자료만 대체 제출합니다.");
  if (!reasons.length) reasons.push(missing.length ? "아직 확인하지 않은 핵심 정보가 있습니다." : "응답 기준 기본 제한요인이 확인되지 않았습니다. 증빙·최신 공고 검증은 별도로 필요합니다.");
  const direction = blocked || structure ? "제한요인 해소·재기 또는 구조개선 경로 검토" : answers.purpose === "facility" ? "시설자금 방향 — 투자견적·자기자금·설치 주소 확인" : answers.purpose === "refinance" ? "대환 전용 공고 여부와 기존 대출 조건 확인" : "운전자금 방향 — 업종·규모·금융잔액 확인";
  return { status, reasons, missing, direction, structure, complete: nextQuestion(answers) === null, amount: null, source: "고객 직접입력 · 증빙 미검증", referenceDate: DOCUMENT_VERSION, action: blocked || structure ? "부족자료와 개선사항을 먼저 정리하세요. 유료결제보다 보완이 우선입니다." : "최신 금융거래확인서·보증잔액·매출 자료와 공식 공고를 대조해 주세요." };
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
  const diag = freeDiagnosis(currentAnswers);
  if (!upcoming) {
    return `지금까지 말씀해 주신 내용을 종합해 보면 '${diag.status}' 상태로 ${diag.direction} 쪽을 우선 살펴보시면 좋겠습니다. 혹시 추가로 궁금하신 조건이나 생각하시는 자금 규모가 있으신가요?`;
  }
  switch (upcoming.key) {
    case "purpose":
      return "먼저 어떤 용도로 자금이 필요하신가요? 운영비·인건비 쪽이신지, 아니면 기계·매장 같은 시설 투자 쪽이신지 편하게 말씀해 주세요.";
    case "entity":
      return "그럼 현재 사업자 형태는 개인사업자이신가요, 아니면 법인사업자이신가요?";
    case "operation":
      return "지금 사업장은 정상적으로 영업 중이신가요? 사업 시작하신 지 얼마나 되셨는지도 함께 알려주시면 더 정확해요.";
    case "tax":
      return "혹시 현재 국세나 지방세 체납은 없으신가요? 분납이나 징수유예 중이셔도 괜찮으니 편하게 알려주세요.";
    case "overdue":
      return "은행이나 카드, 보증기관 쪽에 현재 연체 중인 내역은 없으신가요?";
    case "credit":
      return "혹시 대표님 개인 신용회복이나 회생처럼 별도로 확인해야 할 신용 이슈가 있으신가요?";
    case "industry":
      return "운영하시는 주된 업종이 제조업, 음식점, 도소매, IT·서비스 중 어느 쪽에 해당하시나요?";
    case "ceo":
      return "사업자등록증상 대표자 본인이 직접 경영하고 계신 게 맞으시죠?";
    case "related":
      return "대표님 명의로 함께 운영하시는 다른 개인사업자나 관계법인이 따로 있으신가요?";
    case "finance":
      return "최근 매출이나 영업이익 흐름은 괜찮으신 편인가요, 아니면 적자나 부채 때문에 고민이 있으신가요?";
    default:
      return "최근 대출·보증 잔액이나 부가세 과세표준 같은 기본 자료는 준비가 가능하신 상태인가요?";
  }
}

export function ensureEndsWithFollowUpQuestion(
  replyText: string,
  currentAnswers: Answers = {}
): string {
  const followUp = formatHumanFollowUpQuestion(currentAnswers);
  const paragraphs = replyText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return followUp;

  // AI가 이미 물음표 질문으로 끝냈더라도, 현재 진단 단계의 다음 질문(NBQ)과 자연스럽게 이어지도록 보장
  const bodyOnly =
    paragraphs.length >= 2 && paragraphs[paragraphs.length - 1].includes("?")
      ? paragraphs.slice(0, -1).join("\n\n")
      : paragraphs.join("\n\n");

  return `${bodyOnly}\n\n${followUp}`;
}

export function referenceReply(query: string, currentAnswers: Answers = {}) {
  const updatedAnswers = extractAnswersFromText(currentAnswers, query);
  const hits = searchQuestions(query);
  const match = hits[0];
  const followUpPrompt = formatHumanFollowUpQuestion(updatedAnswers);

  // The source workbook marks answers unreviewed. It is an intent bank, not an approved answer bank.
  if (!match || match.score < .35) {
    const empathy =
      /시설|설비|기계|공장/.test(query)
        ? "아, 설비나 시설 투자 쪽으로 자금을 알아보고 계시는군요! 목돈이 들어가는 일이라 자금 계획을 잘 세우는 게 정말 중요하죠."
        : /운전|인건비|월세|운영|원재료/.test(query)
        ? "운영비나 인건비, 원재료비 같은 운전자금이 필요하신 상황이군요. 사업하시면서 가장 현실적으로 많이 찾으시는 자금이에요."
        : /개인사업자|자영업|소상공인|식당|카페/.test(query)
        ? "네, 개인사업자로 운영 중이시군요! 상시근로자 수나 업종에 따라 소진공이나 지역신보, 중진공 등 맞춰볼 수 있는 경로가 다양해요."
        : /법인/.test(query)
        ? "네, 법인사업자로 운영하고 계시는군요! 법인은 재무구조와 대표자 경영 관계, 기술·인증 여부를 함께 보면서 한도를 설계하게 됩니다."
        : /없어요|없습니다|깨끗|정상/.test(query)
        ? "다행이네요! 기본 제한 요인이 없으면 선택할 수 있는 정책자금 폭이 훨씬 넓어집니다."
        : "네, 대표님 말씀 잘 이해했습니다! 하나씩 맞춰가다 보면 우리 회사에 꼭 맞는 자금 방향이 금방 잡힐 거예요.";

    return {
      text: `${empathy}\n\n${followUpPrompt}`,
      coreId: null,
      references: [],
    };
  }

  const category = match.core.category;
  const guidance = /우대|기술/.test(category)
    ? "특허나 연구소, 여성기업 같은 인증은 정말 좋은 우대 후보예요. 다만 보유 사실만으로 바로 가산되는 건 아니고, 유효한 증빙(확인서)과 신청할 공고의 인정 조건이 맞을 때 실제 혜택으로 반영됩니다."
    : /복수|기존대출/.test(category)
    ? "다른 사업체 채무가 있다고 해서 우리 회사 부채에 무조건 단순 합산하지는 않아요. 주사업체·대표자 개인·타 사업체·관계법인 여신을 각각 분리해서 기관별 기준으로 살펴봅니다."
    : /지역/.test(category)
    ? "본점과 실제 사업장, 공장, 시설투자 예정지 주소를 각각 나누어서 봐요. 특히 시설자금이나 지자체 자금은 실제 투자하는 곳의 권역이 중요하게 작용합니다."
    : /체납|신용/.test(category)
    ? "체납이나 연체가 있으면 걱정이 크실 텐데요, 접수 전에 완납 예정이거나 세무서 분납·징수유예 승인이 있으면 바로 탈락시키지 않고 예외 검토로 살펴볼 수 있어요."
    : /시설/.test(category)
    ? "시설자금은 도입하려는 기계·설비 견적서와 자기자금 계획, 설치할 사업장 주소를 함께 보면서 설계해요. 금액이 크면 정책자금과 보증·담보를 나누어 조합하는 게 유리합니다."
    : "우리 회사의 업종과 규모, 자금 용도, 기존 대출·보증 잔액을 최신 공고와 함께 맞춰봐야 정확해요. 서류 확인 전에는 승인이나 금액을 단정하지 않고 가장 유리한 경로부터 찾아드립니다.";

  const institutions = match.core.institutions.split(" / ");
  return {
    text: `${guidance}\n\n${followUpPrompt}`,
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
