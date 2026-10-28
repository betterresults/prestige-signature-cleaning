import { renderPage, minifyCss, THEME_VARS, catServices } from "./render.mjs";

const API = "/api/admin";
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const LS = "psc_editor_backup";

let token = sessionStorage.getItem("psc_admin") || "";
let live = null;        // published content
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
async function api(action, data = {}) {
  const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json", "x-admin-token": token }, body: JSON.stringify({ action, ...data }) });
  const j = await r.json().catch(() => ({ error: "Server error" }));
  if (r.status === 401 && action !== "login") { logout(); throw new Error("Please sign in again"); }
  if (!r.ok) throw new Error(j.error || "Something went wrong");
  return j;
}
function logout() { sessionStorage.removeItem("psc_admin"); token = ""; location.reload(); }
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
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#loginErr").textContent = "";
  const b = $("#loginBtn"); b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
  try { const j = await api("login", { password: $("#pw").value }); token = j.token; sessionStorage.setItem("psc_admin", token); await start(); }
  catch (er) { $("#loginErr").textContent = er.message; }
  b.disabled = false; b.textContent = "Sign in";
});
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
    let d = j.draft;
    // a local backup that never reached the server wins if it is newer
    try {
      const b = JSON.parse(localStorage.getItem(LS) || "null");
      if (b && b.draft && (!d || (b.at > Date.parse(d.savedAt || 0)))) { d = b.draft; unsaved = true; }
    } catch {}
    draft = d ? { site: d.site, services: d.services, pages: d.pages, html: d.html, images: d.images || [] } : { ...clone(live), images: [] };
    savedAt = d && d.savedAt ? d.savedAt : null;
    $("#login").classList.add("hidden");
    $("#app").classList.remove("hidden");
    const qs = new URLSearchParams(location.hash.slice(1));
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
    if (!token) return;
  } finally { loading(false); }
}
if (token) { $("#login").classList.add("hidden"); start(); }

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
  if (JSON.stringify(draft.services) !== JSON.stringify(live.services)) out.push({ text: "Services and categories" });
  return out;
}
function pageLabel(f, src = draft) {
  const m = src.pages[f];
  if (!m) return f;
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
  return draft.pages[f] ? f : null;
}
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
  dilvon: "This is the Dilvon form. Change the form itself in Dilvon."
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
`;

function attachEditor(doc) {
  const st = doc.createElement("style"); st.id = "pse-style"; st.textContent = EDIT_CSS; doc.head.appendChild(st);
  const main = doc.querySelector("main");
  if (!main) return;
  markBlocks(main);
  const chip = doc.createElement("div"); chip.className = "pse-chip"; chip.textContent = "⚙ Section"; doc.body.appendChild(chip);
  const tip = doc.createElement("div"); tip.className = "pse-tip"; doc.body.appendChild(tip);
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
      } else chip.style.display = "none";
    }
  });
  doc.addEventListener("mousemove", (e) => { if (tip.style.display === "block") { tip.style.left = Math.min(e.clientX + 14, doc.defaultView.innerWidth - 300) + "px"; tip.style.top = e.clientY + 16 + "px"; } });
  const placeChip = () => { const sec = chip._sec; if (!sec || chip.style.display === "none") return; const r = sec.getBoundingClientRect(); chip.style.top = r.top + doc.defaultView.scrollY + "px"; chip.style.left = r.left + "px"; };
  doc.defaultView.addEventListener("scroll", placeChip, { passive: true });
  chip.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (chip._sec) select("section", chip._sec); });

  doc.addEventListener("click", (e) => {
    const t = e.target;
    if (t === chip) return;
    const a = t.closest("a");
    if (a && a.getAttribute("contenteditable") !== "true") e.preventDefault();
    if (!main.contains(t)) {
      if (t.closest("header,footer")) toast("The menu and footer update automatically from Services and Settings.");
      deselect(); return;
    }
    if (t.closest("[data-pse-block]")) { e.preventDefault(); deselect(); return; }
    const tabBtn = t.closest('[role="tab"]');
    if (tabBtn) switchTab(tabBtn);
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
      <div class="tool-row" style="margin-top:6px"><button class="btn sm" id="sDup">Duplicate</button><button class="btn sm danger" id="sDel">Delete section</button></div></div>`;
  }
  const title = sel.kind === "section" ? "Section" : sel.kind === "image" ? "Photo" : ({ A: el.classList.contains("btn") ? "Button" : "Link", H1: "Main heading", H2: "Heading", H3: "Small heading", P: "Paragraph", LI: "List item", SUMMARY: "Question", BUTTON: "Tab" }[el.tagName] || "Text");
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
    const all = [...draft.images.map((n) => ({ n, src: "/api/draft-image/" + n })), ...repoImages.filter((n) => !/^(favicon|logo)/.test(n)).map((n) => ({ n, src: "/images/" + n }))];
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
    $("#sUp").onclick = () => moveUnit(el, -1);
    $("#sDown").onclick = () => moveUnit(el, 1);
    $("#sDup").onclick = () => { const c = el.cloneNode(true); c.classList.remove("pse-sec-sel", "pse-sec-hover"); el.after(c); syncPage(); toast("Section duplicated"); };
    $("#sDel").onclick = async () => { if (await confirmBox("Delete this section?", "It will be removed from this page. You can still discard your changes before publishing.", "Delete", "danger")) { el.remove(); sel = null; syncPage(); renderInspector(); } };
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
  return `<li data-f="${f}" class="${f === file ? "on" : ""}"><span class="t">${esc(pageLabel(f))}</span><span class="chg hidden"></span><button class="gear" data-seo="${f}" title="Page settings">⚙</button></li>`;
}
function pagesPanel() {
  const m = draft.pages;
  const main = Object.keys(m).filter((f) => m[f].kind === "page");
  const legal = Object.keys(m).filter((f) => m[f].kind === "legal");
  let html = `<div class="grp">Main pages</div><ul class="plist">${main.map(pageItem).join("")}</ul>`;
  for (const c of draft.services.categories) {
    const items = catServices(rstate(), c.id).map((s) => s.slug + ".html").filter((f) => m[f]);
    html += `<div class="grp">${esc(c.name)}</div><ul class="plist">${items.map(pageItem).join("") || '<li class="hint">No services yet</li>'}</ul>`;
  }
  const orphan = Object.keys(m).filter((f) => m[f].kind === "service" && !draft.services.services.some((s) => s.slug + ".html" === f && draft.services.categories.some((c) => c.id === s.category)));
  if (orphan.length) html += `<div class="grp">Other</div><ul class="plist">${orphan.map(pageItem).join("")}</ul>`;
  html += `<div class="grp">Legal</div><ul class="plist">${legal.map(pageItem).join("")}</ul>`;
  html += `<div style="margin-top:16px"><button class="btn sm full" id="newSvcBtn">+ New service page</button></div>`;
  return html;
}
function servicesPanel() {
  const st = rstate();
  let html = `<p class="hint">Categories and services feed the menu, footer, service cards and “You might also need” on every page automatically.</p>`;
  draft.services.categories.forEach((c, i) => {
    const items = catServices(st, c.id);
    html += `<div class="card"><h4><span class="cn">📁 ${esc(c.name)}</span>
      <button class="mini" data-cup="${i}" title="Move up">↑</button><button class="mini" data-cdown="${i}" title="Move down">↓</button><button class="mini" data-cedit="${i}" title="Edit category">✎</button><button class="mini" data-cdel="${i}" title="Delete category">🗑</button></h4>
      ${items.map((s) => `<div class="svc"><img src="${draft.images.includes(s.img) ? "/api/draft-image/" : "/images/"}${esc(s.img)}" alt=""><span class="n">${esc(s.name)}</span>
        <button class="mini" data-sup="${s.slug}" title="Move up">↑</button><button class="mini" data-sdown="${s.slug}" title="Move down">↓</button><button class="mini" data-sedit="${s.slug}" title="Edit service">✎</button></div>`).join("") || '<p class="hint">No services yet.</p>'}
      <button class="btn sm full" data-snew="${c.id}">+ Add a service to ${esc(c.name)}</button></div>`;
  });
  html += `<button class="btn primary sm full" id="newCatBtn">+ New category</button>`;
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
  return `<p class="hint">Used in the menu button, footer and contact links on every page.</p>
    ${f("phone", "Phone number (as shown)")}${f("phoneIntl", "Phone for dialling (+44…)")}${f("whatsapp", "WhatsApp link")}${f("email", "Email")}
    ${f("quote", "“Get Your Free Quote” link")}${f("facebook", "Facebook page")}${f("instagram", "Instagram")}${f("tiktok", "TikTok")}
    <label class="field"><span>Footer text</span><textarea class="inp" data-biz="footerText">${esc(b.footerText || "")}</textarea></label>
    <div class="grp">Undo</div><button class="btn sm full danger" id="discardAll">Discard all unpublished changes</button>`;
}

