import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await mkdir("docs", { recursive: true });

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

const css = (await Promise.all(["globals.css", "editorial.css", "admin.css", "maritime.css"].map(name => readFile(`src/app/${name}`, "utf8")))).join("\n").replace(
  '@import "tailwindcss";',
  ""
);
const themeInit = `(function(){try{var t=localStorage.getItem('bareunfund-theme')||localStorage.getItem('fundsea-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'light'}catch(e){document.documentElement.dataset.theme='light'}})();`;

const htmlContent = `<!doctype html><html lang="ko" data-theme="light"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>바른자금 · 우리 기업의 자금 기회</title><meta name="description" content="바른 정보로 찾는, 우리 기업의 자금 기회"><script>${themeInit}</script><style>${css}</style></head><body><div id="root"></div><script src="./app.js"></script></body></html>`;

await writeFile("dist/index.html", htmlContent);
await writeFile("dist/.nojekyll", "");

await writeFile("docs/app.js", js);
await cp("public", "docs", { recursive: true });
await writeFile("docs/index.html", htmlContent);
await writeFile("docs/.nojekyll", "");

console.log("Built static bundle in dist/ (Firebase Hosting) & docs/ (GitHub Pages)");
