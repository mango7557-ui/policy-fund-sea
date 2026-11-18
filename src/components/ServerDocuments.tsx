"use client";

import { useCallback, useEffect, useState } from "react";
import type { DocumentFields, StoredDocument } from "../server/document-store";

type Inventory = { documents: StoredDocument[]; trash: StoredDocument[] };
const endpoint = "/api/admin/documents";
const itemUrl = (id: string) => endpoint + "?id=" + encodeURIComponent(id);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "서버 연결을 확인해 주세요.";

export function ServerDocuments({ connected, token }: { connected: boolean; token: string }) {
  return <section className="admin-panel settings-card">
    <h2>서버 자료 보관함</h2>
    {connected
      ? <Library key={token} token={token} />
      : <p>‘연결·백업’에서 관리자 키로 서버에 연결하면 사용할 수 있습니다.</p>}
  </section>;
}

function Library({ token }: { token: string }) {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [trash, setTrash] = useState(false);
  const [editing, setEditing] = useState<StoredDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useCallback(async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    headers.set("Authorization", "Bearer " + token);
    const response = await fetch(url, { ...options, headers, cache: "no-store" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || "서버에서 요청을 처리하지 못했습니다.");
    }
    return response;
  }, [token]);

  const load = useCallback(async () => {
    const data = await (await request(endpoint)).json();
    if (!Array.isArray(data.documents) || !Array.isArray(data.trash)) throw new Error("서버의 자료 보관함 버전을 확인해 주세요.");
    return data as Inventory;
  }, [request]);

  useEffect(() => {
    let current = true;
    load().then(data => { if (current) setInventory(data); }).catch(error => { if (current) setMessage(errorMessage(error)); });
    return () => { current = false; };
  }, [load]);

  async function perform(action?: () => Promise<void>, success = "") {
    if (busy) return;
    setBusy(true);
    setMessage("");
    let result = success;
    try { await action?.(); } catch (error) { result = errorMessage(error); }
    try {
      const next = await load();
      setInventory(next);
      setEditing(current => {
        if (!current) return null;
        const latest = next.documents.find(item => item.id === current.id);
        return latest && latest.revision === current.revision ? current : null;
      });
    } catch (error) { result += " " + errorMessage(error); }
    setMessage(result);
    setBusy(false);
  }

  function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = new FormData(form);
    const file = body.get("file");
    if (!(file instanceof File) || !file.size || file.size > 10_000_000) {
      setMessage("비어 있지 않은 10MB 이하의 파일을 선택해 주세요.");
      return;
    }
    void perform(async () => {
      await request(endpoint, { method: "POST", body });
      form.reset();
      setTrash(false);
    }, "파일을 보관했습니다.");
  }

  function change(item: StoredDocument, action: "edit" | "restore" | "trash", fields?: DocumentFields) {
    const notices = { edit: "자료 정보를 저장했습니다.", restore: "보관함으로 복원했습니다.", trash: "휴지통으로 이동했습니다." };
    void perform(async () => {
      await request(itemUrl(item.id), {
        method: action === "trash" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json", "X-Document-Revision": item.revision ?? item.id },
        body: action === "trash" ? undefined : JSON.stringify({ ...fields, action }),
      });
      setEditing(null);
    }, notices[action]);
  }

  async function download(item: StoredDocument) {
    try {
      const response = await request(itemUrl(item.id));
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = item.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setMessage(errorMessage(error)); }
  }

  const visible = trash ? inventory?.trash : inventory?.documents;
  return <>
    <p>원본 파일은 개당 최대 10MB까지 보관할 수 있습니다. 상담에 사용할 내용은 검토 후 학습 지식으로 등록해 주세요.</p>
    <form onSubmit={upload}>
      <label>자료 파일<input type="file" name="file" required /></label>
      <label>분류<select name="category" defaultValue="설계서">
        {["설계서", "정책자료", "브랜드", "기타"].map(value => <option key={value}>{value}</option>)}
      </select></label>
      <label>설명<input name="note" maxLength={4000} placeholder="출처나 기준일 등" /></label>
      <button className="admin-primary" disabled={busy || !inventory}>서버에 보관</button>
    </form>
    <div role="group" aria-label="자료 보기">
      <button className="admin-secondary" aria-pressed={!trash} disabled={busy} onClick={() => { setTrash(false); setEditing(null); }}>보관함 {inventory?.documents.length}</button>
      <button className="admin-secondary" aria-pressed={trash} disabled={busy} onClick={() => { setTrash(true); setEditing(null); }}>휴지통 {inventory?.trash.length}</button>
      <button className="admin-text-button" disabled={busy} onClick={() => { setEditing(null); void perform(); }}>목록 새로고침</button>
    </div>
    <p role="status" aria-live="polite">{message}</p>
    <div className="master-data-list">
      {visible?.map(item => <article key={item.id}>
        {editing?.id === item.id && !trash
          ? <form onSubmit={e => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              change(editing, "edit", { name: String(data.get("name")), category: String(data.get("category")), note: String(data.get("note")) });
            }}>
              <label>파일명<input name="name" required maxLength={200} defaultValue={editing.name} /></label>
              <label>분류<input name="category" required maxLength={100} defaultValue={editing.category} /></label>
              <label>설명<textarea name="note" maxLength={4000} defaultValue={editing.note} /></label>
              <div>
                <button className="admin-primary" disabled={busy}>저장</button>
                <button className="admin-secondary" type="button" disabled={busy} onClick={() => setEditing(null)}>취소</button>
              </div>
            </form>
          : <>
            <strong>{item.name}</strong>
            <p>{item.category} · {(item.size / 1024).toFixed(1)} KB · {new Date(item.deletedAt ?? item.createdAt).toLocaleDateString("ko-KR")} {trash ? "삭제" : "등록"}</p>
            {item.note && <p>{item.note}</p>}
            {trash ? <button className="admin-secondary" disabled={busy} onClick={() => change(item, "restore")}>복원</button> : <div>
              <button className="admin-secondary" disabled={busy} onClick={() => void download(item)}>내려받기</button>
              <button className="admin-secondary" disabled={busy} onClick={() => setEditing(item)}>정보 수정</button>
              <button className="admin-text-button" disabled={busy} onClick={() => change(item, "trash")}>휴지통으로</button>
            </div>}
          </>}
      </article>)}
      {visible?.length === 0 && <p>{trash ? "휴지통이 비어 있습니다." : "보관한 파일이 없습니다."}</p>}
    </div>
  </>;
}
