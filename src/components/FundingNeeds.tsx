"use client";
import { useState } from "react";
import { calculateFundingNeeds, FundingNeeds as Values } from "../engines/funding-needs";

const fields: { key: keyof Values; label: string }[] = [
  { key: "facility", label: "시설·설비 투자" }, { key: "working", label: "추가 운전자본" },
  { key: "development", label: "개발·연구 투자" }, { key: "operating", label: "경상비용 증가" },
  { key: "debt", label: "기존 채무 만기 대응" }, { key: "duplicate", label: "위 금액에 중복 포함된 금액" },
  { key: "internal", label: "내부에서 창출할 자금" }, { key: "investment", label: "확정 투자·지원금" },
  { key: "own", label: "사용 가능한 자체자금" },
];

export function FundingNeeds() {
  const [values, setValues] = useState<Partial<Record<keyof Values, string>>>({});
  const [result, setResult] = useState<ReturnType<typeof calculateFundingNeeds> | null>(null);
  const [error, setError] = useState("");
  const [business, setBusiness] = useState("");
  const [stage, setStage] = useState("");
  const [evidence, setEvidence] = useState("");
  const [risk, setRisk] = useState("");
  const advanced = business === "technology" || business === "facility";
  const money = (amount: number) => `${amount.toLocaleString("ko-KR")}만원`;
  function calculate() {
    if (fields.some(({ key }) => values[key] === undefined || values[key] === "")) { setError("모든 항목을 입력해 주세요. 해당 금액이 없으면 0을 입력해 주세요."); setResult(null); return; }
    try {
      const input = Object.fromEntries(fields.map(({ key }) => [key, Number(values[key])])) as Values;
      setResult(calculateFundingNeeds(input)); setError("");
    } catch (e) { setResult(null); setError(e instanceof Error ? e.message : "입력값을 확인해 주세요."); }
  }
  return <details className="document-tools funding-needs">
    <summary>선택 진단 · 앞으로 3년의 자금수요 살펴보기</summary>
    <div className="document-tool-body">
      <p>향후 3년 전체 계획을 만원 단위로 입력해 주세요. 같은 비용이 두 항목에 들어갔다면 중복 금액을 빼고 계산합니다. 입력값은 현재 화면에서만 사용됩니다.</p>
      <div className="funding-needs-grid"><label>기업 또는 자금 계획<select value={business} onChange={e => { setBusiness(e.target.value); setStage(""); setEvidence(""); }}><option value="">선택해 주세요</option><option value="general">일반 기업·소상공인</option><option value="technology">기술·제조·벤처·R&amp;D</option><option value="facility">대규모 시설투자·투자유치</option></select></label>
      {advanced && <><label>사업화 단계<select value={stage} onChange={e => setStage(e.target.value)}><option value="">선택해 주세요</option><option>아이디어·개발</option><option>시제품</option><option>제품화·양산 준비</option><option>매출 발생</option></select></label><label>계획을 확인할 근거<select value={evidence} onChange={e => setEvidence(e.target.value)}><option value="">선택해 주세요</option><option value="available">견적·계약 등 확인할 자료가 있음</option><option value="missing">자료 준비 또는 확인이 필요함</option></select></label></>}
      <label>전문가 검토가 필요한 상황<select value={risk} onChange={e => setRisk(e.target.value)}><option value="">선택해 주세요</option><option value="yes">거절 이력·체납·재무 어려움·복합 조달이 있음</option><option value="unknown">확인이 필요함</option><option value="no">현재 해당 사항 없음</option></select></label></div>
      <div className="funding-needs-grid">{fields.map(({ key, label }) => <label key={key}>{label}<input type="number" min="0" step="1" inputMode="numeric" placeholder="만원" value={values[key] ?? ""} onChange={e => { setValues({ ...values, [key]: e.target.value }); setResult(null); setError(""); }} /></label>)}</div>
      <button className="text-link" type="button" onClick={calculate}>자금수요 계산하기 →</button>
      {error && <p role="alert">{error}</p>}
      {result && <div className="funding-needs-result" aria-live="polite"><strong>입력값 기준 개략 계산</strong><p>총 자금수요 {money(result.total)} · 내부·확정 자금 {money(result.available)}</p><p>외부조달 필요액 <strong>{money(result.external)}</strong>{result.surplus > 0 && ` · 수요 대비 잔여 ${money(result.surplus)}`}</p><p>계산 근거: 시설·운전자본·개발·경상비 증가·만기 대응을 합산하고 중복 금액과 내부 자금을 차감했습니다.</p>{advanced && <p>심화 확인: {stage || "사업화 단계 미선택"} · {evidence === "available" ? "확인할 자료가 있다고 입력함" : "근거자료 확인 필요"}. 입력 내용과 실제 증빙을 대조해야 합니다.</p>}<p>{risk === "yes" ? "전문가 검토 필요: 입력하신 위험 상황의 세부 내용과 증빙을 확인해야 합니다." : risk === "no" ? "전문가 검토 사항 없음으로 입력하셨습니다. 증빙과 공고 확인은 별도로 필요합니다." : "전문가 검토 필요 여부를 확인해 주세요."} 현재 전문가 연결 기능은 준비 중입니다.</p><p>자료 출처: 고객 직접 입력 · 증빙 미확인. 실제 승인액이나 대출 가능 한도가 아닙니다. 예상 현금흐름과 기존 원리금, 중복 여부를 확인해 주세요.</p></div>}
    </div>
  </details>;
}
