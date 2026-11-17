"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, BookOpen, Check, CircleHelp, FileText, FlaskConical, LayoutDashboard, Plus, Search, Settings2, Trash2, Upload, Waves, X } from "lucide-react";
import { CATEGORIES, EMPTY_TRAINING, matchTraining, parseTrainingStore, readLocalTraining, saveLocalTraining, TrainingEntry, TrainingStore } from "../engines/training";
import { INITIAL_EVOLUTION_STATE, JeongchaegiEvolutionState } from "../engines/self-learning";
import { ThemeToggle } from "./ThemeToggle";
import { MasterDataBrowser } from "./MasterDataBrowser";
import { ServerDocuments } from "./ServerDocuments";

type Tab = "knowledge" | "sources" | "memory" | "test" | "settings";
const tabs: { id: Tab; name: string; icon: typeof BookOpen; detail: string }[] = [
  { id: "knowledge", name: "학습 지식", icon: BookOpen, detail: "정책이가 참고하는 답변의 기준을 정리합니다." },
  { id: "sources", name: "원본 자료", icon: FileText, detail: "기존에 가져온 자료를 검색하고 학습 초안을 만듭니다." },
  { id: "memory", name: "상담 기억", icon: LayoutDashboard, detail: "이 브라우저에 저장된 상담 맥락과 피드백을 살펴봅니다." },
  { id: "test", name: "답변 테스트", icon: FlaskConical, detail: "등록한 지식이 어떤 질문에 연결되는지 확인합니다." },
  { id: "settings", name: "연결·백업", icon: Settings2, detail: "서버 연결과 학습 데이터 백업을 관리합니다." },
];
const newEntry = (): TrainingEntry => ({ id: crypto.randomUUID(), title: "", content: "", keywords: "", category: "정책자금", status: "draft", source: "", updatedAt: new Date().toISOString() });
const formatDate = (v: string) => new Date(v).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });

