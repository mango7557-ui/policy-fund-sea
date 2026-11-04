import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";

// Generate the preview from the same React UI, rather than maintaining a second app.
const result = await build({
  entryPoints: ["src/preview.tsx"], bundle: true, write: false,
  minify: true, format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const js = result.outputFiles[0].text.replaceAll('"/jeongchaegi.svg"', '"public/jeongchaegi.svg"').replaceAll('"/jeongchaek-motion.mp4"', '"public/jeongchaek-motion.mp4"').replaceAll('"/jeongchaek-motion-poster.jpg"', '"public/jeongchaek-motion-poster.jpg"');
await writeFile("preview-app.js", js);
const css = (await readFile("src/app/globals.css", "utf8")).replace('@import "tailwindcss";', "");
const themeInit = `(function(){try{var t=localStorage.getItem('fundsea-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'dark'}catch(e){document.documentElement.dataset.theme='dark'}})();`;
await writeFile("preview.html", `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>정책 자금바다 · 정책이와 함께하는 자금진단</title><script>${themeInit}</script><style>${css}</style></head><body><div id="root"></div><script src="preview-app.js"></script></body></html>`);
console.log("Preview generated from FundSeaExperience: preview.html + preview-app.js");
