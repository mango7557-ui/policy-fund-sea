export type CompanyProfile = Partial<Record<string, string>>;
const forms = ["개인사업자", "공동사업자", "영리법인", "사단법인", "재단법인", "기타 비영리법인", "법인으로 보는 단체", "임의단체", "영농조합법인", "농업회사법인", "영어조합법인", "어업회사법인", "외국법인 국내사업장", "기타"];
const yesNo = ["예", "아니요", "확인 필요"];
type Field = { key: string; label: string; options?: string[] };
export function profileFields(p: CompanyProfile): Field[] {
  const individual = ["개인사업자", "공동사업자"].includes(p.form || "");
  const nonprofit = /단체|비영리|사단|재단/.test(p.form || "");
  const fields: Field[] = [
    { key: "tradeName", label: "상호" }, { key: "representative", label: "등록증에 적힌 대표자" },
    { key: "registrationNo", label: "사업자등록번호" }, {key:"opened",label:"개업일"}, {key:"address",label:"등록된 사업장 주소"},
    { key: "companyId", label: "기업 관리번호 (같은 기업에는 같은 번호)" },
    { key: "siteId", label: "사업장 관리번호" },
    { key: "form", label: "어떤 형태로 등록했나요?", options: forms },
    { key: "place", label: "어떤 사업장인가요?", options: ["본점·주사무소", "지점", "기타 사업장"] },
    { key: "unit", label: "여러 사업장의 세금을 본점에서 함께 신고하나요?", options: yesNo },
    { key: "vat", label: "등록증에 적힌 과세유형은 무엇인가요?", options: ["일반과세", "간이과세", "면세", "과세·면세 겸업", "고유번호만 보유", "확인 필요"] },
  ];
  if (p.place === "지점" || p.place === "기타 사업장") fields.push({key:"head", label:"본점 관리번호"}, {key:"applicant",label:"누가 신청하나요?",options:["본점","해당 사업장","확인 필요"]});
  if (p.unit === "예") fields.push({key:"sites",label:"함께 신고하는 사업장 관리번호"});
  if (p.form?.includes("법인") && !p.form.includes("단체")) fields.push({key:"corporateNo",label:"법인등록번호"});
  if (nonprofit) fields.push({key:"revenue",label:"수익사업을 따로 등록했나요?",options:yesNo});
  fields.push({key:"year",label:"세무자료 기준연도"}, {key:"books",label:"복식부기의무 대상인가요?",options:yesNo}, {key:"adjust",label:"세무 신고 때 외부조정을 받나요?",options:yesNo});
  if (individual) fields.push({key:"filing",label:"성실신고확인 대상인가요?",options:yesNo});
  if (p.form && !individual) fields.push({key:"audit",label:"외부감사 대상인가요?",options:yesNo});
  if (p.audit === "예" && !individual) fields.push({key:"auditReport",label:"최근 감사보고서가 있나요?",options:yesNo});
  if (p.audit === "예" && !individual && p.auditReport === "예") fields.push({key:"auditYear",label:"감사보고서 연도"}, {key:"opinion",label:"보고서에 적힌 감사의견은 무엇인가요?",options:["적정","한정","부적정","의견거절","확인 필요"]}, {key:"continuity",label:"계속기업 불확실성이나 강조사항이 있나요?",options:yesNo});
  fields.push({key:"region",label:"사업장 지역"}, {key:"sector",label:"주요 업종"}, {key:"period",label:"실적 기준기간 (예: 2026년 3분기)"},
    {key:"sales",label:"기준기간 매출 (만원)"}, {key:"debt",label:"기말 차입 잔액 (만원)"}, {key:"guarantee",label:"기말 보증 잔액 (만원)"});
  return fields;
}
export function profileAssessment(p: CompanyProfile) {
  const notes: string[] = [];
  let hold = false;
  if (/단체|비영리|사단|재단|외국|기타/.test(p.form || "") || p.vat === "고유번호만 보유") { hold = true; notes.push("신청주체와 수익사업 등록을 확인한 후 지원사업·보조금 등 대상 공고를 별도로 검토하세요."); }
  if (p.form === "공동사업자") notes.push("공동사업자 간 신청 권한과 대표자를 확인하세요.");
  if (p.place === "지점" || p.place === "기타 사업장" || p.unit === "예") notes.push("본점과 사업장을 연결하고 신청주체, 사업장별 매출과 중복신청 여부를 확인하세요.");
  if (p.vat === "면세" || p.vat === "과세·면세 겸업") notes.push("면세 매출 자료를 별도로 확인하세요. 부가세 신고자료만으로 전체 매출을 판단할 수 없습니다.");
  if (p.vat === "간이과세") notes.push("매출 증빙과 소상공인·지역 공고의 요건을 확인하세요.");
  if (p.filing === "예" || p.books === "예" || p.adjust === "예") notes.push("해당 연도 신고서·장부와 조정 자료를 확인하세요. 신고 유형은 승인 가점으로 계산하지 않습니다.");
  if (p.audit === "예") notes.push("감사 연도와 공식 감사보고서 원문을 대조하세요. 입력한 감사의견은 확인 전입니다.");
  if (p.audit === "예" && p.auditReport === "예" && (["한정","부적정","의견거절"].includes(p.opinion || "") || p.continuity === "예")) { hold = true; notes.push("입력한 감사정보에 확인할 위험 신호가 있어 공식 보고서와 전문가 검토가 필요합니다."); }
  return { hold, notes };
}
