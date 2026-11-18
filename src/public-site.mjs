export const publicOrigin = "https://barunfund.kr";
export const publicOrigins = [
  publicOrigin,
  "https://www.barunfund.kr",
  "https://mango7557-ui.github.io",
];

export function usesPublicPages() {
  if (typeof window === "undefined") return false;
  const { hostname } = window.location;
  return hostname.endsWith(".github.io") || publicOrigins.includes(`https://${hostname}`);
}
