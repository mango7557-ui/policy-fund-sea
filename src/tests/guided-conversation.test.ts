import { expect,it } from "vitest";
import { guidedReply } from "../engines/guided-conversation";
it("does not repeat known business form or ask multiple model questions",()=>{
 const reply=guidedReply("개인사업자로 운영하고 계시군요. 개인인가요? 매출은 얼마고 직원은 몇 명인가요?",{purpose:"working",entity:"sole"},[]);
 expect(reply.match(/\?/g)).toHaveLength(1);
 expect(reply).not.toContain("개인인가요");
 expect(reply).toContain("운영하고 계세요?");
});
it("does not repeat an acknowledgement or carry model financing claims into guided questions",()=>{
 const reply=guidedReply("개인사업자로 운영하고 계시군요. 승인 가능합니다!",{purpose:"working",entity:"sole"},["개인사업자로 운영하고 계시군요."]);
 expect(reply).not.toContain("승인"); expect(reply).not.toContain("운영하고 계시군요");
});
