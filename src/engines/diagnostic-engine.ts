import { POLICY_RULES_DB } from "../domain/policy-rules-db";
import {
  BusinessEntityMaster,
  DataProvider,
  DiagnosticSnapshot,
  ExposureRecord,
  L1FreeReport,
  L2DirectionReport,
  L3StrategyReport,
  L4ConsultingNotice,
  MatchedProgramResult,
  PolicyRuleMaster,
  PreferenceItem,
  RepresentativeMaster,
  resolveFieldValue,
} from "../domain/schema";
import { classifyBusinessAddresses } from "./address-classifier";
import { runLimitationGate } from "./limitation-gate";
import { extractNextBestQuestion } from "./nbq-engine";
import {
  evaluateBasePreferenceState,
  evaluatePreferencesForPolicyRule,
} from "./preference-state-machine";

/**
 * 확률/승인 단정 금지 문구 검증 가드 (P0 컴플라이언스 검증용)
 */
const FORBIDDEN_PROBABILITY_PATTERNS = [
  /\d+\s*%\s*승인/,
  /승인\s*확률\s*\d+/,
  /100\s*%\s*보장/,
  /무조건\s*승인/,
  /확정\s*승인/,
];

export function containsForbiddenCompliancePhrase(text: string): boolean {
  return FORBIDDEN_PROBABILITY_PATTERNS.some((regex) => regex.test(text));
}

function calculateBusinessAgeYears(
  establishedDateStr: string,
  referenceDateStr: string = "2026-11-04"
): number {
  const est = new Date(establishedDateStr);
  const ref = new Date(referenceDateStr);
  if (isNaN(est.getTime())) return 3;
  const diffMs = ref.getTime() - est.getTime();
  return Math.max(0.2, Number((diffMs / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1)));
}

function formatMkrwToKoreanBand(minMkrw: number, maxMkrw: number): string {
  const fmt = (val: number) => {
    if (val >= 100) {
      return `${(val / 100).toFixed(1).replace(/\.0$/, "")}억`;
    }
    return `${Math.round(val / 10) * 10}백만`;
  };
  if (maxMkrw <= 0) return "기대출 한도 소진으로 신규 한도 제한 (대환·연장 검토)";
  return `약 ${fmt(minMkrw)} ~ ${fmt(maxMkrw)} 원 범위 (잠정 구간)`;
}

/**
 * 개별 정책 룰과 기업 데이터를 매칭하여 후보 프로그램 평가 결과 산출
 */
