import { describe, expect, it } from "vitest";
import { calculateFundingNeeds } from "../engines/funding-needs";

const base = { facility: 50000, working: 10000, development: 0, operating: 2000, debt: 3000, duplicate: 1000, internal: 5000, investment: 2000, own: 4000 };
describe("3개년 자금수요", () => {
  it("중복을 제외한 수요와 내부자금을 분리한다", () => {
    expect(calculateFundingNeeds(base)).toEqual({ total: 64000, available: 11000, external: 53000, surplus: 0 });
  });
  it("남는 자금은 음수 필요액으로 표시하지 않는다", () => {
    expect(calculateFundingNeeds({ ...base, own: 100000 }).external).toBe(0);
  });
  it("음수와 과도한 중복 입력을 거부한다", () => {
    expect(() => calculateFundingNeeds({ ...base, facility: -1 })).toThrow();
    expect(() => calculateFundingNeeds({ ...base, duplicate: 999999 })).toThrow();
  });
});
