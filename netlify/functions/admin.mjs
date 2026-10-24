// Prestige Signature Cleaning admin API
// Env vars (set in Netlify): ADMIN_PASSWORD, ADMIN_SECRET, GITHUB_TOKEN, GITHUB_REPO (owner/name), GITHUB_BRANCH (default main)
import crypto from "node:crypto";

const GH = "https://api.github.com";
const REPO = process.env.GITHUB_REPO || "betterresults/prestige-signature-cleaning";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN_TTL = 1000 * 60 * 60 * 12; // 12 hours

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});

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
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
async function gh(path, opts = {}) {
  const r = await fetch(`${GH}/repos/${REPO}/${path}`, {
    ...opts,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "psc-admin",
      ...(opts.headers || {})
    }
  });
  const body = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.message || `GitHub error ${r.status}`);
  return body;
}
const cleanPath = (p) => {
  const s = String(p || "").replace(/^\/+/, "");
  if (!/^[a-z0-9][a-z0-9._\/-]*$/i.test(s) || s.includes("..")) throw new Error("Invalid path");
  return s;
};

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

  if (!verify(req.headers.get("x-admin-token"))) return json(401, { error: "Please log in again" });
  if (!process.env.GITHUB_TOKEN) return json(500, { error: "GitHub connection is not set up yet." });

  try {
    if (action === "list") {
      const root = await gh(`contents/?ref=${BRANCH}`);
      const pages = root.filter((f) => f.type === "file" && f.name.endsWith(".html")).map((f) => f.name);
      let images = [];
      try {
        const imgs = await gh(`contents/images?ref=${BRANCH}`);
        images = imgs.filter((f) => /\.(webp|jpe?g|png|gif|svg|avif)$/i.test(f.name)).map((f) => ({ name: f.name, size: f.size }));
      } catch {}
      return json(200, { pages, images });
    }
    if (action === "get") {
      const path = cleanPath(body.path);
      const f = await gh(`contents/${path}?ref=${BRANCH}`);
      return json(200, { path, sha: f.sha, content: Buffer.from(f.content, "base64").toString("utf8") });
    }
    if (action === "save") {
      const path = cleanPath(body.path);
      if (!path.endsWith(".html")) throw new Error("Only pages can be saved");
      const res = await gh(`contents/${path}`, {
        method: "PUT",
        body: JSON.stringify({
          message: body.message || `Update ${path} from admin`,
          content: Buffer.from(body.content, "utf8").toString("base64"),
          sha: body.sha, branch: BRANCH
        })
      });
      return json(200, { sha: res.content.sha });
    }
    if (action === "upload") {
      const base = String(body.name || "image").toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "image";
      const ext = /^(webp|jpg|jpeg|png|svg|gif|avif)$/.test(body.ext) ? body.ext : "webp";
      const b64 = String(body.data || "").replace(/^data:[^,]+,/, "");
      if (b64.length > 8_000_000) throw new Error("Image is too large");
      const path = `images/${base}-${Date.now().toString(36)}.${ext}`;
      await gh(`contents/${path}`, {
        method: "PUT",
        body: JSON.stringify({ message: `Upload ${path} from admin`, content: b64, branch: BRANCH })
      });
      return json(200, { path });
    }
    return json(400, { error: "Unknown action" });
  } catch (e) {
    return json(500, { error: e.message });
  }
};

export const config = { path: "/api/admin" };