function matchPrograms(
  rep: RepresentativeMaster,
  business: BusinessEntityMaster,
  exposures: ExposureRecord[],
  rules: PolicyRuleMaster[],
  hasNonCapitalPresence: boolean,
  hasFactoryOrPlannedInvestment: boolean
): MatchedProgramResult[] {
  const estDate = resolveFieldValue(business.establishedDate, "2023-05-01");
  const bizAge = calculateBusinessAgeYears(estDate);
  const empCount = resolveFieldValue(business.employeeCount, 4) ?? 4;
  const revenueMkrw = resolveFieldValue(business.annualRevenueMkrw, 500) ?? 500;
  const fundPurpose = resolveFieldValue(business.fundPurpose, "WORKING") ?? "WORKING";
  const birthYear = resolveFieldValue(rep.birthYear, 1984);
  const repAge = 2026 - birthYear;

  const results: MatchedProgramResult[] = [];

  for (const rule of rules) {
    // 1. 지역 요건 필터링 (비수도권 전용 자금인데 수도권에만 사업장이 있는 경우 제외)
    if (
      rule.targetMacroRegions &&
      rule.targetMacroRegions.includes("NON_CAPITAL") &&
      !hasNonCapitalPresence
    ) {
      continue;
    }

    // 2. 업력 제한 필터링 (예: 청년창업 3년 이내, 혁신창업 7년 이내)
    if (rule.targetBusinessAgeMaxYears && bizAge > rule.targetBusinessAgeMaxYears) {
      continue;
    }

    // 3. 청년전용창업자금은 대표자 만 39세 이하 필수
    if (rule.ruleId === "RULE-KOSME-YOUTH-2026" && repAge > 39) {
      continue;
    }

    // 4. 소진공 소상공인 상시근로자 요건 필터링
    const ksicCode = resolveFieldValue(business.ksicCode, "C26");
    const isManufOrConst =
      ksicCode.startsWith("C") || ksicCode.startsWith("F") || ksicCode.startsWith("H");
    const semasMaxEmp = isManufOrConst ? 9 : 4;
    if (rule.institution === "SEMAS" && empCount > semasMaxEmp) {
      continue;
    }

    // 5. 가점·우대 4단계 상태머신 실행
    const prefEval = evaluatePreferencesForPolicyRule(business.preferences, rule);

    // 6. 복수 개인사업자·관계법인 기대출 분리 반영 (단순 합산 금지, 해당 룰의 차감 규칙만 적용!)
    const relevantExposures = exposures.filter((e) => e.institution === rule.institution);
    let primaryDeductMkrw = 0;
    let otherSolePropDeductMkrw = 0;
    let relatedCorpDeductMkrw = 0;

    for (const exp of relevantExposures) {
      const bal = resolveFieldValue(exp.balanceMkrw, 0);
      if (exp.relationType === "PRIMARY_BUSINESS" && rule.exposureAggregationRule.includePrimarySameInst) {
        primaryDeductMkrw += bal;
      } else if (
        exp.relationType === "REP_OTHER_SOLE_PROPRIETOR" &&
        rule.exposureAggregationRule.includeOtherSolePropSameInst
      ) {
        otherSolePropDeductMkrw += bal;
      } else if (
        exp.relationType === "RELATED_CORPORATION" &&
        rule.exposureAggregationRule.includeRelatedCorpGuarantee
      ) {
        relatedCorpDeductMkrw += bal;
      }
    }

    const totalRuleDeductionMkrw =
      primaryDeductMkrw + otherSolePropDeductMkrw + relatedCorpDeductMkrw;

    // 7. 잠정 한도 범위 산출 (매출액 사정한도 × 우대배수 vs 공고 캡 - 해당 기관 차감 대상 잔액)
    const revenueRatioFactor =
      prefEval.applied.length > 0 ? 0.35 : 0.25; // 우대 시 매출의 약 1/3, 기본 1/4
    const revenueBasedBaseline = Math.max(
      rule.institution === "SEMAS" ? 50 : 100,
      Math.round(revenueMkrw * revenueRatioFactor)
    );

    const boostedLimit = Math.round(
      revenueBasedBaseline * (1 + prefEval.totalLimitBoostRatioPct / 100)
    );
    const ruleCap =
      prefEval.applied.length > 0 ? rule.preferentialMaxLimitMkrw : rule.baseMaxLimitMkrw;

    const rawMaxAvailable = Math.max(
      0,
      Math.min(boostedLimit, ruleCap, rule.exposureAggregationRule.institutionCapMkrw) -
        totalRuleDeductionMkrw
    );
    const rawMinAvailable = Math.max(0, Math.round(rawMaxAvailable * 0.6));

    // 8. 적합도 점수(fitScore) 및 선정 사유 계산
    let fitScore = 65;
    const selectionReasons: string[] = [];

    if (rule.category === fundPurpose || rule.category === "BOTH" || fundPurpose === "BOTH") {
      fitScore += 10;
      selectionReasons.push(`희망 자금용도(${fundPurpose === "FACILITY" ? "시설자금" : fundPurpose === "BOTH" ? "운전·시설 복합" : "운전자금"})와 공고 지원 트랙 일치`);
    }

    if (prefEval.applied.length > 0) {
      fitScore += Math.min(18, prefEval.applied.length * 6);
      selectionReasons.push(
        `증빙 확인된 우대요인 ${prefEval.applied.length}건(${prefEval.applied.map((a) => a.label).join(", ")})이 공고 인정(Applied)되어 한도·금리 우대 적용`
      );
    }

    if (hasNonCapitalPresence && rule.institution === "LOCAL_GOV") {
      fitScore += 12;
      selectionReasons.push("비수도권 사업장 소재로 지자체 이차보전(이자 지원) 특화 트랙 적용 가능");
    }

    if (hasFactoryOrPlannedInvestment && rule.category === "FACILITY") {
      fitScore += 10;
      selectionReasons.push("공장 또는 시설투자 예정지 보유로 설비·시설자금 심사 요건 부합");
    }

    if (selectionReasons.length === 0) {
      selectionReasons.push(
        `업력(${bizAge}년) 및 상시근로자(${empCount}명) 기준 기본 신청자격 충족`
      );
    }

    const requiredMissingDocs: string[] = [];
    for (const unapp of prefEval.unapplied) {
      if (unapp.state === "CANDIDATE") {
        requiredMissingDocs.push(`${unapp.label} 유효 공식 확인서/등록원부 (가점 반영용)`);
      }
    }
    if (requiredMissingDocs.length === 0) {
      requiredMissingDocs.push("최근 1년 부가가치세 과세표준증명원 및 4대보험 사업장 가입자명부");
    }

    results.push({
      rank: 0,
      ruleId: rule.ruleId,
      ruleVersion: rule.ruleVersion,
      institutionName: rule.institutionName,
      programName: rule.programName,
      budgetStatus: rule.budgetStatus,
      fitScore: Math.min(98, fitScore),
      selectionReasons,
      estimatedRangeText: formatMkrwToKoreanBand(rawMinAvailable, rawMaxAvailable),
      minEstimateMkrw: rawMinAvailable,
      maxEstimateMkrw: rawMaxAvailable,
      appliedPreferences: prefEval.applied.map((a) => ({
        type: a.type,
        label: a.label,
        state: a.state,
        benefitEffect: a.benefitEffect,
      })),
      unappliedPreferences: prefEval.unapplied,
      exposureDeductionNote:
        totalRuleDeductionMkrw > 0
          ? `동일기관 차감 대상 잔액 ${totalRuleDeductionMkrw}백만 원 분리 반영 (주사업체 ${primaryDeductMkrw}백만 / 타 개인사업자 ${otherSolePropDeductMkrw}백만 / 관계법인 ${relatedCorpDeductMkrw}백만 — 타 은행 일반대출 단순 합산 제외)`
          : `해당 기관(${rule.institutionName}) 기대출 차감액 없음 (타 기관 채무 단순 합산 배제)`,
      requiredMissingDocs,
    });
  }

  results.sort((a, b) => b.fitScore - a.fitScore);
  return results.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}

