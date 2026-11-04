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
  q("purpose", "요즘 어떤 자금이 가장 절실하신가요?", [["working", "운영비나 인건비가 좀 필요해요"], ["facility", "기계나 매장을 늘려보려고요"], ["refinance", "이자 높은 대출을 갈아타고 싶어요"], ["unknown", "아직 뭐부터 할지 고민 중이에요"]]),
  q("entity", "지금 사업자는 어떻게 내고 운영 중이세요?", [["sole", "개인사업자로 하고 있어요"], ["corporation", "법인사업자예요"], ["prestartup", "아직 창업 준비 중이에요"]]),
  q("operation", "요즘 가게나 사업장은 계속 운영 중이신가요?", [["active", "네, 정상 영업 중이에요"], ["dormant", "잠깐 쉬고(휴업) 있어요"], ["closed", "폐업하고 다시 준비 중이에요"]]),
  q("tax", "혹시 국세나 지방세 중에 밀린 세금이 있으실까요?", [["none", "네, 세금 밀린 건 없어요"], ["exception", "조금 있는데 분납 중이거나 곧 낼 예정이에요"], ["active", "체납이 좀 있어서 걱정이에요"], ["unknown", "한번 확인해 봐야 해요"]]),
  q("overdue", "은행이나 카드, 보증기관 쪽 연체는 괜찮으신가요?", [["none", "네, 연체는 전혀 없어요"], ["cleared", "잠깐 있었는데 지금은 다 갚았어요"], ["active", "현재 연체 중인 게 있어요"], ["unknown", "잘 모르겠어요"]]),
  q("credit", "대표님 개인 신용이나 회생·신용회복 관련해 걸리는 부분이 있으세요?", [["none", "아니요, 특별한 문제 없어요"], ["review", "신용회복이나 회생 이력이 좀 있어요"], ["unknown", "한번 봐야 할 것 같아요"]]),
  q("industry", "지금 하시는 일이 주로 어떤 업종이신가요?", [["eligible", "제조·음식점·도소매·IT·일반 서비스예요"], ["excluded", "부동산 임대나 유흥 쪽이에요"], ["unknown", "지원 대상 업종인지 잘 모르겠어요"]]),
  q("ceo", "사업자등록증에 있는 대표님 본인이 직접 운영하시는 거 맞으시죠?", [["yes", "네, 제가 직접 다 챙기고 있어요"], ["review", "가족이나 동업자랑 같이 봐서 설명이 좀 필요해요"], ["unknown", "확인이 필요해요"]]),
  q("related", "혹시 대표님 명의로 된 다른 사업자나 법인이 하나 더 있으신가요?", [["none", "아니요, 이 사업장 하나뿐이에요"], ["yes", "네, 다른 사업자도 하나 더 있어요"], ["unknown", "확인이 필요해요"]]),
  q("finance", "요즘 매출이나 장사 흐름은 좀 어떠신 편이에요?", [["normal", "꾸준히 돌아가는 편이에요"], ["weak", "적자나 부채 때문에 마음이 좀 무거워요"], ["unknown", "장부를 한번 봐야 해요"]]),
  q("documents", "나중에 대출 잔액이나 매출 서류 같은 건 떼어보실 수 있으시죠?", [["ready", "네, 서류는 준비할 수 있어요"], ["missing", "어떻게 떼는지 잘 몰라서 도움이 필요해요"], ["unknown", "아직 확인 전이에요"]]),
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
    return `지금까지 들려주신 이야기만 봐도 '${diag.status}' 상태로 ${diag.direction} 쪽 길을 먼저 열어보시면 참 좋을 것 같아요. 혹시 마음속에 두고 계신 희망 금액이나 더 걸리는 부분이 있으세요?`;
  }
  switch (upcoming.key) {
    case "purpose":
      return "요즘 어떤 자금이 제일 절실하세요? 당장 돌아가는 운영비·인건비 때문이신지, 아니면 기계나 매장을 늘리시려는 건지 편하게 들려주세요.";
    case "entity":
      return "혹시 지금 사업자는 개인사업자로 내고 계세요, 아니면 법인으로 운영 중이세요?";
    case "operation":
      return "지금 사업장은 계속 문 열고 영업 중이신지와 시작하신 지 대략 몇 년 정도 되셨는지도 편하게 알려주세요.";
    case "tax":
      return "혹시 국세나 지방세 중에 잠깐 밀려 있는 게 있으실까요? 분납 중이셔도 방법이 있으니 편하게 말씀해 주셔도 돼요.";
    case "overdue":
      return "그럼 은행이나 카드 값, 보증기관 쪽에 현재 연체 걸려 있는 내역도 없으시죠?";
    case "credit":
      return "혹시 대표님 개인 신용점수나 예전 회생·신용회복 이력 때문에 마음 쓰이시는 부분은 없으세요?";
    case "industry":
      return "지금 하고 계신 일이 구체적으로 어떤 업종이세요? 예를 들면 식당이나 제조업, 도소매, IT 같은 거요!";
    case "ceo":
      return "사업자등록증에 올라가 있는 대표님 본인이 직접 현장에서 다 운영하고 계신 거 맞으시죠?";
    case "related":
      return "혹시 대표님 성함으로 하나 더 내신 개인사업자나 관계법인이 따로 있으실까요?";
    case "finance":
      return "요즘 매출이나 장사 흐름은 좀 어떠세요? 버틸 만하신지, 아니면 적자나 기존 대출 때문에 숨통이 좀 막히시는 편인지 궁금해요.";
    default:
      return "나중에 심사 들어가면 부가세 증명원이나 금융거래확인서 같은 서류가 필요한데, 그런 건 세무사님이나 홈택스에서 떼어보실 수 있으시죠?";
  }
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

  return `${singleParagraph} ${followUp}`;
}

export function referenceReply(query: string, currentAnswers: Answers = {}) {
  const updatedAnswers = extractAnswersFromText(currentAnswers, query);
  const hits = searchQuestions(query);
  const match = hits[0];
  const followUpPrompt = formatHumanFollowUpQuestion(updatedAnswers);

  // The source workbook marks answers unreviewed. It is an intent bank, not an approved answer bank.
  if (!match || match.score < .35) {
    const empathy =
      /힘들|막막|걱정|어렵|죽겠|안\s*돼|바닥|급해/.test(query)
        ? "에고, 요즘 경기 때문에 대표님들 마음이 다들 타들어 가시더라고요. 혼자 고민하시느라 정말 고생 많으셨어요. 제가 옆에서 하나씩 같이 짚어드릴 테니 너무 막막해하지 마세요."
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
        : "네, 대표님 말씀 무슨 뜻인지 딱 알겠어요! 조급해하지 마시고 저랑 이야기 나누다 보면 우리 회사에 제일 잘 맞는 길이 금방 보일 거예요.";

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
    ? "세금이나 연체 문제가 조금 걸려 있으면 신청조차 못 할까 봐 마음 무거우실 텐데요. 만약 접수 전에 완납하실 수 있거나 세무서에서 분납·징수유예 승인을 받으셨다면 바로 탈락시키지 않고 예외로 검토해 주는 길이 열려 있어요."
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
