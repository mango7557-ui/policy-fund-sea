"use client";
import { useEffect, useState } from "react";
import { memberClient as db } from "../member-client";
import type { ConsultationReport } from "../engines/consultation-report";

type Partner = {user_id:string; name:string; specialty:string; region:string; fee:string; verified:boolean};
type Case = {id:string; partner:string; customer:string; diagnosis_status:string; state:string; reason:string};
export function PartnerConsultations({user, report}: {user:string; report:ConsultationReport|null}) {
  const [partners,setPartners] = useState<Partner[]>([]);
  const [cases,setCases] = useState<Case[]>([]);
  const [selected,setSelected] = useState("");
  const [consent,setConsent] = useState(false);
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const [revision,setRevision] = useState(0);
  const [operator,setOperator] = useState(false);
  const partner = partners.find(p => p.user_id === selected && p.verified);
  useEffect(() => {
    let active = true;
    void Promise.all([db.from("bareunfund_partners").select("user_id,name,specialty,region,fee,verified"),
      db.from("bareunfund_partner_cases").select("id,partner,customer,diagnosis_status,state,reason").order("consented_at",{ascending:false}),
      db.from("bareunfund_operators").select("user_id").eq("user_id",user).maybeSingle()]).then(([p,c,o]) => {
      if (!active) return;
      if (p.error || c.error) {setMessage("파트너 정보를 불러오지 못했습니다."); return;}
      setPartners(p.data || []); setCases(c.data || []);
      setOperator(!!o.data&&!o.error);
    });
    return () => {active=false;};
  },[user,revision]);
  async function perform(action:()=>PromiseLike<{error:{message:string}|null}>, success:string) {
    setBusy(true);
    try { const result=await action(); if(result.error) throw result.error;
      setMessage(success); setConsent(false); setRevision(v=>v+1);
    } catch {setMessage("저장하지 못했습니다. 보고서 보관 여부와 현재 배정 상태를 확인해 주세요.");}
    finally {setBusy(false);}
  }
  const verified = partners.filter(p => p.verified && p.user_id !== user);
  return <details className="document-tools"><summary>전문가 상담 · 실행 파트너</summary><div className="document-tool-body">
    <p>진단을 마친 보고서를 보관한 뒤, 필요할 때 전문가를 선택해 주세요.</p>
    {operator&&<details><summary>운영자 · 파트너 검증과 배정 중지</summary><p>경력·자격·준법서약·개인정보 취급·비용 고지를 실제로 확인한 경우에만 승인하세요. 승인된 파트너만 고객의 선택 목록에 나타납니다.</p>{partners.map(p=><form key={p.user_id} onSubmit={e=>{e.preventDefault();void perform(()=>db.from("bareunfund_partners").update({verified:!p.verified}).eq("user_id",p.user_id),p.verified?"새 배정을 중지했습니다.":"검증 완료로 기록했습니다.");}}><h4>{p.name} · {p.verified?"검증 완료":"검증 대기"}</h4><p>{p.specialty} · {p.region} · {p.fee}</p><label><input type="checkbox" required/>검증 근거와 조치 대상을 확인했습니다.</label><button disabled={busy}>{p.verified?"배정 중지":"검증 승인"}</button></form>)}</details>}
    {report?.diagnosis.complete && verified.length > 0 && <><label>상담 파트너<select value={selected} onChange={e=>{setSelected(e.target.value);setConsent(false);}}>
      <option value="">선택해 주세요</option>{verified.map(p=><option key={p.user_id} value={p.user_id}>{p.name} · {p.region} · {p.specialty}</option>)}</select></label>
      {partner && <><p>상담 범위·비용 · {partner.fee}</p><p>공유할 진단 상태 · {report.diagnosis.status}</p>
        <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{partner.name}에게 위 진단 상태를 제공하고 상담·실행 결과를 기록하는 데 동의합니다. 아래에서 동의를 철회할 수 있습니다.</label>
        <button type="button" disabled={!consent || busy} onClick={()=>void perform(()=>db.from("bareunfund_partner_cases").insert({customer:user,partner:selected,report_id:report.id,diagnosis_status:report.diagnosis.status,fee:partner.fee}),"선택한 파트너에게 상담건을 배정했습니다.")}>동의하고 상담 신청</button></>}
    </>}
    {!verified.length && <p>현재 선택할 수 있는 검증 파트너가 없습니다.</p>}
    {cases.map(c=><section key={c.id}><h4>{partners.find(p=>p.user_id===c.partner)?.name || "실행 파트너"} · {c.state}</h4><p>{c.diagnosis_status} · 결과 사유 {c.reason}</p>
      {c.customer===user ? <button type="button" disabled={busy} onClick={()=>{if(window.confirm("동의를 철회하고 이 상담건을 삭제할까요?")) void perform(()=>db.from("bareunfund_partner_cases").delete().eq("id",c.id),"동의를 철회했습니다.");}}>동의 철회</button> :
        <form onSubmit={e=>{e.preventDefault(); const v=new FormData(e.currentTarget); void perform(()=>db.from("bareunfund_partner_cases").update({state:v.get("state"),reason:v.get("reason")}).eq("id",c.id),"진행 상태를 기록했습니다.");}}>
          <label>진행 상태<select name="state" defaultValue={c.state}>{["배정","상담 중","자료 준비","신청","승인","부결","보완","종료"].map(x=><option key={x}>{x}</option>)}</select></label>
          <label>결과 사유<select name="reason" defaultValue={c.reason}>{["미기록","지원요건","자료 부족","상환능력","예산·접수","기타"].map(x=><option key={x}>{x}</option>)}</select></label><button disabled={busy}>진행 기록 저장</button></form>}
    </section>)}
    {partners.some(p=>p.user_id===user) ? <p>파트너 등록 상태 · {partners.find(p=>p.user_id===user)?.verified ? "검증 완료" : "운영자 검토 대기"}</p> :
    <details><summary>컨설턴트 파트너 등록 신청</summary><form onSubmit={e=>{e.preventDefault(); const v=new FormData(e.currentTarget); void perform(()=>db.from("bareunfund_partners").insert({user_id:user,name:v.get("name"),specialty:v.get("specialty"),region:v.get("region"),fee:v.get("fee")}),"등록 신청을 받았습니다. 운영자 검증 후 상담을 배정받을 수 있어요.");}}>
      {[["name","공개 활동명",80],["specialty","경력·전문 분야·취급 자금",180],["region","상담 지역",80],["fee","상담 범위·사전 고정 비용",150]].map(([k,label,max])=><label key={k}>{label}<input name={String(k)} required maxLength={Number(max)}/></label>)}
      <label><input required type="checkbox"/>고객 직접신청과 사전 비용 고지를 지키고, 승인보장·정보 재판매·목적 외 이용을 하지 않겠습니다.</label><button disabled={busy}>검증 신청</button></form></details>}
    <p role="status">{message}</p></div></details>;
}
