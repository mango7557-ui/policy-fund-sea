import { describe,it,expect } from "vitest";
import { isCurrentNotice, matchesNotice, Notice, threeMonthsLater, safeOfficialLink } from "../engines/notices";
const notice:Notice={id:"test",title:"공고",institution:"기관",source_url:"https://www.bizinfo.go.kr/",summary:"",regions:["서울"],sectors:["제조"],starts_on:"2026-11-01",ends_on:"2026-11-30",status:"verified",revision:1,verified_at:"2026-11-28T00:00:00Z",review_note:"원문 대조"};
describe("verified notice publication",()=>{
 it("does not expose unreviewed, future or expired notices",()=>{
  expect(isCurrentNotice({...notice,status:"pending"},"2026-11-29")).toBe(false);
  expect(isCurrentNotice({...notice,verified_at:null},"2026-11-29")).toBe(false);
  expect(isCurrentNotice(notice,"2026-10-30")).toBe(false);
  expect(isCurrentNotice(notice,"2026-12-01")).toBe(false);
  expect(isCurrentNotice(notice,"2026-11-30")).toBe(true);
 });
 it("does not infer a regional match from a different region",()=>{
  expect(matchesNotice(notice,"부산","제조")).toBe(false);
  expect(matchesNotice(notice,"서울 강남구","제조")).toBe(true);
  expect(matchesNotice({...notice,regions:["전국"]},"부산","제조")).toBe(true);
 });
 it("keeps quarter reminders inside the target month",()=>{
  expect(threeMonthsLater(new Date("2026-11-30T00:00:00Z"))).toBe("2027-02-28");
 });
 it("rejects executable or credential-bearing source links",()=>{
  expect(safeOfficialLink("javascript:alert(1)")).toBe(null);
  expect(safeOfficialLink("https://user:pass@example.com")).toBe(null);
 });
});
