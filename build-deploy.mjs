import { build } from "esbuild";
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { readStyles, renderLanding, renderPage, staticBuildOptions } from "./build-static.mjs";

const options = await staticBuildOptions("./");
const [bundle, css, body] = await Promise.all([
  build({
    ...options,
    entryPoints: { app: "src/preview.tsx" },
    outdir: "dist",
    chunkNames: "assets/[name]-[hash]",
    format: "esm",
    splitting: true,
    metafile: true,
    minify: true,
    write: false,
  }),
  readStyles(),
  renderLanding(options),
]);

const outputs = bundle.outputFiles.map(file => ({
  name: path.relative("dist", file.path),
  contents: file.contents,
}));
const entry = outputs.find(file => file.name === "app.js");
const version = bytes => createHash("sha256").update(bytes).digest("hex").slice(0, 12);
// Start fetching shared dependencies alongside the entry. The admin import
// remains on demand when someone follows the management link.
const preloads = bundle.metafile.outputs["dist/app.js"].imports
  .filter(dependency => dependency.kind === "import-statement")
  .map(dependency => `<link rel="modulepreload" href="./${path.posix.relative("dist", dependency.path)}">`)
  .join("\n");
const html = renderPage({
  body,
  published: true,
  styles: `<link rel="stylesheet" href="./site.css?v=${version(css)}">`,
  scriptTag: `<script type="module" src="./app.js?v=${version(entry.contents)}"></script>`,
  preloads,
});

for (const target of ["dist", "docs"]) {
  const assetsPath = path.join(target, "assets");
  await mkdir(assetsPath, { recursive: true });
  await cp("public", target, { recursive: true });
  await Promise.all(outputs.map(file => writeFile(path.join(target, file.name), file.contents)));
  await writeFile(path.join(target, "site.css"), css);
  await writeFile(path.join(target, "index.html"), html);
  await writeFile(path.join(target, ".nojekyll"), "");

  const currentFiles = new Set(outputs.map(file => path.basename(file.name)));
  const oldChunks = (await readdir(assetsPath)).filter(name =>
    /^[\w-]+-[A-Z0-9]{8}\.js$/.test(name) && !currentFiles.has(name)
  );
  await Promise.all(oldChunks.map(name => unlink(path.join(assetsPath, name))));
}
console.log("Built the public site in dist/ and docs/.");
