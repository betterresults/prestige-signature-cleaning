// Ready made sections for the "+ Add section" library. Every part is editable in the editor afterwards.
const icon = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const CHECK = icon('<path d="M9 4h6M9 4a1 1 0 0 0-1 1v1h8V5a1 1 0 0 0-1-1M8 6H6v15h12V6h-2"/><path d="m9 13 2 2 4-4"/>');
const SHIELD = icon('<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/>');
const CHAT = icon('<path d="M4 5h16v11H8l-4 4z"/><path d="M8 10h8"/>');
const STARS = "&#9733;&#9733;&#9733;&#9733;&#9733;";

export const SECTIONS = [
  {
    id: "video", name: "Text and video", desc: "Your text on one side, a video on the other.",
    thumb: "split-video",
    html: `<section class="h4-sec ps-sec"><div class="wrap ps-split">
<div class="ps-copy">
<p class="ps-eyebrow">See us at work</p>
<h2>Watch how we clean</h2>
<p class="lead">A short look at our team, our checklists and the care we take on every visit.</p>
<p>Our team is DBS checked, fully insured and trained to the same high standard on every visit.</p>
<a class="btn btn-gold" href="contact.html">Get Your Free Quote</a>
</div>
<div class="ps-video"><video src="video/hero-1280.mp4" poster="images/hero-poster.webp" controls playsinline preload="metadata"></video></div>
</div></section>`
  },
  {
    id: "photo-text", name: "Photo and text", desc: "A photo on one side and your text on the other.",
    thumb: "split-photo",
    html: `<section class="h4-sec ps-sec"><div class="wrap ps-split">
<div class="ps-media"><img src="images/psc-team.webp" alt="Prestige Signature Cleaning team" loading="lazy"></div>
<div class="ps-copy">
<p class="ps-eyebrow">About our team</p>
<h2>People you can trust in your space</h2>
<p class="lead">Every cleaner is DBS checked, vetted and trained before their first visit.</p>
<p>Where possible we send the same small team each time, so they get to know your space and how you like things done.</p>
<a class="btn btn-gold" href="contact.html">Get Your Free Quote</a>
</div>
</div></section>`
  },
  {
    id: "photo-text-right", name: "Text and photo", desc: "Your text first, with the photo on the right.",
    thumb: "split-photo-r",
    html: `<section class="h4-sec ps-sec"><div class="wrap ps-split">
<div class="ps-copy">
<p class="ps-eyebrow">Our standards</p>
<h2>Every clean is checked</h2>
<p class="lead">We follow up after each visit, and anything missed is put right.</p>
<p>Our supervisors check the work against your checklist, and you can message us any time with feedback.</p>
</div>
<div class="ps-media"><img src="images/office.webp" alt="Clean modern office" loading="lazy"></div>
</div></section>`
  },
  {
    id: "gallery", name: "Photo gallery", desc: "A grid of six photos. Duplicate a photo to add more.",
    thumb: "gallery",
    html: `<section class="h4-sec ps-sec"><div class="wrap">
<div class="h4-head"><div><h2>Our recent work</h2><p>A few of the spaces we have cleaned.</p></div></div>
<div class="ps-gallery">
<figure><img src="images/svc-deep-cleaning.webp" alt="Deep cleaning" loading="lazy"><figcaption>Deep clean</figcaption></figure>
<figure><img src="images/svc-office-cleaning.webp" alt="Office cleaning" loading="lazy"><figcaption>Office</figcaption></figure>
<figure><img src="images/svc-clinic-cleaning.webp" alt="Clinic cleaning" loading="lazy"><figcaption>Clinic</figcaption></figure>
<figure><img src="images/svc-communal-cleaning.webp" alt="Communal areas cleaning" loading="lazy"><figcaption>Communal areas</figcaption></figure>
<figure><img src="images/svc-end-of-tenancy-cleaning.webp" alt="End of tenancy cleaning" loading="lazy"><figcaption>End of tenancy</figcaption></figure>
<figure><img src="images/svc-airbnb-cleaning.webp" alt="Airbnb cleaning" loading="lazy"><figcaption>Airbnb</figcaption></figure>
</div>
</div></section>`
  },
  {
    id: "before-after", name: "Before and after", desc: "Two photos side by side with labels.",
    thumb: "before-after",
    html: `<section class="h4-sec h4-paper ps-sec"><div class="wrap">
<div class="h4-head"><div><h2>Before and after</h2><p>The difference a professional clean makes.</p></div></div>
<div class="ps-ba">
<figure><span class="ps-tag">Before</span><img src="images/communal-hallway.webp" alt="Before cleaning" loading="lazy"></figure>
<figure><span class="ps-tag ps-tag-gold">After</span><img src="images/communal-stairs.webp" alt="After cleaning" loading="lazy"></figure>
</div>
</div></section>`
  },
  {
    id: "features", name: "Three feature cards", desc: "Three points with icons, in a white card.",
    thumb: "cards",
    html: `<section class="h4-sec ps-sec"><div class="wrap">
<div class="cl-card">
<div class="cl-head"><h2>Why clients choose us</h2><p class="lead">Small details that make a big difference to every clean.</p></div>
<div class="cl-grid">
<div>${CHECK}<h3>A personalised checklist</h3><p>Every clean covers exactly what we agreed.</p></div>
<div>${SHIELD}<h3>Checked and insured</h3><p>DBS checked, trained and fully insured.</p></div>
<div>${CHAT}<h3>Clear communication</h3><p>You always know who to talk to.</p></div>
</div>
</div>
</div></section>`
  },
  {
    id: "stats", name: "Numbers", desc: "Four big numbers, such as years of experience.",
    thumb: "stats",
    html: `<section class="h4-sec ps-sec"><div class="wrap">
<div class="ps-stats">
<div><strong>20+</strong><span>years of experience</span></div>
<div><strong>100%</strong><span>DBS checked team</span></div>
<div><strong>5&#9733;</strong><span>recommended on Facebook</span></div>
<div><strong>7</strong><span>days a week</span></div>
</div>
</div></section>`
  },
  {
    id: "steps", name: "How it works", desc: "Three numbered steps.",
    thumb: "steps",
    html: `<section class="h4-sec h4-white ps-sec"><div class="wrap">
<h2 class="center">How it works</h2>
<ol class="h4-steps">
<li><span>1</span><h3>Tell us what you need</h3><p>Fill in a short form or message us on WhatsApp.</p></li>
<li><span>2</span><h3>Get a clear price</h3><p>We confirm your price before anything is booked.</p></li>
<li><span>3</span><h3>Enjoy a clean space</h3><p>Your team arrives on time and we follow up after.</p></li>
</ol>
</div></section>`
  },
  {
    id: "reviews", name: "Reviews", desc: "Three client reviews with stars.",
    thumb: "reviews",
    html: `<section class="h4-sec h4-paper ps-sec"><div class="wrap">
<div class="h4-head"><div><h2>What our clients say</h2><p>Real recommendations from our clients.</p></div></div>
<div class="ps-reviews">
<figure class="rq"><div class="stars" aria-label="5 stars">${STARS}</div><blockquote>&ldquo;Excellent service and attention to detail. Everything was cleaned to a very high standard.&rdquo;</blockquote><figcaption>Residential client</figcaption></figure>
<figure class="rq"><div class="stars" aria-label="5 stars">${STARS}</div><blockquote>&ldquo;Consistent quality, great communication and a professional team.&rdquo;</blockquote><figcaption>Office client</figcaption></figure>
<figure class="rq"><div class="stars" aria-label="5 stars">${STARS}</div><blockquote>&ldquo;Arrived on time, took notes of everything needed and went above and beyond.&rdquo;</blockquote><figcaption>Residential client</figcaption></figure>
</div>
</div></section>`
  },
  {
    id: "faq", name: "Questions and answers", desc: "A heading with questions that open and close.",
    thumb: "faq",
    html: `<section class="h4-sec h4-paper ps-sec"><div class="wrap h4-faq">
<div><h2>Questions</h2><p class="lead">Can&rsquo;t find your answer? Message us on WhatsApp and we will help.</p></div>
<div class="faq-cards"><div class="faq">
<details><summary>Do I need to be home during the clean?</summary><p>No. Many clients give us a key or access code, and we confirm when the clean is finished.</p></details>
<details><summary>Are your cleaners checked and insured?</summary><p>Yes. Every cleaner is DBS checked, vetted and trained, and we are fully insured.</p></details>
<details><summary>What areas do you cover?</summary><p>London, Romford, Havering, Brentwood and nearby Essex.</p></details>
</div></div>
</div></section>`
  },
  {
    id: "text", name: "Text block", desc: "A heading with two columns of text.",
    thumb: "text",
    html: `<section class="h4-sec ps-sec"><div class="wrap sp-text">
<div><h2>Cleaning built around you</h2></div>
<div class="sp-cols"><p>Every space is different, so we start by listening. We agree what matters most to you and build a checklist around it.</p><p>From there, your team follows the same standard on every visit, and we stay in touch so you always know where things stand.</p></div>
</div></section>`
  },
  {
    id: "banner", name: "Photo banner", desc: "A wide photo with a heading and button on top.",
    thumb: "banner",
    html: `<section class="h4-sec ps-sec"><div class="wrap">
<div class="ps-banner"><img src="images/hero-clinic.webp" alt="" loading="lazy">
<div class="ps-banner-copy"><h2>Cleaning standards you don&rsquo;t have to chase</h2><p>Reliable cleaning across London and nearby Essex.</p><a class="btn btn-gold" href="contact.html">Get Your Free Quote</a></div>
</div>
</div></section>`
  },
  {
    id: "cta", name: "Call to action", desc: "A green band with a heading and one button.",
    thumb: "cta",
    html: `<section class="h4-sec ps-sec"><div class="wrap">
<div class="h4-final">
<div><h2>Ready for a cleaner you don&rsquo;t have to chase?</h2><p>Get your free, no obligation quote. It only takes a minute.</p></div>
<a class="btn btn-gold btn-lg" href="contact.html">Get Your Free Quote</a>
</div>
</div></section>`
  }
];

