"use client";

import { useEffect, useRef, useState } from "react";

export function MascotMotion() {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const resume = () => {
      if (!video.current) return;
      if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { video.current.pause(); return; }
      video.current.muted = true;
      void video.current.play().catch(() => { /* Retry on the next user gesture. */ });
    };
    resume();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    motion.addEventListener("change", resume);
    document.addEventListener("visibilitychange", resume);
    document.addEventListener("pointerdown", resume);
    document.addEventListener("keydown", resume);
    return () => {
      motion.removeEventListener("change", resume);
      document.removeEventListener("visibilitychange", resume);
      document.removeEventListener("pointerdown", resume);
      document.removeEventListener("keydown", resume);
    };
  }, []);

  return <div className="mascot-motion">
    {failed ? <img src="/jeongchaek-motion-poster.jpg" alt="정책이 캐릭터" width={260} height={260}/> : <video
      ref={video}
      src="/jeongchaek-motion.mp4"
      poster="/jeongchaek-motion-poster.jpg"
      autoPlay muted loop playsInline preload="metadata" controls={false} disablePictureInPicture width={260} height={260}
      onLoadedData={() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { video.current?.pause(); return; }
        if (video.current) video.current.muted = true;
        void video.current?.play().catch(() => { /* Browser policy may require a user gesture. */ });
      }}
      aria-label="인사하는 정책이 캐릭터 영상"
      onError={() => setFailed(true)}
    />}
  </div>;
}
