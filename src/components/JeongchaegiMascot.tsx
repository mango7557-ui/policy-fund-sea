"use client";

import React from "react";

interface JeongchaegiMascotProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

/**
 * '정책이' 공식 3D 마스코트 캐릭터 컴포넌트
 * - 화이트·아이스블루 3D 공문서 몸통 + 우상단 접힌 귀퉁이
 * - 동그란 눈, 파란 눈썹, 다정한 미소
 * - 우하단 태극 정책인증 스탬프 직인
 * - 파란 팔·다리·스니커즈 & 왼손 위 반짝이는 AI 말풍선(✦)
 */
export function JeongchaegiMascot({
  size = "md",
  className = "",
}: JeongchaegiMascotProps) {
  const sizeClass =
    size === "sm"
      ? "w-8 h-8"
      : size === "md"
      ? "w-11 h-11"
      : size === "lg"
      ? "w-16 h-16"
      : "w-24 h-24";

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none shrink-0 ${sizeClass} ${className}`}
      title="정책이 (정책 자금바다 AI 마스코트)"
    >
      <img
        src="/jeongchaegi.svg"
        alt="정책이 캐릭터"
        className="w-full h-full object-contain drop-shadow-sm"
      />
    </div>
  );
}
