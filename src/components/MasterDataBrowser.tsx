"use client";
import { useMemo, useState } from "react";
import manifest from "../data/master/manifest.json";
import questions from "../data/master/questions.json";
import rules from "../data/master/rules.json";
import platform from "../data/master/platform.json";
import uat from "../data/master/uat.json";
import collection from "../data/master/collection.json";
import samples from "../data/master/sample-five.json";
import tiers from "../data/master/sample-tiers.json";
import type { TrainingEntry } from "../engines/training";

const data: Record<string, unknown> = { questions, rules, platform, uat, collection, "sample-five": samples, "sample-tiers": tiers };
type Item = { group: string; index: number; text: string };
function entries(value: unknown): Item[] {
  const groups = Array.isArray(value) ? [["본문", value] as const] : Object.entries(value as Record<string, unknown>);
  return groups.flatMap(([group, records]) => (Array.isArray(records) ? records : [records]).map((record, index) => ({ group, index, text: typeof record === "string" ? record : JSON.stringify(record, null, 2) })));
}
export function MasterDataBrowser({ onDraft }: { onDraft: (entry: TrainingEntry) => void }) {
  const [source, setSource] = useState(manifest[0].id);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const records = useMemo(() => entries(data[source]), [source]);
  const matches = useMemo(() => records.filter(r => r.text.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())), [records, query]);
  const selected = manifest.find(item => item.id === source)!;
  const pages = Math.max(1, Math.ceil(matches.length / 20));
  return <section className="admin-panel"><div className="admin-panel-heading"><div><h2>기존 자료 찾아보기</h2><p>기존에 가져온 7개 원본의 추출 데이터를 검색합니다. 원본은 수정되지 않습니다.</p></div></div>
    <div className="admin-toolbar"><label>자료 선택 <select value={source} onChange={e => { setSource(e.target.value); setPage(0); setExpanded(null); }}>{manifest.map(m => <option key={m.id} value={m.id}>{m.file}</option>)}</select></label><label className="admin-search"><input aria-label="원본 자료 검색" placeholder="자료 내용 검색" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label></div>
    <p>기준일 {selected.referenceDate} · {matches.length.toLocaleString()}건 · 추출 데이터는 증빙 검수 전입니다.</p>
    <div className="master-data-list">{matches.slice(page * 20, page * 20 + 20).map(item => { const key = `${item.group}-${item.index}`; return <article key={key}><button type="button" className="admin-text-button" aria-expanded={expanded === key} onClick={() => setExpanded(expanded === key ? null : key)}>{item.group} · {item.index + 1}번 {expanded === key ? "접기" : "보기"}</button>{expanded === key && <><pre>{item.text}</pre><button type="button" className="admin-secondary" onClick={() => onDraft({ id: crypto.randomUUID(), title: `${selected.file} · ${item.group} ${item.index + 1}`, content: item.text.slice(0, 6000), keywords: "", category: "정책자금", status: "draft", source: selected.file, updatedAt: new Date().toISOString() })}>이 내용을 학습 초안으로 복사</button>{item.text.length > 6000 && <p>초안에는 앞 6,000자만 복사됩니다. 전체 내용은 위에서 확인하세요.</p>}</>}</article>; })}</div>
    {!matches.length && <p>검색 결과가 없습니다.</p>}<div className="admin-table-footer"><button className="admin-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</button><span>{page + 1} / {pages}</span><button className="admin-secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>다음</button></div>
    <p>추출 자료는 자동으로 상담에 게시되지 않습니다. 초안으로 복사해 검토한 뒤 게시할 수 있습니다. 복사한 초안을 수정해도 원본이나 진단 규칙은 바뀌지 않습니다.</p>
  </section>;
}
