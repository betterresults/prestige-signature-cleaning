import { renderPage, minifyCss, THEME_VARS, catServices, posts, blogCatFile } from "./render.mjs";
import { SECTIONS, THUMBS } from "./sections.mjs";

const API = "/api/admin";
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const LS = "psc_editor_backup";

// sign in: Netlify Identity (personal logins). The old shared password still works until everyone has a login.
const ID = "/.netlify/identity";
let auth = JSON.parse(localStorage.getItem("psc_auth") || "null"); // { access, refresh, exp, email } or { legacy }
let live = null;        // published content
let pubs = null;        // { used, left, limit } publishes this month
let draft = null;       // working copy { site, services, pages, html, images }
let cssMin = "";
let repoImages = [];
let file = "index.html";
let mode = "edit";
let device = "desktop";
let tab = "pages";
let sel = null;         // { kind, el }
let saveTimer = null, saving = false, unsaved = false, savedAt = null;
let fdoc = null;        // iframe document
let pickCb = null;      // image upload callback

/* ---------------- basics ---------------- */
function toast(msg, bad) { const t = $("#toast"); t.textContent = msg; t.className = "toast show" + (bad ? " bad" : ""); clearTimeout(t._h); t._h = setTimeout(() => (t.className = "toast"), 3600); }
function loading(on) { $("#loadBar").classList.toggle("hidden", !on); }
async function idFetch(path, opts = {}) {
  const r = await fetch(ID + path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.msg || j.error || "Sign in failed");
  return j;
}
function saveAuth(j, email) {
  auth = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 - 60000, email: email || auth?.email };
  localStorage.setItem("psc_auth", JSON.stringify(auth));
}
async function authHeader() {
  if (!auth) return {};
  if (auth.legacy) return { "x-admin-token": auth.legacy };
  if (Date.now() > auth.exp) {
    const j = await idFetch("/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: auth.refresh }) });
    saveAuth(j);
  }
  return { authorization: "Bearer " + auth.access };
}
async function api(action, data = {}) {
  let headers = { "content-type": "application/json" };
  try { Object.assign(headers, await authHeader()); } catch { logout(); throw new Error("Please sign in again"); }
  const r = await fetch(API, { method: "POST", headers, body: JSON.stringify({ action, ...data }) });
  const j = await r.json().catch(() => ({ error: "Server error" }));
  if (r.status === 401 && action !== "login") { logout(); throw new Error("Please sign in again"); }
  if (!r.ok) throw new Error(j.error || "Something went wrong");
  return j;
}
function logout() { localStorage.removeItem("psc_auth"); auth = null; location.hash = ""; location.reload(); }
function modal(title, bodyHtml, buttons) {
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal"><div class="mh">${title}</div><div class="mb">${bodyHtml}</div><div class="mf"></div></div>`;
    const mf = $(".mf", bg);
    buttons.forEach((b) => {
      const el = document.createElement("button");
      el.className = "btn " + (b.cls || "");
      el.textContent = b.label;
      el.onclick = () => { const v = b.value === undefined ? true : b.value; const data = {}; bg.querySelectorAll("[name]").forEach((i) => (data[i.name] = i.type === "checkbox" ? i.checked : i.value)); bg.remove(); resolve(v ? (b.collect ? data : v) : null); };
      mf.appendChild(el);
    });
    bg.addEventListener("mousedown", (e) => { if (e.target === bg) { bg.remove(); resolve(null); } });
    document.body.appendChild(bg);
    const first = bg.querySelector("input,select,textarea");
    if (first) first.focus();
  });
}
const confirmBox = (title, text, ok = "OK", cls = "primary") => modal(title, `<p>${text}</p>`, [{ label: "Cancel", value: false }, { label: ok, cls }]);

/* ---------------- login + load ---------------- */
let loginMode = "signin"; // signin | forgot | setpw | legacy
let pendingToken = null;
function setLoginMode(m, title, sub) {
  loginMode = m;
  $("#loginTitle").textContent = title || "Website editor";
  $("#loginSub").textContent = sub || "Sign in with your email and password";
  $("#emailField").classList.toggle("hidden", m === "setpw" || m === "legacy");
  $("#pwField").classList.toggle("hidden", m === "forgot");
  $("#pw2Field").classList.toggle("hidden", m !== "setpw");
  $("#forgotLink").classList.toggle("hidden", m !== "signin");
  $("#legacyLink").classList.toggle("hidden", m !== "signin");
  $("#backLink").classList.toggle("hidden", m === "signin");
  $("#loginBtn").textContent = { signin: "Sign in", forgot: "Email me a reset link", setpw: "Save password and sign in", legacy: "Sign in" }[m];
  $("#pw").autocomplete = m === "setpw" ? "new-password" : "current-password";
  $("#loginErr").textContent = ""; $("#loginErr").classList.remove("ok");
}
$("#forgotLink").onclick = (e) => { e.preventDefault(); setLoginMode("forgot", "Reset your password", "We will email you a link to choose a new password"); };
$("#legacyLink").onclick = (e) => { e.preventDefault(); setLoginMode("legacy", "Website editor", "Sign in with the shared password"); };
$("#backLink").onclick = (e) => { e.preventDefault(); setLoginMode("signin"); };
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#loginErr"); err.textContent = ""; err.classList.remove("ok");
  const b = $("#loginBtn"); const label = b.textContent; b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
  const email = $("#em").value.trim(), pw = $("#pw").value;
  try {
    if (loginMode === "signin") {
      const j = await idFetch("/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "password", username: email, password: pw }) });
      saveAuth(j, email); await start();
    } else if (loginMode === "forgot") {
      await idFetch("/recover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      err.textContent = "Check your email for a link to reset your password."; err.classList.add("ok");
    } else if (loginMode === "setpw") {
      if (pw.length < 8) throw new Error("Please use at least 8 characters.");
      if (pw !== $("#pw2").value) throw new Error("The two passwords are not the same.");
      let j;
      if (pendingToken.type === "invite") j = await idFetch("/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: pendingToken.token, type: "signup", password: pw }) });
      else {
        j = await idFetch("/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: pendingToken.token, type: "recovery" }) });
        await idFetch("/user", { method: "PUT", headers: { "content-type": "application/json", authorization: "Bearer " + j.access_token }, body: JSON.stringify({ password: pw }) });
      }
      saveAuth(j);
      history.replaceState(null, "", location.pathname);
      await start();
    } else if (loginMode === "legacy") {
      const j = await api("login", { password: pw });
      auth = { legacy: j.token }; localStorage.setItem("psc_auth", JSON.stringify(auth)); await start();
    }
  } catch (er) { err.textContent = er.message; }
  b.disabled = false; b.textContent = label;
});
// links from Netlify emails arrive here with a token in the address
{
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("invite_token")) { pendingToken = { type: "invite", token: h.get("invite_token") }; setLoginMode("setpw", "Welcome", "Choose a password for the website editor"); }
  else if (h.get("recovery_token")) { pendingToken = { type: "recovery", token: h.get("recovery_token") }; setLoginMode("setpw", "Choose a new password", "Type your new password twice"); }
  else setLoginMode("signin");
}
$("#logoutBtn").onclick = async () => {
  if (unsaved) await saveNow();
  logout();
};

async function start() {
  loading(true);
  try {
    const j = await api("load");
    live = { site: j.content.site, services: j.content.services, pages: j.content.pages, html: j.content.html };
    cssMin = minifyCss(j.content.css);
    repoImages = j.images.map((i) => i.name);
    pubs = j.publishes || null;
    let d = j.draft;
    // a local backup that never reached the server wins if it is newer
    try {
      const b = JSON.parse(localStorage.getItem(LS) || "null");
      if (b && b.draft && (!d || (b.at > Date.parse(d.savedAt || 0)))) { d = b.draft; unsaved = true; }
    } catch {}
    draft = d ? mergeDraft(d, live) : { ...clone(live), images: [], base: baseOf(live) };
    savedAt = d && d.savedAt ? d.savedAt : null;
    $("#login").classList.add("hidden");
    $("#app").classList.remove("hidden");
    const qs = new URLSearchParams(location.hash.slice(1).includes("p=") ? location.hash.slice(1) : "");
    if (qs.get("p") && draft.pages[qs.get("p")]) file = qs.get("p");
    renderPanel();
    showPage(file);
    updateStatus();
    if (changeList().length) {
      showBanner(`You have unpublished changes${savedAt ? " from " + new Date(savedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""}.`);
    }
    if (unsaved) scheduleSave(200);
  } catch (e) {
    toast(e.message, true);
  } finally { loading(false); }
}
// fingerprints of the published site when the draft started, so website updates made since then are not lost
const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const fp = (src, f) => hash((src.html[f] || "") + JSON.stringify(src.pages[f] || {}));
function baseOf(src) { const h = {}; for (const f of Object.keys(src.pages)) h[f] = fp(src, f); return { h, site: hash(JSON.stringify(src.site)), services: hash(JSON.stringify(src.services)) }; }
function mergeDraft(d, lv) {
  const out = { site: d.site, services: d.services, pages: d.pages, html: d.html, images: d.images || [] };
  const base = d.base || { h: Object.fromEntries(Object.keys(d.pages).map((f) => [f, null])) };
  for (const f of Object.keys(lv.pages)) {
    const mine = f in out.pages;
    if (!mine && !(f in base.h)) { out.pages[f] = clone(lv.pages[f]); out.html[f] = lv.html[f]; }
    else if (mine && base.h[f] && base.h[f] === fp(out, f)) { out.pages[f] = clone(lv.pages[f]); out.html[f] = lv.html[f]; }
  }
  if (base.site && base.site === hash(JSON.stringify(out.site))) out.site = clone(lv.site);
  if (base.services && base.services === hash(JSON.stringify(out.services))) out.services = clone(lv.services);
  if (!out.site.seo && lv.site.seo) out.site.seo = clone(lv.site.seo);
  out.base = baseOf(lv);
  // keep her own edits marked as changed against the new base
  for (const f of Object.keys(out.pages)) if (lv.pages[f] && fp(out, f) !== fp(lv, f)) out.base.h[f] = d.base?.h?.[f] || null;
  return out;
}
if (auth && !pendingToken) { $("#login").classList.add("hidden"); start(); }

function showBanner(text) {
  const b = $("#banner");
  b.innerHTML = `<span>⚠️ ${esc(text)}</span><button class="btn sm gold" id="bPub">Publish now</button><button class="btn sm" id="bDis">Discard them</button><button class="mini" id="bX">✕</button>`;
  b.classList.remove("hidden");
  $("#bPub").onclick = () => { b.classList.add("hidden"); publish(); };
  $("#bDis").onclick = () => { b.classList.add("hidden"); discardAll(); };
  $("#bX").onclick = () => b.classList.add("hidden");
}

/* ---------------- state helpers ---------------- */
const rstate = () => ({ site: draft.site, services: draft.services, pages: draft.pages, html: draft.html, cssMin });
function changeList() {
  if (!draft || !live) return [];
  const out = [];
  const files = new Set([...Object.keys(draft.pages), ...Object.keys(live.pages)]);
  for (const f of files) {
    const label = pageLabel(f, draft.pages[f] ? draft : live);
    if (!draft.pages[f]) out.push({ f, text: `Deleted page: ${label}` });
    else if (!live.pages[f]) out.push({ f, text: `New page: ${label}` });
    else if (draft.html[f] !== live.html[f] || JSON.stringify(draft.pages[f]) !== JSON.stringify(live.pages[f])) out.push({ f, text: `Page: ${label}` });
  }
  if (JSON.stringify(draft.site.theme) !== JSON.stringify(live.site.theme)) out.push({ text: "Website colours" });
  if (JSON.stringify(draft.site.business) !== JSON.stringify(live.site.business)) out.push({ text: "Business details" });
  if (JSON.stringify(draft.site.seo || {}) !== JSON.stringify(live.site.seo || {})) out.push({ text: "SEO settings" });
  if (JSON.stringify(draft.services) !== JSON.stringify(live.services)) out.push({ text: "Services and categories" });
  return out;
}
function pageLabel(f, src = draft) {
  const m = src.pages[f];
  if (!m) { const c = src.services.categories.find((x) => blogCatFile(x.id) === f); return c ? `Blog: ${c.name}` : f; }
  if (m.label) return m.label;
  const s = src.services.services.find((x) => x.slug + ".html" === f);
  return s ? s.name : f.replace(/\.html$/, "").replace(/-/g, " ");
}
function updateStatus() {
  const n = changeList().length;
  $("#chgCount").textContent = n;
  $("#publishBtn").disabled = n === 0 && !unsaved;
  const st = $("#status");
  st.className = "status" + (saving ? " saving" : unsaved ? " unsaved" : "");
  if (pubs) $("#publishBtn").title = `${pubs.left} of ${pubs.limit} publishes left this month`;
  $("#statusText").textContent = saving ? "Saving…" : unsaved ? "Unsaved changes" : n ? "Saved · not published yet" : "Everything is published";
  document.querySelectorAll(".plist li[data-f]").forEach((li) => {
    const c = changeList().some((x) => x.f === li.dataset.f);
    li.querySelector(".chg")?.classList.toggle("hidden", !c);
  });
}
function changed(opts = {}) {
  unsaved = true;
  try { localStorage.setItem(LS, JSON.stringify({ at: Date.now(), draft })); } catch {}
  scheduleSave();
  updateStatus();
  if (opts.rerender) showPage(file, true);
  if (opts.panel) renderPanel();
}
function scheduleSave(ms = 2500) { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, ms); }
async function saveNow() {
  clearTimeout(saveTimer);
  if (!unsaved || saving) return;
  saving = true; updateStatus();
  try {
    const j = await api("saveDraft", { draft });
    savedAt = j.savedAt; unsaved = false;
    try { localStorage.removeItem(LS); } catch {}
  } catch (e) { toast("Could not save: " + e.message, true); }
  saving = false; updateStatus();
}
$("#saveBtn").onclick = async () => { if (sel && sel.kind === "text") syncText(); unsaved = true; await saveNow(); toast("Saved. Press Publish when you are ready to go live."); };
document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); $("#saveBtn").click(); } });
window.addEventListener("beforeunload", (e) => {
  if (unsaved || changeList().length) { if (unsaved) saveNow(); e.preventDefault(); e.returnValue = "You have changes that are not published yet."; }
});
$("#viewLive").onclick = () => window.open("/" + (file === "index.html" ? "" : file.replace(/\.html$/, "")), "_blank");

