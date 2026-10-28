// Prestige Signature Cleaning visual editor API
// Env vars (Netlify): ADMIN_PASSWORD, ADMIN_SECRET, GITHUB_TOKEN, GITHUB_REPO (owner/name), GITHUB_BRANCH (default main)
// Drafts and draft images live in Netlify Blobs, so saving never triggers a deploy. Publish = one commit = one deploy.
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const GH = "https://api.github.com";
const REPO = process.env.GITHUB_REPO || "betterresults/prestige-signature-cleaning";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN_TTL = 1000 * 60 * 60 * 12;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const store = () => getStore({ name: "psc-admin", consistency: "strong" });

function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", process.env.ADMIN_SECRET || "").update(data).digest("base64url");
  return `${data}.${mac}`;
}
function verify(token) {
  if (!token || !process.env.ADMIN_SECRET) return false;
  const [data, mac] = token.split(".");
  if (!data || !mac) return false;
  const good = crypto.createHmac("sha256", process.env.ADMIN_SECRET).update(data).digest("base64url");
  if (good.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(mac))) return false;
  try { return JSON.parse(Buffer.from(data, "base64url").toString()).exp > Date.now(); } catch { return false; }
}
function safeEqual(a, b) {
  return crypto.timingSafeEqual(crypto.createHash("sha256").update(String(a)).digest(), crypto.createHash("sha256").update(String(b)).digest());
}
async function gh(path, opts = {}) {
  const r = await fetch(`${GH}/repos/${REPO}/${path}`, {
    ...opts,
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "psc-admin", ...(opts.headers || {}) }
  });
  const body = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.message || `GitHub error ${r.status}`);
  return body;
}
// personal logins: ask Netlify Identity who the bearer token belongs to
async function identityUser(req) {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${new URL(req.url).origin}/.netlify/identity/user`, { headers: { authorization: h } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
const safeFile = (f) => /^[a-z0-9][a-z0-9-]*\.html$/.test(f);
const safeImg = (f) => /^[a-z0-9][a-z0-9-]*\.(webp|jpg|jpeg|png|svg|gif)$/.test(f);

async function head() {
  const ref = await gh(`git/ref/heads/${BRANCH}`);
  const commit = await gh(`git/commits/${ref.object.sha}`);
  const tree = await gh(`git/trees/${commit.tree.sha}?recursive=1`);
  return { sha: ref.object.sha, treeSha: commit.tree.sha, tree: tree.tree };
}

async function loadContent() {
  const { sha, tree } = await head();
  const files = tree.filter((t) => t.type === "blob" && (t.path.startsWith("content/") || t.path === "styles.css"));
  const out = { site: null, services: null, pages: null, html: {}, css: "" };
  await Promise.all(files.map(async (t) => {
    const b = await gh(`git/blobs/${t.sha}`);
    const text = Buffer.from(b.content, "base64").toString("utf8");
    if (t.path === "content/site.json") out.site = JSON.parse(text);
    else if (t.path === "content/services.json") out.services = JSON.parse(text);
    else if (t.path === "content/pages.json") out.pages = JSON.parse(text);
    else if (t.path === "styles.css") out.css = text;
    else if (t.path.startsWith("content/pages/")) out.html[t.path.slice(14)] = text;
  }));
  const images = tree.filter((t) => t.type === "blob" && /^images\/[^/]+$/.test(t.path) && /\.(webp|jpe?g|png|svg|gif)$/i.test(t.path)).map((t) => ({ name: t.path.slice(7), size: t.size }));
  return { sha, content: out, images };
}

async function publish(draft, message) {
  const { sha, treeSha, tree } = await head();
  const entries = [];
  const text = (path, content) => entries.push({ path, mode: "100644", type: "blob", content });
  text("content/site.json", JSON.stringify(draft.site, null, 1));
  text("content/services.json", JSON.stringify(draft.services, null, 1));
  text("content/pages.json", JSON.stringify(draft.pages, null, 1));
  for (const [f, html] of Object.entries(draft.html || {})) {
    if (!safeFile(f)) throw new Error(`Bad page name ${f}`);
    text(`content/pages/${f}`, html);
  }
  // pages removed in the editor
  for (const t of tree) {
    if (t.type === "blob" && t.path.startsWith("content/pages/") && !(t.path.slice(14) in (draft.html || {}))) {
      entries.push({ path: t.path, mode: "100644", type: "blob", sha: null });
    }
  }
  // draft images that the published pages actually use
  const used = JSON.stringify(draft);
  const s = store();
  const imgs = (draft.images || []).filter((f) => safeImg(f) && used.includes(`images/${f}`));
  for (const f of imgs) {
    const data = await s.get(`img/${f}`, { type: "arrayBuffer" });
    if (!data) continue;
    const blob = await gh("git/blobs", { method: "POST", body: JSON.stringify({ content: Buffer.from(data).toString("base64"), encoding: "base64" }) });
    entries.push({ path: `images/${f}`, mode: "100644", type: "blob", sha: blob.sha });
  }
  const newTree = await gh("git/trees", { method: "POST", body: JSON.stringify({ base_tree: treeSha, tree: entries }) });
  if (newTree.sha === treeSha) return { sha, unchanged: true };
  const commit = await gh("git/commits", { method: "POST", body: JSON.stringify({ message: message || "Update website from editor", tree: newTree.sha, parents: [sha] }) });
  await gh(`git/refs/heads/${BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
  return { sha: commit.sha };
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Bad request" }); }
  const { action } = body;

  if (action === "login") {
    if (!process.env.ADMIN_PASSWORD) return json(500, { error: "Admin password is not set up yet." });
    await new Promise((r) => setTimeout(r, 400));
    if (!safeEqual(body.password || "", process.env.ADMIN_PASSWORD)) return json(401, { error: "Wrong password" });
    return json(200, { token: sign({ exp: Date.now() + TOKEN_TTL }) });
  }
  if (!verify(req.headers.get("x-admin-token")) && !(await identityUser(req))) return json(401, { error: "Please log in again" });
  if (!process.env.GITHUB_TOKEN) return json(500, { error: "GitHub connection is not set up yet." });

  try {
    const s = store();
    if (action === "load") {
      const [live, draft] = await Promise.all([loadContent(), s.get("draft", { type: "json" })]);
      return json(200, { ...live, draft: draft || null });
    }
    if (action === "saveDraft") {
      if (!body.draft || !body.draft.site || !body.draft.services || !body.draft.pages) throw new Error("Draft is incomplete");
      const draft = { ...body.draft, savedAt: new Date().toISOString() };
      await s.setJSON("draft", draft);
      return json(200, { savedAt: draft.savedAt });
    }
    if (action === "discardDraft") {
      await s.delete("draft");
      return json(200, { ok: true });
    }
    if (action === "uploadImage") {
      const base = String(body.name || "image").toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "image";
      const ext = /^(webp|jpg|jpeg|png|svg|gif)$/.test(body.ext) ? body.ext : "webp";
      const b64 = String(body.data || "").replace(/^data:[^,]+,/, "");
      if (b64.length > 8_000_000) throw new Error("Image is too large");
      const file = `${base}-${Date.now().toString(36)}.${ext}`;
      const buf = Buffer.from(b64, "base64");
      await s.set(`img/${file}`, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { metadata: { type: ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}` } });
      return json(200, { file });
    }
    if (action === "publish") {
      const draft = await s.get("draft", { type: "json" });
      if (!draft) return json(400, { error: "There is nothing to publish" });
      const res = await publish(draft, body.message);
      await s.delete("draft");
      return json(200, res);
    }
    return json(400, { error: "Unknown action" });
  } catch (e) {
    return json(500, { error: e.message });
  }
};

export const config = { path: "/api/admin" };
