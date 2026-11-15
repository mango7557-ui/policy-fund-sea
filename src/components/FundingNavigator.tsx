"use client";
import { useState } from "react";
import { ArrowUpRight, Factory, Package, Store, Check } from "lucide-react";

const routes = [
  { id: "operation", icon: Package, title: "매달 필요한 운영자금", subtitle: "원재료 · 인건비 · 임차료", heading: "사업이 멈추지 않도록, 운영에 여유를.", description: "매출이 들어오는 시기와 지출 시기가 다를 수 있어요. 자금 용도와 기존 대출부터 살펴보고 검토할 경로를 정리합니다.", checks: ["어디에 사용할 자금인지", "최근 매출과 기존 대출", "사업장 소재지와 업종"], prompt: "원재료비와 인건비에 사용할 운전자금이 필요해요. 무엇부터 확인하면 될까요?" },
  { id: "facility", icon: Factory, title: "다음 성장을 위한 투자", subtitle: "설비 · 기계 · 사업장 확장", heading: "커지는 사업에 맞는, 다음 투자 계획.", description: "새 기계를 들이거나 공간을 넓힐 계획이 있나요? 투자 일정과 견적, 기업의 준비 상황을 함께 보며 시설자금 방향을 찾아봅니다.", checks: ["구입할 설비와 예상 견적", "투자 일정과 자기자금", "공장·사업장 관련 준비"], prompt: "기계를 구입하고 사업장을 확장하려고 해요. 시설자금을 어떻게 준비하면 좋을까요?" },
  { id: "start", icon: Store, title: "이제 막 시작한 사업", subtitle: "창업 초기 · 첫 정책자금", heading: "처음이라면, 기본부터 천천히.", description: "아직 실적이 충분하지 않아도 먼저 확인할 수 있는 조건이 있어요. 사업을 시작한 시점과 업종, 필요한 자금부터 알려주세요.", checks: ["사업자등록 시점과 업종", "대표자·기업의 신청 요건", "자금 사용 계획과 준비 자료"], prompt: "창업 초기인데 처음으로 정책자금을 알아보고 있어요. 신청 조건부터 알려주세요." },
];

export function FundingNavigator({ onStart }: { onStart: (prompt: string) => void }) {
  const [selected, setSelected] = useState(0);
  const route = routes[selected];
  return <section className="funding-navigator section-shell" aria-labelledby="funding-heading">
    <div className="funding-intro"><span className="section-caption">필요한 자금부터</span><h2 id="funding-heading">지금, 어떤 계획을<br />앞두고 계신가요?</h2><p>자금의 목적에 따라<br />살펴볼 조건도 달라집니다.</p></div>
    <div className="funding-options" role="tablist" aria-label="자금 목적" aria-orientation="vertical">{routes.map((r, i) => <button key={r.id} id={`funding-tab-${r.id}`} type="button" role="tab" aria-selected={selected === i} aria-controls="funding-detail" tabIndex={selected === i ? 0 : -1} onClick={() => setSelected(i)} onKeyDown={e => { const next = e.key === "ArrowDown" ? (i + 1) % routes.length : e.key === "ArrowUp" ? (i + routes.length - 1) % routes.length : e.key === "Home" ? 0 : e.key === "End" ? routes.length - 1 : -1; if (next >= 0) { e.preventDefault(); setSelected(next); document.getElementById(`funding-tab-${routes[next].id}`)?.focus(); } }}><r.icon size={21} aria-hidden="true" /><span><strong>{r.title}</strong><small>{r.subtitle}</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}</div>
    <div className="funding-detail" id="funding-detail" role="tabpanel" aria-labelledby={`funding-tab-${route.id}`} tabIndex={0}><span className="funding-detail-label">함께 확인할 이야기</span><h3>{route.heading}</h3><p>{route.description}</p><ul>{route.checks.map(c => <li key={c}><Check size={14} aria-hidden="true" />{c}</li>)}</ul><button type="button" onClick={() => onStart(route.prompt)}>이 내용으로 상담 시작 <ArrowUpRight size={16} aria-hidden="true" /></button></div>
  </section>;
}
