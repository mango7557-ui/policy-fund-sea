"use client";
import { useState } from "react";
import { QUESTION_BANK, DOCUMENT_VERSION } from "../engines/document-advisor";
import samples from "../data/master/sample-cases.json";

export function QuestionLibrary({ onAsk }: { onAsk: (text: string) => void }) {
  const [query, setQuery] = useState("");
  const filtered = QUESTION_BANK.filter(q => `${q.question} ${q.category}`.includes(query));
  return <details className="document-tools"><summary>질문 찾아보기 · 대표질문 100개</summary><div className="document-tool-body"><label>궁금한 내용 검색<input value={query} onChange={e => setQuery(e.target.value)} placeholder="예: 여성기업, 대환, 수출"/></label><p>제공 문서 {DOCUMENT_VERSION} 기준 · 질문 표현 1,000개를 대표질문으로 연결합니다.</p><div className="question-results">{filtered.map(q => <button key={q.id} onClick={() => onAsk(q.question)}><span>{q.category}</span>{q.question}</button>)}{!filtered.length && <p>일치하는 질문이 없어요. 채팅창에 직접 질문해 주세요.</p>}</div></div></details>;
}

export function ReportSamples() {
  const [index, setIndex] = useState(0);
  const [tier, setTier] = useState("무료 결과");
  const sample = samples[index];
  const heading = sample.sections.findIndex(block => typeof block === "string" && block.includes(`— ${tier}`));
  const next = sample.sections.findIndex((block, i) => i > heading && typeof block === "string" && block.includes("—"));
  const selected = heading >= 0 ? sample.sections.slice(heading + 1, next < 0 ? undefined : next) : [];
  return <details className="document-tools sample-library"><summary>결과가 궁금하신가요? · 문서 기반 예시 리포트 5선</summary><div className="document-tool-body"><p><strong>가상 사례 · UI 검수용</strong> — 아래 숫자와 전문가 검수 문구는 원문 샘플이며 실제 고객 진단·승인·전문가 검수 완료를 의미하지 않습니다.</p><div className="sample-controls"><label>사례<select value={index} onChange={e => setIndex(Number(e.target.value))}>{samples.map((s, i) => <option key={s.id} value={i}>{s.title.replace(/^.*?GT2-/, "GT2-")}</option>)}</select></label><label>리포트 등급<select value={tier} onChange={e => setTier(e.target.value)}><option>무료 결과</option><option>19,000원 결과</option><option>59,000원 결과</option></select></label></div><div className="sample-content">{selected.map((block, i) => <div key={i}>{typeof block === "string" ? block : block.map((row, j) => <p key={j}>{row.join(" · ").split("•").map((line, k) => <span key={k}>{k > 0 ? "• " : ""}{line}<br/></span>)}</p>)}</div>)}</div><small>출처: 가격대별 테스트 샘플5선 _2026-11-01.docx · GT2-{sample.id}</small></div></details>;
}
