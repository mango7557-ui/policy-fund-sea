export type FundingNeeds = {
  facility: number; working: number; development: number; operating: number;
  debt: number; duplicate: number; internal: number; investment: number; own: number;
};
export type FundingPlan = { values: FundingNeeds; business: string; stage: string; evidence: string; risk: string; calculatedAt: string };

/** All amounts cover the same three-year period and use the same unit. */
export function calculateFundingNeeds(input: FundingNeeds) {
  if (Object.values(input).some(value => !Number.isFinite(value) || value < 0)) throw new Error("금액은 0 이상의 숫자로 입력해 주세요.");
  const gross = input.facility + input.working + input.development + input.operating + input.debt;
  if (input.duplicate > gross) throw new Error("중복 금액은 총 수요보다 클 수 없습니다.");
  const total = gross - input.duplicate;
  const available = input.internal + input.investment + input.own;
  return { total, available, external: Math.max(0, total - available), surplus: Math.max(0, available - total) };
}
