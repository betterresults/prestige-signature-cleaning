// Shared page builder. Used by the Netlify build (scripts/build.mjs) and by the visual editor (admin).
// state = { site, services, pages (meta), html: { "file.html": mainTemplate }, css }

const SOCIAL_SVG = {
  Instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  TikTok: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 3c.4 2.2 1.8 3.7 4 3.9v3.1c-1.5.1-2.8-.4-4-1.1v6.4c0 3.6-2.9 6.2-6.3 6.1-3.3-.1-5.9-2.9-5.8-6.2.1-3.5 3.2-6.2 6.8-5.7v3.2c-1.6-.4-3.4.6-3.6 2.4-.2 1.6 1 3 2.6 3.1 1.7.1 3.1-1.2 3.1-2.9V3h3.2z"/></svg>',
  Facebook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8h3V4.5h-3c-2.5 0-4 1.6-4 4.1V11H7.5v3.5H10V21h3.6v-6.5h2.8l.5-3.5h-3.3V8.9c0-.6.3-.9.9-.9z"/></svg>'
};
const WA_ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3C8.8 3 3 8.7 3 15.8c0 2.5.7 4.9 2 7L3 29l6.4-2c2 1.1 4.3 1.7 6.6 1.7 7.2 0 13-5.7 13-12.8S23.2 3 16 3zm0 23.4c-2.1 0-4.1-.6-5.9-1.7l-.4-.3-3.8 1.2 1.2-3.7-.3-.4c-1.2-1.8-1.9-3.9-1.9-6.1C4.9 9.9 9.9 5 16 5s11.1 4.9 11.1 10.9S22.1 26.4 16 26.4zm6.1-8.1c-.3-.2-2-1-2.3-1.1-.3-.1-.5-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.7-1.7-1-.9-1.7-2-1.9-2.3-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.4 0-.6l-1.1-2.6c-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.4 3.6 5.7 5 .8.3 1.4.5 1.9.7.8.3 1.5.2 2.1.1.6-.1 2-.8 2.2-1.6.3-.8.3-1.4.2-1.6-.1-.1-.3-.2-.6-.4z"/></svg>';

export const THEME_VARS = [
  ["--green-900", "Main green", "#0D392D"],
  ["--green-950", "Dark green", "#08291F"],
  ["--green-700", "Mid green", "#17503F"],
  ["--green-100", "Light green", "#E6EDE6"],
  ["--gold", "Gold details", "#B08D57"],
  ["--gold-strong", "Buttons and badges", "#8A6A33"],
  ["--gold-soft", "Light gold", "#E3D2AE"],
  ["--ivory", "Cream", "#F5F0E4"],
  ["--paper", "Page background", "#FFFDF8"],
  ["--ink", "Text", "#1B241E"],
  ["--muted", "Soft text", "#56645B"]
];

export const href = (slug) => `${slug}.html`;
const svg = (paths, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export function minifyCss(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{}:;,>])\s*/g, "$1").split(";}").join("}");
}

function themeCss(theme) {
  const entries = Object.entries(theme || {}).filter(([, v]) => v);
  return entries.length ? `:root{${entries.map(([k, v]) => `${k}:${v}`).join(";")}}` : "";
}

export function catServices(state, catId) {
  return state.services.services.filter((s) => catId === "all" ? state.services.categories.some((c) => c.id === s.category) : s.category === catId)
    .sort((a, b) => catOrder(state, a.category) - catOrder(state, b.category));
}
const catOrder = (state, id) => state.services.categories.findIndex((c) => c.id === id);

function head(state, meta, file, body = "") {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${meta.title}</title>
<meta name="description" content="${meta.desc}">
<link rel="preload" href="fonts/marcellus-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/figtree-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
${seoTags(state, meta, file, body)}${meta.extra || ""}<style>${state.cssMin}${themeCss(state.site.theme)}</style>
<link rel="icon" href="images/favicon.png">
<link rel="apple-touch-icon" href="images/favicon.png">
${file === "index.html" ? '<script>if(/(invite|recovery|confirmation)_token=/.test(location.hash))location.replace("/admin/"+location.hash)</script>\n' : ""}</head>
<body>
`;
}

function fbLink(b, text, cls = "textlink") {
  return b.facebook ? `<a class="${cls}" href="${b.facebook}" target="_blank" rel="noopener">${text}</a>` : "";
}

function socialIcons(b) {
  const items = [["Instagram", b.instagram], ["TikTok", b.tiktok]].concat(b.facebook ? [["Facebook", b.facebook]] : []).filter(([, u]) => u);
  return '<div class="socials">' + items.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener" aria-label="${n}">${SOCIAL_SVG[n]}</a>`).join("") + "</div>";
}