export default function LearningAdmin() {
  const [tab, setTab] = useState<Tab>("knowledge");
  const [store, setStore] = useState<TrainingStore>(EMPTY_TRAINING);
  const [memory, setMemory] = useState<JeongchaegiEvolutionState>(INITIAL_EVOLUTION_STATE);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<TrainingEntry | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [server, setServer] = useState(false);
  const [token, setToken] = useState("");
  const [testQuery, setTestQuery] = useState("");
  const [testResult, setTestResult] = useState<{ matches: TrainingEntry[]; text: string; source: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [imported, setImported] = useState<TrainingStore | null>(null);
  const [deleting, setDeleting] = useState<TrainingEntry | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLDialogElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
  const current = tabs.find(t => t.id === tab)!;
  const homeHref = typeof window !== "undefined" && /\.html$/.test(window.location.pathname) ? `${window.location.pathname}#diagnosis` : "./#diagnosis";

  useEffect(() => {
    try {
      setStore(readLocalTraining());
      const raw = localStorage.getItem("bareunfund-evolution-state") ?? localStorage.getItem("fundsea-evolution-state");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.learnedFacts) && typeof parsed.preferredTone === "string") setMemory(parsed);
      }
    } catch { setError("저장된 데이터 형식을 확인하지 못했습니다. 연결·백업에서 유효한 백업 파일을 가져와 주세요."); }
  }, []);

  useEffect(() => {
    if (editing) editor.current?.showModal(); else editor.current?.close();
  }, [Boolean(editing)]);
  useEffect(() => {
    if (imported || deleting) confirmation.current?.showModal(); else confirmation.current?.close();
  }, [Boolean(imported), Boolean(deleting)]);

  async function persist(entries: TrainingEntry[]) {
    setPending(true); setError(""); setNotice("");
    try {
      let next = parseTrainingStore({ ...store, entries });
      if (server) {
        const res = await fetch("/api/admin/training", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(next), signal: AbortSignal.timeout(12000) });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "서버 저장에 실패했습니다.");
        next = parseTrainingStore(body);
      } else saveLocalTraining(next);
      setStore(next);
      setNotice(server ? "서버에 저장했습니다. 게시된 지식은 다음 상담부터 반영됩니다." : "이 브라우저에 저장했습니다. 게시된 지식은 같은 브라우저의 상담에 반영됩니다.");
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "저장에 실패했습니다."); return false; }
    finally { setPending(false); }
  }

  async function connect() {
    setPending(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/admin/training", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
      if (!(res.headers.get("content-type") || "").includes("application/json")) throw new Error("정적 미리보기에서는 브라우저 저장을 이용해 주세요. 서버 연결은 Next.js 실행 주소에서 가능합니다.");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "서버 연결에 실패했습니다.");
      setStore(parseTrainingStore(body)); setServer(true); setNotice("서버 학습 자료를 불러왔습니다.");
    } catch (e) { setError(e instanceof Error ? e.message : "서버에 연결하지 못했습니다."); }
    finally { setPending(false); }
  }

  async function runTest() {
    if (!testQuery.trim() || testing) return;
    setTesting(true); setError("");
    const matches = matchTraining(store.entries, testQuery);
    const localResult = { matches, text: matches.length ? matches.map(m => m.content).join("\n\n") : "연결된 학습 지식이 없습니다. 질문에 쓰이는 표현을 검색 키워드로 등록해 보세요.", source: "지식 검색 테스트 · 생성형 답변 아님" };
    setTestResult(localResult);
    try {
      if (server) {
        const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: testQuery, history: [], answers: {}, evolutionState: INITIAL_EVOLUTION_STATE }), signal: AbortSignal.timeout(60000) });
        if (!res.ok) throw new Error("AI 답변을 가져오지 못했습니다. 지식 검색 결과를 표시합니다.");
        const body = await res.json();
        if (typeof body.text !== "string") throw new Error("답변 형식을 확인하지 못했습니다.");
        setTestResult({ matches, text: body.text, source: body.source || "상담 API" });
      }
    } catch (e) { setError(e instanceof Error ? e.message : "AI 연결이 지연되어 지식 검색 결과를 표시합니다."); }
    finally { setTesting(false); }
  }

  const published = store.entries.filter(e => e.status === "published").length;
  const visible = store.entries.filter(e => (status === "all" || e.status === status) && (category === "all" || e.category === category) && `${e.title} ${e.content} ${e.keywords}`.toLowerCase().includes(query.toLowerCase()));
  const exportData = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(store, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `바른 자금-학습백업-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("학습 백업 파일을 내려받았습니다.");
  };

  return <div className="admin-app">
    <a className="skip-link" href="#admin-content">본문으로 바로가기</a>
    <aside className="admin-sidebar">
      <a href={homeHref} className="sea-brand"><span className="brand-mark"><Waves size={22} /></span><span>바른 자금<small>BAREUN FUND STUDIO</small></span></a>
      <div className="admin-workspace"><span className="studio-monogram">정</span><div><strong>정책이 학습실</strong><small>상담을 더 나답게 만드는 곳</small></div></div>
      <span className="admin-nav-label">학습 관리</span>
      <nav aria-label="학습 관리 메뉴">{tabs.map(t => <button key={t.id} onClick={() => { setTab(t.id); setError(""); setNotice(""); }} className={tab === t.id ? "selected" : ""} aria-current={tab === t.id ? "page" : undefined}><t.icon size={17} />{t.name}{t.id === "knowledge" && <span>{store.entries.length}</span>}</button>)}</nav>
      <div className="admin-sidebar-note"><span className="live-dot" /><strong>{server ? "서버 저장소 연결됨" : "브라우저 작업 공간"}</strong><p>{server ? "게시된 지식을 모든 상담에서 활용합니다." : "이 기기에서 학습 내용을 준비하고 테스트할 수 있습니다."}</p></div>
      <a className="admin-back" href={homeHref}><ArrowLeft size={15} /> 상담 화면으로 돌아가기</a>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar"><div>워크스페이스 <span>/</span> <strong>{current.name}</strong></div><div><span className={`storage-badge ${server ? "connected" : ""}`}>{server ? "서버 연결" : "로컬 저장"}</span><ThemeToggle /></div></header>
      <main className="admin-content" id="admin-content" tabIndex={-1}>
        <div className="admin-page-heading"><div><span className="mini-label">정책이 학습실</span><h1>{current.name === "학습 지식" ? "좋은 답변은, 좋은 기준에서." : current.name}</h1><p>{current.detail}</p></div>{tab === "knowledge" && <button className="admin-primary" onClick={() => setEditing(newEntry())}><Plus size={17} /> 지식 등록</button>}</div>
        {error && <div className="admin-notice error" role="alert"><CircleHelp size={16} /><span>{error}</span><button aria-label="오류 닫기" onClick={() => setError("")}><X size={15} /></button></div>}
        {notice && <div className="admin-notice" role="status"><Check size={16} /><span>{notice}</span><button aria-label="알림 닫기" onClick={() => setNotice("")}><X size={15} /></button></div>}
        <div className="admin-stats">
          {[{ label: "등록된 지식", value: store.entries.length, suffix: "개의 기준", icon: BookOpen }, { label: "상담에 반영 중", value: published, suffix: "개 게시됨", icon: Check }, { label: "작성 중", value: store.entries.length - published, suffix: "개의 초안", icon: FileText }, { label: "이 기기의 상담 기억", value: memory.learnedFacts.length, suffix: "개의 맥락", icon: LayoutDashboard }].map(s => <article key={s.label}><div>{s.label}<s.icon size={16} /></div><strong>{String(s.value).padStart(2, "0")}</strong><small>{s.suffix}</small></article>)}
        </div>

        {tab === "knowledge" && <>
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><h2>정책이의 지식 서랍</h2><p>초안은 보관하고, 확인된 내용만 상담에 반영하세요.</p></div><button className="admin-text-button" onClick={exportData}><ArrowDownToLine size={15} /> 내보내기</button></div>
            <div className="admin-toolbar"><label className="admin-search"><Search size={17} /><input aria-label="학습 지식 검색" placeholder="제목, 내용, 키워드 검색" value={query} onChange={e => setQuery(e.target.value)} /></label><select aria-label="게시 상태 필터" value={status} onChange={e => setStatus(e.target.value)}><option value="all">전체 상태</option><option value="published">게시됨</option><option value="draft">초안</option></select><select aria-label="분류 필터" value={category} onChange={e => setCategory(e.target.value)}><option value="all">전체 분류</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
            {visible.length ? <div className="admin-table-scroll"><table className="knowledge-table"><thead><tr><th>지식 / 검색 키워드</th><th>분류</th><th>상태</th><th>수정일</th><th><span className="sr-only">관리</span></th></tr></thead><tbody>{visible.map(e => <tr key={e.id}><td><button className="knowledge-title" onClick={() => setEditing({ ...e })}><span className="document-icon"><FileText size={18} /></span><span><strong>{e.title}</strong><small>{e.keywords || "검색 키워드 미등록"}</small></span></button></td><td>{e.category}</td><td><button className={`status-pill ${e.status}`} disabled={pending} title="클릭하여 게시 상태 변경" onClick={() => persist(store.entries.map(item => item.id === e.id ? { ...item, status: item.status === "published" ? "draft" : "published", updatedAt: new Date().toISOString() } : item))}><i />{e.status === "published" ? "게시됨" : "초안"}</button></td><td>{formatDate(e.updatedAt)}</td><td><button className="admin-icon-button" aria-label={`${e.title} 삭제`} onClick={() => setDeleting(e)}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div> : <div className="admin-empty"><BookOpen size={32} strokeWidth={1.2} /><h3>{store.entries.length ? "조건에 맞는 지식이 없어요." : "정책이에게 첫 번째 기준을 알려주세요."}</h3><p>{store.entries.length ? "검색어나 필터를 바꿔 다시 찾아보세요." : "자주 받는 질문, 서류 안내, 우리만의 상담 원칙부터 시작해 보세요."}</p><button className="admin-secondary" onClick={() => { if (store.entries.length) { setQuery(""); setStatus("all"); setCategory("all"); } else setEditing(newEntry()); }}>{store.entries.length ? "필터 초기화" : "첫 지식 등록하기"}<ArrowUpRight size={15} /></button></div>}
            <div className="admin-table-footer"><span>총 {store.entries.length}건 중 {visible.length}건</span><span>{server ? `서버 버전 ${store.revision}` : "이 브라우저에 저장됩니다"}</span></div>
          </section>
          <section className="admin-guide"><div><span className="mini-label">A SMALL GUIDE</span><h3>잘 가르치는 세 가지 방법</h3></div><article><b>01</b><strong>하나의 주제, 하나의 지식</strong><p>질문과 답변을 구체적으로 적으면 필요한 순간에 찾기 쉽습니다.</p></article><article><b>02</b><strong>출처와 조건을 함께</strong><p>공고 링크, 적용 기간, 예외 조건을 내용에 함께 남겨주세요.</p></article><article><b>03</b><strong>게시 후 질문해 보기</strong><p>답변 테스트에서 실제 질문으로 검색 결과를 확인하세요.</p></article></section>
        </>}

        {tab === "sources" && <><ServerDocuments connected={server} token={token} /><MasterDataBrowser onDraft={entry => setEditing(entry)} /></>}
        {tab === "memory" && <section className="admin-panel"><div className="admin-panel-heading"><div><h2>상담에서 기억한 이야기</h2><p>개인 상담 기억은 공통 학습 지식과 별도로, 이 브라우저에서 관리합니다.</p></div></div><div className="memory-tone"><span>현재 선호 말투</span><strong>{memory.preferredTone}</strong></div><div className="memory-list">{memory.learnedFacts.map(f => <article key={f.id}><span className="document-icon"><MessageIcon category={f.category} /></span><div><small>{{ CEO_CONTEXT: "기업 맥락", TONE_PREF: "말투·지침", CUSTOM_QA: "질문·답변", FEEDBACK: "답변 피드백" }[f.category]}</small><p>{f.summary}</p></div><button className="admin-icon-button" aria-label={`${f.summary} 기억 삭제`} onClick={() => { try { const facts = memory.learnedFacts.filter(item => item.id !== f.id); const next = { ...memory, learnedFacts: facts, preferredTone: f.category === "TONE_PREF" ? INITIAL_EVOLUTION_STATE.preferredTone : memory.preferredTone }; localStorage.setItem("bareunfund-evolution-state", JSON.stringify(next)); setMemory(next); setNotice("상담 기억을 삭제했습니다. 다음 상담부터 반영됩니다."); } catch { setError("브라우저 저장 공간에 접근할 수 없습니다."); } }}><Trash2 size={16} /></button></article>)}{!memory.learnedFacts.length && <div className="admin-empty"><p>저장된 상담 기억이 없습니다.</p></div>}</div></section>}

        {tab === "test" && <div className="admin-test-grid"><section className="admin-panel test-input"><span className="mini-label">PLAYGROUND</span><h2>대표님처럼 질문해 보세요.</h2><p>{server ? "실제 상담 API를 통해 게시된 지식이 반영된 답변을 확인합니다." : "게시된 지식의 검색 결과를 확인합니다. 서버 연결 시 실제 AI 답변도 테스트할 수 있습니다."}</p><form onSubmit={e => { e.preventDefault(); runTest(); }}><label>테스트 질문<textarea value={testQuery} onChange={e => setTestQuery(e.target.value)} placeholder="예: 운전자금 신청에 어떤 서류가 필요한가요?" maxLength={1500} rows={5} required /></label><button className="admin-primary" disabled={testing || !testQuery.trim()}>{testing ? "답변 확인 중…" : "답변 테스트"}<ArrowUpRight size={16} /></button></form><div className="test-note"><CircleHelp size={16} />초안은 검색 및 답변에 반영되지 않습니다.</div></section><section className="admin-panel test-output"><div className="admin-panel-heading"><h2>테스트 결과</h2><FlaskConical size={18} /></div>{testResult ? <div className="test-result" aria-live="polite"><span className="storage-badge">{testResult.source}</span><p>{testResult.text}</p><h3>연결된 학습 지식 · {testResult.matches.length}</h3>{testResult.matches.map(m => <button key={m.id} onClick={() => setEditing({ ...m })}><FileText size={16} />{m.title}<ArrowUpRight size={14} /></button>)}</div> : <div className="admin-empty"><FlaskConical size={32} strokeWidth={1.2} /><h3>질문 하나로 확인하는 학습의 방향</h3><p>왼쪽에 질문을 입력하면 연결되는 지식을 보여드립니다.</p></div>}</section></div>}

        {tab === "settings" && <div className="admin-settings-grid"><section className="admin-panel settings-card"><Settings2 size={23} /><h2>서버 저장소 연결</h2><p>Next.js 서버에서 설정한 관리자 연결 키로 인증합니다. 키는 현재 화면의 메모리에만 유지됩니다.</p><form onSubmit={e => { e.preventDefault(); connect(); }}><label>관리자 연결 키<input type="password" value={token} onChange={e => { setToken(e.target.value); }} placeholder="ADMIN_ACCESS_TOKEN" autoComplete="off" required disabled={server} /></label><button className="admin-primary" disabled={pending || !token.trim()}>{pending ? "연결 중…" : server ? "서버 자료 다시 불러오기" : "인증하고 서버 자료 불러오기"}</button></form>{server && <button className="admin-text-button" onClick={() => { try { setStore(readLocalTraining()); setServer(false); setToken(""); setNotice("브라우저 작업 공간으로 전환했습니다."); } catch { setError("로컬 데이터를 읽을 수 없습니다."); } }}>연결 해제 · 로컬로 전환</button>}<p className="settings-hint">공유용 정적 페이지에서는 로컬 저장을 사용합니다. 서버 공통 지식은 인증된 관리자만 수정할 수 있습니다.</p></section><section className="admin-panel settings-card"><ArrowDownToLine size={23} /><h2>학습 자료 백업</h2><p>JSON 파일로 학습 자료를 내보내거나 다른 작업 공간의 자료를 가져올 수 있습니다.</p><button className="admin-secondary" onClick={exportData}><ArrowDownToLine size={16} /> 현재 자료 내보내기</button><button className="admin-secondary" onClick={() => fileInput.current?.click()}><Upload size={16} /> 백업 파일 가져오기</button><input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { if (file.size > 4_000_000) throw new Error("4MB 이하의 JSON 파일을 선택해 주세요."); setImported(parseTrainingStore(JSON.parse(await file.text()))); } catch (e) { setError(e instanceof Error ? e.message : "파일을 읽을 수 없습니다."); } }} /><p className="settings-hint">가져오기는 현재 지식 목록을 교체합니다. 적용 전 항목 수를 확인할 수 있습니다. 서버로 옮길 때는 로컬 백업 → 서버 연결 → 가져오기 순서로 진행하세요.</p></section><div className="admin-learning-explainer"><BookOpen size={20} /><div><strong>학습은 어떻게 반영되나요?</strong><p>게시된 지식을 질문에 맞춰 검색하고 AI의 참고 문맥에 전달합니다. 모델 자체의 가중치를 재학습하는 방식은 아닙니다. 초안과 개인 상담 기억은 공통 지식으로 공개되지 않습니다.</p></div></div></div>}
        <footer className="admin-footer"><span>BAREUN FUND / LEARNING STUDIO</span><span>더 좋은 상담을 만드는 작은 기록들.</span></footer>
      </main>
    </div>

    <dialog className="admin-dialog" aria-labelledby="knowledge-editor-title" ref={editor} onCancel={e => { if (pending) e.preventDefault(); else setEditing(null); }} onClose={() => setEditing(null)}>
      {editing && <form onSubmit={async e => { e.preventDefault(); const entry = { ...editing, title: editing.title.trim(), content: editing.content.trim(), updatedAt: new Date().toISOString() }; const exists = store.entries.some(item => item.id === entry.id); if (await persist(exists ? store.entries.map(item => item.id === entry.id ? entry : item) : [entry, ...store.entries])) setEditing(null); }}>
        <div className="editor-heading"><div><span className="mini-label">학습 지식 편집</span><h2 id="knowledge-editor-title">{store.entries.some(e => e.id === editing.id) ? "학습 지식 수정" : "새로운 기준을 알려주세요."}</h2></div><button type="button" disabled={pending} className="admin-icon-button" onClick={() => setEditing(null)} aria-label="편집 닫기"><X size={20} /></button></div>
        {error && <p className="editor-error" role="alert">{error}</p>}
        <label>제목 <span>필수</span><input name="knowledge-title" autoComplete="off" value={editing.title} maxLength={120} required placeholder="예: 운전자금 신청 전 준비할 서류…" onChange={e => setEditing({ ...editing, title: e.target.value })} /></label>
        <div className="editor-columns"><label>분류<select value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value as TrainingEntry["category"] })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label><label>반영 상태<select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value as TrainingEntry["status"] })}><option value="draft">초안 · 상담에 미반영</option><option value="published">게시 · 상담에 반영</option></select></label></div>
        <label>학습 내용 <span>필수 · {editing.content.length.toLocaleString()}/6,000</span><textarea rows={7} maxLength={6000} required value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} placeholder="정책이가 참고할 내용을 구체적으로 적어주세요. 적용 조건과 예외 사항도 함께 적으면 더 정확한 답변에 도움이 됩니다." /></label>
        <label>검색 키워드<input name="knowledge-keywords" autoComplete="off" value={editing.keywords} maxLength={500} onChange={e => setEditing({ ...editing, keywords: e.target.value })} placeholder="운전자금, 신청서류, 준비물… (쉼표로 구분)" /></label>
        <label>출처·참고 링크<input name="knowledge-source" autoComplete="off" spellCheck={false} value={editing.source} maxLength={500} onChange={e => setEditing({ ...editing, source: e.target.value })} placeholder="공식 공고 URL 또는 자료명…" /></label>
        <div className="editor-footer"><small>{editing.status === "published" ? "저장 후 다음 상담부터 참고합니다." : "초안은 답변에 반영되지 않습니다."}</small><button type="button" className="admin-secondary" disabled={pending} onClick={() => setEditing(null)}>취소</button><button className="admin-primary" disabled={pending || !editing.title.trim() || !editing.content.trim()}>{pending ? "저장 중…" : "저장하기"}<Check size={16} /></button></div>
      </form>}
    </dialog>
    <dialog className="admin-dialog confirm-dialog" aria-labelledby="knowledge-confirm-title" ref={confirmation} onCancel={e => { if (pending) e.preventDefault(); else { setImported(null); setDeleting(null); } }}>
      <h2 id="knowledge-confirm-title">{deleting ? "이 지식을 삭제할까요?" : "백업 자료로 교체할까요?"}</h2><p>{deleting ? `‘${deleting.title}’은 다음 상담부터 참고하지 않습니다.` : `현재 ${store.entries.length}건을 가져온 ${imported?.entries.length ?? 0}건으로 교체합니다. 게시 상태도 함께 반영됩니다.`}</p>
      {error && <p role="alert" className="editor-error">{error}</p>}
      <div className="editor-footer"><button className="admin-secondary" disabled={pending} onClick={() => { setImported(null); setDeleting(null); }}>취소</button><button className="admin-primary" disabled={pending} onClick={async () => { const entries = deleting ? store.entries.filter(e => e.id !== deleting.id) : imported?.entries; if (entries && await persist(entries)) { setImported(null); setDeleting(null); } }}>{pending ? "적용 중…" : deleting ? "삭제하기" : "교체하기"}</button></div>
    </dialog>
  </div>;
}

function MessageIcon({ category }: { category: string }) { return category === "FEEDBACK" ? <Check size={18} /> : <FileText size={18} />; }