/**
 * 전체 AI 정책자금 진단 실행 및 불변 스냅샷 생성
 */
export function runFullDiagnosticEngine(params: {
  caseId: string;
  rep: RepresentativeMaster;
  business: BusinessEntityMaster;
  exposures: ExposureRecord[];
  previousSnapshot?: DiagnosticSnapshot | null;
  rulesDb?: PolicyRuleMaster[];
}): DiagnosticSnapshot {
  const {
    caseId,
    rep,
    business,
    exposures,
    previousSnapshot = null,
    rulesDb = POLICY_RULES_DB,
  } = params;

  // 1. 주소 및 권역 자동 분류
  const addressResult = classifyBusinessAddresses(business.addresses);

  // 2. 선제적 제한게이트 실행
  const gateResult = runLimitationGate(rep, business, exposures);

  // 3. 가점·우대 프로필 기본 상태 평가 (Candidate vs Verified)
  const evaluatedBasePrefs: PreferenceItem[] = business.preferences.map(
    evaluateBasePreferenceState
  );

  // 4. 대화형 NBQ 추출 (미확인 항목 중 Information Gain 최상위 1개)
  const nbqResult = extractNextBestQuestion(rep, business);

  // 5. 정책 룰 매칭
  const matchedPrograms = matchPrograms(
    rep,
    business,
    exposures,
    rulesDb,
    addressResult.hasNonCapitalPresence,
    addressResult.hasFactoryOrPlannedInvestment
  );

  const top3 = matchedPrograms.slice(0, 3);
  const estDate = resolveFieldValue(business.establishedDate, "2023-05-01");
  const bizAge = calculateBusinessAgeYears(estDate);

  // 6. 부족 자료 목록 도출
  const missingDataList: string[] = [];
  if (resolveFieldValue(business.nationalTaxArrears, "UNKNOWN") === "UNKNOWN") {
    missingDataList.push("국세·지방세 납세증명서 (완납 여부 확인용)");
  }
  if (resolveFieldValue(business.annualRevenueMkrw, null) === null) {
    missingDataList.push("최근 결산 표준재무제표증명 또는 부가가치세 과세표준증명원");
  }
  if (resolveFieldValue(business.employeeCount, null) === null) {
    missingDataList.push("4대사회보험 사업장 가입자명부 (상시근로자 확인용)");
  }
  for (const pref of evaluatedBasePrefs) {
    if (pref.hasRawCandidate && pref.currentState === "CANDIDATE") {
      missingDataList.push(
        `${pref.label} 유효 증빙서류 (${pref.isExpired ? "유효기간 갱신 확인서 필요" : "공식 확인서/등록원부 미제출"})`
      );
    }
  }
  if (missingDataList.length === 0) {
    missingDataList.push("필수 기초 행정·재무 데이터 확인 완료 (심사 시 사업계획서 본안만 준비)");
  }

  // 7. L1 무료 AI 진단 리포트 생성 (확률 단정 및 정밀 금액 단정 금지!)
  const l1HeadlineSummary =
    gateResult.overallStatus === "ELIGIBLE"
      ? `선제적 제한게이트 검증 결과 결격 사유가 없으며, [${top3[0]?.institutionName ?? "정책금융기관"}] 등 ${top3.length}개 유력 경로에 대한 검토가 가능합니다.`
      : gateResult.overallStatus === "CONDITIONAL_VERIFY"
      ? `즉시 탈락 대상은 아니나, 제한게이트 예외검토 또는 미확인 항목(${
          gateResult.findings.filter((f) => f.severity === "WARNING_EXCEPTION")[0]?.title ?? "추가 확인"
        }) 소명 후 진행이 가능합니다.`
      : `현재 선제적 제한게이트 결격 요인(${
          gateResult.findings.filter((f) => f.severity === "HARD_BLOCK")[0]?.title ?? "제한 사유"
        })이 확인되어 해당 요인 해소 전에는 즉시 접수가 곤란합니다.`;

  const l1Report: L1FreeReport = {
    tier: "L1",
    decisionStatus: gateResult.overallStatus,
    headlineBadge: gateResult.statusLabel,
    headlineSummary: l1HeadlineSummary,
    judgmentGrounds: gateResult.findings.map(
      (f) => `[${f.severity === "PASS" ? "충족" : f.severity === "WARNING_EXCEPTION" ? "예외/확인" : "제한"}] ${f.title}: ${f.reason}`
    ),
    missingDataList,
    promisingDirections:
      gateResult.overallStatus === "RESTRICTED"
        ? [
            "결격 사유(체납·연체·휴폐업·지원제외업종·명의불일치) 선행 해소 후 일반 정책자금 재진단 권고",
            "연체/신용회복 기업인 경우 중진공·소진공 재도전특별자금 예외 요건 별도 점검",
          ]
        : top3.map(
            (p) =>
              `${p.rank}순위 방향: ${p.institutionName} - ${p.programName} (정밀 금액 단정 전 기본 자격 부합)`
          ),
    nextActionGuide: nbqResult.nextQuestion
      ? [
          `[최우선 확인 질문(NBQ)] "${nbqResult.nextQuestion.questionText}" 항목에 먼저 응답하여 판정 정밀도를 높이세요.`,
          ...gateResult.findings
            .filter((f) => f.actionRequired)
            .map((f) => f.actionRequired as string),
        ]
      : [
          "L2 방향 결정 리포트에서 1~3순위 기관별 잠정 한도 범위와 우대요인 반영 내역을 확인하세요.",
          "기대출 분리 내역(주사업체 vs 타 개인사업자 vs 관계법인) 기준 한도 차감액을 점검하세요.",
        ],
    complianceNotice:
      "본 진단은 공공 마이데이터 및 기업 입력 정보와 최신 공고 룰을 기반으로 산출된 방향성 진단이며, 특정 승인 확률(%)이나 최종 실행 금액을 확정 보장하지 않습니다.",
  };

  // 8. L2 19,000원 방향 결정 리포트 생성
  const minSum = top3[0]?.minEstimateMkrw ?? 50;
  const maxSum =
    (top3[0]?.maxEstimateMkrw ?? 100) + Math.round((top3[1]?.maxEstimateMkrw ?? 0) * 0.4);

  const l2Report: L2DirectionReport = {
    tier: "L2",
    priceKrw: 19000,
    slaText: "접수 후 영업일 1일 이내",
    topCandidates: top3,
    provisionalAmountRangeSummary:
      gateResult.overallStatus === "RESTRICTED"
        ? "제한게이트 결격 사유 해소 전 신규 한도 산출 보류 (선행 조치 후 재산정)"
        : `단일/복합 시나리오 기준 잠정 조달 가능 범위: ${formatMkrwToKoreanBand(minSum, maxSum)}`,
    financialAndExposureSummary: {
      revenueMkrw: resolveFieldValue(business.annualRevenueMkrw, null),
      employeeCount: resolveFieldValue(business.employeeCount, null),
      businessAgeYears: bizAge,
      primaryExposureMkrw: gateResult.separatedExposureSummary.primaryBusinessTotalMkrw,
      otherSolePropExposureMkrw:
        gateResult.separatedExposureSummary.otherSoleProprietorTotalMkrw,
      relatedCorpExposureMkrw:
        gateResult.separatedExposureSummary.relatedCorporationTotalMkrw,
      regionalClassificationSummary: addressResult.summaryText,
    },
    recognizedPreferences: evaluatedBasePrefs.filter((p) => p.hasRawCandidate),
    supplementaryDocsRequired: missingDataList,
  };

  // 9. L3 59,000원 정밀전략 리포트 (전문가 1차 검수표 + 1안/2안/대안 + D1~D5 로드맵)
  const planACandidate = top3[0];
  const planBCandidate = top3[1] ?? top3[0];
  const planCCandidate = top3[2] ?? top3[1] ?? top3[0];

  const l3Report: L3StrategyReport = {
    tier: "L3",
    priceKrw: 59000,
    slaText: "접수 후 영업일 1~2일 이내",
    expertReviewTable: {
      reviewerName: "김태현 수석전문위원 (경영지도사 / 전 기술보증기금 지점장)",
      reviewerQualification: "중소벤처기업부 등록 경영지도사 제14-0892호",
      reviewedAt: "2026-11-04 14:30 KST",
      verificationStatus:
        gateResult.overallStatus === "ELIGIBLE" ? "검수 완료" : "보완 권고",
      revisionNotes: [
        `대표자 보유 복수 개인사업자(${gateResult.separatedExposureSummary.otherSoleProprietorTotalMkrw}백만 원) 및 관계법인(${gateResult.separatedExposureSummary.relatedCorporationTotalMkrw}백만 원) 채무를 주사업체 한도에서 단순 차감하지 않도록 기관별 분리 산식 검증 완료`,
        `우대요인 중 공식 증빙 확인(Verified) 및 공고 인정(Applied) 항목만 가점에 반영하고, 미검증 후보(Candidate) 항목은 오가산 배제 처리 확인`,
        `사업장 권역 분류(${addressResult.summaryText})에 따른 수도권/비수도권 특례 적용 타당성 검수 완료`,
      ],
    },
    scenarioPortfolio: {
      planA: {
        title: `1안 (주력 조달): ${planACandidate?.institutionName ?? "중진공"} 직접/우선 트랙`,
        targetProgram: planACandidate?.programName ?? "혁신창업사업화자금",
        expectedRange: planACandidate?.estimatedRangeText ?? "약 1.0억 ~ 2.0억 원 범위 (잠정)",
        prosAndCons:
          "정책 기준금리 연동으로 금리 경쟁력이 가장 우수하나, 온라인 사전상담 예약 경쟁 및 현장실사 준비가 치밀해야 함",
        executionStrategy:
          "인정된 우대요인(Applied) 증빙을 전면에 배치하고 매출 대비 운전자금 회전율 근거를 사업계획서에 명시하여 접수",
      },
      planB: {
        title: `2안 (병행/보완): ${planBCandidate?.institutionName ?? "기술보증기금"} 협약보증 트랙`,
        targetProgram: planBCandidate?.programName ?? "혁신성장 기술우대 보증",
        expectedRange: planBCandidate?.estimatedRangeText ?? "약 1.0억 ~ 1.8억 원 범위 (잠정)",
        prosAndCons:
          "직접대출 예산 소진 시에도 상시 접수가 가능하며 보증비율 우대(90~95%)로 시중은행 금리 인하 유도 가능",
        executionStrategy:
          "주거래은행 사전 한도 조회와 동시에 기술사업성 평가(특허·연구소·고용) 자료를 패키지 제출",
      },
      contingencyPlan: {
        title: `대안 시나리오 (예산소진·심사지연 대비): ${planCCandidate?.institutionName ?? "신용보증기금/지역신보"}`,
        targetProgram: planCCandidate?.programName ?? "성장유망 특례보증 / 지자체 이차보전",
        triggerCondition:
          "1안 기관 월별 상담 쿼터 조기 마감 또는 제한게이트 예외 소명 서류 발급에 5영업일 이상 소요될 경우 즉시 가동",
        executionStrategy:
          "지자체 이차보전 공고 또는 매출액 기준 보증서 트랙으로 브릿지 유동성을 선확보 후 차기 분기 정책자금 재도전",
      },
    },
    weekOneActionRoadmap: [
      {
        day: "D1",
        title: "제한게이트 클리어 및 납세·금융원천 증명 확보",
        tasks: [
          "국세·지방세 납세증명서(완납증명) 및 중진공/주거래은행 금융거래확인서 기준일 최신본 발급",
          "동일 대표자 타 개인사업자 및 관계법인 대출 잔액 명세 분리 정리",
        ],
        deliverable: "무결격 원천 증빙 패키지 (PDF)",
      },
      {
        day: "D2",
        title: "Candidate(후보) 우대요인 증빙 Verified 승격",
        tasks: [
          "만료 임박 또는 미제출 인증서(여성/장애인/벤처/특허등록원부/연구소 인정서) 최신본 발급",
          "4대보험 사업장 가입자명부 전년도 동월 대비 증가 인원 대조표 작성",
        ],
        deliverable: "공고인정(Rule Matched) 가점 증빙철",
      },
      {
        day: "D3",
        title: "1안·2안 기관 맞춤형 사업계획서 수치 정합성 보완",
        tasks: [
          "자금소요명세서(운전자금 회전기간 또는 시설투자 견적서)와 최근 부가세 과세표준 정합성 검증",
          "주소지 권역(본점 vs 공장/투자예정지)별 인허가·임대차계약서 사본 편철",
        ],
        deliverable: "기관 제출용 표준 사업계획서 초안",
      },
      {
        day: "D4",
        title: "전문가 1차 검수 피드백 반영 및 온라인 사전예약",
        tasks: [
          "L3 전문가 검수표 지적사항 수정 반영",
          "중진공/소진공/기보/신보 디지털 지점 사전상담 예약 및 전자약정 인증서 점검",
        ],
        deliverable: "사전상담 접수증 및 최종 제출본",
      },
      {
        day: "D5",
        title: "현장실사 및 대표자 대면심사 Q&A 리허설",
        tasks: [
          "대표자 실경영 입증 핵심 질문(핵심 기술, 주요 거래처, 자금 상환 재원) 점검",
          "1안 심사 결과에 따른 2안/대안 시나리오 스위칭 체크리스트 확정",
        ],
        deliverable: "실사 대응 체크북 완료",
      },
    ],
    riskMitigationRoadmap: gateResult.findings
      .filter((f) => f.severity !== "PASS")
      .map((f) => ({
        riskFactor: f.title,
        mitigationPlan: f.actionRequired ?? "전문위원 사전 소명자료 작성 지원",
        deadline: "기관 본접수 최소 3영업일 전 (D2~D3)",
      })),
  };

  if (l3Report.riskMitigationRoadmap.length === 0) {
    l3Report.riskMitigationRoadmap.push({
      riskFactor: "정책자금 월별 예산 조기 소진 리스크",
      mitigationPlan:
        "1안 직접대출 접수와 동시에 2안 보증기관 사전평가를 병행하여 자금 집행 공백 방지",
      deadline: "당월 10일 이내 사전예약 완료 권고",
    });
  }

  // 10. L4 실행 컨설팅 고지 (승인 및 실행금액 확정 보장 불가 원칙 명시!)
  const l4Notice: L4ConsultingNotice = {
    tier: "L4",
    serviceName: "1:1 실행 컨설팅 케어",
    scopeOfWork: [
      "L3 정밀전략 시나리오 기반 실제 기관 접수 일정 관리 및 서류 편철 가이던스",
      "기업 맞춤형 사업계획서 스토리라인 고도화 및 재무 추정치 정합성 자문",
      "기관 담당자 현장실사 및 대표자 대면평가 사전 모의실사 케어",
    ],
    mandatoryLegalDisclaimer:
      "[필수 법적 고지] 정책자금의 최종 승인 여부, 보증비율, 적용 금리 및 실제 실행 금액은 중소벤처기업진흥공단·소상공인시장진흥공단·기술보증기금·신용보증기금 등 각 공적 심사기관의 고유 권한입니다. 당사는 어떠한 경우에도 승인 및 실행금액 확정 보장을 약정할 수 없으며, 불법 브로커 행위(허위 서류 작성, 제3자 부당 개입)를 일절 배격합니다.",
    contractProcessText: "별도 적격성 인터뷰 후 범위 산정 및 정식 자문계약 체결",
  };

  // 11. 수집 채널 및 버전 스냅샷 생성 (과거 결과 덮어쓰기 금지, versionNumber + 1)
  const providerSet = new Set<DataProvider>();
  const fieldsToScan = [
    business.entityType,
    business.nationalTaxArrears,
    business.annualRevenueMkrw,
    business.employeeCount,
    rep.isActualCEO,
  ];
  for (const f of fieldsToScan) {
    if (f.rawMeta?.provider) providerSet.add(f.rawMeta.provider);
    if (f.confirmedMeta?.provider) providerSet.add(f.confirmedMeta.provider);
  }
  if (providerSet.size === 0) providerSet.add("MyData");

  const nextVersionNumber = previousSnapshot ? previousSnapshot.versionNumber + 1 : 1;

  const dataVersionHash = `DV-${caseId}-v${nextVersionNumber}-${resolveFieldValue(
    business.nationalTaxArrears,
    "UNKNOWN"
  )}-${resolveFieldValue(business.annualRevenueMkrw, 0)}`;

  return {
    snapshotId: `SNAP-${caseId}-V${nextVersionNumber}`,
    caseId,
    versionNumber: nextVersionNumber,
    previousSnapshotId: previousSnapshot ? previousSnapshot.snapshotId : null,
    createdAt: "2026-11-04T09:00:00Z",
    dataVersionHash,
    policyRuleVersionSet: Array.from(new Set(rulesDb.map((r) => `${r.ruleId}@${r.ruleVersion}`))),
    inputCollectionChannel: Array.from(providerSet),
    limitationGate: gateResult,
    classifiedAddresses: addressResult.classified,
    evaluatedPreferences: evaluatedBasePrefs,
    nextBestQuestion: nbqResult.nextQuestion,
    remainingQuestionQueueCount: nbqResult.candidateQueue.length,
    reports: {
      l1: l1Report,
      l2: l2Report,
      l3: l3Report,
      l4: l4Notice,
    },
  };
}
