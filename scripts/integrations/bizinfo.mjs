import { createHash } from "node:crypto";
const regionNames = new Set(["전국","서울","부산","대구","인천","광주","전남광주","대전","울산","세종","경기","강원","충북","충남","전북","전남","경북","경남","제주"]);
const plain = (v, max) => String(v ?? "").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,max);
function date(v) {
  if (!/^\d{8}$/.test(v)) return null;
  const s=`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`;
  const d=new Date(s+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s:null;
}
export function normalizeBizinfo(item) {
  if (!item || typeof item!=="object") throw new Error("Invalid notice record");
  const key=plain(item.seq||item.pblancId,150);
  const title=plain(item.title||item.pblancNm,300);
  const institution=plain(item.author||item.jrsdInsttNm,150);
  const url=new URL(String(item.link||item.pblancUrl));
  if(!key||!title||!institution||url.protocol!=="https:"||!['www.bizinfo.go.kr','bizinfo.go.kr'].includes(url.hostname)||url.username||url.password)throw new Error("Invalid official source");
  const period=plain(item.reqstDt||item.reqstBeginEndDe,150);
  const dates=period.match(/^\s*(\d{8})\s*~\s*(\d{8})\s*$/);
  const summary=plain(item.description||item.bsnsSumryCn,8500)+"\n접수조건: "+(period||"원문 확인")+"\n지원대상: "+plain(item.trgetNm,500);
  const fingerprint=createHash("sha256").update(JSON.stringify([title,institution,url.href,summary,item.flpthNm,item.fileNm,item.printFlpthNm,item.hashTags])).digest("hex");
  return {source_key:`bizinfo:${key}`,title,institution,source_url:url.href,summary,
    starts_on:dates?date(dates[1]):null,ends_on:dates?date(dates[2]):null,
    regions:plain(item.hashTags,1000).split(",").filter(x=>regionNames.has(x)),sectors:[],source_fingerprint:fingerprint};
}
export function parseBizinfo(body) {
  const rows=body?.jsonArray?.item;
  if(!Array.isArray(rows))throw new Error("Unexpected Bizinfo response; nothing published");
  return rows.map(normalizeBizinfo);
}
