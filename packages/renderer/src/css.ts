/**
 * Base and section styles. Everything reads the theme's custom properties, so a
 * theme change never touches this file. Mobile-first; no external dependencies.
 */
export const BASE_CSS = String.raw`
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:5rem}
@media (prefers-reduced-motion: reduce){html{scroll-behavior:auto}}
body{margin:0;background:var(--pb-bg);color:var(--pb-text);font-family:var(--pb-font-body);font-size:var(--pb-step-0);line-height:1.65;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto;display:block}
h1,h2,h3{font-family:var(--pb-font-heading);line-height:1.15;margin:0;text-wrap:balance;letter-spacing:-0.01em}
p{margin:0}
a{color:var(--pb-primary);text-underline-offset:0.2em;text-decoration-thickness:1px}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--pb-accent);outline-offset:3px;border-radius:2px}
ul,ol{margin:0;padding:0}
[role="list"]{list-style:none}
button,input,textarea{font:inherit;color:inherit}
.pb-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.pb-skip{position:absolute;left:1rem;top:-4rem;z-index:100;background:var(--pb-primary);color:var(--pb-on-primary);padding:.6rem 1rem;border-radius:var(--pb-radius)}
.pb-skip:focus{top:1rem}
.pb-container{width:100%;max-width:var(--pb-width);margin-inline:auto;padding-inline:clamp(1rem,4vw,2rem)}
.pb-narrow .pb-container{max-width:min(var(--pb-width),46rem)}
.pb-section{padding-block:calc(clamp(3.5rem,8vw,6.5rem) * var(--pb-space))}
.pb-section+.pb-section{border-top:1px solid var(--pb-border)}
.pb-section-title{font-size:var(--pb-step-3);margin-bottom:calc(2rem * var(--pb-space))}
.pb-eyebrow{font-family:var(--pb-font-mono);font-size:var(--pb-step-m1);letter-spacing:.08em;text-transform:uppercase;color:var(--pb-muted);margin-bottom:1rem}
.pb-meta{color:var(--pb-muted);font-size:var(--pb-step-m1)}
.pb-prose{display:grid;gap:1em;max-width:65ch}
.pb-prose p{font-size:var(--pb-step-1);line-height:1.6}
.pb-bullets{margin-top:.75rem;padding-left:1.2rem;display:grid;gap:.35rem}
.pb-bullets li::marker{color:var(--pb-accent)}
.pb-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-height:2.75rem;padding:.6rem 1.25rem;border-radius:var(--pb-radius);border:1px solid var(--pb-border);background:var(--pb-surface);color:var(--pb-text);text-decoration:none;font-weight:600;cursor:pointer;transition:transform .15s,box-shadow .15s}
.pb-btn:hover{transform:translateY(calc(-1px * var(--pb-motion)));box-shadow:var(--pb-shadow)}
.pb-btn--primary{background:var(--pb-primary);border-color:var(--pb-primary);color:var(--pb-on-primary)}
.pb-btn--lg{font-size:var(--pb-step-1);padding:.9rem 1.8rem}
.pb-actions{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:2rem}
.pb-chip{border:1px solid var(--pb-border);background:var(--pb-surface);color:var(--pb-text);border-radius:999px;padding:.3rem .8rem;font-size:var(--pb-step-m1);cursor:pointer;min-height:2rem}
.pb-chip[aria-pressed="true"]{background:var(--pb-text);color:var(--pb-bg);border-color:var(--pb-text)}
.pb-tags{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.9rem}
.pb-tag{font-family:var(--pb-font-mono);font-size:var(--pb-step-m1);padding:.15rem .55rem;border-radius:calc(var(--pb-radius) / 2);background:color-mix(in srgb,var(--pb-primary) 10%,var(--pb-surface));color:var(--pb-text)}
.pb-tags--lg .pb-tag{font-size:var(--pb-step-0);padding:.35rem .8rem}
.pb-card{background:var(--pb-surface);border:1px solid var(--pb-border);border-radius:var(--pb-radius);box-shadow:var(--pb-shadow);overflow:hidden}
.pb-card-body{padding:calc(1.25rem * var(--pb-space));display:grid;gap:.5rem;align-content:start}
.pb-card-title{font-size:var(--pb-step-1)}
.pb-card-title a{color:inherit;text-decoration:none}
.pb-card-title a:hover{color:var(--pb-primary)}
.pb-card-links{display:flex;flex-wrap:wrap;gap:1rem;margin-top:.5rem;font-weight:600}
.pb-ph{display:grid;place-items:center;background:linear-gradient(135deg,color-mix(in srgb,var(--pb-primary) 22%,var(--pb-surface)),color-mix(in srgb,var(--pb-accent) 22%,var(--pb-surface)));color:var(--pb-text);font-family:var(--pb-font-heading);font-weight:700;overflow:hidden}
.pb-ph span{padding:1rem;text-align:center;opacity:.75}
.pb-socials{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;margin-top:1.5rem;font-weight:600}
.pb-reveal{transition:opacity .6s ease,transform .6s ease}
.pb-js .pb-reveal:not(.pb-in){opacity:0;transform:translateY(calc(16px * var(--pb-motion)))}
@media (prefers-reduced-motion: reduce){.pb-js .pb-reveal:not(.pb-in){opacity:1;transform:none}.pb-reveal{transition:none}}
.pb-empty{border:2px dashed var(--pb-border);border-radius:var(--pb-radius);padding:2rem;text-align:center;color:var(--pb-muted)}

/* Navigation */
.pb-header{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--pb-bg) 88%,transparent);backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--pb-border)}
.pb-header .pb-container{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:4rem}
.pb-brand{font-family:var(--pb-font-heading);font-weight:700;font-size:var(--pb-step-1);color:var(--pb-text);text-decoration:none}
.pb-nav-links{display:none;gap:1.5rem;align-items:center}
.pb-nav-links a{color:var(--pb-text);text-decoration:none;font-weight:500}
.pb-nav-links a:hover{color:var(--pb-primary)}
.pb-nav-tools{display:flex;gap:.5rem;align-items:center}
.pb-icon-btn{display:inline-grid;place-items:center;width:2.75rem;height:2.75rem;border-radius:var(--pb-radius);border:1px solid var(--pb-border);background:var(--pb-surface);color:var(--pb-text);cursor:pointer}
.pb-icon-btn svg{width:1.2rem;height:1.2rem}
.pb-menu-btn[aria-expanded="true"]+.pb-nav-links,.pb-nav-open .pb-nav-links{display:flex}
@media (max-width: 767px){
  .pb-nav-links{position:absolute;inset:4rem 0 auto 0;flex-direction:column;align-items:stretch;gap:0;background:var(--pb-bg);border-bottom:1px solid var(--pb-border);padding:.5rem 1rem 1rem}
  .pb-nav-links a{padding:.8rem 0;border-bottom:1px solid var(--pb-border)}
}
@media (min-width: 768px){.pb-nav-links{display:flex}.pb-menu-btn{display:none}}
.pb-header--minimal .pb-nav-links,.pb-header--minimal .pb-menu-btn{display:none}
.pb-footer{padding-block:2.5rem;border-top:1px solid var(--pb-border);color:var(--pb-muted);font-size:var(--pb-step-m1)}
.pb-footer .pb-container{display:flex;flex-wrap:wrap;justify-content:space-between;gap:1rem}
.pb-footer a{color:inherit}
`;

