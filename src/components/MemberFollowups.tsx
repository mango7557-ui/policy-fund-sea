"use client";
import { useEffect, useState } from "react";
import { memberClient as db } from "../member-client";
import { koreaDate, threeMonthsLater } from "../engines/notices";
import type { ConsultationReport } from "../engines/consultation-report";
import { NoticeBoard, NoticeOperations } from "./NoticeBoard";

type Followup={id:string;title:string;due_on:string;state:"pending"|"done";note:string};
export function MemberFollowups({user,report}:{user:string;report:ConsultationReport|null}){
  const [rows,setRows]=useState<Followup[]>([]);
  const [region,setRegion]=useState(""); const [sector,setSector]=useState("");
  const [saved,setSaved]=useState<{region:string;sector:string}|null>(null);
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;
    void Promise.all([db.from("bareunfund_followups").select("id,title,due_on,state,note").order("due_on").limit(100),db.from("bareunfund_notice_preferences").select("region,sector").eq("user_id",user).maybeSingle()]).then(([tasks,prefs])=>{
      if(!active)return;
      if(tasks.error||prefs.error){setMessage("회원 관리 정보를 불러오지 못했습니다.");return;}
      setRows(tasks.data||[]);const p=prefs.data||{region:"",sector:""};setRegion(p.region);setSector(p.sector);setSaved(p);
    });return()=>{active=false;};
  },[user,revision]);
  async function run(action:()=>Promise<void>){setBusy(true);setMessage("");try{await action();setRevision(x=>x+1);}catch{setMessage("저장하지 못했습니다. 로그인 상태와 보고서 보관 여부를 확인해 주세요.");}finally{setBusy(false);}}
  return <><details className="document-tools"><summary>재진단 일정 · 맞춤공고</summary><div className="document-tool-body">
    <p>재진단과 자료 준비 일정을 보관합니다. 이메일·문자 자동발송은 아직 연결하지 않았으며 이 보관함에서 확인할 수 있어요.</p>
    <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(async()=>{
      const {error}=await db.from("bareunfund_followups").insert({user_id:user,report_id:null,title:String(f.get("title")),due_on:String(f.get("due_on")),note:String(f.get("note"))});if(error)throw error;setMessage("일정을 저장했습니다.");
    });}}><label>준비할 일<input name="title" required maxLength={150} defaultValue="기업정보 확인 후 재진단"/></label><label>확인 날짜<input name="due_on" type="date" required defaultValue={threeMonthsLater()}/></label><label>메모<textarea name="note" maxLength={2000} placeholder="변경된 매출·차입·보증 자료를 준비하세요."/></label><button disabled={busy}>일정 보관</button></form>
    {report&&<p>현재 보고서 · {report.createdAt.slice(0,10)} / 기업 {report.profile?.tradeName||"미입력"}. 보고서는 위의 ‘현재 보고서 보관’으로 별도 저장해 주세요.</p>}
    <ul>{rows.map(t=><li key={t.id}><strong>{t.title}</strong> · {t.due_on} · {t.state==="done"?"완료":t.due_on<=koreaDate()?"확인할 시점이에요":"예정"}<p>{t.note}</p><button disabled={busy} type="button" onClick={()=>void run(async()=>{const {data,error}=await db.from("bareunfund_followups").update({state:t.state==="done"?"pending":"done"}).eq("id",t.id).select("id");if(error||!data?.length)throw error||new Error();setMessage("진행 상태를 저장했습니다.");})}>{t.state==="done"?"다시 진행":"완료 표시"}</button></li>)}</ul>
    <form onSubmit={e=>{e.preventDefault();void run(async()=>{
      const {error}=await db.from("bareunfund_notice_preferences").upsert({user_id:user,region:region.trim(),sector:sector.trim(),updated_at:new Date().toISOString()},{onConflict:"user_id"});if(error)throw error;setMessage("맞춤공고 조건을 보관했습니다.");
    });}}><label>관심 지역<input maxLength={80} value={region} onChange={e=>setRegion(e.target.value)}/></label><label>관심 업종<input maxLength={80} value={sector} onChange={e=>setSector(e.target.value)}/></label><p>저장한 지역·업종을 본인 계정의 공고 필터에 사용합니다.</p><button disabled={busy}>조건 보관</button></form>
    {saved&&<NoticeBoard key={saved.region+saved.sector} initialRegion={saved.region} initialSector={saved.sector}/>}
    <p role="status">{busy?"처리 중…":message}</p>
  </div></details><NoticeOperations user={user}/></>;
}