function header(state) {
  const b = state.site.business;
  let mega = "", mobile = "";
  for (const c of state.services.categories) {
    const items = catServices(state, c.id);
    if (!items.length) continue;
    mega += `<div><p class="mh">${c.name}</p>${items.map((s) => `<a href="${href(s.slug)}">${s.name}</a>`).join("")}</div>`;
    mobile += `<details class="m-group"><summary>${c.name}</summary>${items.map((s) => `<a class="sub" href="${href(s.slug)}">${s.name}</a>`).join("")}</details>`;
  }
  return `<header class="site-header"><div class="wrap">
<a class="brand" href="index.html" aria-label="Prestige Signature Cleaning home"><img class="logo" src="images/logo.webp" alt="Prestige Signature Cleaning Ltd" width="300" height="156"></a>
<nav class="nav" aria-label="Main">
<a href="index.html">Home</a>
<details><summary>Services</summary><div class="mega">${mega}<a class="mega-all" href="services.html">View all services</a></div></details>
<a href="about.html">About us</a>
<a href="areas-we-cover.html">Areas we cover</a>
<a href="blog.html">Blog</a>
<a href="contact.html">Contact</a>
</nav>
<a class="btn btn-gold header-cta" href="${b.quote}">Get Your Free Quote</a>
<details class="menu-toggle"><summary>Menu</summary><div class="panel">
<a href="index.html">Home</a><a href="services.html">All services</a>${mobile}<a href="about.html">About us</a><a href="areas-we-cover.html">Areas we cover</a><a href="blog.html">Blog</a><a href="contact.html">Contact</a>
<a class="btn btn-gold" href="${b.quote}">Get Your Free Quote</a>
</div></details>
</div></header>
<main>
`;
}

function lpHeader() {
  return `<header class="site-header lp-header"><div class="wrap">
<a class="brand" href="index.html" aria-label="Prestige Signature Cleaning home"><img class="logo" src="images/logo.webp" alt="Prestige Signature Cleaning Ltd" width="300" height="156"></a>
<a class="btn btn-gold" href="#quote">Get Your Free Quote</a>
</div></header>
<main>
`;
}

function footer(state) {
  const b = state.site.business;
  const svc = catServices(state, "all").map((s) => `<a href="${href(s.slug)}">${s.name}</a>`).join("");
  return `</main>
<footer class="site-footer"><div class="wrap">
<div class="footer-grid">
<div>
<a class="brand" href="index.html"><img class="logo" src="images/logo.webp" alt="Prestige Signature Cleaning Ltd" width="300" height="156"></a>
<p>${b.footerText}</p>
${socialIcons(b)}
</div>
<div><p class="fh">Services</p>${svc}</div>
<div><p class="fh">Company</p><a href="about.html">About us</a><a href="services.html">All services</a><a href="areas-we-cover.html">Areas we cover</a><a href="index.html#reviews">Reviews</a><a href="blog.html">Blog</a><a href="contact.html">Contact</a>${fbLink(b, "Facebook", "")}<a href="${b.instagram}" target="_blank" rel="noopener">Instagram</a><a href="${b.tiktok}" target="_blank" rel="noopener">TikTok</a></div>
<div><p class="fh">Get in touch</p><a href="tel:${b.phoneIntl}">${b.phone}</a><a href="${b.whatsapp}">WhatsApp</a><a href="mailto:${b.email}">Email us</a><a class="btn btn-gold" style="display:inline-block;margin-top:14px;color:#fff;padding:12px 22px" href="${b.quote}">Get Your Free Quote</a></div>
</div>
<div class="footer-base">
<span>&copy; 2026 Prestige Signature Cleaning Ltd</span>
<span><a href="customer-policies.html">Customer policies</a><a href="privacy-policy.html">Privacy policy</a><a href="cookie-policy.html">Cookie policy</a><a href="website-terms.html">Website terms</a></span>
</div>
</div></footer>
<a class="wa-float" href="${b.whatsapp}" aria-label="Chat with us on WhatsApp">${WA_ICON}</a>
<a class="m-quote" href="${b.quote}">Get Your Free Quote</a>
<script>(function(){var q=document.querySelector(".m-quote");function t(){q.classList.toggle("show",scrollY>window.innerHeight*.6)}if(q){addEventListener("scroll",t,{passive:true});t()}})()</script>
<script>(function(){var v=document.querySelectorAll("video[data-autoplay]");if(!v.length||!("IntersectionObserver" in window))return;var o=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.preload="auto";var p=e.target.play();if(p&&p.catch)p.catch(function(){})}else e.target.pause()})},{threshold:.4});v.forEach(function(x){o.observe(x)})})()</script>
</body>
</html>
`;
}