function bindPanel() {
  const p = $("#panel");
  p.querySelectorAll(".plist li[data-f]").forEach((li) => (li.onclick = (e) => { if (e.target.closest("[data-seo]")) return; showPage(li.dataset.f); }));
  p.querySelectorAll("[data-seo]").forEach((b) => (b.onclick = () => pageSettings(b.dataset.seo)));
  if ($("#newSvcBtn")) $("#newSvcBtn").onclick = () => newService();
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
  const r = await modal(`Page settings: ${esc(pageLabel(f))}`, `
    <p class="hint">How this page appears on Google.</p>
    <label class="field"><span>Google title</span><input class="inp" name="title" value="${esc(m.title)}"></label>
    <label class="field"><span>Google description</span><textarea class="inp" name="desc" rows="3">${esc(m.desc)}</textarea></label>
    <p class="hint">Changed your mind about this page? <a href="#" id="revertPage" data-f="${f}">Undo all unpublished changes on this page</a>.</p>`,
    [{ label: "Cancel", value: false }, { label: "Save", cls: "primary", collect: true }]);
  if (r) { draft.pages[f] = { ...m, title: r.title.trim(), desc: r.desc.trim() }; changed(); toast("Page settings saved"); }
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
  const ok = await modal("Publish your changes?", `<p>These changes will go live on <b>prestigesignaturecleaning.co.uk</b>:</p><ul>${list.map((c) => `<li>${esc(c.text)}</li>`).join("")}</ul><p class="hint">The website updates about a minute after publishing.</p>`, [{ label: "Not yet", value: false }, { label: "Publish", cls: "gold" }]);
  if (!ok) return;
  loading(true);
  const b = $("#publishBtn"); b.disabled = true;
  try {
    unsaved = true; await saveNow();
    if (unsaved) throw new Error("Could not save your changes first");
    await api("publish", { message: "Update website: " + list.map((c) => c.text).join(", ").slice(0, 200) });
    live = clone({ site: draft.site, services: draft.services, pages: draft.pages, html: draft.html });
    repoImages = [...new Set([...repoImages, ...draft.images])];
    toast("Published! The website updates in about a minute.");
  } catch (e) { toast(e.message, true); }
  b.disabled = false; loading(false); updateStatus();
}
async function discardAll() {
  if (!(await confirmBox("Discard all unpublished changes?", "Everything goes back to what is live on the website now. This cannot be undone.", "Discard", "danger"))) return;
  loading(true);
  try {
    await api("discardDraft");
    try { localStorage.removeItem(LS); } catch {}
    draft = { ...clone(live), images: [] }; unsaved = false;
    if (!draft.pages[file]) file = "index.html";
    renderPanel(); showPage(file); updateStatus();
    toast("Changes discarded");
  } catch (e) { toast(e.message, true); }
  loading(false);
}
