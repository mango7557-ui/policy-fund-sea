/**
 * 정책 자금바다 - 핵심 도메인 모델 및 데이터베이스 스키마 설계
 *
 * [핵심 원칙]
 * 1. 원천 데이터(Raw Source)와 고객 확정값(Confirmed Value)을 엄격히 분리하며,
 *    각 필드는 source_id, provider, as_of_date, verification_status 메타데이터를 보관한다.
 *    고객이 수기 수정하더라도 원천 데이터를 절대 덮어쓰지 않고 별도 레이어로 기록한다.
 * 2. 엔터티 분리:
 *    - RepresentativeMaster (대표자 마스터)
 *    - BusinessEntityMaster (사업체 마스터)
 *    - IntegratedExposure (통합 익스포저: 대출/보증/채무 - 복수 개인사업자·관계법인 분리 저장)
 *    - PolicyRuleMaster (정책 룰 마스터 - 버전 및 예산소진 상태 추적)
 *    - DiagnosticSnapshot (진단 결과 스냅샷 - 불변 버전 기록)
 */

export type DataProvider = "MyData" | "API" | "Upload" | "Manual";

export type VerificationStatus =
  | "VERIFIED_RAW"      // 공공 마이데이터 또는 제휴 API 원천 검증 완료
  | "OCR_PARSED"        // 파일 업로드 OCR/문서 파싱 추출값
  | "USER_DECLARED"     // 고객 수기 입력/보정값 (원천 데이터 덮어쓰기 금지)
  | "EXPERT_CONFIRMED"  // L3 전문가 검수 확정값
  | "UNVERIFIED";       // 미확인

/**
 * 필드별 출처·기준일·검증상태 래퍼
 * 원천값(rawValue)과 고객 확정값(confirmedValue)을 분리 보관하여 원천 훼손을 원천 차단한다.
 */
export interface SourcedField<T> {
  fieldKey: string;
  rawValue: T | null;
  rawMeta?: {
    source_id: string;
    provider: DataProvider;
    as_of_date: string; // YYYY-MM-DD
    verification_status: VerificationStatus;
  };
  confirmedValue: T | null;
  confirmedMeta?: {
    source_id: string;
    provider: DataProvider;
    as_of_date: string;
    verification_status: VerificationStatus;
    overrideReason?: string;
  };
}

/** 유효값 조회 헬퍼 (확정값이 있으면 확정값 우선하되 원천 메타는 보존) */
export function resolveFieldValue<T>(field: SourcedField<T> | undefined, fallback: T): T {
  if (!field) return fallback;
  if (field.confirmedValue !== null && field.confirmedValue !== undefined) {
    return field.confirmedValue;
  }
  if (field.rawValue !== null && field.rawValue !== undefined) {
    return field.rawValue;
  }
  return fallback;
}

/**
 * 원천 데이터를 훼손하지 않고 고객/보완 입력값을 업데이트하는 불변 헬퍼
 */