const svCards = (items) => items.map((s) => `<a class="sv" href="${href(s.slug)}"><span class="sv-ic">${svg(s.icon)}</span><span class="sv-body"><strong>${s.name}</strong><span>${s.line}</span></span><span class="sv-tag">Find out more</span></a>`).join("");

function mapBlock(badge) {
  const b = badge ? '<div class="map-badge"><span class="tick" aria-hidden="true"></span>All of London covered</div>' : "";
  return `<div class="map-wrap">
<div id="london-map" class="real-map" role="img" aria-label="Map of London showing every borough we cover"></div>
${b}
</div>
<script src="london-map.js" defer></script>`;
}

function related(state, slug) {
  const me = state.services.services.find((s) => s.slug === slug);
  if (!me) return "";
  const cat = state.services.categories.find((c) => c.id === me.category);
  if (!cat) return "";
  const items = catServices(state, cat.id).filter((s) => s.slug !== slug);
  if (!items.length) return "";
  const rel = items.map((s) => `<a class="rel-card" href="${href(s.slug)}"><span class="rel-img"><img src="images/${s.img}" alt="${s.name}" loading="lazy" width="600" height="400"></span><span class="rel-body"><span class="rel-tag">${cat.name}</span><strong>${s.name}</strong><span class="rel-line">${s.line}</span><span class="rel-more">Find out more <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></span></a>`).join("");
  return `<section class="h4-sec"><div class="wrap">
<div class="h4-head"><div><h2>You might also need</h2><p>More ${cat.name.toLowerCase()} services from our team.</p></div><a class="btn btn-line" href="services.html">See all services</a></div>
<div class="rel-grid">${rel}</div>
</div></section>`;
}

function catSections(state) {
  return state.services.categories.map((c, i) => {
    const items = catServices(state, c.id);
    if (!items.length) return "";
    const n = items.length;
    const grid = n % 2 === 0 && n % 3 !== 0 ? "sv-grid two" : "sv-grid";
    return `<section class="h4-sec${i % 2 === 0 ? " h4-paper" : ""}" id="${c.id}"><div class="wrap">
<div class="h4-head"><div><h2>${c.title || c.name}</h2><p>${c.intro || ""}</p></div></div>
<div class="${grid}">${svCards(items)}</div>
</div></section>`;
  }).filter(Boolean).join("\n\n");
}

function lpCards(state) {
  return catServices(state, "all").map((s) => `<div class="sv lp-sv"><span class="sv-ic">${svg(s.icon)}</span><span class="sv-body"><strong>${s.name}</strong><span>${s.line}</span></span><span class="sv-tag">${s.tag}</span></div>`).join("");
}

