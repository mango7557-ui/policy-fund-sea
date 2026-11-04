import {
  BusinessAddressItem,
  CapitalZoneType,
  MacroRegion,
} from "../domain/schema";

/**
 * 수도권정비계획법 시행령 별표1 기반 법정 권역 매핑 DB
 * - 과밀억제권역 (OVERPOPULATION_CONTROL): 서울특별시 전역, 인천(강화/옹진/경제자유구역 등 일부 제외),
 *   성남, 수원, 안양, 부천, 고양, 의정부, 남양주(일부), 구리, 하남, 과천, 광명, 군포, 의왕, 시흥(반월특수지역 제외)
 * - 성장관리권역 (GROWTH_MANAGEMENT): 화성, 평택, 파주, 김포, 오산, 안성, 포천, 양주, 동두천, 연천, 안산, 용인(일부), 인천 강화/옹진/송도·청라 등
 * - 자연보전권역 (NATURE_PRESERVATION): 이천, 여주, 광주, 양평, 가평, 용인(처인구 일부), 남양주(조안면 등)
 * - 비수도권 (NON_CAPITAL_ZONE): 서울·인천·경기 외 14개 광역시·도 전체
 */
const OVERPOPULATION_SIGUNGU = [
  "성남",
  "수원",
  "안양",
  "부천",
  "고양",
  "의정부",
  "구리",
  "하남",
  "과천",
  "광명",
  "군포",
  "의왕",
  "시흥",
];

const GROWTH_MANAGEMENT_SIGUNGU = [
  "화성",
  "평택",
  "파주",
  "김포",
  "오산",
  "안성",
  "포천",
  "양주",
  "동두천",
  "연천",
  "안산",
  "용인",
  "강화",
  "옹진",
  "송도",
  "청라",
  "영종",
];

const NATURE_PRESERVATION_SIGUNGU = [
  "이천",
  "여주",
  "광주", // 경기도 광주시
  "양평",
  "가평",
];

export function classifySingleAddress(item: BusinessAddressItem): BusinessAddressItem {
  const sidoNorm = item.sido.trim();
  const sigunguNorm = item.sigungu.trim();
  const fullText = `${sidoNorm} ${sigunguNorm} ${item.rawAddress}`;

  // 1. 서울특별시 전역 -> 수도권 / 과밀억제권역
  if (sidoNorm.includes("서울") || fullText.includes("서울특별시") || fullText.includes("서울시")) {
    return {
      ...item,
      macroRegion: "CAPITAL",
      capitalZone: "OVERPOPULATION_CONTROL",
      legalBasisCode: "CAP-LAW-TBL1-OVERPOP-SEOUL",
    };
  }

  // 2. 인천광역시 -> 강화/옹진/경제자유구역(송도·청라·영종)은 성장관리권역, 그 외 일반구는 과밀억제권역
  if (sidoNorm.includes("인천") || fullText.includes("인천광역시")) {
    const isGrowthIncheon = ["강화", "옹진", "송도", "청라", "영종", "서구 검단"].some((kw) =>
      fullText.includes(kw)
    );
    return {
      ...item,
      macroRegion: "CAPITAL",
      capitalZone: isGrowthIncheon ? "GROWTH_MANAGEMENT" : "OVERPOPULATION_CONTROL",
      legalBasisCode: isGrowthIncheon
        ? "CAP-LAW-TBL1-GROWTH-INCHEON"
        : "CAP-LAW-TBL1-OVERPOP-INCHEON",
    };
  }

  // 3. 경기도 -> 자연보전권역 / 과밀억제권역 / 성장관리권역 세분화
  if (sidoNorm.includes("경기") || fullText.includes("경기도")) {
    if (NATURE_PRESERVATION_SIGUNGU.some((kw) => sigunguNorm.includes(kw) || fullText.includes(kw))) {
      return {
        ...item,
        macroRegion: "CAPITAL",
        capitalZone: "NATURE_PRESERVATION",
        legalBasisCode: "CAP-LAW-TBL1-NATURE-GG",
      };
    }
    if (OVERPOPULATION_SIGUNGU.some((kw) => sigunguNorm.includes(kw) || fullText.includes(kw))) {
      return {
        ...item,
        macroRegion: "CAPITAL",
        capitalZone: "OVERPOPULATION_CONTROL",
        legalBasisCode: "CAP-LAW-TBL1-OVERPOP-GG",
      };
    }
    if (GROWTH_MANAGEMENT_SIGUNGU.some((kw) => sigunguNorm.includes(kw) || fullText.includes(kw))) {
      return {
        ...item,
        macroRegion: "CAPITAL",
        capitalZone: "GROWTH_MANAGEMENT",
        legalBasisCode: "CAP-LAW-TBL1-GROWTH-GG",
      };
    }
    // 그 외 경기도 기본값 (남양주 등 일반구간 과밀억제 우선 검토)
    return {
      ...item,
      macroRegion: "CAPITAL",
      capitalZone: "OVERPOPULATION_CONTROL",
      legalBasisCode: "CAP-LAW-TBL1-OVERPOP-GG-DEFAULT",
    };
  }

  // 4. 비수도권 (부산, 대구, 대전, 광주광역시, 울산, 세종, 강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주)
  return {
    ...item,
    macroRegion: "NON_CAPITAL",
    capitalZone: "NON_CAPITAL_ZONE",
    legalBasisCode: "NON-CAPITAL-REGIONAL-PREF",
  };
}

/**
 * 사업체의 복수 주소(본점, 실사업장, 공장, 시설투자 예정지)를 역할별로 분리 분류하고
 * 정책자금 심사 시 유불리 권역 요약을 생성한다.
 */
export function classifyBusinessAddresses(addresses: BusinessAddressItem[]): {
  classified: BusinessAddressItem[];
  hasNonCapitalPresence: boolean;
  hasFactoryOrPlannedInvestment: boolean;
  summaryText: string;
} {
  const classified = addresses.map(classifySingleAddress);

  const hasNonCapitalPresence = classified.some(
    (addr) => addr.macroRegion === "NON_CAPITAL"
  );
  const hasFactoryOrPlannedInvestment = classified.some(
    (addr) => addr.role === "FACTORY" || addr.role === "INVESTMENT_PLANNED"
  );

  const roleLabels: Record<BusinessAddressItem["role"], string> = {
    HEAD_OFFICE: "본점",
    ACTUAL_WORKPLACE: "실사업장",
    FACTORY: "공장",
    INVESTMENT_PLANNED: "시설투자예정지",
  };

  const zoneLabels: Record<CapitalZoneType, string> = {
    OVERPOPULATION_CONTROL: "수도권 과밀억제권역",
    GROWTH_MANAGEMENT: "수도권 성장관리권역",
    NATURE_PRESERVATION: "수도권 자연보전권역",
    NON_CAPITAL_ZONE: "비수도권(지방우대권역)",
  };

  const parts = classified.map((a) => {
    const zLabel = a.capitalZone ? zoneLabels[a.capitalZone] : "미분류";
    return `[${roleLabels[a.role]}] ${a.sido} ${a.sigungu} (${zLabel})`;
  });

  return {
    classified,
    hasNonCapitalPresence,
    hasFactoryOrPlannedInvestment,
    summaryText: parts.join(" / "),
  };
}
