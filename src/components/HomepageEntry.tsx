"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownRight, ArrowRight, Banknote, Check, CircleHelp, Factory, Menu, Repeat2, X,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

const links = [
  ["#consultation", "AI 자금진단"],
  ["#how", "이용 방법"],
  ["#plans", "진단 서비스"],
  ["#cases", "상담 사례"],
  ["#success-cases", "성공 사례"],
  ["#partners", "파트너사"],
  ["#faq", "자주 묻는 질문"],
] as const;

const topics = [
  { label: "운영자금", detail: "인건비·원재료비", icon: Banknote, prompt: "운영자금이 필요해요. 어떤 조건부터 확인하면 될까요?" },
  { label: "시설자금", detail: "기계·시설 구입", icon: Factory, prompt: "기계나 설비를 마련할 시설자금을 알아보고 있어요." },
  { label: "대출 재정비", detail: "이자·상환 부담", icon: Repeat2, prompt: "기존 대출의 이자와 상환 부담을 줄일 방법을 알고 싶어요." },
  { label: "아직 고민 중", detail: "가능한 방향 찾기", icon: CircleHelp, prompt: "어떤 자금이 맞을지 아직 모르겠어요. 우리 기업의 상황부터 이야기하고 싶어요." },
] as const;

export function SiteHeader({ onStart }: { onStart: () => void }) {
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const wide = window.matchMedia("(min-width: 1101px)");
    const closeOnDesktop = () => { if (wide.matches) setOpen(false); };
    wide.addEventListener("change", closeOnDesktop);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      wide.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <header className="bf-header" ref={header}>
      <div className="bf-header-inner">
        <a className="bf-logo" href="#diagnosis" aria-label="바른자금 홈" onClick={() => setOpen(false)}>
          <img src="./bareun-brand.webp" alt="바른자금 BAREUN FUND" width="600" height="200" />
        </a>
        <nav className="bf-desktop-nav" aria-label="주 메뉴">
          {links.map(([href, title]) => <a key={href} href={href}>{title}</a>)}
        </nav>
        <div className="bf-header-actions">
          <ThemeToggle />
          <button className="bf-header-start" onClick={() => { setOpen(false); onStart(); }}>무료 진단 <ArrowRight size={15} aria-hidden="true" /></button>
          <button className="bf-menu-toggle" type="button" ref={toggle}
            aria-label={open ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={open} aria-controls="bf-mobile-menu"
            onClick={() => setOpen(!open)}>{open ? <X size={21} /> : <Menu size={21} />}</button>
        </div>
      </div>
      <nav id="bf-mobile-menu" className="bf-mobile-nav" aria-label="모바일 주 메뉴" hidden={!open}>
        {links.map(([href, title]) => <a key={href} href={href} onClick={() => setOpen(false)}>{title}<ArrowRight size={15} aria-hidden="true" /></a>)}
      </nav>
    </header>
  );
}

export function FundingEntry({ onStart, onTopic, busy }: {
  onStart: () => void;
  onTopic: (prompt: string) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState(0);
  return (
    <div className="bf-entry">
      <div className="bf-tide" aria-hidden="true" />
      <div className="bf-entry-inner">
        <div className="bf-intro">
          <p className="bf-audience">중소기업 · 소상공인 자금 상담</p>
          <h1>사업에 필요한 자금,<br /><em>어디서 시작할까요?</em></h1>
          <p className="bf-intro-copy">기업 상황과 자금 용도를 들려주세요.<br />검토할 자금 방향과 그 이유, 준비할 자료를 짚어드립니다.</p>
          <p className="bf-trust">프라임경영기술(주) · 중소벤처기업부 등록 중소기업상담회사 제2022-651호<br />경영지도사 기반 진단 · 협회 전문가 네트워크 · FDSS 분석과 AI 설명</p>
          <div className="bf-intro-actions">
            <button type="button" onClick={onStart}>직접 질문하기 <ArrowRight size={18} aria-hidden="true" /></button>
            <a href="#how">진단 절차 보기 <ArrowDownRight size={16} aria-hidden="true" /></a>
          </div>
        </div>
        <form className="bf-intake" onSubmit={(event) => { event.preventDefault(); if (!busy) onTopic(topics[selected].prompt); }}>
          <p className="bf-intake-kicker"><span />무료 사전 진단</p>
          <fieldset>
            <legend>어떤 자금이 필요하세요?</legend>
            <div className="bf-topic-grid">
              {topics.map(({ label, detail, icon: Icon }, index) => (
                <label className="bf-topic" key={label}>
                  <input type="radio" name="funding-topic" value={label} checked={index === selected} onChange={() => setSelected(index)} />
                  <span className="bf-topic-face">
                    <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
                    <span className="bf-topic-text"><strong>{label}</strong><small>{detail}</small></span>
                    <span className="bf-topic-check"><Check size={9} strokeWidth={3.5} aria-hidden="true" /></span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button className="bf-topic-submit" type="submit" disabled={busy}>
            {busy ? "상담 답변을 작성하고 있어요" : "이 주제로 상담 시작"} <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
