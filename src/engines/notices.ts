export type Notice = {
  id: string; title: string; institution: string; source_url: string; summary: string;
  regions: string[]; sectors: string[]; starts_on: string | null; ends_on: string | null;
  status: "pending" | "verified" | "closed" | "rejected"; revision: number;
  verified_at: string | null; review_note: string;
};
export const koreaDate = (date = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(date);
export function isCurrentNotice(n: Notice, today = koreaDate()) {
  return n.status === "verified" && Boolean(n.verified_at) && (!n.starts_on || n.starts_on <= today) && (!n.ends_on || n.ends_on >= today);
}
export function matchesNotice(n: Notice, region: string, sector: string) {
  return (!region || !n.regions.length || n.regions.includes("전국") || n.regions.some(r => region.includes(r) || r.includes(region)))
    && (!sector || !n.sectors.length || n.sectors.includes("전체") || n.sectors.some(s => sector.includes(s) || s.includes(sector)));
}
export function safeOfficialLink(url: string) {
  try { const u = new URL(url); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function threeMonthsLater(date = new Date()) {
  const [y,m,d] = koreaDate(date).split("-").map(Number);
  const target = new Date(Date.UTC(y,m+2,1));
  const last = new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(d,last));
  return target.toISOString().slice(0,10);
}
