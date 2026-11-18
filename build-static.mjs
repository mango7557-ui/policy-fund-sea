import { build, transform } from "esbuild";
import { mkdtemp, readFile, readdir, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { publicOrigin } from "./src/public-site.mjs";

export const siteTitle = "바른자금 | 기업 자금조달 진단과 상담";
export const siteDescription = "기업의 자금 용도와 경영 상황을 바탕으로 바른자금에서 자금조달 방향, 판단 근거와 준비할 서류를 확인하세요.";
const siteUrl = publicOrigin + "/";
const themeInit = `(function(){try{var t=localStorage.getItem('bareunfund-theme')||localStorage.getItem('fundsea-theme');document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}})();`;
const stylesheets = ["globals.css", "editorial.css", "admin.css", "maritime.css", "landing-entry.css", "landing-details.css"];

export async function readStyles() {
  const sheets = await Promise.all(stylesheets.map(file => readFile(`src/app/${file}`, "utf8")));
  const source = sheets.join("\n").replace('@import "tailwindcss";', "");
  const { code } = await transform(source, { loader: "css", minify: true, charset: "utf8" });
  return code;
}

// Next serves public assets at the root. GitHub Pages uses a project subpath,
// and a local preview.html opens next to the public/ folder.
export async function staticBuildOptions(assetPrefix) {
  const publicFiles = (await readdir("public", { withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => entry.name);
  return {
    bundle: true,
    jsx: "automatic",
    charset: "utf8",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{
      name: "public-file-paths",
      setup(builder) {
        builder.onLoad({ filter: /\.tsx$/ }, async ({ path: sourcePath }) => {
          let contents = await readFile(sourcePath, "utf8");
          for (const name of publicFiles) {
            for (const prefix of ["/", "./"]) {
              contents = contents.replaceAll('"' + prefix + name + '"', '"' + assetPrefix + name + '"');
            }
          }
          return { contents, loader: "tsx", resolveDir: path.dirname(sourcePath) };
        });
      },
    }],
  };
}

export async function renderLanding(options) {
  const directory = await mkdtemp(path.resolve(".render-"));
  const file = path.join(directory, "landing.cjs");
  try {
    await build({
      ...options,
      stdin: {
        contents: `import { createElement } from 'react';
          import { renderToString } from 'react-dom/server';
          import ExperienceRouter from './src/components/ExperienceRouter';
          export default () => renderToString(createElement(ExperienceRouter));`,
        resolveDir: process.cwd(),
      },
      platform: "node",
      format: "cjs",
      packages: "external",
      outfile: file,
    });
    return createRequire(import.meta.url)(file).default();
  } finally {
    await unlink(file).catch(error => { if (error.code !== "ENOENT") throw error; });
    await rmdir(directory);
  }
}

export function renderPage({ body = "", scriptTag, styles, preloads = "", published = false }) {
  const shareMetadata = published ? `
    <link rel="canonical" href="${siteUrl}">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="ko_KR">
    <meta property="og:site_name" content="바른자금">
    <meta property="og:title" content="${siteTitle}">
    <meta property="og:description" content="${siteDescription}">
    <meta property="og:url" content="${siteUrl}">
    <meta property="og:image" content="${siteUrl}bareun-brand.png">
    <meta property="og:image:alt" content="바른자금 BAREUN FUND">
    <meta name="twitter:card" content="summary">` : "";
  return `<!doctype html>
<html lang="ko" data-theme="light">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${siteTitle}</title>
    <meta name="description" content="${siteDescription}">${shareMetadata}
    <script>${themeInit}</script>
    ${styles}${preloads}
  </head>
  <body>
    <noscript><p>상담과 입력 기능을 사용하려면 브라우저에서 자바스크립트를 켜 주세요.</p></noscript>
    <div id="root">${body}</div>
    ${scriptTag}
  </body>
</html>\n`;
}