/* ---------------- preview ---------------- */
document.querySelectorAll("#modeSeg button").forEach((b) => (b.onclick = () => { mode = b.dataset.mode; document.querySelectorAll("#modeSeg button").forEach((x) => x.classList.toggle("on", x === b)); deselect(); showPage(file, true); }));
document.querySelectorAll("#devSeg button").forEach((b) => (b.onclick = () => { device = b.dataset.dev; document.querySelectorAll("#devSeg button").forEach((x) => x.classList.toggle("on", x === b)); fit(); }));
window.addEventListener("resize", fit);

function fit() {
  const c = $("#canvas"), w = $("#frameWrap"), f = $("#frame");
  c.classList.toggle("mobile", device === "mobile");
  const W = device === "mobile" ? 390 : 1280;
  const availW = c.clientWidth - 40, availH = c.clientHeight - 32;
  const s = Math.min(1, availW / (W + (device === "mobile" ? 20 : 0)));
  const H = Math.round(availH / s) - (device === "mobile" ? 20 : 0);
  f.style.width = W + "px"; f.style.height = H + "px";
  w.style.transform = `scale(${s})`;
}

function previewHtml(f) {
  let html = renderPage(rstate(), f, { wrap: true });
  if (html == null) return "<p>Page not found</p>";
  html = html.replace("<head>", `<head>\n<base href="${location.origin}/">`);
  for (const img of draft.images) html = html.split(`images/${img}`).join(`/api/draft-image/${img}`);
  if (mode === "edit") html = html.replace(/<script(?![^>]*\btype=)/g, '<script type="text/x-psc-off"');
  return html;
}

function showPage(f, keepScroll) {
  if (sel && sel.kind === "text") syncText();
  const fr = $("#frame");
  const y = keepScroll && fr.contentWindow ? fr.contentWindow.scrollY : 0;
  file = f;
  history.replaceState(null, "", "#p=" + encodeURIComponent(f));
  $("#pageName").textContent = pageLabel(f);
  const hint = $("#editHint");
  hint.classList.toggle("hidden", mode !== "edit");
  clearTimeout(hint._t); hint._t = setTimeout(() => hint.classList.add("hidden"), 7000);
  deselect(true);
  fr.onload = () => {
    fdoc = fr.contentDocument;
    try { fr.contentWindow.scrollTo(0, y); } catch {}
    if (mode === "edit") attachEditor(fdoc); else attachPreview(fdoc);
  };
  fr.srcdoc = previewHtml(f);
  fit();
  document.querySelectorAll(".plist li[data-f]").forEach((li) => li.classList.toggle("on", li.dataset.f === f));
}

function internalTarget(a) {
  const h = a.getAttribute("href") || "";
  if (/^(https?:|mailto:|tel:|#)/.test(h)) return null;
  const f = h.split("#")[0] || "index.html";
  return draft.pages[f] || blogCat(f) ? f : null;
}
const blogCat = (f) => draft.services.categories.find((c) => blogCatFile(c.id) === f);
function attachPreview(doc) {
  doc.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    const f = internalTarget(a);
    if (f) { e.preventDefault(); showPage(f); }
    else if (!(a.getAttribute("href") || "").startsWith("#")) { e.preventDefault(); window.open(a.href, "_blank"); }
  }, true);
}

/* ---------------- visual editing ---------------- */
const TEXT_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "P", "LI", "BLOCKQUOTE", "FIGCAPTION", "SUMMARY", "DT", "DD", "TD", "TH", "A", "BUTTON", "SPAN", "STRONG", "EM", "SMALL", "CITE", "LABEL", "B", "I"]);
const SINGLE_LINE = new Set(["H1", "H2", "H3", "H4", "H5", "A", "BUTTON", "SUMMARY", "SPAN", "STRONG", "EM", "SMALL", "CITE", "LABEL", "TH", "TD", "DT", "DD", "B", "I"]);
const BLOCK_HELP = {
  svcards: "These service cards update automatically. Change them in the Services tab.",
  lpcards: "These service cards update automatically. Change them in the Services tab.",
  related: "“You might also need” shows the other services in the same category automatically.",
  catsections: "These sections list your categories and services automatically. Change them in the Services tab.",
  jump: "These links follow your categories automatically.",
  map: "The London map is fixed.",
  dilvon: "This is the Dilvon form. Change the form itself in Dilvon.",
  blog: "Blog posts appear here automatically, newest first. Add posts in Pages, under Blog posts.",
  blogcats: "These category buttons follow your service categories automatically.",
  bloghero: "Category pages are made automatically for every category that has posts.",
  posthead: "Click to change the post title, category, date, summary and cover photo.",
  postmore: "More posts are picked automatically, from the same category first."
};
const EDIT_CSS = `
.pse-hover{outline:2px dashed rgba(176,141,87,.9)!important;outline-offset:2px;cursor:text}
img.pse-hover{cursor:pointer}
.pse-sel{outline:2px solid #B08D57!important;outline-offset:2px}
[contenteditable=true]{outline:2px solid #2563eb!important;outline-offset:3px;cursor:text;caret-color:#2563eb}
section.pse-sec-hover{box-shadow:inset 0 0 0 2px rgba(37,99,235,.45)}
section.pse-sec-sel{box-shadow:inset 0 0 0 3px #2563eb}
[data-pse-block]{cursor:not-allowed}
[data-pse-block].pse-blk-hover{outline:2px dashed #94a3b8!important;outline-offset:2px}
.pse-chip{position:absolute;z-index:2147483646;background:#2563eb;color:#fff;font:600 12px/1 system-ui,sans-serif;padding:7px 10px;border-radius:0 0 8px 0;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2);display:none}
.pse-chip:hover{background:#1d4ed8}
.pse-tip{position:fixed;z-index:2147483647;background:#1f2937;color:#fff;font:500 12px/1.4 system-ui,sans-serif;padding:7px 10px;border-radius:8px;max-width:280px;pointer-events:none;display:none}
.room-panel[hidden]{display:none}
.pse-add{position:absolute;z-index:2147483646;transform:translate(-50%,-50%);background:#fff;color:#2563eb;border:2px solid #2563eb;font:700 12px/1 system-ui,sans-serif;padding:8px 14px;border-radius:999px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.18);display:none;white-space:nowrap}
.pse-add:hover{background:#2563eb;color:#fff}
.pse-add-all{display:block!important;opacity:.85}.pse-add-all:hover{opacity:1}
.ps-video::after{content:"Click to change the video";position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:14px;color:#fff;font:600 13px system-ui,sans-serif;background:linear-gradient(transparent 60%,rgba(0,0,0,.45));cursor:pointer;opacity:0;transition:opacity .2s;z-index:2}
.ps-video:hover::after,.ps-video.pse-sel::after{opacity:1}
.ps-video.pse-sel{outline:3px solid #B08D57;outline-offset:3px}
`;

