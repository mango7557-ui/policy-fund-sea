import { Answers, formatHumanFollowUpQuestion } from "./document-advisor";

/** The model may acknowledge; the decision engine owns the next question. */
export function guidedReply(generated: string, answers: Answers, previousReplies: string[]) {
  const question = formatHumanFollowUpQuestion(answers);
  const sentences = generated.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\*\*/g, "")
    .match(/[^.!?。！？]+[.!?。！？]?/g) || [];
  const prior = previousReplies.slice(-4).join(" ");
  const lead = sentences.map(s => s.trim()).find(s => s.length >= 8 && s.length <= 85
    && !/[?？]|얼마|어떤|무엇|몇 |언제|알려|말씀해|감사|고맙|그러셨군요|승인|한도|금리|가능|대출|상품|추천|힘들|부담|걱정/.test(s)
    && !prior.includes(s));
  return [lead?.replace(/(^|\s)돈(?=[은을이 ,.!]|$)/g,"$1자금"), question].filter(Boolean).join(" ");
}
