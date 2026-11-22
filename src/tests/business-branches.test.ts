import { describe, expect, it } from "vitest";
import { diagnoseBranch } from "../engines/business-branches";
import { freeDiagnosis } from "../engines/document-advisor";
describe("기업 유형별 안전한 경로 검토", () => {
  it("개발 적자를 구조개선으로 단정하지 않는다", () => {
    expect(diagnoseBranch({ businessType: "기술창업", recovery: "개발·R&D 투자에 따른 초기 적자" })?.hold).toBe(false);
  });
  it("복합위험이면 모든 기업의 추천을 보류한다", () => {
    for (const businessType of ["기술창업", "농업·농식품", "어업·수산"]) {
      const result = diagnoseBranch({ businessType, recovery: "자본잠식·복합위험" });
      expect(result?.routes).toEqual([]);
      expect(result?.expert).toBe(true);
    }
  });
  it("농어업도 일반기업 경로를 병행한다", () => {
    expect(diagnoseBranch({ businessType: "농업·농식품" })?.routes.join()).toContain("일반 중소기업");
    expect(diagnoseBranch({ businessType: "어업·수산" })?.missing).toContain("허가·면허·사업권");
  });
  it("기존 상담 위험이 상세 입력보다 우선한다", () => {
    expect(freeDiagnosis({ tax: "active", branch: { businessType: "일반 창업" } }).branch?.hold).toBe(true);
    expect(freeDiagnosis({ finance: "weak", branch: { businessType: "기술창업", recovery: "매출·상환능력 유지" } }).branch?.hold).toBe(true);
  });
  it("구버전 진단과 모르는 유형에 분기를 강제하지 않는다", () => {
    expect(freeDiagnosis({}).branch).toBeNull();
    expect(diagnoseBranch({ businessType: "invalid" })).toBeNull();
  });
});
