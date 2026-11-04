import {
  BusinessEntityMaster,
  ExposureRecord,
  GateCheckFinding,
  GateDecisionStatus,
  LimitationGateResult,
  RepresentativeMaster,
  resolveFieldValue,
} from "../domain/schema";

/**
 * 선제적 제한게이트 (Limitation Gate)
 *
 * [핵심 원칙]
 * - 한도/금액 계산 전, 진단 불가 또는 제한 요인을 선제 검증한다.
 * - 검증 항목:
 *   1) 국세·지방세 체납, 금융 연체, 휴·폐업, 신용사고, 지원제외 업종
 *   2) 사업자등록상 대표자와 실경영자 불일치 여부
 *   3) 동일 대표자의 복수 개인사업자 및 관계법인 채무 노출 (단순 합산 금지, 분리 저장 후 룰별 반영)
 * - 예외 처리:
 *   체납 완납 예정/분납 승인이거나 단기연체 즉시 해소 등 예외 규정이 존재하는 경우
 *   즉시 종결(현재 곤란)하지 않고 "추가 확인" (CONDITIONAL_VERIFY) 상태로 분류한다.
 */
export function runLimitationGate(
  rep: RepresentativeMaster,
  business: BusinessEntityMaster,
  exposures: ExposureRecord[]
): LimitationGateResult {
  const findings: GateCheckFinding[] = [];

  // 1. 휴·폐업 검증
  const opStatus = resolveFieldValue(business.operationStatus, "ACTIVE");
  if (opStatus === "CLOSED" || opStatus === "DORMANT") {
    findings.push({
      code: "GATE-OP-001",
      category: "OPERATION",
      severity: "HARD_BLOCK",
      title: opStatus === "CLOSED" ? "폐업 상태 사업자" : "휴업 상태 사업자",
      reason:
        opStatus === "CLOSED"
          ? "현재 사업자등록 상태가 폐업으로 확인되어 기업 정책자금 신청 대상에서 제외됩니다."
          : "현재 휴업 중인 사업자로 확인됩니다. 영업 재개(사업자등록 재개신고) 및 실매출 발생 증빙 전에는 정책자금 접수가 제한됩니다.",
      actionRequired:
        opStatus === "DORMANT"
          ? "세무서 휴업해제(영업재개) 신고 및 사업장 실가동 증빙 확보 후 재진단"
          : "재창업 전용 패키지로 전환 검토",
    });
  } else {
    findings.push({
      code: "GATE-OP-PASS",
      category: "OPERATION",
      severity: "PASS",
      title: "정상 가동 사업체 확인",
      reason: "국세청 사업자 상태 조회 기준 정상 영업 중으로 확인되었습니다.",
    });
  }

  // 2. 지원제외 업종 검증
  const isExcludedInd = resolveFieldValue(business.isExcludedIndustry, false);
  const ksicName = resolveFieldValue(business.ksicName, "일반업종");
  if (isExcludedInd) {
    findings.push({
      code: "GATE-IND-001",
      category: "INDUSTRY",
      severity: "HARD_BLOCK",
      title: "정책자금 융자제외 대상 업종",
      reason: `주업종(${ksicName})이 정책자금 지원제외 업종(사행·유흥·일반부동산임대·금융 등)에 해당하여 직접대출 및 보증서 발급이 제한됩니다.`,
      actionRequired:
        "제조·지식서비스·IT 등 지원대상 업종으로의 업종 전환 또는 복수업종 중 주업종 매출비중(50% 이상) 변경 여부 확인",
    });
  } else {
    findings.push({
      code: "GATE-IND-PASS",
      category: "INDUSTRY",
      severity: "PASS",
      title: "지원 가능 업종 부합",
      reason: `표준산업분류(${ksicName}) 기준 정책자금 융자 대상 업종 요건을 충족합니다.`,
    });
  }

  // 3. 사업자등록상 대표자와 실경영자 일치 여부
  const isActualCEO = resolveFieldValue(rep.isActualCEO, true);
  if (isActualCEO === false) {
    findings.push({
      code: "GATE-CEO-001",
      category: "CEO_MATCH",
      severity: "HARD_BLOCK",
      title: "대표자-실경영자 불일치 (명의대여·실질지배 위배 위험)",
      reason:
        "사업자등록상 대표자와 실제 경영 의사결정자가 일치하지 않는 경우 모든 정책기관(중진공·기보·신보·소진공)에서 즉시 결격 및 환수 사유에 해당합니다.",
      actionRequired:
        "공동대표 등기 전환 또는 대표자 명의 일치 정리 전에는 정책자금 접수 불가",
    });
  } else if (isActualCEO === null) {
    findings.push({
      code: "GATE-CEO-WARN",
      category: "CEO_MATCH",
      severity: "WARNING_EXCEPTION",
      title: "실경영자 직접 경영 여부 추가 확인 필요",
      reason:
        "대표자 외 가족·특수관계인의 경영 관여 정황이 미확인이므로 현장실사 대비 대표자 직접 경영 소명이 필요합니다.",
      actionRequired: "대표자 직접 경영 확인 질문(NBQ) 응답 완료 필요",
    });
  } else {
    findings.push({
      code: "GATE-CEO-PASS",
      category: "CEO_MATCH",
      severity: "PASS",
      title: "대표자 실경영 일치 확인",
      reason: "사업자등록상 대표자가 실제 경영권을 행사하는 것으로 확인되었습니다.",
    });
  }

  // 4. 국세·지방세 체납 검증 (예외 규정 분리 처리!)
  const natTax = resolveFieldValue(business.nationalTaxArrears, "NONE");
  const locTax = resolveFieldValue(business.localTaxArrears, "NONE");

  if (natTax === "ARREARS_ACTIVE" || locTax === "ARREARS_ACTIVE") {
    findings.push({
      code: "GATE-TAX-001",
      category: "ARREARS",
      severity: "HARD_BLOCK",
      title: "국세·지방세 현행 체납 미해소",
      reason:
        "현재 국세 또는 지방세 체납이 해소되지 않은 상태이며 분납/징수유예 승인이 확인되지 않아 즉시 심사가 제한됩니다.",
      actionRequired:
        "접수 전 전액 완납하여 납세증명서(완납증명)를 발급받거나 세무서 징수유예·분납 승인을 득한 경우 예외 검토로 전환 가능",
    });
  } else if (
    natTax === "INSTALLMENT_APPROVED" ||
    locTax === "INSTALLMENT_APPROVED"
  ) {
    // [핵심 예외 처리] 체납 완납 예정이거나 분납/징수유예 시 즉시 종결하지 않고 '추가 확인/예외 검토'로 분류
    findings.push({
      code: "GATE-TAX-EXCEPTION",
      category: "ARREARS",
      severity: "WARNING_EXCEPTION",
      title: "세금 체납 예외검토 대상 (완납 예정 / 징수유예·분납 승인)",
      reason:
        "체납 이력이 존재하나 접수 전 완납 예정이거나 과세관청의 징수유예·분납 승인이 있는 경우 즉시 종결하지 않고 조건부 예외검토 트랙으로 분류합니다.",
      actionRequired:
        "기관 접수일 이전 국세·지방세 완납증명서 또는 징수유예 승인통지서 제출 필수",
      exceptionRuleApplied:
        "중진공·보증기관 징수유예 및 접수 전 완납 조건부 예외심사 규정 적용",
    });
  } else if (natTax === "UNKNOWN" || locTax === "UNKNOWN") {
    findings.push({
      code: "GATE-TAX-UNKNOWN",
      category: "ARREARS",
      severity: "WARNING_EXCEPTION",
      title: "국세·지방세 납세증명 미확인",
      reason:
        "공공 마이데이터 미연동으로 국세·지방세 완납 여부가 아직 확인되지 않았습니다.",
      actionRequired: "NBQ 응답 또는 국세·지방세 납세증명서 확인 필요",
    });
  } else {
    findings.push({
      code: "GATE-TAX-PASS",
      category: "ARREARS",
      severity: "PASS",
      title: "국세·지방세 체납 없음",
      reason: "국세 및 지방세 완납 상태로 결격 사유가 없습니다.",
    });
  }

  // 5. 금융 연체 및 대표자 신용사고 검증
  const overdue = resolveFieldValue(business.financialOverdue, "NONE");
  const creditDefault = resolveFieldValue(rep.hasCreditDefault, false);

  if (creditDefault || overdue === "OVERDUE_ACTIVE") {
    findings.push({
      code: "GATE-FIN-001",
      category: "OVERDUE",
      severity: "HARD_BLOCK",
      title: "금융권 현행 연체 또는 신용관리대상 정보 등록",
      reason:
        "현재 금융기관 원리금 연체 중이거나 대표자 신용도판단정보(채무불이행 등)가 해제되지 않아 일반 정책자금 승인이 불가합니다.",
      actionRequired:
        "연체 원리금 전액 상환 및 해제 기록 반영 확인, 또는 재도전특별자금(신용회복 성실상환자 전용) 별도 요건 검토",
    });
  } else if (overdue === "RECENT_SHORT_CLEARED") {
    findings.push({
      code: "GATE-FIN-EXCEPTION",
      category: "OVERDUE",
      severity: "WARNING_EXCEPTION",
      title: "단기 경미 연체 해소 (예외검토 대상)",
      reason:
        "최근 일시적 단기 연체가 있었으나 현재 전액 해소된 상태이므로 즉시 탈락 처리하지 않고 금융거래확인서 기준 예외검토로 분류합니다.",
      actionRequired: "금융거래확인서 발급을 통해 연체 일수(영업일 기준) 및 현재 정상거래 소명",
      exceptionRuleApplied: "단기 일시 연체 해소 기업 소명 심사 규정",
    });
  } else if (overdue === "UNKNOWN") {
    findings.push({
      code: "GATE-FIN-UNKNOWN",
      category: "OVERDUE",
      severity: "WARNING_EXCEPTION",
      title: "금융권 연체 여부 미확인",
      reason: "금융거래확인서 또는 대표자 연체 유무가 아직 확인되지 않았습니다.",
      actionRequired: "금융권 연체 여부 질문(NBQ) 응답 필요",
    });
  } else {
    findings.push({
      code: "GATE-FIN-PASS",
      category: "OVERDUE",
      severity: "PASS",
      title: "금융권 정상 거래 확인",
      reason: "현재 금융기관 원리금 연체 및 신용사고 내역이 없습니다.",
    });
  }

  // 6. 동일 대표자의 복수 개인사업자 및 관계법인 채무 분리 집계 (단순 합산 절대 금지!)
  let primaryBusinessTotalMkrw = 0;
  let otherSoleProprietorTotalMkrw = 0;
  let relatedCorporationTotalMkrw = 0;

  const institutionBreakdown: LimitationGateResult["separatedExposureSummary"]["institutionBreakdown"] =
    {};

  for (const exp of exposures) {
    const bal = resolveFieldValue(exp.balanceMkrw, 0);
    if (!institutionBreakdown[exp.institution]) {
      institutionBreakdown[exp.institution] = {
        primaryMkrw: 0,
        otherSolePropMkrw: 0,
        relatedCorpMkrw: 0,
        ruleAppliedNote: "",
      };
    }

    if (exp.relationType === "PRIMARY_BUSINESS") {
      primaryBusinessTotalMkrw += bal;
      institutionBreakdown[exp.institution].primaryMkrw += bal;
    } else if (exp.relationType === "REP_OTHER_SOLE_PROPRIETOR") {
      otherSoleProprietorTotalMkrw += bal;
      institutionBreakdown[exp.institution].otherSolePropMkrw += bal;
    } else if (exp.relationType === "RELATED_CORPORATION") {
      relatedCorporationTotalMkrw += bal;
      institutionBreakdown[exp.institution].relatedCorpMkrw += bal;
    }
  }

  Object.keys(institutionBreakdown).forEach((inst) => {
    const item = institutionBreakdown[inst];
    item.ruleAppliedNote = `주사업체(${item.primaryMkrw}백만) / 대표자 타 개인사업자(${item.otherSolePropMkrw}백만) / 관계법인(${item.relatedCorpMkrw}백만) 분리 보관 — 기관별 한도 룰에 따라 개별 차감`;
  });

  if (otherSoleProprietorTotalMkrw > 0 || relatedCorporationTotalMkrw > 0) {
    findings.push({
      code: "GATE-EXP-SEPARATED",
      category: "MULTI_EXPOSURE",
      severity: "WARNING_EXCEPTION",
      title: "복수 개인사업자·관계법인 기대출 분리 감지 (단순 합산 배제)",
      reason: `주사업체 채무(${primaryBusinessTotalMkrw}백만 원) 외에 동일 대표자 타 개인사업자(${otherSoleProprietorTotalMkrw}백만 원) 및 관계법인(${relatedCorporationTotalMkrw}백만 원) 채무가 존재합니다. 단순 합산하지 않고 기관별 동일인 한도 룰에 맞춰 분리 반영합니다.`,
      actionRequired:
        "타 사업장 기대출의 취급기관(중진공/소진공/신보/기보/시중은행)별 분리 내역서 대조",
      exceptionRuleApplied:
        "복수 사업체 채무 단순 합산 금지 및 기관별 차등 반영 원칙 적용",
    });
  } else {
    findings.push({
      code: "GATE-EXP-PASS",
      category: "MULTI_EXPOSURE",
      severity: "PASS",
      title: "단일 사업체 여신 구조",
      reason: `주사업체 기대출(${primaryBusinessTotalMkrw}백만 원)만 존재하며 타 개인사업자·관계법인 중복 채무 노출이 없습니다.`,
    });
  }

  // 전체 판정 도출
  const hasHardBlock = findings.some((f) => f.severity === "HARD_BLOCK");
  const hasWarning = findings.some((f) => f.severity === "WARNING_EXCEPTION");

  let overallStatus: GateDecisionStatus = "ELIGIBLE";
  let statusLabel: LimitationGateResult["statusLabel"] = "검토 가능";

  if (hasHardBlock) {
    overallStatus = "RESTRICTED";
    statusLabel = "현재 곤란";
  } else if (hasWarning) {
    overallStatus = "CONDITIONAL_VERIFY";
    statusLabel = "추가 확인";
  }

  return {
    overallStatus,
    statusLabel,
    findings,
    separatedExposureSummary: {
      primaryBusinessTotalMkrw,
      otherSoleProprietorTotalMkrw,
      relatedCorporationTotalMkrw,
      institutionBreakdown,
    },
  };
}
