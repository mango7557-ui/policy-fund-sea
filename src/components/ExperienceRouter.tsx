"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import FundSeaExperience from "./FundSeaExperience";

const LearningAdmin = lazy(() => import("./LearningAdmin").catch(() => ({
  default: function AdminLoadError() {
    return (
      <main>
        <h1>학습 관리 화면을 불러오지 못했습니다</h1>
        <p>인터넷 연결을 확인한 뒤 다시 시도해 주세요.</p>
        <button type="button" onClick={() => window.location.reload()}>다시 불러오기</button>
        <a href="#diagnosis">상담으로 돌아가기</a>
      </main>
    );
  },
})));

export default function ExperienceRouter() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    const update = () => {
      const hash = window.location.hash;
      setAdmin(hash === "#admin" || hash === "#admin-content");
      if (hash === "#admin") window.scrollTo(0, 0);
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  if (!admin) return <FundSeaExperience />;
  return (
    <Suspense fallback={<main role="status">학습 관리 화면을 불러오고 있습니다…</main>}>
      <LearningAdmin />
    </Suspense>
  );
}
