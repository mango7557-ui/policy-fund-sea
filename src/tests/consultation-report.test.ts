import { expect, it } from "vitest";
import { createConsultationReport, reportText } from "../engines/consultation-report";
it("creates an immutable snapshot including risks and missing data", () => {
  const answers = { branch: { businessType: "농업·농식품", recovery: "자본잠식·복합위험" } };
  const messages = [{ role: "user" as const, text: "시설자금이 필요합니다", time: "오후 1시" }];
  const report = createConsultationReport(answers, messages);
  answers.branch.businessType = "일반기업";
  messages[0].text = "변경됨";
  expect(report.branchInputs.businessType).toBe("농업·농식품");
  expect(report.diagnosis.branch?.routes).toEqual([]);
  expect(report.messages[0].text).toBe("시설자금이 필요합니다");
  expect(reportText(report)).toContain("전문가");
  expect(report.id).toMatch(/^[a-f0-9-]{36}$/);
});
