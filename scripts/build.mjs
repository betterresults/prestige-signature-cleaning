// Builds every page from content/ into dist/. Run by Netlify on each publish.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderPage, minifyCss, sitemap } from "../admin/render.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const state = {
  site: JSON.parse(read("content/site.json")),
  services: JSON.parse(read("content/services.json")),
  pages: JSON.parse(read("content/pages.json")),
  html: {},
  cssMin: minifyCss(read("styles.css"))
};
for (const f of readdirSync(join(root, "content/pages"))) state.html[f] = read(`content/pages/${f}`);
// static files that go to the website as they are
const out = join(root, "dist");
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const p of ["images", "fonts", "video", "admin", "styles.css", "london-map.js", "london-boroughs.js"]) {
  if (existsSync(join(root, p))) cpSync(join(root, p), join(out, p), { recursive: true });
}
let n = 0;
for (const file of Object.keys(state.pages)) {
  const html = renderPage(state, file);
  if (html == null) { console.warn("skipped", file); continue; }
  writeFileSync(join(out, file), html);
  n++;
}
writeFileSync(join(out, "sitemap.xml"), sitemap(state, "https://prestigesignaturecleaning.co.uk"));
writeFileSync(join(out, "robots.txt"), "User-agent: *\nDisallow: /admin/\nSitemap: https://prestigesignaturecleaning.co.uk/sitemap.xml\n");
console.log(`built ${n} pages`);
