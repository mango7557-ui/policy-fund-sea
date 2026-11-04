/**
 * 정책이 자가학습·진화 메모리 엔진 (Self-Learning & Evolution Engine)
 *
 * - 대표님과의 대화에서 업종·지역·자금규모·감정 상태·선호하는 대화 톤·커스텀 지식을 스스로 추출해 축적한다.
 * - 대표님이 "기억해: ...", "참고로 ...", "더 친근하게 말해줘" 등 피드백을 주면 즉시 말투와 지식베이스를 진화시킨다.
 * - 학습된 상태는 브라우저(localStorage)와 서버(learned-memory.json) 양쪽에 동기화되어 대화를 거듭할수록 진화한다.
 */

export interface LearnedFactItem {
  id: string;
  category: "CEO_CONTEXT" | "TONE_PREF" | "CUSTOM_QA" | "FEEDBACK";
  summary: string;
  learnedAt: string;
}

export interface JeongchaegiEvolutionState {
  level: number;
  stageTitle: string;
  exp: number;
  nextLevelExp: number;
  totalConversations: number;
  positiveFeedbacks: number;
  preferredTone: string;
  learnedFacts: LearnedFactItem[];
}

export const INITIAL_EVOLUTION_STATE: JeongchaegiEvolutionState = {
  level: 1,
  stageTitle: "따뜻한 공감 상담사",
  exp: 20,
  nextLevelExp: 100,
  totalConversations: 0,
  positiveFeedbacks: 0,
  preferredTone: "다정하고 인간적인 구어체 (단일 호흡 말풍선)",
  learnedFacts: [
    {
      id: "init-1",
      category: "TONE_PREF",
      summary: "직선적인 설문 대신 대표님 마음에 먼저 공감하고 한 호흡으로 자연스럽게 대화하기",
      learnedAt: "기본 학습됨",
    },
  ],
};

function computeStageTitle(level: number): string {
  if (level <= 1) return "따뜻한 공감 상담사";
  if (level === 2) return "눈치 빠른 숙련 상담사";
  if (level === 3) return "대표님 전담 수석 파트너";
  return "마스터 정책자금 코파일럿";
}

function addExp(
  state: JeongchaegiEvolutionState,
  gain: number
): JeongchaegiEvolutionState {
  let exp = state.exp + gain;
  let level = state.level;
  let nextLevelExp = state.nextLevelExp;

  while (exp >= nextLevelExp) {
    exp -= nextLevelExp;
    level += 1;
    nextLevelExp = Math.round(nextLevelExp * 1.35);
  }

  return {
    ...state,
    level,
    stageTitle: computeStageTitle(level),
    exp,
    nextLevelExp,
  };
}

/**
 * 대표님의 발화에서 새로운 맥락·지식·말투 선호를 스스로 학습하여 진화 상태를 갱신한다.
 */
