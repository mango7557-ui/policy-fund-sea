import {
  applyCustomerConfirmation,
  BusinessEntityMaster,
  CapitalZoneType,
  createSourcedField,
  ExposureRecord,
  GateDecisionStatus,
  RepresentativeMaster,
} from "../domain/schema";
import {
  containsForbiddenCompliancePhrase,
  runFullDiagnosticEngine,
} from "./diagnostic-engine";
import {
  buildSecureNotificationMessage,
  resolveSecureLinkAccess,
} from "./security-notification";

export interface GT100CaseSpec {
  caseNumber: number;
  caseId: string;
  category:
    | "GATE_HARD_BLOCK"       // 1~20: 휴폐업, 지원제외업종, 현행체납, 현행연체, 대표자불일치 차단 검증
    | "GATE_EXCEPTION"        // 21~35: 체납 분납/완납예정, 단기연체 해소 등 '추가 확인' 예외분류 검증
    | "MULTI_EXPOSURE_RULE"   // 36~50: 복수 개인사업자·관계법인 채무 분리 저장 및 단순 합산 금지 검증
    | "PREF_STATE_MACHINE"    // 51~65: 가점·우대 4단계(Candidate->Verified->RuleMatched->Applied) 오가산 방지 검증
    | "ADDRESS_ZONING"        // 66~80: 본점/공장/투자예정지 분리 및 수도권(과밀/성장/자연)/비수도권 매핑 검증
    | "NBQ_AND_IMMUTABILITY"  // 81~90: NBQ 기수집 재질문 금지, 원천 데이터 덮어쓰기 금지 및 스냅샷 버전 증가 검증
    | "COMPLIANCE_AND_SEC";   // 91~100: 확률 단정 문구 배제, L4 법적 고지, 알림톡 민감정보 미노출 및 만료세션 OTP 검증
  title: string;
  expectedGateStatus: GateDecisionStatus;
  expectedZone?: CapitalZoneType;
  p0ChecksPassed: boolean;
  p0FailureReasons: string[];
  actualGateStatus: GateDecisionStatus;
  executionTimeMs: number;
}

export interface GT100SuiteSummary {
  totalCases: 100;
  passedCases: number;
  failedCases: number;
  p0ErrorCount: number;
  releaseGateApproved: boolean;
  executedAt: string;
  cases: GT100CaseSpec[];
}

function buildBaselineCase(idx: number): {
  rep: RepresentativeMaster;
  business: BusinessEntityMaster;
  exposures: ExposureRecord[];
} {
  const rep: RepresentativeMaster = {
    repId: `GT-REP-${idx}`,
    name: `테스트대표_${idx}`,
    birthYear: createSourcedField("birthYear", 1988, "MyData"),
    gender: createSourcedField("gender", idx % 2 === 0 ? "F" : "M", "MyData"),
    isActualCEO: createSourcedField("isActualCEO", true, "MyData"),
    hasCreditDefault: createSourcedField("hasCreditDefault", false, "API"),
    creditScoreBand: createSourcedField("creditScoreBand", "HIGH", "API"),
    ownedBusinessIds: [`GT-BIZ-${idx}`],
  };

  const business: BusinessEntityMaster = {
    businessId: `GT-BIZ-${idx}`,
    businessNumber: `100-81-${String(10000 + idx)}`,
    companyName: `골든테스트기업_${idx}호`,
    repId: `GT-REP-${idx}`,
    entityType: createSourcedField("entityType", "CORPORATION", "MyData"),
    establishedDate: createSourcedField("establishedDate", "2022-05-01", "MyData"),
    ksicCode: createSourcedField("ksicCode", "C26", "MyData"),
    ksicName: createSourcedField("ksicName", "전자부품 제조업", "MyData"),
    isExcludedIndustry: createSourcedField("isExcludedIndustry", false, "MyData"),
    operationStatus: createSourcedField("operationStatus", "ACTIVE", "MyData"),
    annualRevenueMkrw: createSourcedField("annualRevenueMkrw", 1200, "API"),
    operatingProfitMkrw: createSourcedField("operatingProfitMkrw", 140, "API"),
    capitalImpairment: createSourcedField("capitalImpairment", false, "API"),
    employeeCount: createSourcedField("employeeCount", 7, "MyData"),
    nationalTaxArrears: createSourcedField("nationalTaxArrears", "NONE", "MyData"),
    localTaxArrears: createSourcedField("localTaxArrears", "NONE", "MyData"),
    financialOverdue: createSourcedField("financialOverdue", "NONE", "MyData"),
    fundPurpose: createSourcedField("fundPurpose", "WORKING", "Manual"),
    requestedAmountMkrw: createSourcedField("requestedAmountMkrw", 300, "Manual"),
    addresses: [
      {
        addressId: `GT-ADDR-${idx}`,
        role: "HEAD_OFFICE",
        rawAddress: "경기도 화성시 동탄산단로 10",
        sido: "경기도",
        sigungu: "화성시",
      },
    ],
    preferences: [
      {
        type: "PATENT_IP",
        label: "등록 특허권",
        currentState: "VERIFIED",
        hasRawCandidate: true,
        evidenceVerified: true,
        provider: "MyData",
        asOfDate: "2026-11-04",
      },
    ],
  };

  const exposures: ExposureRecord[] = [
    {
      exposureId: `GT-EXP-${idx}-1`,
      businessId: `GT-BIZ-${idx}`,
      businessName: `골든테스트기업_${idx}호`,
      relationType: "PRIMARY_BUSINESS",
      institution: "KOSME",
      productType: "DIRECT_LOAN",
      productName: "중진공 운전자금",
      balanceMkrw: createSourcedField("balanceMkrw", 50, "MyData"),
      interestRatePct: createSourcedField("interestRatePct", 2.9, "MyData"),
      maturityDate: "2028-05-01",
    },
  ];

  return { rep, business, exposures };
}

