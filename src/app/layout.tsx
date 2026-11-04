import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "정책 자금바다 | AI 기반 맞춤형 정책자금 진단 및 조달 경로 추천",
  description:
    "공공 마이데이터 우선(MyData First) 기업 데이터 엔진과 최신 정책 룰 엔진을 결합하여 최소 질문(NBQ)으로 맞춤형 정책자금 조달 시나리오를 산출합니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" data-theme="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('fundsea-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'dark'}catch(e){document.documentElement.dataset.theme='dark'}})();` }}/></head>
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
