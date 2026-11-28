import { CompanyProfile, profileFields } from "../engines/company-profile";
export function CompanyProfileFields({value, onChange}: {value: CompanyProfile; onChange: (p: CompanyProfile) => void}) {
  function set(key: string, input: string) {
    const next = {...value, [key]:input};
    const visible = new Set(profileFields(next).map(f => f.key));
    onChange(Object.fromEntries(Object.entries(next).filter(([k,v]) => visible.has(k) && v)));
  }
  return <details className="document-tools"><summary>사업자등록 · 세무·회계 정보</summary><div className="document-tool-body">
    <p>등록증이나 신고 자료를 보고 아는 항목만 입력해 주세요. 회원 보관함에 저장하면 입력한 내용도 보고서에 포함됩니다. 관리번호에는 기업과 사업장을 구분할 이름이나 번호를 사용할 수 있어요.</p>
    <div className="funding-needs-grid">{profileFields(value).map(f => <label key={f.key}>{f.label}
      {f.options ? <select value={value[f.key] || ""} onChange={e=>set(f.key,e.target.value)}><option value="">선택해 주세요</option>{f.options.map(o=><option key={o}>{o}</option>)}</select>
      : <input maxLength={f.key.toLowerCase().includes("year") ? 4 : 120} value={value[f.key] || ""} onChange={e=>set(f.key,e.target.value)}/>}</label>)}</div></div></details>;
}
