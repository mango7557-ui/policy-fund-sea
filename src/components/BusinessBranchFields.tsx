"use client";
import { BranchAnswers, fieldsFor } from "../engines/business-branches";
export function BusinessBranchFields({ answers, onChange }: { answers: BranchAnswers; onChange: (next: BranchAnswers) => void }) {
  return <details className="document-tools"><summary>기업 유형별 진단 · 창업·구조개선·농어업</summary>
    <div className="document-tool-body"><p>기업 유형과 현재 상황을 알려주세요. 선택하면 상담의 진단 방향에 즉시 반영합니다.</p>
      <div className="funding-needs-grid">{fieldsFor(answers).map(f => <label key={f.key}>{f.label}
        <select value={answers[f.key] || ""} onChange={e => {
          const next = { ...answers, [f.key]: e.target.value };
          if (f.key === "businessType") {
            const permitted = new Set(fieldsFor(next).map(field => field.key));
            for (const key of Object.keys(next)) if (!permitted.has(key)) delete next[key];
          }
          onChange(next);
        }}><option value="">선택해 주세요</option>{f.options.map(value => <option key={value}>{value}</option>)}</select>
      </label>)}</div>
    </div></details>;
}