/**
 * 100개 대표 시뮬레이션 케이스(GT100)를 자동 실행하고 P0 무결성 규칙을 검증한다.
 */
export function runGoldenTest100Suite(): GT100SuiteSummary {
  const cases: GT100CaseSpec[] = [];

  for (let i = 1; i <= 100; i++) {
    const startMs = performance.now();
    const caseId = `GT100-${String(i).padStart(3, "0")}`;
    const { rep, business, exposures } = buildBaselineCase(i);
    const p0Failures: string[] = [];

    let category: GT100CaseSpec["category"] = "GATE_HARD_BLOCK";
    let title = "";
    let expectedGateStatus: GateDecisionStatus = "ELIGIBLE";
    let expectedZone: CapitalZoneType | undefined = undefined;

    // ------------------------------------------------------------------------
    // 그룹 1 (Case 1 ~ 20): 선제적 제한게이트 즉시 차단(RESTRICTED) 시나리오
    // ------------------------------------------------------------------------
    if (i <= 20) {
      category = "GATE_HARD_BLOCK";
      expectedGateStatus = "RESTRICTED";
      const mod = i % 5;
      if (mod === 1) {
        title = `[제한게이트 #${i}] 국세 현행 체납 미해소 기업 차단 검증`;
        business.nationalTaxArrears = createSourcedField("nationalTaxArrears", "ARREARS_ACTIVE", "MyData");
      } else if (mod === 2) {
        title = `[제한게이트 #${i}] 휴·폐업 사업자 선제 차단 검증`;
        business.operationStatus = createSourcedField("operationStatus", i % 2 === 0 ? "CLOSED" : "DORMANT", "MyData");
      } else if (mod === 3) {
        title = `[제한게이트 #${i}] 정책자금 융자제외 업종(사행·일반임대업) 차단 검증`;
        business.isExcludedIndustry = createSourcedField("isExcludedIndustry", true, "API");
      } else if (mod === 4) {
        title = `[제한게이트 #${i}] 사업자등록 대표자와 실경영자 불일치 차단 검증`;
        rep.isActualCEO = createSourcedField("isActualCEO", false, "Manual");
      } else {
        title = `[제한게이트 #${i}] 금융기관 현행 원리금 연체 / 신용사고 차단 검증`;
        business.financialOverdue = createSourcedField("financialOverdue", "OVERDUE_ACTIVE", "API");
      }

      const snap = runFullDiagnosticEngine({ caseId, rep, business, exposures });
      if (snap.limitationGate.overallStatus !== "RESTRICTED") {
        p0Failures.push(`제한게이트가 RESTRICTED를 반환해야 하나 ${snap.limitationGate.overallStatus} 반환`);
      }
      if (snap.reports.l1.headlineBadge !== "현재 곤란") {
        p0Failures.push("L1 결론 배지가 '현재 곤란'이어야 함");
      }

      cases.push({
        caseNumber: i,
        caseId,
        category,
        title,
        expectedGateStatus,
        p0ChecksPassed: p0Failures.length === 0,
        p0FailureReasons: p0Failures,
        actualGateStatus: snap.limitationGate.overallStatus,
        executionTimeMs: Math.max(1, Math.round(performance.now() - startMs)),
      });
      continue;
    }

    // ------------------------------------------------------------------------
    // 그룹 2 (Case 21 ~ 35): 제한게이트 예외 규정 ('추가 확인' / CONDITIONAL_VERIFY)
    // ------------------------------------------------------------------------
    if (i <= 35) {
      category = "GATE_EXCEPTION";
      expectedGateStatus = "CONDITIONAL_VERIFY";
      if (i % 3 === 0) {
        title = `[예외검토 #${i}] 국세 체납 중이나 징수유예/분납 승인 시 즉시 종결 금지 검증`;
        business.nationalTaxArrears = createSourcedField(
          "nationalTaxArrears",
          "INSTALLMENT_APPROVED",
          "Upload"
        );
      } else if (i % 3 === 1) {
        title = `[예외검토 #${i}] 단기 경미 연체(5영업일 미만) 즉시 해소 기업 예외검토 분류 검증`;
        business.financialOverdue = createSourcedField(
          "financialOverdue",
          "RECENT_SHORT_CLEARED",
          "Upload"
        );
      } else {
        title = `[예외검토 #${i}] 지방세 접수 전 완납 예정 기업 조건부 검토 분류 검증`;
        business.localTaxArrears = createSourcedField(
          "localTaxArrears",
          "INSTALLMENT_APPROVED",
          "Manual"
        );
      }

      const snap = runFullDiagnosticEngine({ caseId, rep, business, exposures });
      if (snap.limitationGate.overallStatus !== "CONDITIONAL_VERIFY") {
        p0Failures.push(
          `체납 완납예정/단기연체 해소 케이스는 즉시 종결(RESTRICTED)하지 않고 CONDITIONAL_VERIFY로 분류해야 함`
        );
      }
      if (snap.reports.l1.headlineBadge !== "추가 확인") {
        p0Failures.push("L1 결론 배지가 '추가 확인'이어야 함");
      }

      cases.push({
        caseNumber: i,
        caseId,
        category,
        title,
        expectedGateStatus,
        p0ChecksPassed: p0Failures.length === 0,
        p0FailureReasons: p0Failures,
        actualGateStatus: snap.limitationGate.overallStatus,
        executionTimeMs: Math.max(1, Math.round(performance.now() - startMs)),
      });
      continue;
    }

    // ------------------------------------------------------------------------
    // 그룹 3 (Case 36 ~ 50): 복수 개인사업자 및 관계법인 채무 분리 저장 (단순 합산 금지)
    // ------------------------------------------------------------------------
    if (i <= 50) {
      category = "MULTI_EXPOSURE_RULE";
      expectedGateStatus = "CONDITIONAL_VERIFY"; // 복수사업자 채무 분리 감지 경고 포함
      title = `[복수사업자 채무분리 #${i}] 타 개인사업자 시중은행 대출(5억)이 중진공 한도를 단순 잠식하지 않는지 검증`;

      exposures.push(
        {
          exposureId: `GT-EXP-${i}-SOLE`,
          businessId: `GT-SOLE-${i}`,
          businessName: `대표자타개인사업장_${i}`,
          relationType: "REP_OTHER_SOLE_PROPRIETOR",
          institution: "COMMERCIAL_BANK",
          productType: "PRIVATE_LOAN",
          productName: "시중은행 일반부동산담보대출",
          balanceMkrw: createSourcedField("balanceMkrw", 500, "API"),
          interestRatePct: createSourcedField("interestRatePct", 4.5, "API"),
          maturityDate: "2029-10-01",
        },
        {
          exposureId: `GT-EXP-${i}-CORP`,
          businessId: `GT-REL-CORP-${i}`,
          businessName: `관계법인_${i}`,
          relationType: "RELATED_CORPORATION",
          institution: "KODIT",
          productType: "GUARANTEE",
          productName: "신보 보증서 대출",
          balanceMkrw: createSourcedField("balanceMkrw", 300, "API"),
          interestRatePct: createSourcedField("interestRatePct", 3.9, "API"),
          maturityDate: "2027-12-31",
        }
      );

      const snap = runFullDiagnosticEngine({ caseId, rep, business, exposures });
      const sep = snap.limitationGate.separatedExposureSummary;

      if (
        sep.primaryBusinessTotalMkrw !== 50 ||
        sep.otherSoleProprietorTotalMkrw !== 500 ||
        sep.relatedCorporationTotalMkrw !== 300
      ) {
        p0Failures.push("주사업체/타개인사업자/관계법인 익스포저가 분리 집계되지 않음");
      }

      // 중진공 청년창업(한도 200백만) 매칭 시 시중은행 500백만원이 단순 차감되어 한도가 0이 되면 P0 오류!
      const kosmeYouth = snap.reports.l2.topCandidates.find(
        (c) => c.ruleId === "RULE-KOSME-YOUTH-2026"
      );
      if (kosmeYouth && kosmeYouth.maxEstimateMkrw <= 0) {
        p0Failures.push("타 개인사업자의 시중은행 대출이 중진공 한도에 단순 합산 차감됨 (단순 합산 금지 위반)");
      }

      cases.push({
        caseNumber: i,
        caseId,
        category,
        title,
        expectedGateStatus,
        p0ChecksPassed: p0Failures.length === 0,
        p0FailureReasons: p0Failures,
        actualGateStatus: snap.limitationGate.overallStatus,
        executionTimeMs: Math.max(1, Math.round(performance.now() - startMs)),
      });
      continue;
    }

    // ------------------------------------------------------------------------
    // 그룹 4 (Case 51 ~ 65): 가점·우대 프로필 4단계 상태머신 (오가산 방지 검증)
    // ------------------------------------------------------------------------
    if (i <= 65) {
      category = "PREF_STATE_MACHINE";
      expectedGateStatus = "ELIGIBLE";
      title = `[가점 4단계 상태머신 #${i}] 미검증 후보(Candidate) 및 만료 인증서의 자동 오가산 차단 검증`;

      business.preferences = [
        {
          type: "SMART_FACTORY",
          label: "스마트공장 확인서 (증빙 미제출 Candidate)",
          currentState: "CANDIDATE",
          hasRawCandidate: true,
          evidenceVerified: false, // 미검증!
          provider: "Manual",
          asOfDate: "2026-11-04",
        },
        {
          type: "WOMEN_ENTERPRISE",
          label: "여성기업 확인서 (유효기간 만료)",
          currentState: "CANDIDATE",
          hasRawCandidate: true,
          evidenceVerified: true,
          isExpired: true, // 만료!
          expiryDate: "2025-12-31",
          provider: "MyData",
          asOfDate: "2026-11-04",
        },
        {
          type: "PATENT_IP",
          label: "특허등록원부 (정상 증빙확인 완료)",
          currentState: "VERIFIED",
          hasRawCandidate: true,
          evidenceVerified: true,
          isExpired: false,
          provider: "MyData",
          asOfDate: "2026-11-04",
        },
      ];

      const snap = runFullDiagnosticEngine({ caseId, rep, business, exposures });

      for (const cand of snap.reports.l2.topCandidates) {
        const wronglyApplied = cand.appliedPreferences.some(
          (ap) => ap.type === "SMART_FACTORY" || ap.type === "WOMEN_ENTERPRISE"
        );
        if (wronglyApplied) {
          p0Failures.push(
            `증빙 미확인(Candidate) 또는 만료된 우대요인이 [${cand.programName}]에 오가산(APPLIED)됨`
          );
        }
      }

      cases.push({
        caseNumber: i,
        caseId,
        category,
        title,
        expectedGateStatus,
        p0ChecksPassed: p0Failures.length === 0,
        p0FailureReasons: p0Failures,
        actualGateStatus: snap.limitationGate.overallStatus,
        executionTimeMs: Math.max(1, Math.round(performance.now() - startMs)),
      });
      continue;
    }

    // ------------------------------------------------------------------------
    // 그룹 5 (Case 66 ~ 80): 주소 및 지역권역 자동 분류 엔진 검증
    // ------------------------------------------------------------------------
    if (i <= 80) {
      category = "ADDRESS_ZONING";
      expectedGateStatus = "ELIGIBLE";
      const mod = i % 4;
      if (mod === 0) {
        title = `[권역분류 #${i}] 서울 강남구/성남 분당구 -> 수도권 과밀억제권역 자동 분류 검증`;
        expectedZone = "OVERPOPULATION_CONTROL";
        business.addresses = [
          {
            addressId: `ADDR-${i}`,
            role: "HEAD_OFFICE",
            rawAddress: "서울특별시 강남구 역삼동 123",
            sido: "서울특별시",
            sigungu: "강남구",
          },
        ];
      } else if (mod === 1) {
        title = `[권역분류 #${i}] 경기 화성시/평택시/김포시 -> 수도권 성장관리권역 자동 분류 검증`;
        expectedZone = "GROWTH_MANAGEMENT";
        business.addresses = [
          {
            addressId: `ADDR-${i}`,
            role: "FACTORY",
            rawAddress: "경기도 평택시 포승읍 산단로 45",
            sido: "경기도",
            sigungu: "평택시",
          },
        ];
      } else if (mod === 2) {
        title = `[권역분류 #${i}] 경기 이천시/여주시/양평군 -> 수도권 자연보전권역 자동 분류 검증`;
        expectedZone = "NATURE_PRESERVATION";
        business.addresses = [
          {
            addressId: `ADDR-${i}`,
            role: "HEAD_OFFICE",
            rawAddress: "경기도 이천시 부발읍 경충대로 200",
            sido: "경기도",
            sigungu: "이천시",
          },
        ];
      } else {
        title = `[권역분류 #${i}] 부산/대전/전북/충남 -> 비수도권(NON_CAPITAL_ZONE) 및 지자체 자금 매칭 검증`;
        expectedZone = "NON_CAPITAL_ZONE";
        business.addresses = [
          {
            addressId: `ADDR-${i}`,
            role: "INVESTMENT_PLANNED",
            rawAddress: "대전광역시 유성구 테크노2로 77",
            sido: "대전광역시",
            sigungu: "유성구",
          },
        ];
      }

      const snap = runFullDiagnosticEngine({ caseId, rep, business, exposures });
      const actualZone = snap.classifiedAddresses[0]?.capitalZone;
      if (actualZone !== expectedZone) {
        p0Failures.push(`기대 권역(${expectedZone})과 실제 분류(${actualZone}) 불일치`);
      }

      cases.push({
        caseNumber: i,
        caseId,
        category,
        title,
        expectedGateStatus,
        expectedZone,
        p0ChecksPassed: p0Failures.length === 0,
        p0FailureReasons: p0Failures,
        actualGateStatus: snap.limitationGate.overallStatus,
        executionTimeMs: Math.max(1, Math.round(performance.now() - startMs)),
      });
      continue;
    }

    // ------------------------------------------------------------------------
    // 그룹 6 (Case 81 ~ 90): NBQ 재질문 금지, 원천 데이터 보존 및 스냅샷 버전관리 검증
    // ------------------------------------------------------------------------
    if (i <= 90) {
      category = "NBQ_AND_IMMUTABILITY";
      expectedGateStatus = "CONDITIONAL_VERIFY";
      title = `[NBQ·원천보존·버전관리 #${i}] 미확인 질문 1개 추출 후 고객 확정 시 원천 보존 & 스냅샷 v1→v2 불변 검증`;

      // 초기 상태: 연매출액 미확인(null) & 실경영자 미확인(null)
      rep.isActualCEO = createSourcedField("isActualCEO", null, "MyData", "2026-11-04", "UNVERIFIED");
      business.annualRevenueMkrw = createSourcedField("annualRevenueMkrw", 1000, "MyData");

      const snapV1 = runFullDiagnosticEngine({ caseId, rep, business, exposures });
      if (!snapV1.nextBestQuestion || snapV1.nextBestQuestion.questionId !== "NBQ-ACTUAL-CEO") {
        p0Failures.push("미확인 항목 중 최고 Information Gain 질문(NBQ-ACTUAL-CEO)이 1순위로 추출되지 않음");
      }

      // 고객이 연매출액을 1500으로 수기 수정하더라도 원천값(1000, MyData)이 덮어쓰기되지 않는지 검증
      business.annualRevenueMkrw = applyCustomerConfirmation(
        business.annualRevenueMkrw,
        1500,
        "Manual",
        "최근 가결산 기준 보정"
      );
      rep.isActualCEO = applyCustomerConfirmation(rep.isActualCEO, true, "Manual");

      if (business.annualRevenueMkrw.rawValue !== 1000) {
        p0Failures.push("고객 확정값 반영 시 원천 데이터(rawValue=1000)가 덮어쓰기됨 (원천 보존 원칙 위반)");
      }

      const snapV2 = runFullDiagnosticEngine({
        caseId,
        rep,
        business,
        exposures,
        previousSnapshot: snapV1,
      });

      if (snapV2.versionNumber !== 2 || snapV2.previousSnapshotId !== snapV1.snapshotId) {
        p0Failures.push("진단 결과 수정 시 기존 스냅샷을 덮어쓰지 않고 versionNumber=2가 생성되어야 함");
      }

      // 이미 응답 완료된 NBQ-ACTUAL-CEO가 다시 질문되면 P0 오류!
      if (snapV2.nextBestQuestion?.questionId === "NBQ-ACTUAL-CEO") {
        p0Failures.push("이미 확인된 정보(NBQ-ACTUAL-CEO)를 다시 질문함 (NBQ 재질문 금지 위반)");
      }

      cases.push({
        caseNumber: i,
        caseId,
        category,
        title,
        expectedGateStatus,
        p0ChecksPassed: p0Failures.length === 0,
        p0FailureReasons: p0Failures,
        actualGateStatus: snapV1.limitationGate.overallStatus,
        executionTimeMs: Math.max(1, Math.round(performance.now() - startMs)),
      });
      continue;
    }

    // ------------------------------------------------------------------------
    // 그룹 7 (Case 91 ~ 100): 확률 단정 금지, L4 필수 고지, 알림톡 민감정보 차단 & 만료세션 OTP 검증
    // ------------------------------------------------------------------------
    category = "COMPLIANCE_AND_SEC";
    expectedGateStatus = "ELIGIBLE";
    title = `[보안·컴플라이언스 #${i}] 확률 단정 문구 0건, L4 보장불가 고지, 알림톡 민감정보 미노출 및 만료세션 OTP 검증`;

    const snap = runFullDiagnosticEngine({ caseId, rep, business, exposures });
    const serializedReport = JSON.stringify(snap.reports);

    if (containsForbiddenCompliancePhrase(serializedReport)) {
      p0Failures.push("리포트 내에 금지된 승인 확률 단정 문구(예: '90% 승인')가 포함됨");
    }

    if (!snap.reports.l4.mandatoryLegalDisclaimer.includes("확정 보장")) {
      p0Failures.push("L4 컨설팅 고지에 승인 및 실행금액 확정 보장 불가 원칙이 누락됨");
    }

    const msg = buildSecureNotificationMessage({
      channel: i % 2 === 0 ? "KAKAO_ALIMTALK" : "SMS",
      recipientMaskedPhone: "010-****-5678",
      companyName: business.companyName,
      reportTier: "L3",
      tokenId: `TOK-${i}`,
      snapshotVersion: snap.versionNumber,
    });

    if (msg.containsSensitiveData) {
      p0Failures.push("알림톡/SMS 메시지 본문에 민감한 재무/신용 정보가 직접 노출됨");
    }

    const expiredUnauth = resolveSecureLinkAccess({
      tokenId: `TOK-${i}`,
      snapshotId: snap.snapshotId,
      expiresAt: "2026-11-01T00:00:00Z",
      isExpired: true,
      otpVerifiedForExpiredSession: false,
    });
    if (expiredUnauth.accessGranted || expiredUnauth.destinationView !== "OTP_CHALLENGE_MODAL") {
      p0Failures.push("만료된 보안 링크 클릭 시 OTP 인증 없이 열람이 허용됨");
    }

    const expiredAfterOtp = resolveSecureLinkAccess(
      {
        tokenId: `TOK-${i}`,
        snapshotId: snap.snapshotId,
        expiresAt: "2026-11-01T00:00:00Z",
        isExpired: true,
        otpVerifiedForExpiredSession: false,
      },
      "849201"
    );
    if (!expiredAfterOtp.accessGranted || expiredAfterOtp.destinationView !== "MYPAGE_ARCHIVE") {
      p0Failures.push("만료된 보안 링크 OTP 인증 후 마이페이지 열람 전환이 작동하지 않음");
    }

    cases.push({
      caseNumber: i,
      caseId,
      category,
      title,
      expectedGateStatus,
      p0ChecksPassed: p0Failures.length === 0,
      p0FailureReasons: p0Failures,
      actualGateStatus: snap.limitationGate.overallStatus,
      executionTimeMs: Math.max(1, Math.round(performance.now() - startMs)),
    });
  }

  const passedCases = cases.filter((c) => c.p0ChecksPassed).length;
  const failedCases = cases.length - passedCases;

  return {
    totalCases: 100,
    passedCases,
    failedCases,
    p0ErrorCount: failedCases,
    releaseGateApproved: failedCases === 0 && passedCases === 100,
    executedAt: "2026-11-04 09:30:00 KST",
    cases,
  };
}
