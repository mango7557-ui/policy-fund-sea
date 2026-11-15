"use client";
import { useEffect, useState } from "react";
import FundSeaExperience from "./FundSeaExperience";
import LearningAdmin from "./LearningAdmin";

export default function ExperienceRouter() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    const update = () => { const next = window.location.hash === "#admin" || window.location.hash === "#admin-content"; setAdmin(next); if (next && window.location.hash === "#admin") window.scrollTo(0, 0); };
    update(); window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return admin ? <LearningAdmin /> : <FundSeaExperience />;
}