export function evolveFromUserMessage(
  prevState: JeongchaegiEvolutionState,
  userText: string
): {
  nextState: JeongchaegiEvolutionState;
  newlyLearned: string | null;
} {
  const t = userText.trim();
  if (!t) return { nextState: prevState, newlyLearned: null };

  let updated = addExp(
    {
      ...prevState,
      totalConversations: prevState.totalConversations + 1,
    },
    18
  );

  const newFacts: LearnedFactItem[] = [...updated.learnedFacts];
  let newlyLearned: string | null = null;
  const nowStr = new Date().toLocaleTimeString("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
  });

  const pushUniqueFact = (
    category: LearnedFactItem["category"],
    summary: string
  ) => {
    if (!newFacts.some((f) => f.summary === summary)) {
      newFacts.unshift({
        id: `fact-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        category,
        summary,
        learnedAt: nowStr,
      });
      newlyLearned = summary;
    }
  };

  // 1. 대표님이 명시적으로 가르쳐 준 규칙/기억 ("기억해", "외워둬", "참고로", "말투")
  if (/기억해|외워|참고로|앞으로는|말투/.test(t)) {
    pushUniqueFact("TONE_PREF", `대표님 맞춤 지침: "${t.slice(0, 80)}"`);
    if (/인간적|친근|부드럽|편하|사람처럼/.test(t)) {
      updated.preferredTone = "더욱 친근하고 따뜻한 옆자리 파트너 말투";
    } else if (/짧게|간단히|핵심만/.test(t)) {
      updated.preferredTone = "공감하면서도 핵심을 간결하게 짚어주는 말투";
    }
    updated = addExp(updated, 25);
  }

  // 2. 매출·희망금액 수치 자동 학습
  const moneyMatch = t.match(/(\d+(?:\.\d+)?)\s*(억|천만|백만)/);
  if (moneyMatch) {
    pushUniqueFact(
      "CEO_CONTEXT",
      `언급된 규모/희망금액: ${moneyMatch[1]}${moneyMatch[2]}원 맥락 기억`
    );
  }

  // 3. 지역/도시 자동 학습
  const regionMatch = t.match(
    /(서울|강남|송파|성남|분당|수원|화성|평택|김포|파주|이천|여주|인천|부산|대구|대전|광주|울산|세종|충남|천안|충북|전북|익산|전남|경북|경남|김해|강원|제주)/
  );
  if (regionMatch) {
    pushUniqueFact("CEO_CONTEXT", `사업장 관련 지역: ${regionMatch[1]} 권역 기억`);
  }

  // 4. 업력/연차 자동 학습
  const yearMatch = t.match(/(\d+)\s*(년|개월)/);
  if (yearMatch) {
    pushUniqueFact(
      "CEO_CONTEXT",
      `사업 운영 기간: 약 ${yearMatch[1]}${yearMatch[2]}차 맥락 기억`
    );
  }

  // 5. 구체적 업종 키워드 자동 학습
  const indMatch = t.match(
    /(식당|음식점|카페|베이커리|제조|금속|기계|반도체|화장품|식품|물류|운송|도소매|유통|쇼핑몰|IT|소프트웨어|디자인|건설|인테리어)/
  );
  if (indMatch) {
    pushUniqueFact("CEO_CONTEXT", `대표님 업종 특성: ${indMatch[1]} 분야 기억`);
  }

  // 6. 우대/인증 키워드 자동 학습
  const certMatch = t.match(/(특허|연구소|전담부서|여성기업|청년|벤처|이노비즈|메인비즈|스마트공장|수출)/);
  if (certMatch) {
    pushUniqueFact("CEO_CONTEXT", `보유/관심 우대요인: ${certMatch[1]} 키워드 기억`);
  }

  updated.learnedFacts = newFacts.slice(0, 12);
  return { nextState: updated, newlyLearned };
}

export function rewardPositiveFeedback(
  prevState: JeongchaegiEvolutionState,
  likedMessageSample: string
): JeongchaegiEvolutionState {
  const next = addExp(
    {
      ...prevState,
      positiveFeedbacks: prevState.positiveFeedbacks + 1,
    },
    30
  );
  const summary = `대표님이 선호하신 화법: "${likedMessageSample.slice(0, 48)}..."`;
  if (!next.learnedFacts.some((f) => f.summary === summary)) {
    next.learnedFacts = [
      {
        id: `like-${Date.now()}`,
        category: "FEEDBACK" as const,
        summary,
        learnedAt: "피드백 반영됨",
      },
      ...next.learnedFacts,
    ].slice(0, 12);
  }
  return next;
}

export function buildEvolutionPromptContext(
  state: JeongchaegiEvolutionState
): string {
  const factsText = state.learnedFacts
    .slice(0, 8)
    .map((f) => `- [${f.category}] ${f.summary}`)
    .join("\n");

  return [
    `[정책이 자가학습·진화 메모리 (현재 Lv.${state.level} ${state.stageTitle})]`,
    `- 선호 말투 스타일: ${state.preferredTone}`,
    `- 대화 중 스스로 학습해 기억하고 있는 대표님 맥락:`,
    factsText || "- 아직 학습된 추가 맥락 없음",
  ].join("\n");
}
