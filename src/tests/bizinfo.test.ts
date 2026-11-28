import { expect,it } from "vitest";
import { normalizeBizinfo,parseBizinfo } from "../../scripts/integrations/bizinfo.mjs";
const row={seq:"fixture-1",title:"테스트 공고",author:"시험기관",link:"https://www.bizinfo.go.kr/example",reqstDt:"20261101 ~ 20261130",description:"<p>내용</p>",hashTags:"서울,금융"};
it("extracts dates without approving collected data",()=>{
 const result=normalizeBizinfo(row);expect(result.starts_on).toBe("2026-11-01");expect(result).not.toHaveProperty("status");expect(result.regions).toEqual(["서울"]);
 expect(normalizeBizinfo({...row,reqstDt:"예산 소진 시까지"}).ends_on).toBeNull();
});
it("rejects malformed or nonofficial feeds and detects modifications",()=>{
 expect(()=>parseBizinfo({error:"not authorized"})).toThrow();
 expect(()=>normalizeBizinfo({...row,link:"https://example.com"})).toThrow();
 expect(normalizeBizinfo({...row,description:"변경"}).source_fingerprint).not.toBe(normalizeBizinfo(row).source_fingerprint);
});
