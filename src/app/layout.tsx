import type { Metadata } from "next";
import "./globals.css";
import "./editorial.css";
import "./admin.css";
import "./maritime.css";

export const metadata: Metadata = {
  title: "바른자금 | 우리 기업의 자금 기회",
  description: "바른 정보로 찾는, 우리 기업의 자금 기회. 정책자금과 지원정보를 쉽게 살펴보세요.",
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
