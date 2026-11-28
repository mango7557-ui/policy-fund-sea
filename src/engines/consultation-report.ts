import { profileFields, CompanyProfile } from "./company-profile";
import { fieldsFor } from "./business-branches";
import { calculateFundingNeeds } from "./funding-needs";
import { Answers, DIAGNOSIS_QUESTIONS, freeDiagnosis } from "./document-advisor";

export type ReportMessage = { role: "user" | "assistant"; text: string; time: string; source?: string };
export type ConsultationReport = ReturnType<typeof createConsultationReport>;
function reportId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20)].join("-");
}
export function createConsultationReport(answers: Answers, messages: ReportMessage[]) {
  const diagnosis = freeDiagnosis(answers);
  const facts = DIAGNOSIS_QUESTIONS.filter(q => answers[q.key]).map(q => ({
    question: q.text,
    answer: q.choices.find(c => c.value === answers[q.key])?.label || "추가 확인 필요",
  }));
  return {
    id: reportId(),
    createdAt: new Date().toISOString(),
    title: "기업 자금조달 사전 상담 보고서",
    profile: answers.profile ? {...answers.profile} : undefined as CompanyProfile | undefined,
    facts: [...facts, ...profileFields(answers.profile || {}).filter(f => answers.profile?.[f.key]).map(f => ({question:f.label, answer:answers.profile![f.key]!}))],
    branchInputs: { ...answers.branch },
    fundingPlan: answers.fundingPlan ? { ...answers.fundingPlan,values:{...answers.fundingPlan.values},result:calculateFundingNeeds(answers.fundingPlan.values) } : undefined,
    trace: { rulesVersion:"bareun-fdss-2026-11-29", sourceDate:diagnosis.referenceDate, evidenceStatus:"고객 입력 · 증빙 미검증", modelSources:[...new Set(messages.filter(m=>m.role==="assistant"&&m.source).map(m=>m.source!))], expertStatus:"미검토" },
    diagnosis,
    messages: messages.map(({ role, text, time, source }) => ({ role, text, time, source })),
    disclaimer: "사용자 입력과 상담 시점의 내부 진단 규칙에 따른 사전 안내입니다. 증빙·공식 공고·전문가 검토를 거치지 않았으며 승인 여부나 조달금액을 확정하지 않습니다.",
  };
}
export function reportText(report: ConsultationReport) {
  const d = report.diagnosis;
  return [
    report.title, new Date(report.createdAt).toLocaleString("ko-KR"), report.disclaimer,
    "진단 요약", d.status, d.direction, "판단 근거", ...d.reasons,
    "확인한 정보", ...report.facts.map(f => f.question + "\n" + f.answer),
    "기업 유형별 입력", ...fieldsFor(report.branchInputs).filter(f => report.branchInputs[f.key]).map(f => f.label + " · " + report.branchInputs[f.key]),
    "추가 확인", ...d.missing, ...(d.branch?.missing || []),
    ...(report.fundingPlan ? ["3년 자금수요 · 고객 계획 기준",JSON.stringify(report.fundingPlan,null,2),"외부조달 필요액은 승인 한도가 아닙니다."] : []),
    "다음 행동", d.action, ...(d.branch ? [d.branch.reason, ...d.branch.routes, d.branch.notice] : []),
    "상담 기록", ...report.messages.map(m => (m.role === "user" ? "대표님" : "정책이") + " · " + m.text + (m.source ? "\n출처 · " + m.source : "")),
  ].join("\n\n");
}