function attachEditor(doc) {
  const st = doc.createElement("style"); st.id = "pse-style"; st.textContent = EDIT_CSS; doc.head.appendChild(st);
  const main = doc.querySelector("main");
  if (!main) return;
  markBlocks(main);
  const chip = doc.createElement("div"); chip.className = "pse-chip"; chip.textContent = "⚙ Section"; doc.body.appendChild(chip);
  const tip = doc.createElement("div"); tip.className = "pse-tip"; doc.body.appendChild(tip);
  const add = doc.createElement("button"); add.className = "pse-add"; add.type = "button"; add.textContent = "+ Add section"; doc.body.appendChild(add);
  ["data-gramm", "data-gramm_editor", "data-enable-grammarly"].forEach((a) => doc.body.setAttribute(a, "false")); // stop Grammarly boxes in the editor
  let hoverEl = null, hoverSec = null;

  doc.addEventListener("mouseover", (e) => {
    const t = e.target;
    if (hoverEl) { hoverEl.classList.remove("pse-hover", "pse-blk-hover"); hoverEl = null; }
    tip.style.display = "none";
    if (!main.contains(t)) return;
    const blk = t.closest("[data-pse-block]");
    if (blk) {
      blk.classList.add("pse-blk-hover"); hoverEl = blk;
      tip.textContent = BLOCK_HELP[blk.dataset.pseBlock.split(":")[0]] || "This part updates automatically.";
      tip.style.display = "block";
    } else {
      const target = pickTarget(t);
      if (target && target.getAttribute("contenteditable") !== "true") { target.classList.add("pse-hover"); hoverEl = target; }
    }
    const sec = topSection(t, main);
    if (sec !== hoverSec) {
      if (hoverSec) hoverSec.classList.remove("pse-sec-hover");
      hoverSec = sec;
      if (sec) {
        sec.classList.add("pse-sec-hover");
        const r = sec.getBoundingClientRect();
        chip.style.top = r.top + doc.defaultView.scrollY + "px"; chip.style.left = r.left + "px"; chip.style.display = sec.dataset.pseBlock ? "none" : "block";
        chip._sec = sec;
        add.style.top = r.bottom + doc.defaultView.scrollY + "px"; add.style.left = r.left + r.width / 2 + "px"; add.style.display = "block"; add._sec = sec;
      } else { chip.style.display = "none"; }
    }
  });
  doc.addEventListener("mousemove", (e) => { if (tip.style.display === "block") { tip.style.left = Math.min(e.clientX + 14, doc.defaultView.innerWidth - 300) + "px"; tip.style.top = e.clientY + 16 + "px"; } });
  const placeChip = () => { const sec = chip._sec; if (!sec) return; const r = sec.getBoundingClientRect(); chip.style.top = r.top + doc.defaultView.scrollY + "px"; chip.style.left = r.left + "px"; add.style.top = r.bottom + doc.defaultView.scrollY + "px"; add.style.left = r.left + r.width / 2 + "px"; };
  doc.defaultView.addEventListener("scroll", placeChip, { passive: true });
  chip.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (chip._sec) select("section", chip._sec); });
  add.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (add._sec) openLibrary(add._sec, "after"); });
  // A "+ Add section" button under every section, always showing, so it never jumps when the mouse moves
  add.remove();
  let adds = [];
  const placeAdds = () => {
    const secs = [...main.children].filter((x) => x.tagName !== "SCRIPT" && x.tagName !== "STYLE" && x.getBoundingClientRect().height > 0);
    while (adds.length > secs.length) adds.pop().remove();
    while (adds.length < secs.length) {
      const b = doc.createElement("button"); b.type = "button"; b.className = "pse-add pse-add-all"; b.textContent = "+ Add section here";
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (b._sec) openLibrary(b._sec, "after"); });
      doc.body.appendChild(b); adds.push(b);
    }
    const sy = doc.defaultView.scrollY;
    secs.forEach((sec, i) => { const r = sec.getBoundingClientRect(), b = adds[i]; b._sec = sec; b.style.top = r.bottom + sy + "px"; b.style.left = r.left + r.width / 2 + "px"; });
  };
  placeAdds();
  new doc.defaultView.MutationObserver(() => requestAnimationFrame(placeAdds)).observe(main, { childList: true, subtree: true, characterData: true });
  if (doc.defaultView.ResizeObserver) new doc.defaultView.ResizeObserver(() => requestAnimationFrame(placeAdds)).observe(main);
  doc.defaultView.addEventListener("resize", placeAdds);
  doc.defaultView.addEventListener("load", placeAdds);
  [300, 1200, 3000].forEach((ms) => setTimeout(placeAdds, ms));

  doc.addEventListener("click", (e) => {
    const t = e.target;
    if (t === chip || t === add) return;
    const a = t.closest("a");
    if (a && a.getAttribute("contenteditable") !== "true") e.preventDefault();
    if (!main.contains(t)) {
      if (t.closest("header,footer")) toast("The menu and footer update automatically from Services and Settings.");
      deselect(); return;
    }
    if (t.closest("[data-pse-block]")) { e.preventDefault(); deselect(); if (t.closest("[data-pse-block]").dataset.pseBlock === "posthead") postSettings(file); return; }
    const tabBtn = t.closest('[role="tab"]');
    if (tabBtn) switchTab(tabBtn);
    const vid = t.closest(".ps-video");
    if (vid) { e.preventDefault(); select("video", vid); return; }
    if (t.tagName === "IMG") { e.preventDefault(); select("image", t); return; }
    const target = pickTarget(t);
    if (target) {
      if (target.tagName === "SUMMARY" && target.getAttribute("contenteditable") === "true") e.preventDefault();
      if (sel && sel.el === target) return;
      select("text", target);
      return;
    }
    const sec = topSection(t, main);
    if (sec && !sec.dataset.pseBlock) select("section", sec); else deselect();
  }, true);

  doc.addEventListener("keydown", (e) => {
    const el = e.target;
    if (!el || el.getAttribute?.("contenteditable") !== "true") return;
    if (e.key === "Escape") { e.preventDefault(); deselect(); return; }
    if (e.key === "Enter") {
      // Enter finishes editing. Shift+Enter adds a line break inside paragraphs.
      if (e.shiftKey && !SINGLE_LINE.has(el.tagName)) return;
      e.preventDefault();
      return deselect();
    }
    if (e.key === " " && (el.tagName === "SUMMARY" || el.tagName === "BUTTON")) { e.preventDefault(); doc.execCommand("insertText", false, " "); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); $("#saveBtn").click(); }
  });
  doc.addEventListener("keyup", (e) => { if (e.key === " " && e.target?.tagName === "SUMMARY") e.preventDefault(); });
  doc.addEventListener("paste", (e) => {
    const el = e.target.closest?.("[contenteditable=true]");
    if (!el) return;
    e.preventDefault();
    doc.execCommand("insertText", false, (e.clipboardData.getData("text/plain") || "").replace(/\s*\n\s*/g, SINGLE_LINE.has(el.tagName) ? " " : " "));
  });
  doc.addEventListener("input", () => { if (sel && sel.kind === "text") { clearTimeout(attachEditor._t); attachEditor._t = setTimeout(syncText, 400); } });
}

function markBlocks(main) {
  const walker = main.ownerDocument.createTreeWalker(main, NodeFilter.SHOW_COMMENT);
  const opens = [];
  let n;
  while ((n = walker.nextNode())) {
    const v = n.nodeValue;
    if (v.startsWith("@b:")) opens.push(n);
  }
  for (const start of opens) {
    const name = start.nodeValue.slice(3);
    let x = start.nextSibling;
    while (x && !(x.nodeType === 8 && x.nodeValue === "@/b")) {
      if (x.nodeType === 1) x.dataset.pseBlock = name;
      x = x.nextSibling;
    }
    // a block that sits alone inside a container: mark the container too so hover feels right
    const p = start.parentElement;
    if (p && p !== main && [...p.childNodes].every((c) => c.nodeType !== 1 || c.dataset.pseBlock)) p.dataset.pseBlock = name;
  }
}
function topSection(t, main) {
  let x = t.nodeType === 1 ? t : t.parentElement;
  while (x && x.parentElement !== main) x = x.parentElement;
  return x && x.parentElement === main ? x : null;
}
function hasOwnText(el) { return [...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim()); }
function pickTarget(t) {
  let x = t.nodeType === 1 ? t : t.parentElement;
  // walk up to the nearest text element that holds visible text
  while (x && x.tagName !== "MAIN" && x.tagName !== "SECTION") {
    if (TEXT_TAGS.has(x.tagName) && (hasOwnText(x) || x.tagName === "A" || x.tagName === "BUTTON")) {
      // prefer the whole paragraph or heading when clicking inline formatting
      const up = x.parentElement;
      if (["STRONG", "EM", "B", "I", "SMALL"].includes(x.tagName) && up && ["P", "LI", "H1", "H2", "H3", "BLOCKQUOTE", "FIGCAPTION", "DD", "TD"].includes(up.tagName) && hasOwnText(up)) return up;
      if (x.tagName === "SPAN" && x.closest("a.btn,.btn")) return x.closest("a");
      return x;
    }
    if (x.tagName === "IMG") return null;
    if (hasOwnText(x) && !["UL", "OL", "TABLE", "TBODY", "TR", "DL", "DETAILS", "FIGURE"].includes(x.tagName)) return x;
    x = x.parentElement;
  }
  return null;
}
function switchTab(btn) {
  const list = btn.closest('[role="tablist"]'); if (!list) return;
  const doc = btn.ownerDocument;
  list.querySelectorAll('[role="tab"]').forEach((b) => {
    const on = b === btn; b.setAttribute("aria-selected", on ? "true" : "false");
    const p = doc.getElementById(b.getAttribute("aria-controls")); if (p) p.hidden = !on;
  });
}

function select(kind, el) {
  if (sel && sel.el === el) return;
  deselect(true);
  sel = { kind, el };
  if (kind === "text") {
    el.setAttribute("contenteditable", "true");
    el.setAttribute("spellcheck", "true");
    el.focus();
    sel.before = el.innerHTML;
  } else if (kind === "section") el.classList.add("pse-sec-sel");
  else el.classList.add("pse-sel");
  el.classList.remove("pse-hover");
  renderInspector();
}
function deselect(silent) {
  if (sel) {
    const el = sel.el;
    if (sel.kind === "text") { syncText(); el.removeAttribute("contenteditable"); el.removeAttribute("spellcheck"); }
    el.classList.remove("pse-sel", "pse-sec-sel");
  }
  sel = null;
  if (!silent) renderInspector(); else { $("#insp").innerHTML = ""; $("#main").classList.add("noinspect"); fit(); }
}

