import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
import { readStyles, renderPage, staticBuildOptions } from "./build-static.mjs";

// A classic standalone bundle also works when someone opens preview.html via file://.
const [styles] = await Promise.all([
  readStyles(),
  build({
    ...await staticBuildOptions("./public/"),
    entryPoints: ["src/preview.tsx"],
    format: "iife",
    minify: true,
    outfile: "preview-app.js",
  }),
]);
await writeFile("preview.html", renderPage({
  styles: `<style>${styles}</style>`,
  scriptTag: '<script src="./preview-app.js"></script>',
}));
console.log("Generated preview.html and its standalone bundle.");
