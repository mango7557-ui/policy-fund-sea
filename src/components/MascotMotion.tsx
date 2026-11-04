"use client";

import { useEffect, useRef, useState } from "react";

export function MascotMotion() {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const resume = () => {
      if (document.hidden || !video.current) return;
      video.current.muted = true;
      void video.current.play().catch(() => { /* Retry on the next user gesture. */ });
    };
    resume();
    document.addEventListener("visibilitychange", resume);
    document.addEventListener("pointerdown", resume);
    document.addEventListener("keydown", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      document.removeEventListener("pointerdown", resume);
      document.removeEventListener("keydown", resume);
    };
  }, []);

  return <div className="mascot-motion">
    {failed ? <img src="/jeongchaek-motion-poster.jpg" alt="정책이 캐릭터"/> : <video
      ref={video}
      src="/jeongchaek-motion.mp4"
      poster="/jeongchaek-motion-poster.jpg"
      autoPlay muted loop playsInline preload="auto" controls={false} disablePictureInPicture
      onLoadedData={() => {
        if (video.current) video.current.muted = true;
        void video.current?.play().catch(() => { /* Browser policy may require a user gesture. */ });
      }}
      aria-label="인사하는 정책이 캐릭터 영상"
      onError={() => setFailed(true)}
    />}
  </div>;
}