/* serialize the edited iframe page back into its template */
function serialize() {
  if (!fdoc) return null;
  const main = fdoc.querySelector("main");
  const c = main.cloneNode(true);
  c.querySelectorAll("[contenteditable]").forEach((x) => { x.removeAttribute("contenteditable"); x.removeAttribute("spellcheck"); });
  c.querySelectorAll("*").forEach((x) => {
    if (x.classList.length) { [...x.classList].filter((k) => k.startsWith("pse-")).forEach((k) => x.classList.remove(k)); if (!x.classList.length) x.removeAttribute("class"); }
    if (x.dataset && x.dataset.pseBlock !== undefined) delete x.dataset.pseBlock;
  });
  c.querySelectorAll('script[type="text/x-psc-off"]').forEach((s) => s.removeAttribute("type"));
  c.querySelectorAll('[role="tablist"]').forEach((list) => {
    list.querySelectorAll('[role="tab"]').forEach((b, i) => {
      b.setAttribute("aria-selected", i === 0 ? "true" : "false");
      const p = c.querySelector("#" + CSS.escape(b.getAttribute("aria-controls") || "x")); if (p) { if (i === 0) p.removeAttribute("hidden"); else p.setAttribute("hidden", ""); }
    });
  });
  c.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"));
  // collapse automatic blocks back into their placeholders
  const walker = fdoc.createTreeWalker(c, NodeFilter.SHOW_COMMENT);
  const opens = []; let n;
  while ((n = walker.nextNode())) if (n.nodeValue.startsWith("@b:")) opens.push(n);
  for (const s of opens) {
    const name = s.nodeValue.slice(3);
    let x = s.nextSibling;
    while (x && !(x.nodeType === 8 && x.nodeValue === "@/b")) { const nx = x.nextSibling; x.remove(); x = nx; }
    if (x) x.remove();
    s.replaceWith(fdoc.createComment("@" + name));
  }
  c.querySelectorAll('[class=""]').forEach((x) => x.removeAttribute("class"));
  c.querySelectorAll('[style=""]').forEach((x) => x.removeAttribute("style"));
  let html = c.innerHTML;
  html = html.split("/api/draft-image/").join("images/");
  // typing leaves non breaking spaces next to words; keep only the ones that separate double spaces
  html = html.replace(/&nbsp;(?=[^\s<&])/g, " ").replace(/([^\s>;])&nbsp;/g, "$1 ");
  return html;
}
function syncPage() {
  const html = serialize();
  if (html == null) return;
  if (html !== draft.html[file]) {
    draft.html[file] = html;
    syncHeroImage();
    changed();
  }
}
function syncText() { if (sel && sel.kind === "text") syncPage(); }
// keep the service card image and the preload hint in step with a service page's hero photo
function syncHeroImage() {
  const hero = fdoc && fdoc.querySelector("main > section img.h4-bg");
  if (!hero) return;
  const src = (hero.getAttribute("src") || "").replace("/api/draft-image/", "images/");
  if (!src.startsWith("images/")) return;
  const meta = draft.pages[file];
  if (meta && meta.extra && meta.extra.includes('as="image"')) meta.extra = meta.extra.replace(/href="images\/[^"]+"/, `href="${src}"`);
  const svc = draft.services.services.find((s) => s.slug + ".html" === file);
  if (svc && svc.img !== src.slice(7)) svc.img = src.slice(7);
}

/* item = repeated thing (list item, card, FAQ) the selection belongs to */
function itemOf(el) {
  let x = el;
  while (x && x.tagName !== "SECTION" && x.tagName !== "MAIN") {
    const p = x.parentElement;
    if (p && x.tagName !== "SECTION") {
      const sib = [...p.children].filter((c) => c.tagName === x.tagName && c.className === x.className && !c.dataset.pseBlock);
      if (sib.length >= 2 && !["SPAN", "STRONG", "EM", "A", "BR"].includes(x.tagName)) return x;
    }
    x = p;
  }
  return null;
}

