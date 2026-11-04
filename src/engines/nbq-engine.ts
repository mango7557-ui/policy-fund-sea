import {
  BusinessEntityMaster,
  NBQItem,
  RepresentativeMaster,
  resolveFieldValue,
} from "../domain/schema";

/**
 * 대화형 NBQ (Next Best Question) 엔진
 *
 * [핵심 원칙]
 * 1. 이미 수집되거나 확인된 정보는 절대 다시 묻지 않는다.
 * 2. 현재 진단 결론(제한게이트 통과 여부 -> 기관 트랙 결정 -> 한도 결정)을 바꿀
 *    정보가득성(Information Gain)이 가장 높은 핵심 질문 딱 하나만 선별해 연속 질의한다.
 */
export function extractNextBestQuestion(
  rep: RepresentativeMaster,
  business: BusinessEntityMaster
): {
  nextQuestion: NBQItem | null;
  candidateQueue: NBQItem[];
} {
  const candidates: NBQItem[] = [];

  // 1순위 (InfoGain 98): 국세·지방세 체납 상태가 UNKNOWN이거나 체납 중인데 분납/완납예정 여부가 미확인인 경우
  const natTax = resolveFieldValue(business.nationalTaxArrears, "UNKNOWN");
  const locTax = resolveFieldValue(business.localTaxArrears, "UNKNOWN");
  const taxMetaStatus =
    business.nationalTaxArrears.confirmedMeta?.verification_status ??
    business.nationalTaxArrears.rawMeta?.verification_status;

  if (
    natTax === "UNKNOWN" ||
    locTax === "UNKNOWN" ||
    (natTax === "ARREARS_ACTIVE" &&
      !business.nationalTaxArrears.confirmedMeta?.overrideReason)
  ) {
    candidates.push({
      questionId: "NBQ-TAX-STATUS",
      targetFieldKey: "nationalTaxArrears",
      questionText:
        "현재 국세·지방세 체납 여부는 어떠하며, 체납이 있다면 접수 전 완납 또는 분납 승인 계획이 있으신가요?",
      whyWeAsk:
        "체납 여부는 모든 정책자금의 1차 제한게이트 항목이지만, 접수 전 완납 예정이거나 징수유예·분납 승인이 있으면 즉시 탈락 대신 '추가 확인(예외검토)' 트랙으로 살릴 수 있습니다.",
      informationGainScore: 98,
      impactOnConclusion:
        "결론 등급 변화: [현재 곤란] ↔ [추가 확인(예외검토)] ↔ [검토 가능]",
      options: [
        {
          label: "체납 없음 (완납 상태)",
          value: "NONE",
          description: "국세·지방세 모두 체납 사실이 없습니다.",
        },
        {
          label: "일시 체납 중이나 접수 전 완납 예정 / 분납 승인",
          value: "INSTALLMENT_APPROVED",
          description: "징수유예·분납 승인을 받았거나 신청 전 즉시 완납 가능합니다.",
        },
        {
          label: "현재 체납 중이며 단기 내 완납 어려움",
          value: "ARREARS_ACTIVE",
          description: "당장 해소 계획 수립이 어려운 상태입니다.",
        },
      ],
    });
  }

  // 2순위 (InfoGain 95): 사업자등록상 대표자와 실경영자 일치 여부 미확인 (null)
  const isActualCEO = resolveFieldValue(rep.isActualCEO, null);
  if (isActualCEO === null) {
    candidates.push({
      questionId: "NBQ-ACTUAL-CEO",
      targetFieldKey: "isActualCEO",
      questionText:
        "사업자등록증상 대표자 본인이 실제 경영 의사결정(자금·계약·인사)을 직접 수행하고 계신가요?",
      whyWeAsk:
        "실경영자와 명의상 대표자가 다를 경우 현장실사에서 즉시 부결 사유가 되므로 선제 확인이 필수적입니다.",
      informationGainScore: 95,
      impactOnConclusion:
        "실경영자 일치 확인 시 정상 심사 진행, 불일치 시 공동대표 등기 선행 안내",
      options: [
        {
          label: "네, 대표자 본인이 직접 경영합니다",
          value: "true",
          description: "명의대여 없이 본인이 실경영자입니다.",
        },
        {
          label: "아니오, 실제 경영자가 따로 있습니다",
          value: "false",
          description: "가족·동업자 등이 실질 경영을 맡고 있습니다.",
        },
      ],
    });
  }

  // 3순위 (InfoGain 91): 금융권 연체 여부 미확인
  const finOverdue = resolveFieldValue(business.financialOverdue, "UNKNOWN");
  if (finOverdue === "UNKNOWN") {
    candidates.push({
      questionId: "NBQ-FIN-OVERDUE",
      targetFieldKey: "financialOverdue",
      questionText:
        "최근 3개월 내 은행·카드·보증기관 등 금융권 원리금 연체 이력이 있으신가요?",
      whyWeAsk:
        "현재 연체 중이면 신청이 제한되지만, 단기 일시 연체 후 완납된 경우에는 금융거래확인서 소명으로 진행 가능합니다.",
      informationGainScore: 91,
      impactOnConclusion: "보증기관 및 직접대출 심사 통과 가능 여부 판별",
      options: [
        {
          label: "연체 전혀 없음",
          value: "NONE",
          description: "정상 금융거래 유지 중입니다.",
        },
        {
          label: "단기(5영업일 미만) 경미 연체 있었으나 현재 해소 완료",
          value: "RECENT_SHORT_CLEARED",
          description: "일시적 출금 지연 등으로 발생 후 즉시 상환했습니다.",
        },
        {
          label: "현재 연체 진행 중",
          value: "OVERDUE_ACTIVE",
          description: "현재 미상환 연체금이 있습니다.",
        },
      ],
    });
  }

  // 4순위 (InfoGain 84): 최근 결산 연매출액 미확인 (null)
  const revenue = resolveFieldValue(business.annualRevenueMkrw, null);
  if (revenue === null) {
    candidates.push({
      questionId: "NBQ-ANNUAL-REVENUE",
      targetFieldKey: "annualRevenueMkrw",
      questionText:
        "최근 결산 기준 연간 매출액(또는 최근 1년 부가세 과세표준 합계)은 어느 구간인가요?",
      whyWeAsk:
        "운전자금 및 보증서 사정한도는 기본적으로 연간 매출액의 1/4 ~ 1/2(우대 시) 구간을 기준으로 산출됩니다.",
      informationGainScore: 84,
      impactOnConclusion: "기관별 잠정 조달 가능 범위(한도 밴드) 정밀화",
      options: [
        {
          label: "3억 원 미만 (초기/소규모)",
          value: "200",
          description: "창업초기·소진공 또는 기술기반 한도 산정 트랙 적용",
        },
        {
          label: "3억 원 ~ 10억 원",
          value: "600",
          description: "신보·기보·중진공 운전자금 주력 구간",
        },
        {
          label: "10억 원 ~ 30억 원",
          value: "1800",
          description: "성장기 기업 한도 우대 및 복수기관 포트폴리오 가능",
        },
        {
          label: "30억 원 이상",
          value: "3500",
          description: "중진공·기보·신보 대규모 운전/시설 복합 설계 구간",
        },
      ],
    });
  }

  // 5순위 (InfoGain 78): 상시근로자 수 미확인 (소진공 vs 중진공/기보 분기 핵심)
  const empCount = resolveFieldValue(business.employeeCount, null);
  if (empCount === null) {
    candidates.push({
      questionId: "NBQ-EMPLOYEE-COUNT",
      targetFieldKey: "employeeCount",
      questionText: "현재 4대보험 가입 기준 상시근로자 수(대표자 제외)는 몇 명인가요?",
      whyWeAsk:
        "상시근로자 수(5인 미만 / 10인 미만 기준)에 따라 소진공(소상공인 정책자금) 대상 여부와 고용창출 우대가 갈립니다.",
      informationGainScore: 78,
      impactOnConclusion: "소진공 소상공인 트랙 vs 중소기업 트랙 분기",
      options: [
        {
          label: "0명 ~ 4명 (소상공인 요건 충족)",
          value: "3",
          description: "소진공 일반경영안정자금 및 지역신보 신청 가능",
        },
        {
          label: "5명 ~ 9명 (제조업 소상공인 / 일반 소기업)",
          value: "7",
          description: "제조·건설·운수업은 소진공 가능, 일반업종은 중진공·기보·신보 트랙",
        },
        {
          label: "10명 이상",
          value: "15",
          description: "중진공·기보·신보 중소기업 전용자금 집중 매칭",
        },
      ],
    });
  }

  // 6순위 (InfoGain 72): 필요자금 용도 미확인 (운전 vs 시설)
  const purpose = resolveFieldValue(business.fundPurpose, null);
  if (purpose === null) {
    candidates.push({
      questionId: "NBQ-FUND-PURPOSE",
      targetFieldKey: "fundPurpose",
      questionText: "이번에 조달하고자 하는 정책자금의 주된 용도는 무엇인가요?",
      whyWeAsk:
        "운전자금(인건비·원부자재·임차료)과 시설자금(기계설비·공장매입·스마트공장)은 한도와 금리, 상환기간이 완전히 다릅니다.",
      informationGainScore: 72,
      impactOnConclusion: "운전자금 전용 공고 vs 시설자금 전용 공고 매칭",
      options: [
        {
          label: "운전자금 (인건비·원자재·경영안정)",
          value: "WORKING",
          description: "보증서 및 직접대출 운전자금 중심 설계",
        },
        {
          label: "시설자금 (기계설비 구입·공장 신증축)",
          value: "FACILITY",
          description: "중진공 신성장기반·시설자금 중심 설계",
        },
        {
          label: "운전자금 + 시설자금 복합",
          value: "BOTH",
          description: "시설자금 + 초기 가동 운전자금 패키지 설계",
        },
      ],
    });
  }

  // 7순위 (InfoGain 65): 후보(Candidate) 상태이지만 증빙 미확인인 핵심 우대요인 확인
  const unverifiedCandidatePref = business.preferences.find(
    (p) => p.hasRawCandidate && !p.evidenceVerified && !p.isExpired
  );
  if (unverifiedCandidatePref) {
    candidates.push({
      questionId: `NBQ-PREF-${unverifiedCandidatePref.type}`,
      targetFieldKey: `preference:${unverifiedCandidatePref.type}`,
      questionText: `[${unverifiedCandidatePref.label}] 항목의 공식 확인서(또는 등록원부)가 현재 유효기간 내에 발급 가능한 상태인가요?`,
      whyWeAsk:
        "보유 정황(Candidate)만으로는 가점을 자동 반영하지 않으며, 유효한 증빙이 확인(Verified)되어야 공고 우대 한도·금리에 실제 반영(Applied)됩니다.",
      informationGainScore: 65,
      impactOnConclusion: `${unverifiedCandidatePref.label} 우대 가점 및 한도 상향 반영 여부 확정`,
      options: [
        {
          label: "네, 유효기간 내 공식 증빙 보유 중입니다",
          value: "VERIFIED_TRUE",
          description: "Candidate → Verified → Rule Matched → Applied 상태로 승격",
        },
        {
          label: "아직 출원 중이거나 유효기간이 만료되었습니다",
          value: "VERIFIED_FALSE",
          description: "오가산 방지를 위해 후보 상태로 유지하고 보완 서류로 안내",
        },
      ],
    });
  }

  // Information Gain 내림차순 정렬 후 최상위 1개만 반환
  candidates.sort((a, b) => b.informationGainScore - a.informationGainScore);

  return {
    nextQuestion: candidates.length > 0 ? candidates[0] : null,
    candidateQueue: candidates,
  };
}
