"use client";
import { useCallback, useEffect, useState } from "react";
type DocumentRecord = { id: string; name: string; category: string; note: string; size: number; createdAt: string };
export function ServerDocuments({ connected, token }: { connected: boolean; token: string }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]); const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("설계서"); const [note, setNote] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try { const res = await fetch("/api/admin/documents", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }); if (!res.ok) throw new Error("서버 자료 목록을 불러오지 못했습니다."); const data = await res.json(); setDocuments(data.documents); } catch (e) { setMessage(e instanceof Error ? e.message : "서버 연결을 확인해 주세요."); }
  }, [token]);
  useEffect(() => { if (connected) void refresh(); }, [connected, refresh]);
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!file || busy) return; const formElement = e.currentTarget; setBusy(true); setMessage("");
    try { if (file.size > 10_000_000) throw new Error("10MB 이하의 파일을 선택해 주세요."); const form = new FormData(); form.set("file", file); form.set("category", category); form.set("note", note); const res = await fetch("/api/admin/documents", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "저장하지 못했습니다."); setFile(null); setNote(""); formElement.reset(); setMessage("파일을 서버에 저장했습니다. 상담에 자동으로 반영되지는 않습니다."); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); } finally { setBusy(false); }
  }
  async function download(item: DocumentRecord) {
    try { const res = await fetch(`/api/admin/documents?id=${encodeURIComponent(item.id)}`, { headers: { Authorization: `Bearer ${token}` } }); if (!res.ok) throw new Error("파일을 불러오지 못했습니다."); const url = URL.createObjectURL(await res.blob()); const a = document.createElement("a"); a.href = url; a.download = item.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (e) { setMessage(e instanceof Error ? e.message : "다운로드에 실패했습니다."); }
  }
  return <section className="admin-panel"><div className="admin-panel-heading"><div><h2>서버 자료 보관함</h2><p>원본 파일을 비공개 서버에 보관합니다. 1개당 최대 10MB.</p></div></div>{!connected ? <p>‘연결·백업’에서 관리자 키로 서버에 연결하면 사용할 수 있습니다. GitHub 공유 페이지에서는 서버 보관함을 사용할 수 없습니다.</p> : <><form onSubmit={upload}><label>자료 파일<input type="file" required onChange={e => setFile(e.target.files?.[0] ?? null)} /></label><label>분류<select value={category} onChange={e => setCategory(e.target.value)}><option>설계서</option><option>정책자료</option><option>브랜드</option><option>기타</option></select></label><label>설명<input value={note} maxLength={4000} onChange={e => setNote(e.target.value)} placeholder="출처나 기준일 등" /></label><button className="admin-primary" disabled={busy || !file}>{busy ? "저장 중…" : "서버에 보관"}</button></form>{message && <p role="status">{message}</p>}<p>파일은 상담 지식이나 진단 규칙에 자동 적용되지 않습니다. 내용을 확인한 후 학습 지식에 별도로 등록해 주세요.</p><div className="master-data-list">{documents.map(item => <article key={item.id}><strong>{item.name}</strong><p>{item.category} · {(item.size / 1024).toFixed(1)} KB · {new Date(item.createdAt).toLocaleDateString("ko-KR")}</p>{item.note && <p>{item.note}</p>}<button className="admin-secondary" type="button" onClick={() => void download(item)}>내려받기</button></article>)}{!documents.length && <p>아직 서버에 보관한 파일이 없습니다.</p>}</div></>}</section>;
}
