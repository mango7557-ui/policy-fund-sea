import { describe, expect, it } from "vitest";
import { consultationWording, interviewReply, conversationReply, QUESTION_BANK, POLICY_REFERENCES, PREFERENCE_REFERENCES, DIAGNOSIS_QUESTIONS, Answers, answerQuestion, nextQuestion, freeDiagnosis, searchQuestions, referenceReply, collectionRoute, reportReadiness, extractAnswersFromText, ensureEndsWithFollowUpQuestion } from "../engines/document-advisor";
import manifest from "../data/master/manifest.json";
import samples from "../data/master/sample-cases.json";

const complete: Answers = { purpose: "working", entity: "sole", operation: "active", tax: "none", overdue: "none", credit: "none", industry: "eligible", ceo: "yes", related: "none", finance: "normal", documents: "ready" };
describe("문서 기반 UAT 회귀검증", () => {
  it("서류 질문에 먼저 답하고 질문 속 조건을 고객 사실로 저장하지 않는다", () => {
    const reply = referenceReply("정책자금 신청 서류는 무엇을 준비하나요?");
    expect(reply.text).toContain("사업자등록증");
    expect(reply.text).not.toContain("어떤 자금이 제일 절실");
    expect(extractAnswersFromText({}, "법인도 설비자금 신청이 가능한가요?")).toEqual({});
    expect(extractAnswersFromText({}, "법인이고 기계를 구입하려고 해요")).toMatchObject({ entity: "corporation", purpose: "facility" });
    expect(ensureEndsWithFollowUpQuestion("기관별 공고를 확인해 주세요.")).toBe("기관별 공고를 확인해 주세요.");
  });
  it("서류에 관한 후속 질문을 앞선 대화와 연결한다", () => {
    const history: { role: "user" | "assistant"; text: string }[] = [
      { role: "user", text: "정책자금 신청 서류가 뭐예요?" },
      { role: "assistant", text: "사업자등록증과 납세증명서 등이 필요할 수 있어요." },
    ];
    expect(referenceReply("어디서 발급받나요?", {}, history).text).toContain("홈택스");
    expect(referenceReply("어디서 발급받나요?").text).not.toContain("홈택스");
  });
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

it("acknowledges the sole proprietor and follows the stated expense on the next turn", () => {
  const first = "개인 사업자인데 자금이 필요해?";
  expect(referenceReply(first).text).toMatch(/^개인사업.*자금을 어디에/);
  const next = referenceReply("월세가 급해요", extractAnswersFromText({}, first));
  expect(next.text).toMatch(/^월세.*사업장을 운영/);
});

it("follows a correction, a contextual date, and a natural closing", () => {
  const fixed = extractAnswersFromText({purpose: "facility"}, "기계 말고 월세요");
  expect(fixed.purpose).toBe("working");
  expect(conversationReply("기계 말고 월세요", fixed, [])).toContain("바로잡았어요");
  const history = [{role: "assistant" as const, text: "월세는 언제까지 필요하세요?"}];
  expect(conversationReply("다음 주 금요일이요", fixed, history)).toContain("다음 주 금요일까지");
  expect(conversationReply("고마워요", fixed, history)).not.toContain("?");
  expect(extractAnswersFromText({ purpose: "working", entity: "sole", operation: "active" }, "네", "설명이 더 필요하세요?").tax).toBeUndefined();
});

it("leads a consultation through each outstanding question and ends with an actionable result", () => {
  let answers: Answers = {};
  const seen = new Set();
  while (nextQuestion(answers)) {
    const q = nextQuestion(answers)!;
    expect(seen.has(q.key)).toBe(false);
    seen.add(q.key);
    expect(interviewReply(answers)).toBeTruthy();
    answers = answerQuestion(answers, q.key, q.key === "tax" ? "active" : q.choices[0].value);
  }
  expect(seen.size).toBe(11);
  expect(interviewReply(answers)).toContain("제한요인");
  expect(interviewReply(answers)).toContain("보고서");
  const first = interviewReply({});
  expect(extractAnswersFromText({}, "잘 모르겠어요", first).purpose).toBe("unknown");
});

it("understands a short business-form reply and advances without inferring an entity from personal expenses", () => {
  const previous = {purpose: "working"};
  const prompt = interviewReply(previous);
  for (const answer of ["개인", "개인이요", "개인입니다"]) {
    const updated = extractAnswersFromText(previous, answer, prompt);
    expect(updated.entity).toBe("sole");
    expect(nextQuestion(updated)?.key).toBe("operation");
    const operating = extractAnswersFromText(updated, "응", interviewReply(updated, previous));
    expect(nextQuestion(operating)?.key).toBe("tax");
    expect(interviewReply(updated, previous)).not.toContain("아니면 법인");
  }
  expect(extractAnswersFromText(previous, "개인 대출", prompt).entity).toBeUndefined();
});

it("handles the one-word operating expense reply and asks one matching question per turn", () => {
  const first = interviewReply({});
  const working = extractAnswersFromText({}, "운영", "안녕하세요! " + first);
  expect(working).toEqual({purpose:"working"});
  const second = interviewReply(working, {});
  expect(second).toBe("운영비가 필요하시군요. 개인사업자세요, 법인사업자세요?");
  expect(extractAnswersFromText(working, "개인", second).entity).toBe("sole");
  for (const q of DIAGNOSIS_QUESTIONS) expect(q.text.match(/\?/g)).toHaveLength(1);
});

it("uses 자금 in replies and leaves the user's terminology and unrelated words intact", () => {
  expect(consultationWording("돈을 어디에 쓰실까요? 돈이 필요하면 정돈된 돈가스 가게도 살펴봐요.")).toBe("자금을 어디에 쓰실까요? 자금이 필요하면 정돈된 돈가스 가게도 살펴봐요.");
  expect(referenceReply("개인사업자인데 돈이 필요해?").text).toContain("자금을 어디에");
});
it("holds recommendations for nonprofit and audit review while preserving exempt business guidance", () => {
  const reviewed = freeDiagnosis({profile:{form:"사단법인",vat:"면세"}});
  expect(reviewed.branch?.hold).toBe(true);
  expect(reviewed.reasons.join(" ")).toContain("면세 매출");
  expect(freeDiagnosis({profile:{form:"영리법인",audit:"예",auditReport:"예",opinion:"의견거절"}}).branch?.routes).toEqual([]);
  expect(freeDiagnosis({profile:{form:"영어조합법인"}}).branch?.routes.join(" ")).toContain("수산");
});

it("clarifies a payment type before recording arrears", () => {
  const answers = { purpose: "working", entity: "sole", operation: "active", tax: "none" };
  const asked = interviewReply(answers);
  const clarify = conversationReply("카드", answers, [{role:"assistant", text:asked}])!;
  expect(clarify).toContain("카드 결제일");
  expect(extractAnswersFromText(answers, "카드", asked)).toEqual(answers);
  expect(extractAnswersFromText(answers, "네", clarify).overdue).toBe("active");
  expect(extractAnswersFromText(answers, "아니요", clarify).overdue).toBe("none");
  const reminder = conversationReply("카드", answers, [{role:"assistant", text:clarify}])!;
  expect(reminder).not.toContain(clarify);
  expect(extractAnswersFromText(answers, "건너뛸게요", reminder).overdue).toBe("unknown");
});
