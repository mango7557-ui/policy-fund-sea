export type BranchAnswers = Partial<Record<string, string>>;
export const branchFields = [
  { key: "businessType", label: "기업 유형", options: ["일반기업", "일반 창업", "기술창업", "투자지향 스타트업", "임팩트 스타트업", "농업·농식품", "어업·수산"] },
  { key: "recovery", label: "재무·현금흐름 상황", options: ["확인 필요", "매출·상환능력 유지", "개발·R&D 투자에 따른 초기 적자", "일시적 유동성 부족", "지속적 영업적자", "과다차입·상환부담", "시장수요 감소", "자본잠식·복합위험"] },
  { key: "recoveryEvidence", label: "정상화 근거", options: ["확인 필요", "회수·매출 계약과 상환계획 있음", "개선계획 수립 중", "회복 근거 부족"] },
];
export const startupFields = [
  { key: "stage", label: "업력·성장단계", options: ["예비창업", "3년 이내", "3~7년", "스케일업"] },
  { key: "technology", label: "핵심 기술·권리", options: ["확인 필요", "특허·R&D·자체 제품 보유", "개발 중", "해당 없음"] },
  { key: "market", label: "고객·시장 검증", options: ["확인 필요", "아이디어 단계", "PoC·실증", "유료고객·수주 계약", "반복매출"] },
  { key: "capital", label: "조달 목적", options: ["대출·보증", "사업화·R&D", "투자유치·스케일업"] },
  { key: "runway", label: "현금 소진·런웨이", options: ["확인 필요", "자금 소진 전 후속조달 필요", "현금흐름 계획 확보"] },
  { key: "ownership", label: "지분구조·기존 투자", options: ["확인 필요", "투자 이력 없음", "기존 투자자·희석 조건 확인 필요", "주주명부·투자조건 확보"] },
  { key: "impact", label: "사회적 성과·공공수요", options: ["확인 필요", "측정지표·실증 수요 있음", "측정지표·수익모델 준비 중"] },
];
export const sectorFields = [
  { key: "registration", label: "농어업경영체 등록", options: ["확인 필요", "등록", "미등록"] },
  { key: "legalForm", label: "사업자 지위", options: ["개인", "영농조합법인", "농업회사법인", "어업법인", "기타 법인"] },
  { key: "activity", label: "주요 품목·업종", options: ["재배·축산", "스마트팜", "어선어업", "양식", "가공", "유통", "서비스"] },
  { key: "license", label: "허가·면허·사업권", options: ["확인 필요", "필요 권리 보유", "취득 준비", "해당 여부 확인 필요"] },
  { key: "assets", label: "농지·어선·시설", options: ["확인 필요", "보유", "임차", "신규 확보 예정"] },
  { key: "sectorPurpose", label: "자금 사용 목적", options: ["운영비·종자·사료·유류", "시설 신축·증설", "시설 개보수·장비", "가공·유통·수출"] },
  { key: "contracts", label: "매출·납품 계약", options: ["확인 필요", "납품·계약재배·수주 있음", "수출 계약 있음", "거래처 확보 중"] },
  { key: "previousFunds", label: "기존 정책자금·보증", options: ["확인 필요", "농어업 전용자금 이용", "일반기업 자금 이용", "양쪽 이용", "없음"] },
];
export function isStartup(type = "") {
  return ["일반 창업", "기술창업", "투자지향 스타트업", "임팩트 스타트업"].includes(type);
}
export function isSector(type = "") {
  return ["농업·농식품", "어업·수산"].includes(type);
}
export function fieldsFor(a: BranchAnswers) {
  const extra = isStartup(a.businessType) ? startupFields.filter(f => f.key !== "impact" || a.businessType === "임팩트 스타트업") : isSector(a.businessType) ? sectorFields : [];
  return [...branchFields, ...extra];
}
export function diagnoseBranch(a: BranchAnswers, restricted = false) {
  if (!branchFields[0].options.includes(a.businessType || "")) return null;
  const unknown = fieldsFor(a).filter(f => !f.options.includes(a[f.key] || "") || a[f.key] === "확인 필요").map(f => f.label);
  const expert = restricted || a.recovery === "자본잠식·복합위험" || a.recoveryEvidence === "회복 근거 부족" || a.runway === "자금 소진 전 후속조달 필요";
  const improve = ["지속적 영업적자", "과다차입·상환부담", "시장수요 감소"].includes(a.recovery || "");
  const stage = expert ? "사업 지속성 정밀진단 필요" : improve ? "추가차입보다 구조개선 우선" : unknown.length ? "추가 정보 확인" : "자금조달 경로 검토";
  const routes: Record<string, string[]> = {
    "일반기업": ["정책융자·보증"],
    "일반 창업": ["창업자금·정책융자", "지역신보·지자체 자금"],
    "기술창업": ["기술보증·IP보증", "R&D·사업화", "정책융자"],
    "투자지향 스타트업": ["R&D·사업화", "TIPS 요건 확인", "VC·오픈이노베이션·후속투자"],
    "임팩트 스타트업": ["정책지원·실증", "공공수요 연계"],
    "농업·농식품": ["농업정책·종합자금·농신보", "스마트팜·시설·가공·유통", "일반 중소기업·수출·R&D 자금"],
    "어업·수산": ["영어·수산정책·시설·양식자금", "보증·이차보전·지자체 수산자금", "일반 중소기업·수출·R&D 자금"],
  };
  const candidates = [...(routes[a.businessType || ""] || [])];
  if (a.capital === "투자유치·스케일업" && a.businessType !== "투자지향 스타트업") candidates.push(a.businessType === "임팩트 스타트업" ? "임팩트 투자" : "투자·스케일업 조건 확인");
  const reason = expert ? "위험요인 또는 회복 근거 부족으로 자동 자금추천을 보류합니다." : improve ? "비용·채무·사업구조와 미수금 회수계획을 먼저 검토합니다." : isStartup(a.businessType) ? "기술·시장검증·성장단계와 현금 소진 계획을 함께 확인합니다. 개발 단계 적자는 원인을 구분합니다." : isSector(a.businessType) ? "경영체·사업권·법인형태를 확인하고 전용자금과 일반기업 자금을 병행 비교합니다." : "매출·상환능력과 현금흐름 회복 근거를 확인합니다.";
  return { stage, expert: expert || improve, hold: expert || improve, reason, missing: unknown,
    routes: expert || improve ? [] : candidates,
    action: expert ? "전문가와 사업 지속성·전환 가능성, 잔존 기술·고객·인력·설비를 검토하세요." : improve ? "원가·고정비, 원리금 일정, 미수금·대표자 자금흐름 개선계획을 준비한 뒤 재진단하세요." : "근거자료와 최신 공식 공고의 자격·접수상태·중복수혜 제한을 확인하세요.",
    source: "추가설계서 v5.0·v5.1·v5.2 / 사용자 직접입력 · 증빙 미검증",
    notice: "공고 기준일·접수상태 미확인. 위 항목은 검토 경로입니다. 검증된 상품·금리·한도 및 비용 비교 결과는 아직 제공하지 않습니다.",
  };
}

