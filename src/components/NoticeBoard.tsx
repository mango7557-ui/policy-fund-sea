"use client";
import { useEffect, useId, useState } from "react";
import { memberClient as db } from "../member-client";
import { isCurrentNotice, matchesNotice, Notice, safeOfficialLink, koreaDate } from "../engines/notices";

export function NoticeBoard({ initialRegion = "", initialSector = "" }: { initialRegion?: string; initialSector?: string }) {
  const heading=useId();
  const [rows,setRows] = useState<Notice[]>([]);
  const [region,setRegion] = useState(initialRegion);
  const [sector,setSector] = useState(initialSector);
  const [message,setMessage] = useState("검증된 공고를 확인하고 있어요.");
  const [revision,setRevision] = useState(0);
  const [loaded,setLoaded] = useState(false);
  useEffect(() => { let active=true; setLoaded(false);
    void db.from("bareunfund_notices").select("id,title,institution,source_url,summary,regions,sectors,starts_on,ends_on,status,revision,verified_at,review_note")
      .eq("status","verified").order("verified_at",{ascending:false}).limit(200).then(({data,error})=>{
        if(!active)return;
        setRows(error?[]:(data||[]) as Notice[]); setLoaded(!error);
        setMessage(error?"공고를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.":"최근 검증한 공고 최대 200건을 표시합니다. 지역·업종 일치는 신청 자격 확정을 뜻하지 않아요.");
      }); return()=>{active=false;};
  },[revision]);
  const visible=rows.filter(n=>isCurrentNotice(n)&&matchesNotice(n,region.trim(),sector.trim()));
  return <section className="document-tools" aria-labelledby={heading}>
    <h2 id={heading}>우리 기업에 맞는 공고 찾아보기</h2>
    <p>담당자가 원문을 확인한 공고만 보여드립니다. 마감일이 없으면 예산 소진 여부를 신청처에서 다시 확인해 주세요.</p>
    <div className="admin-toolbar"><label>사업장 지역<input value={region} onChange={e=>setRegion(e.target.value)} placeholder="예: 서울" maxLength={80}/></label>
      <label>업종<input value={sector} onChange={e=>setSector(e.target.value)} placeholder="예: 제조" maxLength={80}/></label>
      <button type="button" onClick={()=>setRevision(x=>x+1)}>공고 새로고침</button></div>
    <p role="status">{message}</p>
    {loaded && !visible.length && <p>현재 조건에 맞는 검증 완료 공고가 없습니다. 자동수집 API는 계약·발급 후 연결하며, 그 전에는 운영자가 공식 공고를 등록하고 검증합니다.</p>}
    <div className="question-results">{visible.map(n=><article key={n.id} className="admin-panel"><h3>{n.title}</h3><p>{n.institution} · {n.regions.join(", ")||"지역 조건 원문 확인"}</p><p>{n.summary}</p>
      <p>접수 기간 · {n.starts_on||"시작일 원문 확인"} ~ {n.ends_on||"예산 소진 등 종료조건 확인"}</p>
      <p>검증일 · {n.verified_at?.slice(0,10)} / 공고 버전 {n.revision}</p>
      {safeOfficialLink(n.source_url)&&<a href={safeOfficialLink(n.source_url)!} target="_blank" rel="noopener noreferrer">공식 공고와 신청 조건 확인</a>}
    </article>)}</div>
  </section>;
}