export function renderBlock(state, name, file) {
  const [kind, arg] = name.split(":");
  switch (kind) {
    case "svcards": return svCards(catServices(state, arg || "all"));
    case "lpcards": return lpCards(state);
    case "map": return mapBlock(arg === "badge");
    case "related": return related(state, file.replace(/\.html$/, ""));
    case "catsections": return catSections(state);
    case "jump": return state.services.categories.filter((c) => catServices(state, c.id).length).map((c) => `<a href="#${c.id}">${c.title || c.name}</a>`).join("");
    case "blog": return blogCards(state, arg === "latest" ? posts(state).slice(0, 3) : posts(state, arg || "all"));
    case "blogcats": return blogCats(state, arg || "all");
    case "bloghero": return blogCatHero(state, arg);
    case "posthead": return postHead(state, file);
    case "postmore": return postMore(state, file);
    case "dilvon": {
      const t = state.site.embedTemplate || "";
      return arg === "contact-us" ? t : t.split("booking-form-contact-us").join(`booking-form-${arg}`).split("/contact-us?").join(`/${arg}?`);
    }
    default: return "";
  }
}

export function expandBlocks(state, tpl, file, wrap) {
  return tpl.replace(/<!--@([a-z0-9:-]+)-->/g, (m, name) => {
    const out = renderBlock(state, name, file);
    return wrap ? `<!--@b:${name}-->${out}<!--@/b-->` : out;
  });
}

// opts.wrap: keep block markers (editor). Returns full page html.
export function renderPage(state, file, opts = {}) {
  const v = !state.pages[file] && blogCatVirtual(state, file);
  const meta = v ? v.meta : state.pages[file];
  const tpl = v ? v.tpl : state.html[file];
  if (!meta || tpl == null) return null;
  const top = meta.header === "lp" ? lpHeader() : header(state);
  const body = expandBlocks(state, tpl, file, opts.wrap);
  return head(state, meta, file, body) + top + body + footer(state);
}

