"use client";
import { useEffect,useState } from "react";
import { memberClient as db } from "../member-client";
import type { ConsultationReport } from "../engines/consultation-report";
type Review={id:string;customer:string;report_id:string;state:string;request_note:string;review_note:string;reviewed_at:string|null};
const states:Record<string,string>={requested:"검토 요청",reviewing:"검토 중",needs_data:"자료 보완",completed:"검토 완료"};
export function ReportReview({user,report}:{user:string;report:ConsultationReport|null}){
 const [rows,setRows]=useState<Review[]>([]); const [operator,setOperator]=useState(false);
 const [consent,setConsent]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 const [revision,setRevision]=useState(0);const [opened,setOpened]=useState("");
 useEffect(()=>{let active=true;void Promise.all([db.from("bareunfund_report_reviews").select("id,customer,report_id,state,request_note,review_note,reviewed_at").order("created_at",{ascending:false}).limit(100),db.from("bareunfund_operators").select("user_id").eq("user_id",user).maybeSingle()]).then(([r,o])=>{if(!active)return;setRows(r.data||[]);setOperator(!!o.data&&!o.error);if(r.error)setMessage("검토 목록을 불러오지 못했습니다.");});return()=>{active=false;};},[user,revision]);
 async function run(action:()=>Promise<void>){setBusy(true);setMessage("");try{await action();setRevision(x=>x+1);}catch{setMessage("처리하지 못했습니다. 보고서 보관과 현재 검토 상태를 확인해 주세요.");}finally{setBusy(false);}}
 return <details className="document-tools"><summary>보고서 검토 요청 · 처리 상태</summary><div className="document-tool-body">
  <p>검토를 요청하면 운영 검토자가 저장된 보고서의 기업정보와 상담기록을 볼 수 있습니다. 검토 완료는 금융기관의 승인이나 전문가 자격을 보장하는 표시가 아닙니다.</p>
  {report&&!rows.some(r=>r.report_id===report.id)&&<form onSubmit={e=>{e.preventDefault();if(!consent)return;const f=new FormData(e.currentTarget);void run(async()=>{
   const {error}=await db.from("bareunfund_report_reviews").insert({customer:user,report_id:report.id,request_note:String(f.get("request_note"))});if(error)throw error;setConsent(false);setMessage("검토 요청을 저장했습니다. 아직 검토 완료 상태는 아닙니다.");
  });}}><label>확인받고 싶은 내용<textarea name="request_note" required maxLength={2000}/></label><label><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/>현재 보고서를 먼저 보관했으며, 검토를 위해 운영 검토자가 기업정보·상담기록을 확인하는 데 동의합니다.</label><button disabled={busy||!consent}>검토 요청</button></form>}
  <p>공유를 중단하려면 보관함에서 해당 보고서를 삭제하세요. 연결된 검토 요청·결과도 함께 삭제됩니다.</p>
  {rows.map(r=><article key={r.id}><h4>{states[r.state]} · 보고서 {r.report_id.slice(0,8)}</h4><p>{r.request_note}</p><p>{r.review_note||"아직 검토 의견이 없습니다."}</p>{r.reviewed_at&&<p>검토일 · {new Date(r.reviewed_at).toLocaleString("ko-KR")}</p>}
   {operator&&<><button disabled={busy} onClick={()=>void run(async()=>{const {data,error}=await db.from("bareunfund_report_reviews").select("report_snapshot").eq("id",r.id).single();if(error)throw error;setOpened(data.report_snapshot?JSON.stringify(data.report_snapshot,null,2):"이전 요청에 저장된 보고서 사본이 없습니다. 고객에게 새 보고서 검토 요청을 안내해 주세요.");})}>동의 시점 보고서 확인</button>
    {r.state!=="completed"&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(async()=>{const {data,error}=await db.from("bareunfund_report_reviews").update({state:String(f.get("state")),review_note:String(f.get("review_note"))}).eq("id",r.id).eq("state",r.state).select("id");if(error||!data?.length)throw error||new Error();setMessage("검토 이력을 저장했습니다.");});}}><label>처리 단계<select name="state" defaultValue={r.state}>{Object.entries(states).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>확인 자료·판단 근거·보완 의견<textarea required name="review_note" maxLength={5000} defaultValue={r.review_note}/></label><p>완료 처리 후에는 검토 의견을 덮어쓸 수 없습니다.</p><button disabled={busy}>검토 기록</button></form>}</>}
  </article>)}
  {opened&&<details open><summary>검토 중인 보고서 원문</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{opened}</pre><button onClick={()=>setOpened("")}>원문 닫기</button></details>}
  <p role="status">{busy?"처리 중…":message}</p>
 </div></details>;
}