/* ---------------- inspector ---------------- */
// The words on a link or button (keeps any icon inside it)
function textNodesOf(el) { const w = el.ownerDocument.createTreeWalker(el, 4); const out = []; let n; while ((n = w.nextNode())) if (n.nodeValue.trim()) out.push(n); return out; }
function linkText(el) { return textNodesOf(el).map((n) => n.nodeValue.trim()).join(" "); }
function setLinkText(el, v) {
  const ns = textNodesOf(el);
  if (!ns.length) { el.appendChild(el.ownerDocument.createTextNode(v)); return; }
  const lead = ns[0].nodeValue.match(/^\s*/)[0], trail = ns[0].nodeValue.match(/\s*$/)[0];
  ns[0].nodeValue = lead + v + trail;
  ns.slice(1).forEach((n) => { n.nodeValue = ""; });
}
function rgbToHex(c) {
  c = String(c).trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map((x) => x + x).join("").toLowerCase();
  const m = String(c).match(/\d+/g); if (!m) return "#000000";
  return "#" + m.slice(0, 3).map((v) => (+v).toString(16).padStart(2, "0")).join("");
}
function colorField(label, value, id, resetId) {
  return `<div class="color-row"><label>${label}</label><input type="color" id="${id}" value="${value}"><input class="inp hex" id="${id}Hex" value="${value}">${resetId ? `<button class="mini" id="${resetId}" title="Reset">↺</button>` : ""}</div>`;
}
function bindColor(id, fn) {
  const c = $("#" + id), h = $("#" + id + "Hex");
  c.oninput = () => { h.value = c.value; fn(c.value); };
  h.onchange = () => { if (/^#[0-9a-f]{6}$/i.test(h.value)) { c.value = h.value; fn(h.value); } };
}
function renderInspector() {
  const box = $("#insp");
  if (!sel || mode !== "edit") { box.innerHTML = ""; $("#main").classList.add("noinspect"); fit(); return; }
  $("#main").classList.remove("noinspect");
  const el = sel.el, win = fdoc.defaultView;
  const item = sel.kind !== "section" ? itemOf(el) : null;
  const itemTools = item ? `<div class="sec"><h5>This ${item.tagName === "LI" ? "list item" : item.tagName === "DETAILS" ? "question" : "item"}</h5><div class="tool-row"><button class="btn sm" id="iUp">↑ Up</button><button class="btn sm" id="iDown">↓ Down</button><button class="btn sm" id="iDup">Duplicate</button><button class="btn sm danger" id="iDel">Delete</button></div></div>` : "";
  let body = "";
  if (sel.kind === "text") {
    const isLink = el.tagName === "A";
    const cs = win.getComputedStyle(el);
    body = `
      <p class="hint">Type straight on the page. <kbd>Enter</kbd> finishes, <kbd>Esc</kbd> closes.</p>
      <div class="sec"><h5>Style</h5><div class="tool-row">
        <button class="btn sm" id="tB"><b>B</b></button><button class="btn sm" id="tI"><i>I</i></button>
        <button class="btn sm" id="tLink">🔗 Link</button><button class="btn sm" id="tUnlink">Remove link</button></div>
        ${colorField("Text colour", rgbToHex(cs.color), "tCol", "tColReset")}
      </div>
      ${isLink ? `<div class="sec"><h5>Link</h5>
        <label class="field"><span>Button text</span><input class="inp" id="lText" value="${esc(linkText(el))}"></label>
        <label class="field"><span>Goes to</span><input class="inp" id="lHref" value="${esc(el.getAttribute("href") || "")}"></label>
        <label class="field"><span>Or pick a page</span><select class="inp" id="lPage"><option value="">Choose a page…</option>${Object.keys(draft.pages).map((f) => `<option value="${f}">${esc(pageLabel(f))}</option>`).join("")}</select></label>
        <label class="row"><input type="checkbox" id="lNew" ${el.getAttribute("target") === "_blank" ? "checked" : ""}> Open in a new tab</label>
        ${el.classList.contains("btn") ? colorField("Button colour", rgbToHex(cs.backgroundColor), "bCol", "bColReset") : ""}
      </div>` : ""}
      ${itemTools}`;
  } else if (sel.kind === "image") {
    body = `
      <img class="thumb" src="${esc(el.getAttribute("src"))}" alt="">
      <div class="sec"><div class="tool-row"><button class="btn primary sm" id="imUp">⬆ Upload new photo</button></div>
      <p class="hint">Or choose one you already have:</p><div class="lib" id="imLib"></div></div>
      <div class="sec"><h5>Description for Google and screen readers</h5><input class="inp" id="imAlt" value="${esc(el.getAttribute("alt") || "")}"></div>
      ${itemTools}`;
  } else if (sel.kind === "video") {
    const cur = el.querySelector("iframe") ? (el.querySelector("iframe").getAttribute("src") || "") : (el.querySelector("video")?.getAttribute("src") || "");
    const isLink = !!el.querySelector("iframe");
    body = `
      <p class="hint">${isLink ? "Showing a video from " + (cur.includes("vimeo") ? "Vimeo" : "YouTube") + "." : cur.includes("video/hero") ? "Showing your team video." : "Showing your uploaded video."}</p>
      <div class="sec"><h5>YouTube or Vimeo link</h5>
        <input class="inp" id="vLink" placeholder="Paste the link to the video" value="${isLink ? esc(watchUrl(cur)) : ""}">
        <div class="tool-row" style="margin-top:6px"><button class="btn primary sm" id="vUse">Use this link</button></div>
        <p class="hint">Best choice for longer videos. Copy the link from the address bar on YouTube or Vimeo.</p></div>
      <div class="sec"><h5>Or upload a short clip</h5>
        <div class="tool-row"><button class="btn sm" id="vUp">⬆ Upload MP4</button><button class="btn sm" id="vTeam">Use team video</button></div>
        <p class="hint">MP4 under 4 MB, about 20 to 30 seconds.</p></div>`;
  } else if (sel.kind === "section") {
    const cs = win.getComputedStyle(el);
    const bgImg = el.querySelector(":scope img.h4-bg, :scope .h4-bg");
    body = `
      <div class="sec"><h5>Colours for this section only</h5>
        ${colorField("Background", rgbToHex(cs.backgroundColor === "rgba(0, 0, 0, 0)" ? "#ffffff" : cs.backgroundColor), "sBg")}
        ${colorField("Text", rgbToHex(cs.color), "sTx")}
        ${colorField("Headings and green details", rgbToHex(win.getComputedStyle(el).getPropertyValue("--green-900").trim() || "#0D392D"), "sHd")}
        ${colorField("Buttons and gold details", rgbToHex(win.getComputedStyle(el).getPropertyValue("--gold-strong").trim() || "#8A6A33"), "sGd")}
        <button class="btn sm full" id="sReset">↺ Back to the website colours</button>
      </div>
      ${bgImg && bgImg.tagName === "IMG" ? `<div class="sec"><h5>Background photo</h5><button class="btn sm full" id="sBgImg">Change background photo</button></div>` : ""}
      <div class="sec"><h5>Section</h5><div class="tool-row"><button class="btn sm" id="sUp">↑ Move up</button><button class="btn sm" id="sDown">↓ Move down</button></div>
      <div class="tool-row" style="margin-top:6px"><button class="btn sm" id="sDup">Duplicate</button><button class="btn sm danger" id="sDel">Delete section</button></div></div>
      <div class="sec"><h5>Add a new section</h5><div class="tool-row"><button class="btn sm" id="sAddUp">+ Above</button><button class="btn sm primary" id="sAddDown">+ Below</button></div></div>`;
  }
  const title = sel.kind === "section" ? "Section" : sel.kind === "video" ? "Video" : sel.kind === "image" ? "Photo" : ({ A: el.classList.contains("btn") ? "Button" : "Link", H1: "Main heading", H2: "Heading", H3: "Small heading", P: "Paragraph", LI: "List item", SUMMARY: "Question", BUTTON: "Tab" }[el.tagName] || "Text");
  box.innerHTML = `<div class="hd">${title}<span class="sp"></span><button class="mini" id="inspX">✕</button></div><div class="bd">${body}</div>`;
  $("#main").classList.remove("noinspect"); fit();
  $("#inspX").onclick = () => deselect();
  const exec = (cmd, val) => { fdoc.defaultView.focus(); if (sel.kind === "text") sel.el.focus(); fdoc.execCommand(cmd, false, val); syncPage(); };
  if (sel.kind === "text") {
    $("#tB").onmousedown = $("#tI").onmousedown = $("#tLink").onmousedown = $("#tUnlink").onmousedown = (e) => e.preventDefault();
    $("#tB").onclick = () => exec("bold");
    $("#tI").onclick = () => exec("italic");
    $("#tLink").onclick = async () => {
      const r = await modal("Add a link", `<label class="field"><span>Web address or page</span><input class="inp" name="u" placeholder="https://… or about.html"></label>`, [{ label: "Cancel", value: false }, { label: "Add link", cls: "primary", collect: true }]);
      if (r && r.u) exec("createLink", r.u);
    };
    $("#tUnlink").onclick = () => exec("unlink");
    bindColor("tCol", (v) => { el.style.color = v; syncPage(); });
    $("#tColReset").onclick = () => { el.style.removeProperty("color"); if (!el.getAttribute("style")) el.removeAttribute("style"); syncPage(); renderInspector(); };
    if (el.tagName === "A") {
      $("#lText").oninput = () => { setLinkText(el, $("#lText").value); syncPage(); };
      $("#lHref").onchange = () => { el.setAttribute("href", $("#lHref").value.trim()); syncPage(); };
      $("#lPage").onchange = () => { if ($("#lPage").value) { $("#lHref").value = $("#lPage").value; el.setAttribute("href", $("#lPage").value); syncPage(); } };
      $("#lNew").onchange = () => { if ($("#lNew").checked) { el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener"); } else { el.removeAttribute("target"); el.removeAttribute("rel"); } syncPage(); };
      if ($("#bCol")) {
        bindColor("bCol", (v) => { el.style.background = v; el.style.borderColor = v; syncPage(); });
        $("#bColReset").onclick = () => { el.style.removeProperty("background"); el.style.removeProperty("border-color"); if (!el.getAttribute("style")) el.removeAttribute("style"); syncPage(); renderInspector(); };
      }
    }
  }
  if (sel.kind === "image") {
    const lib = $("#imLib");
    const all = [...draft.images.filter((n) => !/\.(mp4|webm)$/.test(n)).map((n) => ({ n, src: "/api/draft-image/" + n })), ...repoImages.filter((n) => !/^(favicon|logo)/.test(n)).map((n) => ({ n, src: "/images/" + n }))];
    lib.innerHTML = all.map((i) => `<img src="${i.src}" data-n="${esc(i.n)}" loading="lazy" title="${esc(i.n)}">`).join("");
    lib.onclick = (e) => { const t = e.target.closest("img[data-n]"); if (t) setImage(t.dataset.n); };
    $("#imUp").onclick = () => pickImage((n) => setImage(n));
    $("#imAlt").onchange = () => { el.setAttribute("alt", $("#imAlt").value.trim()); syncPage(); };
  }
  if (sel.kind === "section") {
    const setVar = (prop, v) => { el.style.setProperty(prop, v); syncPage(); };
    bindColor("sBg", (v) => setVar("background", v));
    bindColor("sTx", (v) => setVar("color", v));
    bindColor("sHd", (v) => setVar("--green-900", v));
    bindColor("sGd", (v) => { el.style.setProperty("--gold", v); el.style.setProperty("--gold-strong", v); syncPage(); });
    $("#sReset").onclick = () => { ["background", "color", "--green-900", "--gold", "--gold-strong"].forEach((p) => el.style.removeProperty(p)); if (!el.getAttribute("style")) el.removeAttribute("style"); syncPage(); renderInspector(); };
    if ($("#sBgImg")) $("#sBgImg").onclick = () => select("image", el.querySelector("img.h4-bg"));
    $("#sAddUp").onclick = () => openLibrary(el, "before");
    $("#sAddDown").onclick = () => openLibrary(el, "after");
    $("#sUp").onclick = () => moveUnit(el, -1);
    $("#sDown").onclick = () => moveUnit(el, 1);
    $("#sDup").onclick = () => { const c = el.cloneNode(true); c.classList.remove("pse-sec-sel", "pse-sec-hover"); el.after(c); syncPage(); toast("Section duplicated"); };
    $("#sDel").onclick = async () => { if (await confirmBox("Delete this section?", "It will be removed from this page. You can still discard your changes before publishing.", "Delete", "danger")) { el.remove(); sel = null; syncPage(); renderInspector(); } };
  }
  if (sel.kind === "video") {
    $("#vUse").onclick = () => {
      const u = embedUrl($("#vLink").value.trim());
      if (!u) return toast("That link doesn't look like a YouTube or Vimeo video.", true);
      el.innerHTML = `<iframe src="${u}" title="Video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
      syncPage(); renderInspector(); toast("Video changed");
    };
    $("#vTeam").onclick = () => { el.innerHTML = `<video src="video/hero-1280.mp4" poster="images/hero-poster.webp" controls playsinline preload="metadata"></video>`; syncPage(); renderInspector(); };
    $("#vUp").onclick = () => pickVideo((f) => { el.innerHTML = `<video src="/api/draft-image/${f}" controls playsinline preload="metadata"></video>`; syncPage(); renderInspector(); toast("Video uploaded"); });
  }
  if (item) {
    $("#iUp").onclick = () => { const p = item.previousElementSibling; if (p && p.tagName === item.tagName) { p.before(item); syncPage(); } };
    $("#iDown").onclick = () => { const n = item.nextElementSibling; if (n && n.tagName === item.tagName) { n.after(item); syncPage(); } };
    $("#iDup").onclick = () => { const wasSel = sel; deselect(true); const c = item.cloneNode(true); item.after(c); syncPage(); toast("Duplicated. Click the copy to change its text."); if (wasSel) select(wasSel.kind, wasSel.el); };
    $("#iDel").onclick = async () => { if (await confirmBox("Delete this item?", "It will be removed from the page.", "Delete", "danger")) { deselect(true); item.remove(); syncPage(); } };
  }
}
// move a section, stepping over automatic blocks as a whole
function moveUnit(el, dir) {
  const isMarker = (n, v) => n && n.nodeType === 8 && (v ? n.nodeValue === v : n.nodeValue.startsWith("@b:"));
  const sib = (n) => (dir < 0 ? n.previousSibling : n.nextSibling);
  let x = sib(el);
  while (x && x.nodeType !== 1 && !(x.nodeType === 8 && (x.nodeValue.startsWith("@b:") || x.nodeValue === "@/b"))) x = sib(x);
  if (!x) return;
  if (dir > 0) {
    if (isMarker(x)) { while (x && !isMarker(x, "@/b")) x = x.nextSibling; if (x) x.after(el); }
    else if (x.nodeType === 1) x.after(el);
  } else {
    if (isMarker(x, "@/b")) { while (x && !isMarker(x)) x = x.previousSibling; if (x) x.before(el); }
    else if (x.nodeType === 1) x.before(el);
  }
  syncPage();
  el.scrollIntoView({ block: "center", behavior: "smooth" });
}
/* ---------------- add section library ---------------- */
function openLibrary(ref, where) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal wide"><div class="mh">Add a section<span class="sp"></span><button class="mini" data-x>✕</button></div>
    <div class="mb"><p class="hint" style="margin-top:0">Pick a design. It is added ${where === "before" ? "above" : "below"} the section you chose, and you can change every word, photo and colour after.</p>
    <div class="slib">${SECTIONS.map((t) => `<button class="scard" data-id="${t.id}">${THUMBS[t.thumb] || ""}<b>${esc(t.name)}</b><span>${esc(t.desc)}</span></button>`).join("")}</div></div></div>`;
  const close = () => bg.remove();
  bg.addEventListener("mousedown", (e) => { if (e.target === bg) close(); });
  bg.querySelector("[data-x]").onclick = close;
  bg.querySelectorAll(".scard").forEach((b) => (b.onclick = () => { close(); insertSection(ref, where, SECTIONS.find((t) => t.id === b.dataset.id)); }));
  document.body.appendChild(bg);
}
function insertSection(ref, where, tpl) {
  if (!tpl || !fdoc) return;
  const t = fdoc.createElement("template"); t.innerHTML = tpl.html.trim();
  const node = t.content.firstElementChild;
  // automatic blocks sit between comment markers; keep the new section outside them
  let anchor = ref;
  if (ref.dataset.pseBlock) {
    if (where === "after") { let x = ref; while (x && !(x.nodeType === 8 && x.nodeValue === "@/b")) x = x.nextSibling; if (x) anchor = x; }
    else { let x = ref; while (x && !(x.nodeType === 8 && x.nodeValue.startsWith("@b:"))) x = x.previousSibling; if (x) anchor = x; }
  }
  if (where === "before") anchor.before(node); else anchor.after(node);
  syncPage();
  node.scrollIntoView({ block: "center", behavior: "smooth" });
  select("section", node);
  toast(`“${tpl.name}” added. Click any text or photo in it to change it.`);
}
function embedUrl(u) {
  let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}
function watchUrl(u) {
  let m = u.match(/embed\/([\w-]{11})/); if (m) return `https://www.youtube.com/watch?v=${m[1]}`;
  m = u.match(/player\.vimeo\.com\/video\/(\d+)/); if (m) return `https://vimeo.com/${m[1]}`;
  return u;
}
function pickVideo(cb) {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "video/mp4,video/webm";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    if (f.size > 4e6) return toast("That video is over 4 MB. Please upload it to YouTube and paste the link instead.", true);
    loading(true); toast("Uploading video…");
    try {
      const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
      const j = await api("uploadImage", { name: f.name, ext: /webm/.test(f.type) ? "webm" : "mp4", data });
      draft.images.push(j.file); cb(j.file);
    } catch (e) { toast(e.message, true); }
    loading(false);
  };
  inp.click();
}
function setImage(name) {
  if (!sel || sel.kind !== "image") return;
  const el = sel.el;
  const src = draft.images.includes(name) ? "/api/draft-image/" + name : "images/" + name;
  el.setAttribute("src", src);
  el.removeAttribute("srcset");
  if (el.closest("section") && el.classList.contains("h4-bg")) { /* hero */ }
  syncPage();
  renderInspector();
  toast("Photo changed");
}

/* ---------------- image upload ---------------- */
async function compress(f) {
  if (f.type === "image/svg+xml" || f.type === "image/gif") return { data: await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }), ext: f.type === "image/svg+xml" ? "svg" : "gif" };
  const bmp = await createImageBitmap(f); const sc = Math.min(1, 1920 / bmp.width);
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const data = c.toDataURL("image/webp", 0.8);
  return data.startsWith("data:image/webp") ? { data, ext: "webp" } : { data: c.toDataURL("image/jpeg", 0.82), ext: "jpg" };
}
function pickImage(cb) { pickCb = cb; $("#fileIn").value = ""; $("#fileIn").click(); }
$("#fileIn").addEventListener("change", async () => {
  const f = $("#fileIn").files[0]; if (!f || !pickCb) return;
  if (f.size > 25e6) return toast("That photo is too large. Please choose one under 25 MB.", true);
  loading(true); toast("Uploading photo…");
  try {
    const { data, ext } = await compress(f);
    const j = await api("uploadImage", { name: f.name, ext, data });
    draft.images.push(j.file);
    pickCb(j.file);
  } catch (e) { toast(e.message, true); }
  loading(false);
});

/* ---------------- left panel ---------------- */
document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b)); renderPanel(); }));

