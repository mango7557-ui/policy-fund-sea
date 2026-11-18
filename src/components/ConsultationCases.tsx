"use client";

import { ArrowUpRight, ChevronDown } from "lucide-react";

// Public, anonymous examples from 가격대별 테스트 샘플5선 (GT2 series).
const examples = [
  {
    id: "001", category: "운전자금", title: "첫 직원을 둔 가게의 인건비",
    situation: "창업한 지 1년 된 소상공인이 직원 인건비를 마련하려고 합니다.",
    review: "매출 자료와 기존 대출을 먼저 살피고, 신청하려는 공고에서 청년 창업 요건을 확인합니다.",
    prompt: "창업 초기에 인건비를 마련하려면 어떤 자료부터 준비해야 하나요?",
  },
  {
    id: "054", category: "시설자금", title: "사업장이 둘일 때의 점포 리뉴얼",
    situation: "연관 사업체를 함께 운영하는 대표자가 한 점포의 리뉴얼을 계획합니다.",
    review: "공사 견적과 사업체별 차입 내역을 나누어 정리합니다. 기존 담보와 보증이 어느 사업장에 연결되는지도 살핍니다.",
    prompt: "점포를 리뉴얼하려고 합니다. 사업장이 여러 곳이면 무엇부터 확인할까요?",
  },
  {
    id: "084", category: "시설자금", title: "여성기업의 대규모 시설 투자",
    situation: "여성기업 확인서를 보유한 기업이 큰 규모의 시설 투자를 검토합니다.",
    review: "우대 조건의 적용 여부와 투자자금 조달 가능성을 각각 살핍니다. 총투자비, 자기자금, 추가로 마련할 금액을 구분합니다.",
    prompt: "여성기업이 시설 투자를 검토할 때 우대 요건과 자금 계획은 어떻게 확인하나요?",
  },
  {
    id: "097", category: "자료 확인", title: "자동조회가 되지 않는 사업장",
    situation: "운전자금을 검토하는 중에 자동조회가 중단되어 대출과 보증 정보가 비어 있습니다.",
    review: "확인한 정보와 빠진 항목을 구분한 뒤, 직접 입력한 값과 대조할 증빙을 정리합니다.",
    prompt: "자동조회가 안 될 때 제가 직접 확인할 자료는 무엇인가요?",
  },
  {
    id: "098", category: "재무 개선", title: "매출이 줄어든 기업의 추가 차입",
    situation: "매출 감소와 영업적자가 겹친 기업이 운전자금을 알아보고 있습니다.",
    review: "월별 현금흐름과 상환 일정을 확인합니다. 자본잠식과 상환 부담이 크면 전문가와 재무 개선 방안을 함께 검토할 사안입니다.",
    prompt: "매출이 줄고 상환 부담이 클 때 추가 차입 전에 무엇을 살펴야 하나요?",
  },
];

export function ConsultationCases({ onAsk }: { onAsk: (prompt: string) => void }) {
  return (
    <section className="casebook section-shell" id="cases" aria-labelledby="cases-title">
      <div className="casebook-intro">
        <h2 id="cases-title">상담 사례</h2>
        <p>우리 회사와 비슷한 상황을 골라 보세요. 무엇을 확인하고 어떤 자료를 준비하는지 살펴볼 수 있어요.</p>
        <small>자료 출처 · 가격대별 테스트 샘플 5선<br />모두 가상 기업을 바탕으로 한 예시입니다.</small>
      </div>
      <div className="casebook-list">
        {examples.map(example => (
          <details className="casebook-entry" key={example.id} name="consultation-examples">
            <summary>
              <span className="casebook-category">{example.category}</span>
              <span className="casebook-title">{example.title}</span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className="casebook-answer">
              <dl>
                <dt>기업 상황</dt><dd>{example.situation}</dd>
                <dt>확인할 점</dt><dd>{example.review}</dd>
              </dl>
              <button type="button" onClick={() => onAsk(example.prompt)}>
                이 주제로 상담하기 <ArrowUpRight size={16} aria-hidden="true" />
              </button>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
