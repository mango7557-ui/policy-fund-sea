import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import ExperienceRouter from "./components/ExperienceRouter";

const root = document.getElementById("root")!;
if (root.hasChildNodes()) {
  hydrateRoot(root, <ExperienceRouter />);
} else {
  createRoot(root).render(<ExperienceRouter />);
}
