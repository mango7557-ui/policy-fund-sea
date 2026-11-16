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
      <div className="funding-needs-grid">{fields.map(({ key, label }) => <label key={key}>{label}<input type="number" min="0" step="1" inputMode="numeric" placeholder="만원" value={values[key] ?? ""} onChange={e => { setValues({ ...values, [key]: e.target.value }); setResult(null); setError(""); }} /></label>)}</div>
      <button className="text-link" type="button" onClick={calculate}>자금수요 계산하기 →</button>
      {error && <p role="alert">{error}</p>}
      {result && <div className="funding-needs-result" aria-live="polite"><strong>입력값 기준 개략 계산</strong><p>총 자금수요 {money(result.total)} · 내부·확정 자금 {money(result.available)}</p><p>외부조달 필요액 <strong>{money(result.external)}</strong>{result.surplus > 0 && ` · 수요 대비 잔여 ${money(result.surplus)}`}</p><p>자료 출처: 고객 직접 입력 · 증빙 미확인. 실제 승인액이나 대출 가능 한도가 아닙니다. 예상 현금흐름과 기존 원리금, 중복 여부를 확인하고 필요하면 전문가 검토를 받으세요.</p></div>}
    </div>
  </details>;
}
