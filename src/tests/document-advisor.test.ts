import { describe, expect, it } from "vitest";
import { QUESTION_BANK, POLICY_REFERENCES, PREFERENCE_REFERENCES, DIAGNOSIS_QUESTIONS, Answers, answerQuestion, nextQuestion, freeDiagnosis, searchQuestions, referenceReply, collectionRoute, reportReadiness } from "../engines/document-advisor";
import manifest from "../data/master/manifest.json";
import samples from "../data/master/sample-cases.json";

const complete: Answers = { purpose: "working", entity: "sole", operation: "active", tax: "none", overdue: "none", credit: "none", industry: "eligible", ceo: "yes", related: "none", finance: "normal", documents: "ready" };
describe("문서 기반 UAT 회귀검증", () => {
  it("7개 원문과 100개 대표질문·1,000개 변형의 출처를 보존한다", () => {
    expect(manifest).toHaveLength(7);
    expect(manifest.every(m => m.sha256.length === 64)).toBe(true);
    expect(QUESTION_BANK).toHaveLength(100);
    expect(QUESTION_BANK.reduce((n, q) => n + q.variants.length, 0)).toBe(1000);
    expect(POLICY_REFERENCES).toHaveLength(18);
    expect(PREFERENCE_REFERENCES).toHaveLength(15);
    expect(samples.map(s => s.id)).toEqual(["001", "054", "084", "097", "098"]);
  });
  for (const core of QUESTION_BANK) it(`UAT-010 ${core.id} 원문 의도 검색`, () => {
    expect(searchQuestions(core.question)[0].core.id).toBe(core.id);
    expect(searchQuestions(core.variants[0].text)[0].core.id).toBe(core.id);
  });
  it("미검수 질문을 승인된 답변으로 인용하지 않는다", () => {
    const reply = referenceReply("여성 대표자이면 자동으로 여성기업 우대를 받나요?");
    expect(reply.text).toContain("유효한 증빙");
    expect(reply.text).not.toContain("자동 적용");
    expect(reply.coreId).toBe("CORE-077");
  });
  it("UAT-011 답변한 질문과 오래된 버튼 응답은 다시 적용하지 않는다", () => {
    const first = answerQuestion({}, "purpose", "working");
    expect(nextQuestion(first)?.key).toBe("entity");
    expect(answerQuestion(first, "purpose", "facility")).toBe(first);
    expect(answerQuestion({}, "tax", "none")).toEqual({});
    expect(nextQuestion(complete)).toBeNull();
    expect(Object.keys(complete)).toHaveLength(DIAGNOSIS_QUESTIONS.length);
  });
  it("UAT-003/012 제한항목은 우대와 무관하게 먼저 검증하며 무료 금액은 없다", () => {
    expect(freeDiagnosis({}).status).toBe("추가 확인");
    expect(freeDiagnosis(complete).status).toBe("검토 가능");
    expect(freeDiagnosis({ ...complete, tax: "active" }).status).toBe("현재 곤란");
    expect(freeDiagnosis({ ...complete, tax: "exception" }).status).toBe("추가 확인");
    expect(freeDiagnosis({ ...complete, ceo: "review" }).status).toBe("추가 확인");
    expect(freeDiagnosis(complete).amount).toBeNull();
  });
  it("GT2-054 다른 사업체 채무는 분리 확인한다", () => {
    const result = freeDiagnosis({ ...complete, related: "yes", purpose: "facility" });
    expect(result.status).toBe("추가 확인");
    expect(result.reasons.join()).toContain("단순 합산하지 않고");
  });
  it("GT2-097 조회장애는 자료보완·GT2-098은 구조개선을 우선한다", () => {
    expect(freeDiagnosis({ ...complete, documents: "missing" }).status).toBe("추가 확인");
    const weak = freeDiagnosis({ ...complete, finance: "weak" });
    expect(weak.amount).toBeNull();
    expect(weak.direction).toContain("구조개선");
    expect(weak.action).toContain("유료결제보다 보완");
  });
  it("UAT-002/009 MyData 거부·부분성공·미계약 시 성공값 보존 및 누락만 fallback", () => {
    expect(collectionRoute(false, true, "success").steps).toEqual(["Upload", "Manual"]);
    expect(collectionRoute(true, false, "success").mode).toBe("MANUAL_FALLBACK");
    expect(collectionRoute(true, true, "partial", false).steps).not.toContain("API");
    expect(collectionRoute(true, true, "failed", true).preserveCollected).toBe(true);
  });
  it("UAT-013/014 금액은 자료·정책 검증 이후, L3 발행은 실제 검수 이후", () => {
    expect(reportReadiness("L1", true, true, true).showAmount).toBe(false);
    expect(reportReadiness("L2", false, true, true).showAmount).toBe(false);
    expect(reportReadiness("L2", true, false, true).showAmount).toBe(false);
    expect(reportReadiness("L3", true, true, false).status).toBe("EXPERT_REVIEW_PENDING");
  });
});