export function sitemap(state, base) {
  const urls = Object.keys(state.pages).filter((f) => !state.pages[f].noindex).concat(blogCatFiles(state)).map((f) => `<url><loc>${base}/${f === "index.html" ? "" : f.replace(/\.html$/, "")}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/* ---------------- blog ---------------- */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const fmtDate = (d) => { const [y, m, day] = String(d || "").split("-").map(Number); return y ? `${day} ${MONTHS[m - 1]} ${y}` : ""; };
const escT = (t) => String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escA = (t) => String(t || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
export function posts(state, cat = "all") {
  return Object.keys(state.pages).filter((f) => state.pages[f].kind === "post" && (cat === "all" || state.pages[f].category === cat))
    .map((f) => ({ file: f, ...state.pages[f] })).sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.file.localeCompare(b.file));
}
export const blogCatFile = (id) => `blog-${id}.html`;
export function blogCatFiles(state) { return state.services.categories.filter((c) => posts(state, c.id).length).map((c) => blogCatFile(c.id)); }
function blogCatVirtual(state, file) {
  const c = state.services.categories.find((x) => blogCatFile(x.id) === file);
  if (!c || !state.pages["blog.html"]) return null;
  return { meta: { title: `${c.name} Tips and Advice | Prestige Signature Cleaning Blog`, desc: `Practical ${c.name.toLowerCase()} tips and advice from the Prestige Signature Cleaning team in London and Essex.`, kind: "blogcat" }, tpl: `<!--@bloghero:${c.id}-->\n\n<section class="h4-sec blog-sec"><div class="wrap"><!--@blog:${c.id}--></div></section>\n` };
}
export function readMins(html) { const words = String(html || "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length; return Math.max(1, Math.round(words / 220)); }
const imgSrc = (i) => (i ? (/^(https?:|\/)/.test(i) ? i : "images/" + i) : "images/psc-team.webp");
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const catName = (state, id) => (state.services.categories.find((c) => c.id === id) || {}).name || "Blog";
function blogCards(state, list) {
  if (!list.length) return '<p class="blog-empty">New articles are on the way.</p>';
  return `<div class="blog-grid">${list.map((p) => `<a class="rel-card blog-card" href="${p.file}"><span class="rel-img"><img src="${imgSrc(p.img)}" alt="${escA(p.label)}" loading="lazy" width="600" height="400"></span><span class="rel-body"><span class="rel-tag">${catName(state, p.category)}</span><strong>${escT(p.label)}</strong><span class="rel-line">${escT(p.excerpt)}</span><span class="blog-meta">${fmtDate(p.date)} &middot; ${readMins(state.html[p.file])} min read</span><span class="rel-more">Read the article ${ARROW}</span></span></a>`).join("")}</div>`;
}
function blogCats(state, cur) {
  const cats = state.services.categories.filter((c) => posts(state, c.id).length);
  return `<nav class="blog-cats" aria-label="Blog categories"><a href="blog.html"${cur === "all" ? ' class="on" aria-current="page"' : ""}>All articles</a>${cats.map((c) => `<a href="${blogCatFile(c.id)}"${cur === c.id ? ' class="on" aria-current="page"' : ""}>${c.name}</a>`).join("")}</nav>`;
}
function blogCatHero(state, id) {
  const c = state.services.categories.find((x) => x.id === id) || { name: "Blog" };
  return `<section class="page-hero blog-hero"><div class="wrap">
<p class="crumbs"><a href="index.html">Home</a> / <a href="blog.html">Blog</a> / ${c.name}</p>
<h1>${c.name} tips and advice</h1>
<p>Practical advice from our team to help you keep your ${id === "commercial-cleaning" ? "workplace" : "home"} clean, fresh and looked after.</p>
${blogCats(state, id)}
</div></section>`;
}
function postHead(state, file) {
  const m = state.pages[file] || {};
  const cat = state.services.categories.find((c) => c.id === m.category);
  return `<section class="post-hero"><div class="wrap post-wrap">
<p class="crumbs"><a href="index.html">Home</a> / <a href="blog.html">Blog</a>${cat ? ` / <a href="${blogCatFile(cat.id)}">${cat.name}</a>` : ""}</p>
${cat ? `<a class="rel-tag" href="${blogCatFile(cat.id)}">${cat.name}</a>` : ""}
<h1>${escT(m.label)}</h1>
<p class="post-meta">By the Prestige Signature Cleaning team &middot; ${fmtDate(m.date)} &middot; ${readMins(state.html[file])} min read</p>
</div>
<div class="wrap post-cover"><img src="${imgSrc(m.img)}" alt="${escA(m.label)}" width="1200" height="675"></div>
</section>`;
}
function postMore(state, file) {
  const m = state.pages[file] || {};
  const all = posts(state).filter((p) => p.file !== file);
  const list = all.filter((p) => p.category === m.category).concat(all.filter((p) => p.category !== m.category)).slice(0, 3);
  if (!list.length) return "";
  return `<section class="h4-sec h4-paper"><div class="wrap">
<div class="h4-head"><div><h2>More from our blog</h2><p>More cleaning tips and advice from our team.</p></div><a class="btn btn-line" href="blog.html">See all articles</a></div>
${blogCards(state, list)}
</div></section>`;
}
function postSchema(state, m, file) {
  const base = siteUrl(state);
  const j = { "@type": "BlogPosting", headline: m.label, description: m.desc, datePublished: m.date, dateModified: m.updated || m.date, image: base + "/" + imgSrc(m.img), mainEntityOfPage: `${base}/${file.replace(/\.html$/, "")}`, author: { "@id": base + "/#business" }, publisher: { "@id": base + "/#business" } };
  return j;
}

/* ---------------- SEO: canonical, share tags, schema ---------------- */
const siteUrl = (state) => ((state.site.seo || {}).siteUrl || "https://prestigesignaturecleaning.co.uk").replace(/\/$/, "");
export const pageUrl = (state, file) => siteUrl(state) + "/" + (file === "index.html" ? "" : file.replace(/\.html$/, ""));
const strip = (h) => String(h || "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&pound;/g, "£").replace(/&rsquo;|&lsquo;/g, "\u2019").replace(/&ldquo;|&rdquo;/g, "\"").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
function shareImage(state, meta, body) {
  const seo = state.site.seo || {};
  let img = meta.ogImage || (meta.kind === "post" && meta.img) || "";
  if (!img) { const m = body.match(/<img[^>]*class="h4-bg"[^>]*src="images\/([^"]+)"/) || body.match(/<img[^>]*src="images\/([^"]+\.(?:webp|jpe?g|png))"/); if (m) img = m[1]; }
  img = img || seo.shareImage || "psc-team.webp";
  return /^https?:/.test(img) ? img : siteUrl(state) + "/images/" + img.replace(/^images\//, "");
}
function businessSchema(state) {
  const b = state.site.business, seo = state.site.seo || {}, base = siteUrl(state);
  const j = { "@type": "LocalBusiness", "@id": base + "/#business", name: "Prestige Signature Cleaning Ltd", url: base + "/", logo: base + "/images/logo.png", image: base + "/images/" + (seo.shareImage || "psc-team.webp"), description: b.footerText, telephone: b.phoneIntl, email: b.email, priceRange: "££", address: { "@type": "PostalAddress", addressLocality: "London", addressCountry: "GB" } };
  const areas = String(seo.areas || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (areas.length) j.areaServed = areas.map((a) => ({ "@type": "Place", name: a }));
  if (seo.days && seo.opens && seo.closes) {
    const all = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const n = { "Mon to Fri": 5, "Mon to Sat": 6, "Every day": 7 }[seo.days] || 7;
    j.openingHoursSpecification = { "@type": "OpeningHoursSpecification", dayOfWeek: all.slice(0, n), opens: seo.opens, closes: seo.closes };
  }
  j.sameAs = [b.facebook, b.instagram, b.tiktok, seo.googleProfile].filter(Boolean);
  return j;
}
function crumbs(state, meta, file) {
  const base = siteUrl(state);
  const list = [["Home", base + "/"]];
  if (file === "index.html") return null;
  if (meta.kind === "service") {
    const s = state.services.services.find((x) => x.slug + ".html" === file);
    list.push(["Services", base + "/services"], [s ? s.name : meta.title, pageUrl(state, file)]);
  } else if (meta.kind === "post" || meta.kind === "blogcat") {
    list.push(["Blog", base + "/blog"]);
    const c = state.services.categories.find((x) => x.id === meta.category || blogCatFile(x.id) === file);
    if (c) list.push([c.name, base + "/" + blogCatFile(c.id).replace(/\.html$/, "")]);
    if (meta.kind === "post") list.push([meta.label, pageUrl(state, file)]);
  } else list.push([meta.label || meta.title.split("|")[0].trim(), pageUrl(state, file)]);
  return { "@type": "BreadcrumbList", itemListElement: list.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) };
}
function faqSchema(body) {
  const qs = [];
  const re = /<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g;
  let m;
  while ((m = re.exec(body))) { const q = strip(m[1]), a = strip(m[2]); if (q && a) qs.push({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }); }
  return qs.length ? { "@type": "FAQPage", mainEntity: qs } : null;
}
function seoTags(state, meta, file, body) {
  const url = pageUrl(state, file), img = shareImage(state, meta, body), base = siteUrl(state);
  const graph = [businessSchema(state)];
  if (file === "index.html") graph.push({ "@type": "WebSite", "@id": base + "/#website", url: base + "/", name: "Prestige Signature Cleaning", publisher: { "@id": base + "/#business" } });
  if (meta.kind === "service") {
    const s = state.services.services.find((x) => x.slug + ".html" === file);
    if (s) graph.push({ "@type": "Service", name: s.name, serviceType: s.name, description: meta.desc, url, image: img, provider: { "@id": base + "/#business" }, areaServed: (businessSchema(state).areaServed || []) });
  }
  if (meta.kind === "post") graph.push(postSchema(state, meta, file));
  const bc = crumbs(state, meta, file); if (bc) graph.push(bc);
  const faq = faqSchema(body); if (faq) graph.push(faq);
  const t = escA(meta.title), d = escA(meta.desc);
  return `<link rel="canonical" href="${url}">
${meta.noindex ? '<meta name="robots" content="noindex, follow">\n' : ""}<meta property="og:type" content="${meta.kind === "post" ? "article" : "website"}">
<meta property="og:site_name" content="Prestige Signature Cleaning">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta name="twitter:card" content="summary_large_image">
${meta.kind === "post" && meta.date ? `<meta property="article:published_time" content="${meta.date}">\n` : ""}<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>
`;
}
