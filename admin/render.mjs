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

function head(state, meta, file) {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${meta.title}</title>
<meta name="description" content="${meta.desc}">
<link rel="preload" href="fonts/marcellus-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/figtree-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
${meta.extra || ""}<style>${state.cssMin}${themeCss(state.site.theme)}</style>
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
<a href="contact.html">Contact</a>
</nav>
<a class="btn btn-gold header-cta" href="${b.quote}">Get Your Free Quote</a>
<details class="menu-toggle"><summary>Menu</summary><div class="panel">
<a href="index.html">Home</a><a href="services.html">All services</a>${mobile}<a href="about.html">About us</a><a href="areas-we-cover.html">Areas we cover</a><a href="contact.html">Contact</a>
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
<div><p class="fh">Company</p><a href="about.html">About us</a><a href="services.html">All services</a><a href="areas-we-cover.html">Areas we cover</a><a href="index.html#reviews">Reviews</a><a href="contact.html">Contact</a>${fbLink(b, "Facebook", "")}<a href="${b.instagram}" target="_blank" rel="noopener">Instagram</a><a href="${b.tiktok}" target="_blank" rel="noopener">TikTok</a></div>
<div><p class="fh">Get in touch</p><a href="tel:${b.phoneIntl}">${b.phone}</a><a href="${b.whatsapp}">WhatsApp</a><a href="mailto:${b.email}">Email us</a><a class="btn btn-gold" style="display:inline-block;margin-top:14px;color:#fff;padding:12px 22px" href="${b.quote}">Get Your Free Quote</a></div>
</div>
<div class="footer-base">
<span>&copy; 2026 Prestige Signature Cleaning Ltd</span>
<span><a href="customer-policies.html">Customer policies</a><a href="privacy-policy.html">Privacy policy</a><a href="cookie-policy.html">Cookie policy</a><a href="website-terms.html">Website terms</a></span>
</div>
</div></footer>
<a class="wa-float" href="${b.whatsapp}" aria-label="Chat with us on WhatsApp">${WA_ICON}</a>
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
  const meta = state.pages[file];
  const tpl = state.html[file];
  if (!meta || tpl == null) return null;
  const top = meta.header === "lp" ? lpHeader() : header(state);
  return head(state, meta, file) + top + expandBlocks(state, tpl, file, opts.wrap) + footer(state);
}

export function sitemap(state, base) {
  const urls = Object.keys(state.pages).filter((f) => !state.pages[f].noindex).map((f) => `<url><loc>${base}/${f === "index.html" ? "" : f.replace(/\.html$/, "")}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
