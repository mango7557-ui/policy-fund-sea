"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const sync = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem("fundsea-theme"); } catch { /* Storage may be unavailable in previews. */ }
      const next = saved === "light" || saved === "dark" ? saved : "dark";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    sync();
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("storage", sync); };
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem("fundsea-theme", next); } catch { /* Keep the in-session choice. */ }
  };
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label={theme === "dark" ? "화이트 모드로 전환" : "다크 모드로 전환"} title={theme === "dark" ? "화이트 모드로 전환" : "다크 모드로 전환"}>
    {theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}
    <span>{theme === "dark" ? "화이트" : "다크"}</span>
  </button>;
}
