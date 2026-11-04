import { describe, expect, it } from "vitest";
import { runGoldenTest100Suite } from "../engines/gt100-runner";

describe("Golden Test 100 (GT100) 회귀테스트 게이트 검증", () => {
  const suiteResult = runGoldenTest100Suite();

  it("100개 대표 시뮬레이션 케이스가 전수 실행되고 P0 오류가 0건이어야 한다", () => {
    expect(suiteResult.totalCases).toBe(100);
    expect(suiteResult.passedCases).toBe(100);
    expect(suiteResult.failedCases).toBe(0);
    expect(suiteResult.p0ErrorCount).toBe(0);
    expect(suiteResult.releaseGateApproved).toBe(true);
  });

  it("그룹 1 (Case 1~20): 선제적 제한게이트 결격 사유(체납/연체/휴폐업/지원제외업종/명의불일치)를 100% 차단해야 한다", () => {
    const group1 = suiteResult.cases.slice(0, 20);
    expect(group1.every((c) => c.p0ChecksPassed && c.actualGateStatus === "RESTRICTED")).toBe(true);
  });

  it("그룹 2 (Case 21~35): 체납 분납/완납예정 및 단기연체 해소는 즉시 종결하지 않고 '추가 확인(CONDITIONAL_VERIFY)'으로 분류해야 한다", () => {
    const group2 = suiteResult.cases.slice(20, 35);
    expect(group2.every((c) => c.p0ChecksPassed && c.actualGateStatus === "CONDITIONAL_VERIFY")).toBe(true);
  });

  it("그룹 3 (Case 36~50): 복수 개인사업자 및 관계법인 채무를 단순 합산하지 않고 분리 저장 후 룰별로 반영해야 한다", () => {
    const group3 = suiteResult.cases.slice(35, 50);
    expect(group3.every((c) => c.p0ChecksPassed)).toBe(true);
  });

  it("그룹 4 (Case 51~65): 가점·우대 4단계 상태머신이 미검증 Candidate 및 만료 인증서의 오가산을 100% 차단해야 한다", () => {
    const group4 = suiteResult.cases.slice(50, 65);
    expect(group4.every((c) => c.p0ChecksPassed)).toBe(true);
  });

  it("그룹 5 (Case 66~80): 주소 및 지역권역(수도권 과밀억제·성장관리·자연보전·비수도권)을 법정 매핑 기준으로 자동 분류해야 한다", () => {
    const group5 = suiteResult.cases.slice(65, 80);
    expect(group5.every((c) => c.p0ChecksPassed)).toBe(true);
  });

  it("그룹 6 (Case 81~90): NBQ 재질문 금지, 원천 데이터 보존 및 스냅샷 버전 증가가 보장되어야 한다", () => {
    const group6 = suiteResult.cases.slice(80, 90);
    expect(group6.every((c) => c.p0ChecksPassed)).toBe(true);
  });

  it("그룹 7 (Case 91~100): 승인 확률 단정 문구 금지, L4 보장불가 고지, 알림톡 민감정보 차단 및 만료 세션 OTP 인증이 작동해야 한다", () => {
    const group7 = suiteResult.cases.slice(90, 100);
    expect(group7.every((c) => c.p0ChecksPassed)).toBe(true);
  });
});
