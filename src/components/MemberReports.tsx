"use client";
import { useEffect, useId, useRef, useState } from "react";
import { PartnerConsultations } from "./PartnerConsultations";
import { MemberFollowups } from "./MemberFollowups";
import { ReportReview } from "./ReportReview";
import type { User } from "@supabase/supabase-js";
import { memberClient as client } from "../member-client";
import type { ConsultationReport } from "../engines/consultation-report";

type SavedReport = { id: string; title: string; created_at: string; report: ConsultationReport };
export function MemberReports({ report, onOpen }: { report: ConsultationReport | null; onOpen: (report: ConsultationReport) => void }) {
  const titleId = useId();
  const panel = useRef<HTMLDialogElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [consent, setConsent] = useState(false);
  const [rows, setRows] = useState<SavedReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const identity = useRef<string | null>(null);
  const [secure, setSecure] = useState(false);
  useEffect(() => {
    setSecure(window.isSecureContext);
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      identity.current = session?.user.id || null;
      setUser(session?.user || null); setRows([]);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function list() {
    const owner = identity.current;
    if (!owner) return;
    const { data, error } = await client.from("bareunfund_reports").select("id,title,created_at,report").order("created_at", { ascending: false }).limit(100);
    if (identity.current !== owner) return;
    if (error) throw error;
    setRows((data || []) as SavedReport[]);
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await action(); } catch { setMessage("요청을 완료하지 못했습니다. 입력 내용과 연결 상태를 확인한 뒤 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  const currentProfile = report?.profile;
  const earlier = currentProfile?.companyId && currentProfile.siteId ? rows.filter(row => row.report.profile?.companyId === currentProfile.companyId
    && row.report.profile?.siteId === currentProfile.siteId && row.report.createdAt < report!.createdAt)
    .sort((a,b) => b.report.createdAt.localeCompare(a.report.createdAt))[0]?.report : undefined;
  async function save() {
    if (!report || !user) return;
    const { error } = await client.from("bareunfund_reports").insert({ id: report.id, user_id: user.id, title: report.title, report });
    if (error) {
      if (error.code !== "23505") throw error;
      const existing = await client.from("bareunfund_reports").select("id").eq("id", report.id).maybeSingle();
      if (existing.error || !existing.data) throw error;
    }
    setMessage("회원 보관함에 보고서를 저장했습니다.");
    await list();
  }
  return <>
    <button type="button" className="save-button" onClick={() => { panel.current?.showModal(); if (user) void run(list); }}>회원가입 · 내 보고서</button>
    <dialog ref={panel} className="consultation-report-dialog" aria-labelledby={titleId}>
      <div className="report-actions"><button type="button" onClick={() => panel.current?.close()}>닫기</button></div>
      <h2 id={titleId}>내 보고서 보관함</h2>
      {!secure ? <p>회원가입과 로그인은 HTTPS 보안 연결이 완료된 후 이용할 수 있습니다. 현재 보고서는 내려받아 보관해 주세요.</p> : !user ?
        <form onSubmit={e => { e.preventDefault(); void run(async () => {
          if (signup && !consent) { setMessage("보관 안내에 동의해 주세요."); return; }
          const result = signup
            ? await client.auth.signUp({ email: email.trim(), password, options: { data: { application: "bareunfund", report_consent_at: new Date().toISOString() } } })
            : await client.auth.signInWithPassword({ email: email.trim(), password });
          if (result.error) throw result.error;
          setPassword("");
          setMessage(result.data.session ? "로그인했습니다. 보고서를 보관할 수 있습니다." : "확인 메일을 보냈습니다. 이메일 인증 후 이 화면에서 로그인해 주세요.");
        }); }}>
          <label>이메일<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label>비밀번호<input type="password" minLength={8} maxLength={128} autoComplete={signup ? "new-password" : "current-password"} required value={password} onChange={e => setPassword(e.target.value)} /></label>
          {signup && <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required />회원 식별용 이메일을 사용하고, 저장을 요청한 상담·기업정보와 보고서를 Supabase 회원 저장소에 보관하는 데 동의합니다. 보고서는 본인 계정에서 조회하고 삭제할 수 있습니다.</label>}
          <div className="report-actions"><button disabled={busy} type="submit">{signup ? "회원가입" : "로그인"}</button><button type="button" onClick={() => { setSignup(!signup); setMessage(""); }}>{signup ? "기존 회원 로그인" : "새 회원가입"}</button></div>
        </form> :
        <><p>{user.email}</p><div className="report-actions">
          <button disabled={busy || !report} onClick={() => void run(save)}>현재 보고서 보관</button>
          <button disabled={busy} onClick={() => void run(list)}>보관함 새로고침</button>
          <button disabled={busy} onClick={() => void run(async () => { const { error } = await client.auth.signOut(); if (error) throw error; setRows([]); setMessage("로그아웃했습니다."); })}>로그아웃</button>
        </div><p>최근 보고서 100개를 표시합니다. 보고서 생성 후 ‘현재 보고서 보관’을 눌러 저장하세요.</p>
        <PartnerConsultations key={user.id + (report?.id || "")} user={user.id} report={report}/>
        <MemberFollowups key={"followups-" + user.id} user={user.id} report={report}/>
        <ReportReview key={"reviews-" + user.id + (report?.id||"")} user={user.id} report={report}/>
        {earlier && report && <section><h3>지난 진단과 비교</h3>
          <p>{earlier.profile?.period || earlier.createdAt.slice(0,10)} → {currentProfile?.period || report.createdAt.slice(0,10)}</p>
          <p>진단 상태 · {earlier.diagnosis.status} → {report.diagnosis.status}</p>
          {[["sales","매출"],["debt","차입 잔액"],["guarantee","보증 잔액"]].map(([key,label]) =>
            <p key={key}>{label} · {earlier.profile?.[key] ? earlier.profile[key] + "만원" : "미입력"} → {currentProfile?.[key] ? currentProfile[key] + "만원" : "미입력"}</p>)}
        </section>}
        <ul>{rows.map(row => <li key={row.id}><button type="button" onClick={() => { onOpen(row.report); panel.current?.close(); }}>{row.title} · {new Date(row.created_at).toLocaleString("ko-KR")}</button><button disabled={busy} type="button" onClick={() => {
          if (window.confirm("이 보고서를 보관함에서 삭제할까요?")) void run(async () => {
            const { error } = await client.from("bareunfund_reports").delete().eq("id", row.id);
            if (error) throw error; await list(); setMessage("보고서를 삭제했습니다.");
          });
        }}>삭제</button></li>)}</ul>{!rows.length && <p>조회된 보고서가 없습니다.</p>}</>}
      <p role="status">{busy ? "처리 중입니다…" : message}</p>
    </dialog>
  </>;
}
