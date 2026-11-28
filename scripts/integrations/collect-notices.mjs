import { createClient } from "@supabase/supabase-js";
import { parseBizinfo } from "./bizinfo.mjs";
// Run in the server only. Never include this file's environment in a client bundle.
const required=["BIZINFO_API_KEY","BAREUN_SUPABASE_URL","BAREUN_SUPABASE_SERVICE_KEY"];
const missing=required.filter(k=>!process.env[k]);
if(missing.length){console.error("연결 대기: "+missing.join(", "));process.exit(2);}
if(process.env.BAREUN_BIZINFO_ENABLED!=="true"){console.error("수집 비활성: 사용승인 후 BAREUN_BIZINFO_ENABLED=true 설정");process.exit(2);}
const base=new URL(process.env.BAREUN_SUPABASE_URL);
if(base.origin!=="https://wmzszltshcrywplytzcg.supabase.co")throw new Error("Unexpected data destination");
const db=createClient(base.origin,process.env.BAREUN_SUPABASE_SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let inserted=0,changed=0,unchanged=0,conflicts=0;
try {
 for(let page=1;page<=20;page++){
  const url=new URL("https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do");
  url.search=new URLSearchParams({crtfcKey:process.env.BIZINFO_API_KEY,dataType:"json",pageUnit:"100",pageIndex:String(page)}).toString();
  const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error("Source unavailable");
  const reader=response.body.getReader();let size=0;const chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5_000_000){await reader.cancel();throw new Error("Response limit");}chunks.push(value);}
  const rows=parseBizinfo(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  for(const n of rows){
   const found=await db.from("bareunfund_notices").select("id,revision,source_fingerprint").eq("source_key",n.source_key).maybeSingle();if(found.error)throw found.error;
   if(found.data?.source_fingerprint===n.source_fingerprint){unchanged++;continue;}
   if(found.data){
    const {regions: _regions,sectors: _sectors,...data}=n;
    const r=await db.from("bareunfund_notices").update({...data,status:"pending",verified_at:null,verified_by:null,review_note:"공식 공고 변경 감지: 재검증 필요"}).eq("id",found.data.id).eq("revision",found.data.revision).select("id");
    if(r.error)throw r.error;if(r.data.length)changed++;else conflicts++;
   }else{const r=await db.from("bareunfund_notices").insert(n);if(r.error?.code==="23505"){conflicts++;continue;}if(r.error)throw r.error;inserted++;}
  }
  if(rows.length<100)break;
 }
 console.log(JSON.stringify({inserted,changed,unchanged,conflicts,publication:"human_review_required"}));
}catch{
 // Provider errors can contain credential-bearing URLs: never log raw errors.
 console.error("수집 실패: 연결·승인·응답 형식을 확인하세요. 기존 검증 정보는 유지하며 신규 자료는 자동 공개하지 않습니다.");process.exitCode=1;
}