export function applyCustomerConfirmation<T>(
  existing: SourcedField<T>,
  newValue: T,
  provider: DataProvider = "Manual",
  overrideReason?: string,
  asOfDate: string = "2026-11-04"
): SourcedField<T> {
  return {
    ...existing,
    // rawValue와 rawMeta는 절대 덮어쓰지 않음!
    confirmedValue: newValue,
    confirmedMeta: {
      source_id: `CONF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      provider,
      as_of_date: asOfDate,
      verification_status: provider === "Upload" ? "OCR_PARSED" : "USER_DECLARED",
      overrideReason,
    },
  };
}

export function createSourcedField<T>(
  fieldKey: string,
  value: T | null,
  provider: DataProvider = "MyData",
  asOfDate: string = "2026-11-04",
  status?: VerificationStatus
): SourcedField<T> {
  const defaultStatus: VerificationStatus =
    status ??
    (provider === "MyData" || provider === "API"
      ? "VERIFIED_RAW"
      : provider === "Upload"
      ? "OCR_PARSED"
      : "USER_DECLARED");

  if (provider === "MyData" || provider === "API") {
    return {
      fieldKey,
      rawValue: value,
      rawMeta: {
        source_id: `RAW-${provider.toUpperCase()}-${fieldKey}`,
        provider,
        as_of_date: asOfDate,
        verification_status: defaultStatus,
      },
      confirmedValue: null,
    };
  }

  return {
    fieldKey,
    rawValue: null,
    confirmedValue: value,
    confirmedMeta: {
      source_id: `USR-${provider.toUpperCase()}-${fieldKey}`,
      provider,
      as_of_date: asOfDate,
      verification_status: defaultStatus,
    },
  };
}

// ============================================================================
// 1. 대표자 마스터 (RepresentativeMaster)
// ============================================================================
export interface RepresentativeMaster {
  repId: string;
  name: string;
  birthYear: SourcedField<number>; // 만 나이 산출 및 청년창업(만 39세 이하) 판정용
  gender: SourcedField<"M" | "F">;
  isActualCEO: SourcedField<boolean | null>; // 사업자등록상 대표자와 실경영자 일치 여부 (true=일치, false=불일치, null=미확인)
  actualCEORelationNote?: string; // 공동대표/가족경영 등 소명 메모
  hasCreditDefault: SourcedField<boolean>; // 금융채무불이행/신용회복·파산면책 진행 등 신용사고 여부
  creditScoreBand: SourcedField<"HIGH" | "MID" | "LOW" | "UNKNOWN">; // NICE/KCB 구간
  ownedBusinessIds: string[]; // 동일 대표자가 보유한 복수 개인사업자 및 관계법인 목록
}

// ============================================================================
// 2. 주소 및 지역권역 분류 (Address & Regional Zone)
// ============================================================================
export type AddressRole =
  | "HEAD_OFFICE"         // 본점 (사업자등록증상 본점)
  | "ACTUAL_WORKPLACE"    // 실사업장 (주사무소/연구소 등)
  | "FACTORY"             // 공장 (공장등록증 기준 제조시설)
  | "INVESTMENT_PLANNED"; // 시설투자 예정지 (신축/매입/설비도입 예정지)

export type MacroRegion = "CAPITAL" | "NON_CAPITAL"; // 수도권 vs 비수도권

export type CapitalZoneType =
  | "OVERPOPULATION_CONTROL" // 과밀억제권역 (서울 전지역, 인천 일부, 성남/수원/안양/부천/고양 등)
  | "GROWTH_MANAGEMENT"      // 성장관리권역 (화성/평택/김포/파주/용인 일부 등)
  | "NATURE_PRESERVATION"    // 자연보전권역 (이천/여주/광주/양평/가평 등)
  | "NON_CAPITAL_ZONE";      // 비수도권 (지방 우대/지역신보·지자체 특화 대상)

export interface BusinessAddressItem {
  addressId: string;
  role: AddressRole;
  rawAddress: string;
  sido: string;
  sigungu: string;
  macroRegion?: MacroRegion;
  capitalZone?: CapitalZoneType;
  legalBasisCode?: string; // 수도권정비계획법 시행령 별표1 매핑 코드
}

// ============================================================================
// 3. 가점·우대 프로필 4단계 상태머신 (Preference Profile State Machine)
// ============================================================================
export type PreferenceType =
  | "YOUTH_CEO"           // 청년대표 (만 39세 이하)
  | "WOMEN_ENTERPRISE"    // 여성기업 확인서
  | "DISABLED_ENTERPRISE" // 장애인기업 확인서
  | "PATENT_IP"           // 특허권/실용신안 등록 (직무발명/법인명의)
  | "RND_INSTITUTE"       // 기업부설연구소 / 연구개발전담부서
  | "JOB_CREATION"        // 최근 1년 고용창출 (4대보험 증가)
  | "EXPORT_PERFORMANCE"  // 직수출/간접수출 실적
  | "SMART_FACTORY"       // 스마트공장 구축/고도화 기업
  | "VENTURE_INNO_MAINBIZ"; // 벤처기업 / 이노비즈 / 메인비즈 인증

/**
 * 4단계 상태 정의:
 * Candidate (후보) -> Verified (증빙확인) -> Rule Matched (공고인정) -> Applied (실제반영)
 */
export type PreferenceState =
  | "CANDIDATE"     // 1단계: 고객 주장 또는 기초 정황 포착 (증빙 미검증)
  | "VERIFIED"      // 2단계: 공공 마이데이터/인증서/공식 서류로 유효기간·명의 검증 완료
  | "RULE_MATCHED"  // 3단계: 특정 정책자금 공고의 우대 요건과 매칭됨
  | "APPLIED";      // 4단계: 해당 공고에서 실제 한도상향/금리감면/가점/전용트랙에 반영 완료

export interface PreferenceItem {
  type: PreferenceType;
  label: string;
  currentState: PreferenceState;
  hasRawCandidate: boolean;
  evidenceVerified: boolean;
  evidenceDocName?: string;
  expiryDate?: string; // 유효기간 만료 여부 검증용
  isExpired?: boolean;
  provider: DataProvider;
  asOfDate: string;
}

// ============================================================================
// 4. 사업체 마스터 (BusinessEntityMaster)
// ============================================================================
export type BusinessType = "SOLE_PROPRIETOR" | "CORPORATION"; // 개인사업자 | 법인사업자

export type OperationStatus = "ACTIVE" | "DORMANT" | "CLOSED"; // 정상영업 | 휴업 | 폐업

export type TaxArrearsStatus =
  | "NONE"                // 체납 없음 (완납증명 확인)
  | "ARREARS_ACTIVE"      // 현재 체납 중 (해소 계획 미확인)
  | "INSTALLMENT_APPROVED"// 징수유예 / 분납 승인 또는 금주 내 완납 예정 (예외검토 대상)
  | "UNKNOWN";            // 미확인 (NBQ 질의 대상)

export type FinancialOverdueStatus =
  | "NONE"                // 연체 없음
  | "OVERDUE_ACTIVE"      // 현재 금융기관 원리금 연체 중
  | "RECENT_SHORT_CLEARED"// 단기 경미 연체(5영업일 미만) 해소 완료 (예외검토 대상)
  | "UNKNOWN";

export interface BusinessEntityMaster {
  businessId: string;
  businessNumber: string; // 사업자등록번호 (예: 120-88-12345)
  companyName: string;
  repId: string;
  entityType: SourcedField<BusinessType>;
  establishedDate: SourcedField<string>; // YYYY-MM-DD (업력 계산용)
  ksicCode: SourcedField<string>;        // 표준산업분류 코드 (예: C26, J58, G47, I56, L68 등)
  ksicName: SourcedField<string>;
  isExcludedIndustry: SourcedField<boolean>; // 유흥·사행·일반부동산임대 등 정책자금 지원제외 업종 여부
  operationStatus: SourcedField<OperationStatus>;
  annualRevenueMkrw: SourcedField<number | null>; // 최근 결산 매출액 (백만원 단위)
  operatingProfitMkrw: SourcedField<number | null>; // 최근 영업이익 (백만원 단위)
  capitalImpairment: SourcedField<boolean | null>; // 완전자본잠식 여부
  employeeCount: SourcedField<number | null>; // 4대보험 가입 상시근로자 수
  nationalTaxArrears: SourcedField<TaxArrearsStatus>; // 국세 체납 상태
  localTaxArrears: SourcedField<TaxArrearsStatus>;    // 지방세 체납 상태
  financialOverdue: SourcedField<FinancialOverdueStatus>; // 금융권 연체 상태
  fundPurpose: SourcedField<"WORKING" | "FACILITY" | "BOTH" | null>; // 필요자금 용도 (운전/시설/복합)
  requestedAmountMkrw: SourcedField<number | null>; // 희망 조달 금액 (백만원)
  addresses: BusinessAddressItem[];
  preferences: PreferenceItem[];
}

// ============================================================================
// 5. 통합 익스포저 (IntegratedExposure - 단순 합산 금지, 분리 저장 후 룰별 반영)
// ============================================================================
export type ExposureInstitution =
  | "KOSME"        // 중소벤처기업진흥공단 (중진공)
  | "SEMAS"        // 소상공인시장진흥공단 (소진공)
  | "KODIT"        // 신용보증기금 (신보)
  | "KIBO"         // 기술보증기금 (기보)
  | "REGIONAL_CGF" // 지역신용보증재단 (지역신보)
  | "COMMERCIAL_BANK" // 시중은행 일반신용/담보대출
  | "LOCAL_GOV";   // 지자체 이차보전 자금

export type OwnerRelationType =
  | "PRIMARY_BUSINESS"          // 진단 대상 주사업체 직접 채무
  | "REP_OTHER_SOLE_PROPRIETOR" // 동일 대표자 명의 타 개인사업자 채무
  | "RELATED_CORPORATION";      // 동일 대표자 지배 관계법인 채무

export interface ExposureRecord {
  exposureId: string;
  businessId: string;
  businessName: string;
  relationType: OwnerRelationType;
  institution: ExposureInstitution;
  productType: "DIRECT_LOAN" | "GUARANTEE" | "PRIVATE_LOAN";
  productName: string;
  balanceMkrw: SourcedField<number>; // 잔액 (백만원)
  interestRatePct: SourcedField<number>; // 적용 금리 (%)
  maturityDate: string; // 만기일 YYYY-MM-DD
}

// ============================================================================
// 6. 정책 룰 마스터 (PolicyRuleMaster - 버전관리 및 예산소진 상태 추적)
// ============================================================================
export type BudgetStatus = "OPEN" | "LOW_BUDGET" | "EXHAUSTED" | "UPCOMING";

export interface PolicyRuleMaster {
  ruleId: string;
  ruleVersion: string; // 예: "2026.11-v2.4"
  institution: ExposureInstitution;
  institutionName: string;
  programName: string;
  category: "WORKING" | "FACILITY" | "BOTH";
  budgetStatus: BudgetStatus;
  remainingBudgetRatioPct: number;
  updatedAt: string;

  // 자격 요건
  targetBusinessAgeMaxYears?: number; // 업력 제한 (예: 창업 7년 이내)
  targetEmployeeMax?: number;         // 소상공인 상시근로자 요건 등
  targetMacroRegions?: MacroRegion[]; // 지역 제한 (비수도권 전용 등)
  allowedCapitalZones?: CapitalZoneType[];
  requiresFactoryOrRND?: boolean;
  requiresTechOrIP?: boolean;

  // 한도 및 금리 조건 (백만원)
  baseMaxLimitMkrw: number;
  preferentialMaxLimitMkrw: number;
  indicativeRateRange: string; // 예: "연 2.5% ~ 3.3% (변동)"

  // 해당 공고가 인정하는 가점/우대 항목 (Rule Matched 판정 기준)
  acceptedPreferences: {
    type: PreferenceType;
    benefitType: "LIMIT_BOOST" | "RATE_DISCOUNT" | "PRIORITY_TRACK" | "SCORE_BONUS";
    effectDescription: string;
    rateDiscountBp?: number;
    limitBoostRatioPct?: number;
  }[];

  // 복수 사업자 / 관계기업 채무 반영 룰 (단순 합산 금지, 기관별 차등 룰)
  exposureAggregationRule: {
    includePrimarySameInst: boolean;
    includeOtherSolePropSameInst: boolean; // 동일 대표자 타 개인사업자의 동일기관 잔액 차감 여부
    includeRelatedCorpGuarantee: boolean;  // 관계법인 보증/대출 연계 한도 반영 여부
    institutionCapMkrw: number;            // 기관 통합 한도 캡
    description: string;
  };
}

// ============================================================================
// 7. 선제적 제한게이트 결과 및 NBQ 모델
// ============================================================================
export type GateDecisionStatus =
  | "ELIGIBLE"            // 검토 가능 (정상 통과)
  | "CONDITIONAL_VERIFY"  // 추가 확인 / 예외 검토 (체납 분납/완납예정, 단기연체 해소, 미확인 항목 존재 등)
  | "RESTRICTED";         // 현재 곤란 (휴폐업, 지원제외업종, 현행 체납/연체 미해소, 명의불일치 등)

export interface GateCheckFinding {
  code: string;
  category: "ARREARS" | "OVERDUE" | "OPERATION" | "INDUSTRY" | "CEO_MATCH" | "CREDIT" | "MULTI_EXPOSURE";
  severity: "PASS" | "WARNING_EXCEPTION" | "HARD_BLOCK";
  title: string;
  reason: string;
  actionRequired?: string;
  exceptionRuleApplied?: string;
}

export interface LimitationGateResult {
  overallStatus: GateDecisionStatus;
  statusLabel: "검토 가능" | "추가 확인" | "현재 곤란";
  findings: GateCheckFinding[];
   separatedExposureSummary: {
    primaryBusinessTotalMkrw: number;
    otherSoleProprietorTotalMkrw: number;
    relatedCorporationTotalMkrw: number;
    institutionBreakdown: Record<
      string,
      {
        primaryMkrw: number;
        otherSolePropMkrw: number;
        relatedCorpMkrw: number;
        ruleAppliedNote: string;
      }
    >;
  };
}

export interface NBQItem {
  questionId: string;
  targetFieldKey: string;
  questionText: string;
  whyWeAsk: string; // 왜 이 질문이 결론을 바꾸는지 설명
  informationGainScore: number; // 0 ~ 100 (가장 높은 1개만 최우선 추출)
  impactOnConclusion: string;
  options: {
    label: string;
    value: string;
    description: string;
  }[];
}

// ============================================================================
// 8. L1 ~ L4 단계별 리포트 및 진단 스냅샷 (DiagnosticSnapshot)
// ============================================================================
export interface MatchedProgramResult {
  rank: number;
  ruleId: string;
  ruleVersion: string;
  institutionName: string;
  programName: string;
  budgetStatus: BudgetStatus;
  fitScore: number; // 내부 매칭 적합도 (절대 '승인 확률 %'로 노출 금지!)
  selectionReasons: string[];
  estimatedRangeText: string; // 예: "1.5억 ~ 2.5억 원 범위 (잠정)" - 단정 금액 금지
  minEstimateMkrw: number;
  maxEstimateMkrw: number;
  appliedPreferences: {
    type: PreferenceType;
    label: string;
    state: PreferenceState;
    benefitEffect: string;
  }[];
  unappliedPreferences: {
    type: PreferenceType;
    label: string;
    state: PreferenceState;
    reasonWhyNotApplied: string;
  }[];
  exposureDeductionNote: string;
  requiredMissingDocs: string[];
}

export interface L1FreeReport {
  tier: "L1";
  decisionStatus: GateDecisionStatus;
  headlineBadge: "검토 가능" | "추가 확인" | "현재 곤란";
  headlineSummary: string;
  judgmentGrounds: string[];     // 판단 근거
  missingDataList: string[];     // 부족 자료
  promisingDirections: string[]; // 유력 자금 방향 (정밀 금액 단정 금지)
  nextActionGuide: string[];     // 다음 행동 지침
  complianceNotice: string;      // 확률/승인 단정 배제 고지
}

export interface L2DirectionReport {
  tier: "L2";
  priceKrw: 19000;
  slaText: "접수 후 영업일 1일 이내";
  topCandidates: MatchedProgramResult[]; // 1~3순위 후보기관 및 선정 이유
  provisionalAmountRangeSummary: string;
  financialAndExposureSummary: {
    revenueMkrw: number | null;
    employeeCount: number | null;
    businessAgeYears: number;
    primaryExposureMkrw: number;
    otherSolePropExposureMkrw: number;
    relatedCorpExposureMkrw: number;
    regionalClassificationSummary: string;
  };
  recognizedPreferences: PreferenceItem[];
  supplementaryDocsRequired: string[];
}

export interface L3StrategyReport {
  tier: "L3";
  priceKrw: 59000;
  slaText: "접수 후 영업일 1~2일 이내";
  expertReviewTable: {
    reviewerName: string;
    reviewerQualification: string;
    reviewedAt: string;
    verificationStatus: "검수 완료" | "보완 권고";
    revisionNotes: string[];
  };
  scenarioPortfolio: {
    planA: {
      title: string;
      targetProgram: string;
      expectedRange: string;
      prosAndCons: string;
      executionStrategy: string;
    };
    planB: {
      title: string;
      targetProgram: string;
      expectedRange: string;
      prosAndCons: string;
      executionStrategy: string;
    };
    contingencyPlan: {
      title: string;
      targetProgram: string;
      triggerCondition: string;
      executionStrategy: string;
    };
  };
  weekOneActionRoadmap: {
    day: "D1" | "D2" | "D3" | "D4" | "D5";
    title: string;
    tasks: string[];
    deliverable: string;
  }[];
  riskMitigationRoadmap: {
    riskFactor: string;
    mitigationPlan: string;
    deadline: string;
  }[];
}

export interface L4ConsultingNotice {
  tier: "L4";
  serviceName: "1:1 실행 컨설팅 케어";
  scopeOfWork: string[];
  mandatoryLegalDisclaimer: string; // 승인 및 실행금액 확정 보장 불가 원칙 명시
  contractProcessText: string;
}

/**
 * 진단 결과 스냅샷 (버전관리 및 불변 기록)
 * 과거 진단 결과를 수정할 때 덮어쓰지 않고 새로운 versionNumber의 스냅샷을 생성한다.
 */
export interface DiagnosticSnapshot {
  snapshotId: string;
  caseId: string;
  versionNumber: number; // v1, v2, v3... 덮어쓰기 금지
  previousSnapshotId: string | null;
  createdAt: string;
  dataVersionHash: string;     // 사용된 원천/확정 기업데이터 스냅샷 버전
  policyRuleVersionSet: string[]; // 사용된 정책 룰 버전 목록
  inputCollectionChannel: DataProvider[];
  limitationGate: LimitationGateResult;
  classifiedAddresses: BusinessAddressItem[];
  evaluatedPreferences: PreferenceItem[];
  nextBestQuestion: NBQItem | null; // 남은 최고 정보가득성 질문 1개
  remainingQuestionQueueCount: number;
  reports: {
    l1: L1FreeReport;
    l2: L2DirectionReport;
    l3: L3StrategyReport;
    l4: L4ConsultingNotice;
  };
}