function renderPanel() {
  const p = $("#panel");
  if (tab === "pages") p.innerHTML = pagesPanel();
  if (tab === "services") p.innerHTML = servicesPanel();
  if (tab === "design") p.innerHTML = designPanel();
  if (tab === "settings") p.innerHTML = settingsPanel();
  bindPanel();
  updateStatus();
}
function pageItem(f) {
  return `<li data-f="${f}" class="${f === file ? "on" : ""}"><span class="t">${esc(pageLabel(f))}</span><span class="chg hidden"></span><button class="gear" data-seo="${f}" title="Page settings">⚙</button>${KEEP_PAGES.includes(f) || !draft.pages[f] ? "" : `<button class="gear" data-del="${f}" title="Delete this page">🗑</button>`}</li>`;
}
const openGroups = new Set(["main"]);
function group(id, title, files) {
  const open = openGroups.has(id) || files.includes(file);
  if (open) openGroups.add(id);
  return `<details class="pgrp" data-g="${esc(id)}" ${open ? "open" : ""}><summary>${esc(title)}<span class="cnt">${files.length}</span></summary><ul class="plist">${files.map(pageItem).join("") || '<li class="hint">No pages yet</li>'}</ul></details>`;
}
function pagesPanel() {
  const m = draft.pages;
  const main = Object.keys(m).filter((f) => m[f].kind === "page");
  const legal = Object.keys(m).filter((f) => m[f].kind === "legal");
  let html = group("main", "Main pages", main);
  for (const c of draft.services.categories) {
    html += group("cat:" + c.id, c.name, catServices(rstate(), c.id).map((s) => s.slug + ".html").filter((f) => m[f]));
  }
  const orphan = Object.keys(m).filter((f) => m[f].kind === "service" && !draft.services.services.some((s) => s.slug + ".html" === f && draft.services.categories.some((c) => c.id === s.category)));
  if (orphan.length) html += group("other", "Other", orphan);
  html += group("blog", "Blog posts", posts(rstate()).map((x) => x.file));
  html += group("legal", "Legal pages", legal);
  html += `<div style="margin-top:16px;display:grid;gap:8px"><button class="btn sm full" id="newPostBtn">+ New blog post</button><button class="btn sm full" id="newSvcBtn">+ New service page</button></div>`;
  return html;
}
function servicesPanel() {
  const st = rstate();
  let html = `<button class="btn primary sm full" id="newCatBtn" style="margin-bottom:10px">+ New category</button><p class="hint">Categories and services feed the menu, footer, service cards and “You might also need” on every page automatically.</p>`;
  draft.services.categories.forEach((c, i) => {
    const items = catServices(st, c.id);
    html += `<div class="card"><h4><span class="cn">📁 ${esc(c.name)}</span>
      <button class="mini" data-cup="${i}" title="Move up">↑</button><button class="mini" data-cdown="${i}" title="Move down">↓</button><button class="mini" data-cedit="${i}" title="Edit category">✎</button><button class="mini" data-cdel="${i}" title="Delete category">🗑</button></h4>
      ${items.map((s) => `<div class="svc"><img src="${draft.images.includes(s.img) ? "/api/draft-image/" : "/images/"}${esc(s.img)}" alt=""><span class="n">${esc(s.name)}</span>
        <button class="mini" data-sup="${s.slug}" title="Move up">↑</button><button class="mini" data-sdown="${s.slug}" title="Move down">↓</button><button class="mini" data-sedit="${s.slug}" title="Edit service">✎</button></div>`).join("") || '<p class="hint">No services yet.</p>'}
      <button class="btn sm full" data-snew="${c.id}">+ Add a service to ${esc(c.name)}</button></div>`;
  });
  return html;
}
function designPanel() {
  const t = draft.site.theme || {};
  return `<p class="hint">These colours apply to the whole website. To change one section only, click ⚙ Section on the page.</p>
    ${THEME_VARS.map(([v, label, def]) => colorField(label, t[v] || def, "th" + v.replace(/-/g, "_"), "thr" + v.replace(/-/g, "_"))).join("")}
    <button class="btn sm full" id="themeReset" style="margin-top:10px">↺ Back to the original colours</button>`;
}
function settingsPanel() {
  const b = draft.site.business;
  const f = (k, label) => `<label class="field"><span>${label}</span><input class="inp" data-biz="${k}" value="${esc(b[k] || "")}"></label>`;
  const seo = draft.site.seo || {};
  const sf = (k, label) => `<label class="field"><span>${label}</span><input class="inp" data-seok="${k}" value="${esc(seo[k] || "")}"></label>`;
  return `<p class="hint">Used in the menu button, footer and contact links on every page.</p>
    ${f("phone", "Phone number (as shown)")}${f("phoneIntl", "Phone for dialling (+44…)")}${f("whatsapp", "WhatsApp link")}${f("email", "Email")}
    ${f("quote", "“Get Your Free Quote” link")}${f("facebook", "Facebook page")}${f("instagram", "Instagram")}${f("tiktok", "TikTok")}
    <label class="field"><span>Footer text</span><textarea class="inp" data-biz="footerText">${esc(b.footerText || "")}</textarea></label>
    <div class="grp">SEO and Google</div>
    <p class="hint">Used for Google, AI search and link previews on Facebook and WhatsApp. Leave a field empty if you don't need it.</p>
    ${sf("areas", "Areas you cover (separate with commas)")}
    <label class="field"><span>Opening days</span><select class="inp" data-seok="days">${["", "Mon to Fri", "Mon to Sat", "Every day"].map((d) => `<option value="${d}" ${seo.days === d ? "selected" : ""}>${d || "Not shown"}</option>`).join("")}</select></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="field"><span>Opens</span><input class="inp" type="time" data-seok="opens" value="${esc(seo.opens || "")}"></label><label class="field"><span>Closes</span><input class="inp" type="time" data-seok="closes" value="${esc(seo.closes || "")}"></label></div>
    ${sf("googleProfile", "Google Business Profile link")}
    <label class="field"><span>Default photo for link previews</span><select class="inp" data-seok="shareImage">${repoImages.filter((n) => /\.(webp|png)$/.test(n) && !/^(favicon|logo|whatsapp)/.test(n)).concat(draft.images.filter((n) => !/\.(mp4|webm)$/.test(n))).map((n) => `<option ${seo.shareImage === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
    <div class="grp">Undo</div><button class="btn sm full danger" id="discardAll">Discard all unpublished changes</button>`;
}

function bindPanel() {
  const p = $("#panel");
  p.querySelectorAll(".plist li[data-f]").forEach((li) => (li.onclick = (e) => { if (e.target.closest("[data-seo],[data-del]")) return; showPage(li.dataset.f); }));
  p.querySelectorAll("details.pgrp").forEach((d) => d.addEventListener("toggle", () => { if (d.open) openGroups.add(d.dataset.g); else openGroups.delete(d.dataset.g); }));
  p.querySelectorAll("[data-seo]").forEach((b) => (b.onclick = () => pageSettings(b.dataset.seo)));
  p.querySelectorAll("[data-del]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); deletePage(b.dataset.del); }));
  if ($("#newSvcBtn")) $("#newSvcBtn").onclick = () => newService();
  if ($("#newPostBtn")) $("#newPostBtn").onclick = () => newPost();
  // services tab
  p.querySelectorAll("[data-snew]").forEach((b) => (b.onclick = () => newService(b.dataset.snew)));
  p.querySelectorAll("[data-sedit]").forEach((b) => (b.onclick = () => editService(b.dataset.sedit)));
  p.querySelectorAll("[data-sup],[data-sdown]").forEach((b) => (b.onclick = () => moveService(b.dataset.sup || b.dataset.sdown, b.dataset.sup ? -1 : 1)));
  p.querySelectorAll("[data-cup],[data-cdown]").forEach((b) => (b.onclick = () => { const i = +(b.dataset.cup ?? b.dataset.cdown), j = i + (b.dataset.cup !== undefined ? -1 : 1); const a = draft.services.categories; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; changed({ rerender: true, panel: true }); }));
  p.querySelectorAll("[data-cedit]").forEach((b) => (b.onclick = () => editCategory(+b.dataset.cedit)));
  p.querySelectorAll("[data-cdel]").forEach((b) => (b.onclick = () => deleteCategory(+b.dataset.cdel)));
  if ($("#newCatBtn")) $("#newCatBtn").onclick = () => editCategory(-1);
  // design tab
  THEME_VARS.forEach(([v, , def]) => {
    const id = "th" + v.replace(/-/g, "_");
    if (!$("#" + id)) return;
    bindColor(id, (val) => { draft.site.theme = { ...draft.site.theme, [v]: val }; applyTheme(); changed(); });
    $("#thr" + v.replace(/-/g, "_")).onclick = () => { const t = { ...draft.site.theme }; delete t[v]; draft.site.theme = t; changed({ rerender: true, panel: true }); };
  });
  if ($("#themeReset")) $("#themeReset").onclick = () => { draft.site.theme = {}; changed({ rerender: true, panel: true }); };
  // settings tab
  p.querySelectorAll("[data-biz]").forEach((i) => (i.onchange = () => { draft.site.business = { ...draft.site.business, [i.dataset.biz]: i.value.trim() }; changed({ rerender: true }); }));
  p.querySelectorAll("[data-seok]").forEach((i) => (i.onchange = () => { draft.site.seo = { ...(draft.site.seo || {}), [i.dataset.seok]: i.value.trim() }; changed(); }));
  if ($("#discardAll")) $("#discardAll").onclick = discardAll;
}
// live theme preview without reloading the page
function applyTheme() {
  if (!fdoc) return;
  let s = fdoc.getElementById("pse-theme");
  if (!s) { s = fdoc.createElement("style"); s.id = "pse-theme"; fdoc.head.appendChild(s); }
  s.textContent = ":root{" + Object.entries(draft.site.theme || {}).map(([k, v]) => `${k}:${v}`).join(";") + "}";
}

/* ---------------- pages / services / categories ---------------- */
async function pageSettings(f) {
  const m = draft.pages[f];
  if (!m) return toast("This page is made automatically from your blog posts.");
  if (m.kind === "post") return postSettings(f);
  const r = await modal(`Page settings: ${esc(pageLabel(f))}`, `
    <p class="hint">How this page appears on Google.</p>
    <label class="field"><span>Google title</span><input class="inp" name="title" value="${esc(m.title)}"></label>
    <label class="field"><span>Google description</span><textarea class="inp" name="desc" rows="3">${esc(m.desc)}</textarea></label>
    <label class="field"><span>Photo for link previews</span><select class="inp" name="ogImage"><option value="">Automatic (first photo on the page)</option>${repoImages.filter((n) => /\.(webp|png)$/.test(n) && !/^(favicon|logo|whatsapp)/.test(n)).concat(draft.images.filter((n) => !/\.(mp4|webm)$/.test(n))).map((n) => `<option ${m.ogImage === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
    <label class="row"><input type="checkbox" name="noindex" ${m.noindex ? "checked" : ""}> Hide this page from Google</label>
    <p class="hint">Changed your mind about this page? <a href="#" id="revertPage" data-f="${f}">Undo all unpublished changes on this page</a>.</p>
    ${KEEP_PAGES.includes(f) ? "" : `<p class="hint"><a href="#" id="delPage" data-f="${f}" style="color:#b3261e">Delete this page</a></p>`}`,
    [{ label: "Cancel", value: false }, { label: "Save", cls: "primary", collect: true }]);
  if (r) {
    const n = { ...m, title: r.title.trim(), desc: r.desc.trim() };
    if (r.ogImage) n.ogImage = r.ogImage; else delete n.ogImage;
    if (r.noindex) n.noindex = true; else delete n.noindex;
    draft.pages[f] = n; changed(); toast("Page settings saved");
  }
}
document.addEventListener("click", async (e) => {
  if (e.target.id !== "revertPage") return;
  e.preventDefault();
  const f = e.target.dataset.f;
  document.querySelector(".modal-bg")?.remove();
  if (!live.pages[f]) return toast("This is a new page, so there is no published version yet.", true);
  draft.html[f] = live.html[f]; draft.pages[f] = clone(live.pages[f]);
  changed({ rerender: f === file }); toast("This page is back to the published version");
});

/* ---------------- delete a page ---------------- */
// Home and the pages in the main menu stay, so the menu never links to a missing page
const KEEP_PAGES = ["index.html", "services.html", "about.html", "areas-we-cover.html", "blog.html", "contact.html", "quote.html"];
async function deletePage(f) {
  const m = draft.pages[f];
  if (!m || KEEP_PAGES.includes(f)) return toast("This page is in the menu or the quote buttons, so it can not be deleted. You can hide it from Google in its settings instead.", true);
  const name = pageLabel(f);
  const what = m.kind === "service" ? "Its page will be removed and it will disappear from the menu, footer and service cards once you publish."
    : m.kind === "post" ? "It will be removed from the blog once you publish."
    : "It will be removed from the website once you publish.";
  if (!(await confirmBox(`Delete ${esc(name)}?`, what + " Links to it in your own text will need updating. You can still undo this by discarding your changes before you publish.", "Delete", "danger"))) return;
  if (m.kind === "service") draft.services.services = draft.services.services.filter((x) => x.slug + ".html" !== f);
  delete draft.pages[f]; delete draft.html[f];
  if (file === f) file = m.kind === "post" ? "blog.html" : "index.html";
  changed({ panel: true }); showPage(file);
  toast(`${name} deleted. Publish to make it final.`);
}
document.addEventListener("click", (e) => {
  if (e.target.id !== "delPage") return;
  e.preventDefault();
  const f = e.target.dataset.f;
  e.target.closest(".modal-bg")?.remove();
  deletePage(f);
});

/* ---------------- blog posts ---------------- */
const today = () => new Date().toISOString().slice(0, 10);
const imgUrl = (n) => (draft.images.includes(n) ? "/api/draft-image/" : "/images/") + n;
async function postSettings(f) {
  const m = draft.pages[f];
  const cats = draft.services.categories;
  const imgs = [...draft.images.filter((n) => !/\.(mp4|webm)$/.test(n)), ...repoImages.filter((n) => !/^(favicon|logo|whatsapp)/.test(n) && !/\.jpe?g$/.test(n))];
  const p = modal(`Post settings`, `
    <label class="field"><span>Post title</span><input class="inp" name="label" value="${esc(m.label)}"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="field"><span>Category</span><select class="inp" name="category">${cats.map((c) => `<option value="${c.id}" ${c.id === m.category ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Date</span><input class="inp" type="date" name="date" value="${esc(m.date || today())}"></label>
    </div>
    <label class="field"><span>Short summary for the blog cards</span><textarea class="inp" name="excerpt" rows="2">${esc(m.excerpt)}</textarea></label>
    <div class="field"><span>Cover photo</span><input type="hidden" name="img" value="${esc(m.img)}">
      <div style="display:flex;align-items:center;gap:12px;margin:6px 0"><img id="pcPrev" src="${esc(imgUrl(m.img))}" alt="" style="width:120px;aspect-ratio:3/2;object-fit:cover;border-radius:8px"><button class="btn sm" id="pcUp" type="button">⬆ Upload new photo</button></div>
      <div class="lib" id="pcLib" style="max-height:170px;grid-template-columns:repeat(6,1fr)">${imgs.map((n) => `<img src="${imgUrl(n)}" data-n="${esc(n)}" loading="lazy" title="${esc(n)}">`).join("")}</div></div>
    <p class="hint" style="margin-top:14px">How this post appears on Google.</p>
    <label class="field"><span>Google title</span><input class="inp" name="title" value="${esc(m.title)}"></label>
    <label class="field"><span>Google description</span><textarea class="inp" name="desc" rows="2">${esc(m.desc)}</textarea></label>
    <label class="row"><input type="checkbox" name="noindex" ${m.noindex ? "checked" : ""}> Hide this post from Google</label>
    <p class="hint"><a href="#" id="delPost">Delete this post</a> &middot; <a href="#" id="revertPage" data-f="${f}">Undo unpublished changes</a></p>`,
    [{ label: "Cancel", value: false }, { label: "Save", cls: "primary", collect: true }]);
  const bg = document.querySelector(".modal-bg:last-of-type");
  const setImg = (n) => { bg.querySelector('[name="img"]').value = n; bg.querySelector("#pcPrev").src = imgUrl(n); };
  bg.querySelector("#pcLib").onclick = (e) => { const t = e.target.closest("img[data-n]"); if (t) setImg(t.dataset.n); };
  bg.querySelector("#pcUp").onclick = () => pickImage((n) => setImg(n));
  bg.querySelector(".modal").style.width = "min(620px,96vw)";
  bg.querySelector("#delPost").onclick = async (e) => {
    e.preventDefault(); bg.remove();
    if (!(await confirmBox("Delete this post?", "It will be removed from the blog when you publish.", "Delete", "danger"))) return;
    delete draft.pages[f]; delete draft.html[f];
    changed({ panel: true }); showPage("blog.html"); toast("Post deleted");
  };
  const r = await p;
  if (!r) return;
  draft.pages[f] = { ...m, label: r.label.trim() || m.label, category: r.category, date: r.date || m.date, excerpt: r.excerpt.trim(), img: r.img || m.img, title: r.title.trim(), desc: r.desc.trim() };
  if (r.noindex) draft.pages[f].noindex = true; else delete draft.pages[f].noindex;
  changed({ rerender: f === file, panel: true }); toast("Post settings saved");
}
async function newPost() {
  const cats = draft.services.categories;
  if (!cats.length) return toast("Create a category first", true);
  const r = await modal("New blog post", `
    <label class="field"><span>Post title</span><input class="inp" name="label" placeholder="e.g. How often should you deep clean your oven?"></label>
    <label class="field"><span>Category</span><select class="inp" name="cat">${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
    <p class="hint">The post opens straight away so you can write it on the page. Add the cover photo and summary in Post settings.</p>`,
    [{ label: "Cancel", value: false }, { label: "Create post", cls: "primary", collect: true }]);
  if (!r || !r.label.trim()) return;
  const label = r.label.trim();
  let slug = slugify(label).slice(0, 70).replace(/-$/, ""), k = 2;
  while (draft.pages[slug + ".html"] || blogCat(slug + ".html") || slug === "blog") slug = slugify(label).slice(0, 66) + "-" + k++;
  const svc = draft.services.services.find((s) => s.category === r.cat);
  const f = slug + ".html";
  draft.pages[f] = { title: `${label} | Prestige Signature Cleaning`, desc: "", header: "main", kind: "post", label, category: r.cat, date: today(), img: svc ? svc.img : "psc-team.webp", excerpt: "" };
  draft.html[f] = `\n<!--@posthead-->\n\n<section class="post-body"><div class="wrap">\n<p class="lead">Write a short introduction to your post here.</p>\n<h2>First heading</h2>\n<p>Write your first paragraph here. Click any text to change it, and use Duplicate in the right panel to add more paragraphs or headings.</p>\n</div></section>\n\n<section class="post-sec-cta"><div class="wrap">\n<div class="h4-final">\n<div><h2>Need a hand with your cleaning?</h2><p>Tell us what you need and get a clear price, with no obligation.</p></div>\n<a class="btn btn-gold btn-lg" href="${esc(draft.site.business.quote)}">Get Your Free Quote</a>\n</div>\n</div></section>\n\n<!--@postmore-->\n`;
  openGroups.add("blog");
  changed({ panel: true });
  tab = "pages"; document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x.dataset.tab === "pages")); renderPanel();
  showPage(f);
  toast("New post created. Click the text to write it, then add a cover photo and summary in Post settings.");
}
const slugify = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function iconOptions(cur) {
  const icons = draft.services.icons || {};
  return Object.keys(icons).map((k) => `<option value="${k}" ${icons[k] === cur ? "selected" : ""}>${k.replace(/-cleaning$/, "").replace(/-/g, " ")}</option>`).join("");
}
async function newService(cat) {
  const cats = draft.services.categories;
  if (!cats.length) return toast("Create a category first", true);
  const svcs = draft.services.services;
  const r = await modal("New service page", `
    <p class="hint">The new page copies the full design and text of an existing service. Then you just change the words and photos.</p>
    <label class="field"><span>Service name</span><input class="inp" name="name" placeholder="e.g. Carpet cleaning"></label>
    <label class="field"><span>Category</span><select class="inp" name="cat">${cats.map((c) => `<option value="${c.id}" ${c.id === cat ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
    <label class="field"><span>Start from this page</span><select class="inp" name="from">${svcs.map((s) => `<option value="${s.slug}">${esc(s.name)}</option>`).join("")}</select></label>
    <label class="field"><span>Short line for the service cards</span><input class="inp" name="line" placeholder="One sentence about this service"></label>`,
    [{ label: "Cancel", value: false }, { label: "Create page", cls: "primary", collect: true }]);
  if (!r || !r.name.trim()) return;
  const name = r.name.trim();
  let slug = slugify(name); if (!/cleaning/.test(slug)) slug += "-cleaning";
  let k = 2; while (draft.pages[slug + ".html"]) slug = slugify(name) + "-" + k++;
  const from = svcs.find((s) => s.slug === r.from);
  const fFile = from.slug + ".html";
  const H1 = name.replace(/\b\w/g, (c) => c.toUpperCase());
  const swap = (s) => String(s).split(from.name).join(name).split(from.name.replace(/\b\w/g, (c) => c.toUpperCase())).join(H1).split(from.name.toLowerCase()).join(name.toLowerCase());
  draft.html[slug + ".html"] = swap(draft.html[fFile]);
  draft.pages[slug + ".html"] = { ...clone(draft.pages[fFile]), title: `${H1} in London | Prestige Signature Cleaning`, desc: swap(draft.pages[fFile].desc), kind: "service" };
  draft.services.services.push({ slug, name, category: r.cat, line: r.line.trim() || from.line, tag: from.tag, icon: from.icon, img: from.img });
  changed({ panel: true });
  tab = "pages"; document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x.dataset.tab === "pages")); renderPanel();
  showPage(slug + ".html");
  toast("New page created. Click any text or photo to make it yours.");
}
async function editService(slug) {
  const s = draft.services.services.find((x) => x.slug === slug); if (!s) return;
  const cats = draft.services.categories;
  const r = await modal(`Edit service: ${esc(s.name)}`, `
    <label class="field"><span>Name (menu, footer and cards)</span><input class="inp" name="name" value="${esc(s.name)}"></label>
    <label class="field"><span>Category</span><select class="inp" name="cat">${cats.map((c) => `<option value="${c.id}" ${c.id === s.category ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
    <label class="field"><span>Short line on service cards</span><input class="inp" name="line" value="${esc(s.line)}"></label>
    <label class="field"><span>Label on the quote page cards</span><input class="inp" name="tag" value="${esc(s.tag)}"></label>
    <label class="field"><span>Icon</span><select class="inp" name="icon">${iconOptions(s.icon)}</select></label>
    <p class="hint">The card photo follows the main photo at the top of the service page. To change the page wording, open the page and click the text.</p>
    <p><button class="btn sm danger" id="delSvc" data-slug="${s.slug}" type="button">Delete this service and its page</button></p>`,
    [{ label: "Cancel", value: false }, { label: "Save", cls: "primary", collect: true }]);
  if (r) {
    Object.assign(s, { name: r.name.trim() || s.name, category: r.cat, line: r.line.trim(), tag: r.tag.trim(), icon: (draft.services.icons || {})[r.icon] || s.icon });
    changed({ rerender: true, panel: true });
    toast("Service saved");
  }
}
document.addEventListener("click", async (e) => {
  if (e.target.id !== "delSvc") return;
  const bg = e.target.closest(".modal-bg");
  const s = draft.services.services.find((x) => x.slug === e.target.dataset.slug);
  bg.remove();
  if (!s) return;
  if (!(await confirmBox(`Delete ${esc(s.name)}?`, "Its page will be removed and it will disappear from the menu, footer and service cards once you publish. Links to it in your own text will need updating.", "Delete", "danger"))) return;
  draft.services.services = draft.services.services.filter((x) => x !== s);
  delete draft.html[s.slug + ".html"]; delete draft.pages[s.slug + ".html"];
  if (file === s.slug + ".html") file = "index.html";
  changed({ panel: true });
  showPage(file);
  toast("Service deleted. Publish to make it final.");
});
function moveService(slug, dir) {
  const arr = draft.services.services;
  const i = arr.findIndex((s) => s.slug === slug); if (i < 0) return;
  const cat = arr[i].category;
  let j = i + dir;
  while (j >= 0 && j < arr.length && arr[j].category !== cat) j += dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  changed({ rerender: true, panel: true });
}
async function editCategory(i) {
  const c = i >= 0 ? draft.services.categories[i] : { id: "", name: "", title: "", intro: "" };
  const r = await modal(i >= 0 ? `Edit category: ${esc(c.name)}` : "New category", `
    <label class="field"><span>Name (menu and cards)</span><input class="inp" name="name" value="${esc(c.name)}" placeholder="e.g. Specialist Cleaning"></label>
    <label class="field"><span>Heading on the Services page</span><input class="inp" name="title" value="${esc(c.title || "")}" placeholder="e.g. Specialist cleaning"></label>
    <label class="field"><span>Intro on the Services page</span><textarea class="inp" name="intro" rows="3">${esc(c.intro || "")}</textarea></label>`,
    [{ label: "Cancel", value: false }, { label: i >= 0 ? "Save" : "Create category", cls: "primary", collect: true }]);
  if (!r || !r.name.trim()) return;
  if (i >= 0) Object.assign(c, { name: r.name.trim(), title: r.title.trim() || r.name.trim(), intro: r.intro.trim() });
  else {
    let id = slugify(r.name); let k = 2; while (draft.services.categories.some((x) => x.id === id)) id = slugify(r.name) + "-" + k++;
    draft.services.categories.push({ id, name: r.name.trim(), title: r.title.trim() || r.name.trim(), intro: r.intro.trim() });
    toast("Category created. Add a service to it so it shows on the website.");
  }
  changed({ rerender: true, panel: true });
}
async function deleteCategory(i) {
  const c = draft.services.categories[i];
  if (draft.services.services.some((s) => s.category === c.id)) return modal("Category not empty", `<p>Move or delete the services in <b>${esc(c.name)}</b> first.</p>`, [{ label: "OK", cls: "primary" }]);
  if (!(await confirmBox(`Delete ${esc(c.name)}?`, "This category will be removed.", "Delete", "danger"))) return;
  draft.services.categories.splice(i, 1);
  changed({ rerender: true, panel: true });
}

/* ---------------- publish / discard ---------------- */
$("#publishBtn").onclick = () => publish();
async function publish() {
  if (sel && sel.kind === "text") syncText();
  const list = changeList();
  if (!list.length && !unsaved) return toast("Everything is already published");
  if (pubs && pubs.left <= 0) return modal("No publishes left this month", `<p>You have used all ${pubs.limit} publishes for this month. Your changes are saved here, and you can publish them at the start of next month.</p>`, [{ label: "OK" }]);
  const ok = await modal("Publish your changes?", `<p>These changes will go live on <b>prestigesignaturecleaning.co.uk</b>:</p><ul>${list.map((c) => `<li>${esc(c.text)}</li>`).join("")}</ul><p class="hint">The website updates about a minute after publishing.${pubs ? ` You have <b>${pubs.left} of ${pubs.limit}</b> publishes left this month, so it is best to make all your changes first and publish them together.` : ""}</p>`, [{ label: "Not yet", value: false }, { label: "Publish", cls: "gold" }]);
  if (!ok) return;
  loading(true);
  const b = $("#publishBtn"); b.disabled = true;
  try {
    unsaved = true; await saveNow();
    if (unsaved) throw new Error("Could not save your changes first");
    const pr = await api("publish", { message: "Update website: " + list.map((c) => c.text).join(", ").slice(0, 200) });
    if (pr && pr.publishes) pubs = pr.publishes;
    live = clone({ site: draft.site, services: draft.services, pages: draft.pages, html: draft.html });
    draft.base = baseOf(live);
    repoImages = [...new Set([...repoImages, ...draft.images])];
    toast("Published! The website updates in about a minute." + (pubs ? ` ${pubs.left} of ${pubs.limit} publishes left this month.` : ""));
  } catch (e) { toast(e.message, true); }
  b.disabled = false; loading(false); updateStatus();
}
async function discardAll() {
  if (!(await confirmBox("Discard all unpublished changes?", "Everything goes back to what is live on the website now. This cannot be undone.", "Discard", "danger"))) return;
  loading(true);
  try {
    await api("discardDraft");
    try { localStorage.removeItem(LS); } catch {}
    draft = { ...clone(live), images: [], base: baseOf(live) }; unsaved = false;
    if (!draft.pages[file]) file = "index.html";
    renderPanel(); showPage(file); updateStatus();
    toast("Changes discarded");
  } catch (e) { toast(e.message, true); }
  loading(false);
}
