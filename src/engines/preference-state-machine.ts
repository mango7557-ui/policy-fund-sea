import {
  PolicyRuleMaster,
  PreferenceItem,
  PreferenceState,
} from "../domain/schema";

/**
 * 가점·우대 프로필 4단계 상태머신 (State Machine)
 *
 * [핵심 원칙]
 * - 청년대표, 여성기업, 장애인기업, 특허/IP, 연구부설기관, 고용창출, 수출실적, 스마트공장 등
 *   우대요인의 자동 오가산을 방지한다.
 * - 상태 전이: Candidate (후보) -> Verified (증빙확인) -> Rule Matched (공고인정) -> Applied (실제반영)
 * - 보유 사실만으로 가점을 하드코딩하지 않고:
 *   1) 유효한 증빙이 확인(evidenceVerified && !isExpired)되어야 Verified로 승격하며,
 *   2) 대상 기관의 최신 공고 룰(acceptedPreferences)에 포함될 때만 Rule Matched -> Applied로 반영한다.
 */
export function evaluateBasePreferenceState(item: PreferenceItem): PreferenceItem {
  // 만료된 인증서나 증빙 미확인 상태는 절대 VERIFIED 이상으로 전이될 수 없음 (오가산 방지)
  if (!item.hasRawCandidate) {
    return {
      ...item,
      currentState: "CANDIDATE",
    };
  }

  if (item.isExpired || !item.evidenceVerified) {
    return {
      ...item,
      currentState: "CANDIDATE",
    };
  }

  return {
    ...item,
    currentState: "VERIFIED",
  };
}

export interface RulePreferenceEvaluation {
  applied: {
    type: PreferenceItem["type"];
    label: string;
    state: PreferenceState;
    benefitEffect: string;
    rateDiscountBp: number;
    limitBoostRatioPct: number;
  }[];
  unapplied: {
    type: PreferenceItem["type"];
    label: string;
    state: PreferenceState;
    reasonWhyNotApplied: string;
  }[];
  totalRateDiscountBp: number;
  totalLimitBoostRatioPct: number;
}

/**
 * 특정 정책 룰(PolicyRuleMaster)에 대해 기업의 우대 프로필을 4단계 상태머신으로 검증
 */
export function evaluatePreferencesForPolicyRule(
  preferences: PreferenceItem[],
  rule: PolicyRuleMaster
): RulePreferenceEvaluation {
  const applied: RulePreferenceEvaluation["applied"] = [];
  const unapplied: RulePreferenceEvaluation["unapplied"] = [];

  for (const rawPref of preferences) {
    if (!rawPref.hasRawCandidate) continue;

    const baseEvaluated = evaluateBasePreferenceState(rawPref);
    const matchedInRule = rule.acceptedPreferences.find(
      (acc) => acc.type === baseEvaluated.type
    );

    // 1. 후보(Candidate) 단계에서 멈춘 경우 (증빙 미확인 또는 유효기간 만료)
    if (baseEvaluated.currentState === "CANDIDATE") {
      const reason = baseEvaluated.isExpired
        ? `인증/증빙 유효기간 만료(${baseEvaluated.expiryDate ?? "만료"})로 인해 가점 자동 반영 제외 (갱신 후 반영 가능)`
        : `보유 후보(Candidate) 상태이나 공식 증빙(${baseEvaluated.evidenceDocName ?? "확인서/등록원부"}) 미검증으로 오가산 방지 처리`;

      unapplied.push({
        type: baseEvaluated.type,
        label: baseEvaluated.label,
        state: "CANDIDATE",
        reasonWhyNotApplied: reason,
      });
      continue;
    }

    // 2. 증빙은 확인(VERIFIED)되었으나 해당 공고 룰(Rule)에 우대 조항이 없는 경우
    if (!matchedInRule) {
      unapplied.push({
        type: baseEvaluated.type,
        label: baseEvaluated.label,
        state: "VERIFIED",
        reasonWhyNotApplied: `증빙 확인(Verified) 완료되었으나, [${rule.programName}] 공고의 우대 가점 인정 항목에 해당하지 않아 미반영`,
      });
      continue;
    }

    // 3. 공고 예산 소진 시에는 RULE_MATCHED까지만 인정하고 실제 적용(APPLIED)은 유보
    if (rule.budgetStatus === "EXHAUSTED") {
      unapplied.push({
        type: baseEvaluated.type,
        label: baseEvaluated.label,
        state: "RULE_MATCHED",
        reasonWhyNotApplied: `공고 요건과 매칭(Rule Matched)되었으나 현재 해당 자금 예산 소진으로 차기 접수분 대기`,
      });
      continue;
    }

    // 4. 증빙 확인(VERIFIED) + 공고 인정(RULE_MATCHED) -> 실제 한도/금리/우대트랙 반영(APPLIED)
    applied.push({
      type: baseEvaluated.type,
      label: baseEvaluated.label,
      state: "APPLIED",
      benefitEffect: matchedInRule.effectDescription,
      rateDiscountBp: matchedInRule.rateDiscountBp ?? 0,
      limitBoostRatioPct: matchedInRule.limitBoostRatioPct ?? 0,
    });
  }

  const totalRateDiscountBp = Math.min(
    60, // 최대 금리 감면 캡 0.6%p
    applied.reduce((acc, cur) => acc + cur.rateDiscountBp, 0)
  );
  const totalLimitBoostRatioPct = Math.min(
    50, // 최대 한도 우대 캡 50%
    applied.reduce((acc, cur) => acc + cur.limitBoostRatioPct, 0)
  );

  return {
    applied,
    unapplied,
    totalRateDiscountBp,
    totalLimitBoostRatioPct,
  };
}
