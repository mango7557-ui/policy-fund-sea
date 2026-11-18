import type { Metadata } from "next";
import "./globals.css";
import "./editorial.css";
import "./admin.css";
import "./maritime.css";
import "./landing-entry.css";
import "./landing-details.css";

export const metadata: Metadata = {
  title: "바른자금 | 기업 자금조달 진단과 상담",
  description: "기업의 자금 용도와 경영 상황을 바탕으로 바른자금에서 자금조달 방향, 판단 근거와 준비할 서류를 확인하세요.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" data-theme="light" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('bareunfund-theme')||localStorage.getItem('fundsea-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'light'}catch(e){document.documentElement.dataset.theme='light'}})();` }}/></head>
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