export function NoticeOperations({user}:{user:string}) {
  const [operator,setOperator]=useState(false);
  const [rows,setRows]=useState<Notice[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  const [history,setHistory]=useState<{revision:number;state:string;reason:string;occurred_at:string}[]>([]);
  useEffect(()=>{let active=true;
    void db.from("bareunfund_operators").select("user_id").eq("user_id",user).maybeSingle().then(async ({data,error})=>{
      if(!active)return;setOperator(Boolean(data)&&!error);
      if(data&&!error){const result=await db.from("bareunfund_notices").select("*").order("updated_at",{ascending:false}).limit(200);
        if(active){setRows(result.data||[]);if(result.error)setMessage("검증 목록 조회에 실패했습니다.");}}
    }); return()=>{active=false;};
  },[user,revision]);
  async function run(action:()=>Promise<void>){setBusy(true);setMessage("");try{await action();setRevision(x=>x+1);}catch{setMessage("저장하지 못했습니다. 권한·필수항목·중복 출처번호를 확인해 주세요.");}finally{setBusy(false);}}
  if(!operator)return null;
  return <details className="document-tools"><summary>운영자 · 공고 검증</summary><div className="document-tool-body">
    <p>등록·내용 수정 후에는 검증대기로 돌아갑니다. 공식 원문을 대조한 뒤 별도로 승인해야 공개됩니다. 기한이 지난 공고는 자동으로 공개 목록에서 제외됩니다.</p>
    <form onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form);void run(async()=>{
      const {error}=await db.from("bareunfund_notices").insert({source_key:String(f.get("source_key")).trim(),title:String(f.get("title")).trim(),institution:String(f.get("institution")).trim(),source_url:String(f.get("source_url")).trim(),summary:String(f.get("summary")),regions:String(f.get("regions")).split(",").map(x=>x.trim()).filter(Boolean),sectors:String(f.get("sectors")).split(",").map(x=>x.trim()).filter(Boolean),starts_on:f.get("starts_on")||null,ends_on:f.get("ends_on")||null});
      if(error)throw error;form.reset();setMessage("검증대기에 등록했습니다.");
    });}}>
      {[["source_key","출처 고유번호",200],["title","공고명",300],["institution","기관",150],["source_url","공식 HTTPS 주소",2000]].map(([key,label,max])=><label key={key}>{label}<input name={String(key)} required maxLength={Number(max)} type={key==="source_url"?"url":"text"} pattern={key==="source_url"?"https://.*":undefined}/></label>)}
      <label>대상·내용·준비사항<textarea name="summary" required maxLength={10000}/></label><label>지역 (쉼표로 구분)<input name="regions" maxLength={500}/></label><label>업종 (쉼표로 구분)<input name="sectors" maxLength={500}/></label>
      <label>접수 시작일<input name="starts_on" type="date"/></label><label>접수 마감일<input name="ends_on" type="date"/></label><button disabled={busy}>검증대기 등록</button>
    </form>
    {rows.map(n=><article key={n.id}><h4>{n.title} · {n.status} · v{n.revision}</h4><p>{n.summary}</p><a href={safeOfficialLink(n.source_url)||undefined} target="_blank" rel="noopener noreferrer">원문 확인</a>
      <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(async()=>{
        const state=String(f.get("status"));
        if(state==="verified"&&n.ends_on&&n.ends_on<koreaDate()){setMessage("접수기한이 지난 공고는 공개할 수 없습니다.");return;}
        const {data,error}=await db.from("bareunfund_notices").update({status:state,review_note:String(f.get("review_note"))}).eq("id",n.id).eq("revision",n.revision).select("id");
        if(error)throw error;if(!data?.length){setMessage("다른 담당자가 수정했습니다. 최신 목록에서 다시 확인하세요.");return;}setMessage("검증 상태를 기록했습니다.");
      });}}><label>검증 상태<select name="status" defaultValue={n.status}><option value="pending">검증대기</option><option value="verified">원문 검증완료·공개</option><option value="closed">마감·예산소진</option><option value="rejected">제외</option></select></label>
        <label>확인한 조건·변경 사유<textarea name="review_note" required maxLength={4000} defaultValue={n.review_note}/></label><button disabled={busy}>검증 기록 저장</button></form>
      <button disabled={busy} type="button" onClick={()=>void run(async()=>{const {data,error}=await db.from("bareunfund_notice_history").select("revision,state,reason,occurred_at").eq("notice_id",n.id).order("revision",{ascending:false});if(error)throw error;setHistory(data||[]);})}>변경 이력</button>
    </article>)}
    {!!history.length&&<ul>{history.map(h=><li key={h.revision}>v{h.revision} · {h.state} · {h.occurred_at} · {h.reason}</li>)}</ul>}
    <p role="status">{busy?"저장 중…":message}</p>
  </div></details>;
}
