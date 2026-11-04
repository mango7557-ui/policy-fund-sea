import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });

const result = await build({
  entryPoints: ["src/preview.tsx"],
  bundle: true,
  write: false,
  minify: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});

// Relative paths("./jeongchaegi.svg") work on both Firebase Hosting root and GitHub Pages subpaths
const js = result.outputFiles[0].text
  .replaceAll('"/jeongchaegi.svg"', '"./jeongchaegi.svg"')
  .replaceAll('"/jeongchaek-motion.mp4"', '"./jeongchaek-motion.mp4"')
  .replaceAll('"/jeongchaek-motion-poster.jpg"', '"./jeongchaek-motion-poster.jpg"');

await writeFile("dist/app.js", js);
await cp("public", "dist", { recursive: true });

const css = (await readFile("src/app/globals.css", "utf8")).replace(
  '@import "tailwindcss";',
  ""
);
const themeInit = `(function(){try{var t=localStorage.getItem('fundsea-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'dark'}catch(e){document.documentElement.dataset.theme='dark'}})();`;

await writeFile(
  "dist/index.html",
  `<!doctype html><html lang="ko" data-theme="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>정책 자금바다 · 정책이와 함께하는 AI 정책자금 진단</title><script>${themeInit}</script><style>${css}</style></head><body><div id="root"></div><script src="./app.js"></script></body></html>`
);
await writeFile("dist/.nojekyll", "");

console.log("Built static bundle in dist/ for Firebase Hosting & GitHub Pages");
