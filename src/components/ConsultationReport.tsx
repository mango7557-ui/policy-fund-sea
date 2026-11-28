"use client";
import { MemberReports } from "./MemberReports";
import { useEffect, useRef, useState } from "react";
import { Answers } from "../engines/document-advisor";
import { createConsultationReport, ConsultationReport as Report, ReportMessage, reportText } from "../engines/consultation-report";
import { fieldsFor } from "../engines/business-branches";

export function ConsultationReport({ answers, messages, busy, onRecheck }: { answers: Answers; messages: ReportMessage[]; busy: boolean; onRecheck: (report: Report) => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (report) dialog.current?.showModal(); }, [report]);
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([reportText(report)], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "바른자금-상담보고서-" + report.createdAt.slice(0, 10) + ".txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <button className="save-button" type="button" disabled={busy || !messages.some(m => m.role === "user")} onClick={() => setReport(createConsultationReport(answers, messages))}>
      상담 보고서 자동 생성
    </button>
    <MemberReports report={report} onOpen={setReport} />
    <dialog className="consultation-report-dialog" ref={dialog} onClose={() => setReport(null)} aria-labelledby="consultation-report-title">
      {report && <>
        <MemberReports report={report} onOpen={setReport} /><div className="report-actions"><button type="button" disabled={busy} onClick={() => { if (window.confirm("지금 열린 상담을 마치고 이 보고서의 기업·사업장 정보로 새 진단을 시작할까요?")) { dialog.current?.close(); onRecheck(report); } }}>이 기업 다시 진단</button><button type="button" onClick={() => window.print()}>인쇄 · PDF 저장</button><button type="button" onClick={download}>보고서 내려받기</button><button type="button" onClick={() => dialog.current?.close()}>닫기</button></div>
        <article>
          <p>바른자금 · 사전 상담 보고서</p>
          <h2 id="consultation-report-title">{report.title}</h2>
          <p>{new Date(report.createdAt).toLocaleString("ko-KR")}</p>
          <p>{report.disclaimer}</p>
          <h3>진단 요약</h3><strong>{report.diagnosis.status}</strong><p>{report.diagnosis.direction}</p>
          <h3>판단 근거</h3><ul>{report.diagnosis.reasons.map(r => <li key={r}>{r}</li>)}</ul>
          <h3>확인한 기업정보</h3>
          {report.facts.length ? <dl>{report.facts.map(f => <div key={f.question}><dt>{f.question}</dt><dd>{f.answer}</dd></div>)}</dl> : <p>아직 확인된 기본 진단 항목이 없습니다.</p>}
          {Object.keys(report.branchInputs).length > 0 && <dl>{fieldsFor(report.branchInputs).filter(f => report.branchInputs[f.key]).map(f => <div key={f.key}><dt>{f.label}</dt><dd>{report.branchInputs[f.key]}</dd></div>)}</dl>}
          <h3>추가로 확인할 사항</h3><ul>{[...report.diagnosis.missing, ...(report.diagnosis.branch?.missing || [])].map((r, i) => <li key={i}>{r}</li>)}</ul>
          <h3>다음 행동</h3><p>{report.diagnosis.action}</p>
          {report.fundingPlan&&<section><h3>3년 자금수요 계획</h3><p>총 수요 {report.fundingPlan.result.total.toLocaleString("ko-KR")}만원 · 내부·확정 자금 {report.fundingPlan.result.available.toLocaleString("ko-KR")}만원 · 외부조달 필요액 {report.fundingPlan.result.external.toLocaleString("ko-KR")}만원</p><p>고객의 계획값으로 계산한 수요이며 실제 승인 한도가 아닙니다. 계산일 {report.fundingPlan.calculatedAt.slice(0,10)}</p><p>사업화 단계 · {report.fundingPlan.stage||"미입력"} / 증빙 · {report.fundingPlan.evidence==="available"?"보유한다고 입력함 · 검증 필요":"자료 확인 필요"}</p></section>}
          {report.diagnosis.branch && <><ul>{report.diagnosis.branch.routes.map(r => <li key={r}>{r}</li>)}</ul><p>{report.diagnosis.branch.notice}</p></>}
          <h3>상담 기록</h3>{report.messages.map((m,i) => <section key={i}><strong>{m.role === "user" ? "대표님" : "정책이"} · {m.time}</strong><p>{m.text}</p>{m.source && <small>출처 · {m.source}</small>}</section>)}
          <p>자료 기준 · {report.diagnosis.referenceDate} / {report.diagnosis.source}</p>
          {report.trace&&<p>진단 규칙 · {report.trace.rulesVersion} / {report.trace.evidenceStatus} / 생성 당시 검토 · {report.trace.expertStatus}. 이후 검토 결과는 회원 보관함에서 별도로 확인합니다.</p>}
        </article>
      </>}
    </dialog>
  </>;
}