// tiny drawings for the library cards
const W = (inner) => `<svg viewBox="0 0 120 72" aria-hidden="true"><rect width="120" height="72" rx="6" fill="#F5F0E4"/>${inner}</svg>`;
const L = (x, y, w, c = "#c9c2b2", h = 4) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${c}"/>`;
const G = "#0D392D", GOLD = "#B08D57";
export const THUMBS = {
  "split-video": W(L(10, 18, 40, G, 6) + L(10, 30, 44) + L(10, 38, 36) + L(10, 50, 22, GOLD, 7) + `<rect x="62" y="14" width="48" height="44" rx="5" fill="${G}"/><path d="M82 29v14l12-7z" fill="#fff"/>`),
  "split-photo": W(`<rect x="10" y="14" width="48" height="44" rx="5" fill="#9fb3a5"/>` + L(66, 20, 40, G, 6) + L(66, 32, 44) + L(66, 40, 36) + L(66, 50, 22, GOLD, 7)),
  "split-photo-r": W(L(10, 20, 40, G, 6) + L(10, 32, 44) + L(10, 40, 36) + `<rect x="62" y="14" width="48" height="44" rx="5" fill="#9fb3a5"/>`),
  gallery: W([0, 1, 2].flatMap((c) => [0, 1].map((r) => `<rect x="${10 + c * 35}" y="${10 + r * 27}" width="30" height="23" rx="3" fill="#9fb3a5"/>`)).join("")),
  "before-after": W(`<rect x="10" y="14" width="48" height="44" rx="4" fill="#b9b3a5"/><rect x="62" y="14" width="48" height="44" rx="4" fill="#9fb3a5"/>` + L(14, 18, 16, G, 6) + L(66, 18, 16, GOLD, 6)),
  cards: W(`<rect x="8" y="8" width="104" height="56" rx="6" fill="#fff"/>` + [0, 1, 2].map((i) => `<rect x="${16 + i * 33}" y="20" width="8" height="8" rx="2" fill="${G}"/>` + L(16 + i * 33, 34, 24, G) + L(16 + i * 33, 42, 20)).join("")),
  stats: W([0, 1, 2, 3].map((i) => L(12 + i * 26, 26, 16, G, 10) + L(10 + i * 26, 42, 20)).join("")),
  steps: W(`<path d="M24 26H96" stroke="${GOLD}" stroke-dasharray="3 3"/>` + [0, 1, 2].map((i) => `<circle cx="${24 + i * 36}" cy="26" r="7" fill="${G}"/>` + L(14 + i * 36, 40, 20, G) + L(12 + i * 36, 48, 24)).join("")),
  reviews: W([0, 1, 2].map((i) => `<rect x="${8 + i * 36}" y="14" width="32" height="44" rx="4" fill="#fff"/>` + L(12 + i * 36, 20, 16, GOLD) + L(12 + i * 36, 30, 24) + L(12 + i * 36, 36, 20)).join("")),
  faq: W(L(10, 16, 30, G, 6) + L(10, 28, 32) + [0, 1, 2].map((i) => `<rect x="50" y="${12 + i * 17}" width="60" height="13" rx="3" fill="#fff"/>` + L(54, 16 + i * 17, 36, G)).join("")),
  text: W(L(10, 16, 34, G, 6) + [0, 1, 2, 3].map((i) => L(56, 16 + i * 9, 24) + L(84, 16 + i * 9, 26)).join("")),
  banner: W(`<rect x="8" y="10" width="104" height="52" rx="6" fill="#4d6b5c"/>` + L(18, 24, 50, "#fff", 6) + L(18, 36, 40, "#d7e2da") + L(18, 46, 22, GOLD, 7)),
  cta: W(`<rect x="8" y="18" width="104" height="36" rx="8" fill="${G}"/>` + L(18, 28, 44, "#fff", 6) + L(18, 40, 36, "#9fb3a5") + L(80, 31, 24, GOLD, 9))
};