export const SECTION_CSS = String.raw`
/* Hero */
.pb-hero{padding-block:calc(clamp(4rem,10vw,8rem) * var(--pb-space))}
.pb-hero-name{font-size:var(--pb-step-5);letter-spacing:-0.02em}
.pb-hero-headline{font-size:var(--pb-step-2);margin-top:1rem;font-family:var(--pb-font-heading);color:var(--pb-text)}
.pb-hero-tagline{font-size:var(--pb-step-1);margin-top:1rem;color:var(--pb-muted);max-width:55ch}
.pb-hero-split{display:grid;gap:3rem;align-items:center}
@media (min-width: 860px){.pb-hero-split{grid-template-columns:1.3fr 1fr}}
.pb-hero-photo{width:100%;max-width:22rem;aspect-ratio:4/5;object-fit:cover;border-radius:calc(var(--pb-radius) * 2);margin-inline:auto;font-size:var(--pb-step-4)}
.pb-hero-centered{text-align:center;display:grid;justify-items:center}
.pb-hero-centered .pb-actions,.pb-hero-centered .pb-socials{justify-content:center}
.pb-hero-centered .pb-hero-tagline{margin-inline:auto}
.pb-hero-avatar{width:9rem;height:9rem;border-radius:50%;object-fit:cover;margin-bottom:1.5rem;font-size:var(--pb-step-3)}
.pb-hero--bigtype .pb-hero-name{font-size:clamp(3rem,13vw,9rem);line-height:.95;letter-spacing:-0.04em}
.pb-hero--bigtype .pb-hero-headline{font-size:var(--pb-step-3);max-width:30ch}
.pb-terminal{background:#0d1117;color:#e6edf3;border-radius:calc(var(--pb-radius) + 4px);box-shadow:var(--pb-shadow);font-family:var(--pb-font-mono);font-size:var(--pb-step-m1);overflow:hidden;border:1px solid #30363d;min-width:0}
.pb-term-bar{display:flex;gap:.4rem;padding:.7rem .9rem;background:#161b22}
.pb-term-bar span{width:.7rem;height:.7rem;border-radius:50%;background:#30363d}
.pb-term-body{padding:1rem 1.2rem 1.4rem;display:grid;gap:.15rem;overflow-wrap:anywhere}
.pb-term-prompt{color:#7ee787}
.pb-term-out{color:#a5b3c1;margin-bottom:.6rem}
.pb-term-cursor{display:inline-block;width:.55em;height:1.1em;vertical-align:-.15em;background:#e6edf3;animation:pb-blink 1.1s steps(1) infinite}
@keyframes pb-blink{50%{opacity:0}}
@media (prefers-reduced-motion: reduce){.pb-term-cursor{animation:none}}

/* About */
.pb-about-grid{display:grid;gap:2.5rem;align-items:start}
@media (min-width: 760px){.pb-about-grid{grid-template-columns:minmax(0,18rem) 1fr}}
.pb-about-photo{width:100%;aspect-ratio:1;object-fit:cover;border-radius:calc(var(--pb-radius) * 1.5);font-size:var(--pb-step-3)}

/* Experience */
.pb-exp-list{display:grid;gap:calc(2rem * var(--pb-space))}
.pb-exp-role{font-size:var(--pb-step-1)}
.pb-exp-at{color:var(--pb-muted);font-weight:400}
.pb-exp-head{display:grid;gap:.25rem}
.pb-exp-list--timeline{border-left:2px solid var(--pb-border);padding-left:1.5rem;margin-left:.4rem}
.pb-exp-list--timeline .pb-exp{position:relative}
.pb-exp-list--timeline .pb-exp::before{content:"";position:absolute;left:calc(-1.5rem - 7px);top:.45rem;width:12px;height:12px;border-radius:50%;background:var(--pb-primary);box-shadow:0 0 0 4px var(--pb-bg)}
.pb-exp-list--cards{grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))}
.pb-exp-list--cards .pb-exp{background:var(--pb-surface);border:1px solid var(--pb-border);border-radius:var(--pb-radius);padding:calc(1.4rem * var(--pb-space));box-shadow:var(--pb-shadow)}
.pb-exp-list--compact{gap:0}
.pb-exp-list--compact .pb-exp{padding-block:1rem;border-bottom:1px solid var(--pb-border)}
.pb-exp-list--compact .pb-exp-head{grid-template-columns:1fr auto;align-items:baseline;gap:1rem}
@media (max-width: 600px){.pb-exp-list--compact .pb-exp-head{grid-template-columns:1fr}}

/* Projects */
.pb-projects-grid{display:grid;gap:calc(1.5rem * var(--pb-space));grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))}
.pb-project-img{width:100%;aspect-ratio:16/10;object-fit:cover;border-bottom:1px solid var(--pb-border);font-size:var(--pb-step-1)}
@media (min-width: 900px){.pb-projects-grid--featured .pb-project--featured{grid-column:1/-1;display:grid;grid-template-columns:1.4fr 1fr}.pb-projects-grid--featured .pb-project--featured .pb-project-img{aspect-ratio:auto;height:100%;border-bottom:0;border-right:1px solid var(--pb-border)}.pb-project--featured .pb-card-title{font-size:var(--pb-step-2)}}
.pb-projects-grid--list{grid-template-columns:1fr}
@media (min-width: 760px){.pb-projects-grid--list .pb-project{display:grid;grid-template-columns:16rem 1fr}.pb-projects-grid--list .pb-project-img{height:100%;aspect-ratio:auto;border-bottom:0;border-right:1px solid var(--pb-border)}}
.pb-filters{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.5rem}
.pb-project[hidden]{display:none}

/* Skills */
.pb-skill-group+.pb-skill-group{margin-top:1.75rem}
.pb-skill-group h3,.pb-skill-col h3{font-size:var(--pb-step-0);color:var(--pb-muted);font-family:var(--pb-font-body);font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.pb-skill-cols{display:grid;gap:2rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,13rem),1fr))}
.pb-skill-col ul{display:grid;gap:.4rem;margin-top:.8rem}

/* Simple lists: education, certifications, awards, writing */
.pb-simple-list{display:grid;gap:1.5rem}
.pb-simple-list>li{padding-bottom:1.5rem;border-bottom:1px solid var(--pb-border)}
.pb-simple-list>li:last-child{border-bottom:0;padding-bottom:0}
.pb-simple-cards{display:grid;gap:1.25rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))}
.pb-simple-cards>li{padding:calc(1.25rem * var(--pb-space));display:grid;gap:.4rem;align-content:start}
.pb-simple-title{font-size:var(--pb-step-1)}
.pb-simple-title a{color:inherit}
.pb-edu,.pb-simple{display:grid;gap:.3rem}

/* Testimonials */
.pb-quotes{display:grid;gap:1.5rem}
.pb-quotes--grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr))}
.pb-quote figure{margin:0;padding:calc(1.5rem * var(--pb-space));display:grid;gap:1rem;height:100%}
.pb-quote blockquote{margin:0;font-size:var(--pb-step-1);line-height:1.5}
.pb-quote blockquote p::before{content:"\201C"}
.pb-quote blockquote p::after{content:"\201D"}
.pb-quote figcaption{display:grid}
.pb-quote-author{font-weight:700}
.pb-quotes--single blockquote{font-size:var(--pb-step-3);font-family:var(--pb-font-heading);line-height:1.25}
.pb-quotes--single .pb-quote figure{padding-inline:0;border-left:4px solid var(--pb-accent);padding-left:1.5rem}

/* Gallery */
.pb-gallery{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr))}
.pb-gallery figure{margin:0;display:grid;gap:.5rem}
.pb-gallery figcaption{font-size:var(--pb-step-m1);color:var(--pb-muted)}
.pb-gallery-img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--pb-radius)}
.pb-gallery--masonry{display:block;columns:3 15rem;column-gap:1rem}
.pb-gallery--masonry li{break-inside:avoid;margin-bottom:1rem}
.pb-gallery--masonry .pb-gallery-img{aspect-ratio:auto}
.pb-gallery--masonry .pb-ph{aspect-ratio:3/4}
.pb-lightbox{border:0;padding:0;background:transparent;max-width:min(92vw,1400px);max-height:92vh}
.pb-lightbox::backdrop{background:rgb(0 0 0 / .85)}
.pb-lightbox img{max-height:86vh;width:auto;margin-inline:auto;border-radius:var(--pb-radius)}
.pb-lightbox button{position:fixed;top:1rem;right:1rem}

/* Contact */
.pb-contact-lead{font-size:var(--pb-step-2);font-family:var(--pb-font-heading);line-height:1.3;max-width:30ch}
.pb-contact-links{display:grid;gap:.6rem;margin-top:1.5rem;font-size:var(--pb-step-1)}
.pb-contact-links li{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem;overflow-wrap:anywhere}
.pb-contact-grid{display:grid;gap:3rem}
@media (min-width: 860px){.pb-contact-grid{grid-template-columns:1fr 1fr}}
.pb-contact-cta{display:grid;gap:1.75rem;justify-items:start}
.pb-form{display:grid;gap:1rem;margin-top:1.5rem}
.pb-field{display:grid;gap:.35rem}
.pb-field label{font-weight:600}
.pb-field input,.pb-field textarea{width:100%;padding:.75rem .9rem;border:1px solid var(--pb-border);border-radius:var(--pb-radius);background:var(--pb-surface);min-height:2.75rem}
.pb-field input:focus-visible,.pb-field textarea:focus-visible{outline-offset:1px}
.pb-hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.pb-form-status:empty{display:none}

/* Case study page */
.pb-case{padding-block:calc(3rem * var(--pb-space))}
.pb-case .pb-container{max-width:min(var(--pb-width),52rem)}
.pb-case-back{display:inline-block;margin-bottom:2rem;font-weight:600}
.pb-case h1{font-size:var(--pb-step-4)}
.pb-case-summary{font-size:var(--pb-step-1);color:var(--pb-muted);margin-top:1rem;max-width:60ch}
.pb-case-hero{margin-block:2.5rem;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:calc(var(--pb-radius) * 1.5);font-size:var(--pb-step-2)}
.pb-case-section{margin-top:2.5rem;display:grid;gap:1rem}
.pb-case-section h2{font-size:var(--pb-step-2)}
.pb-case-images{display:grid;gap:1rem;margin-top:2.5rem}
.pb-case-images img{border-radius:var(--pb-radius)}
`;
