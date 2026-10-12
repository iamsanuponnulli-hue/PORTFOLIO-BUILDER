import type { BehaviourName } from './sections/shared.ts';

/**
 * Small scripts shipped with the site. Each is plain ES2018 with no dependencies
 * and is included only when the site uses it. Content stays readable without JS.
 */
const SCRIPTS: Record<BehaviourName, string> = {
  reveal: `
  var els = document.querySelectorAll('.pb-reveal');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window) || reduce) {
    els.forEach(function (el) { el.classList.add('pb-in'); });
  } else {
    document.documentElement.classList.add('pb-js');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('pb-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }`,

  nav: `
  var btn = document.querySelector('.pb-menu-btn');
  var header = document.querySelector('.pb-header');
  if (btn && header) {
    var setOpen = function (open) {
      btn.setAttribute('aria-expanded', String(open));
      header.classList.toggle('pb-nav-open', open);
    };
    btn.addEventListener('click', function () { setOpen(btn.getAttribute('aria-expanded') !== 'true'); });
    header.querySelectorAll('.pb-nav-links a').forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  }`,

  theme: `
  var root = document.documentElement;
  var toggle = document.querySelector('[data-pb-theme-toggle]');
  var stored = null;
  try { stored = localStorage.getItem('pb-theme'); } catch (e) {}
  if (stored === 'light' || stored === 'dark') root.setAttribute('data-theme', stored);
  var current = function () {
    var t = root.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };
  var label = function () {
    if (toggle) toggle.setAttribute('aria-label', current() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  };
  label();
  if (toggle) toggle.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('pb-theme', next); } catch (e) {}
    label();
  });`,

  filter: `
  document.querySelectorAll('.pb-filters').forEach(function (group) {
    var list = group.parentElement.querySelector('.pb-projects-grid');
    group.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pb-filter]');
      if (!b) return;
      var tag = b.getAttribute('data-pb-filter');
      group.querySelectorAll('[data-pb-filter]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      list.querySelectorAll('.pb-project').forEach(function (p) {
        var tags = (p.getAttribute('data-tags') || '').split(' ');
        p.hidden = !!tag && tags.indexOf(tag) < 0;
      });
    });
  });`,

  lightbox: `
  var links = document.querySelectorAll('[data-pb-lightbox]');
  if (links.length && typeof HTMLDialogElement === 'function') {
    var dlg = document.createElement('dialog');
    dlg.className = 'pb-lightbox';
    dlg.innerHTML = '<button type="button" class="pb-icon-btn" aria-label="Close image">\\u2715</button><img alt="">';
    document.body.appendChild(dlg);
    var im = dlg.querySelector('img');
    dlg.querySelector('button').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    links.forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var inner = a.querySelector('img');
        im.src = a.getAttribute('href');
        im.alt = inner ? inner.alt : '';
        dlg.showModal();
      });
    });
  }`,

  copy: `
  document.querySelectorAll('[data-pb-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-pb-copy');
      var done = function () { var t = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = t; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    });
  });`,

  form: `
  document.querySelectorAll('form[data-pb-form]').forEach(function (f) {
    var status = f.querySelector('.pb-form-status');
    f.addEventListener('submit', function (e) {
      if (!window.fetch) return;
      e.preventDefault();
      if (window.__PB_PREVIEW__) { status.textContent = 'In your published site, this sends the message to your form service.'; return; }
      var btn = f.querySelector('button[type=submit]');
      btn.disabled = true;
      status.textContent = 'Sending\\u2026';
      fetch(f.action, { method: 'POST', body: new FormData(f), headers: { Accept: 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error();
          f.reset();
          status.textContent = 'Thanks! Your message was sent.';
        })
        .catch(function () { status.textContent = 'Sorry, the message could not be sent. Please email me instead.'; })
        .then(function () { btn.disabled = false; });
    });
  });`,
};

const ORDER: BehaviourName[] = ['theme', 'nav', 'reveal', 'filter', 'lightbox', 'copy', 'form'];

export function behavioursJs(used: Set<BehaviourName>): string {
  const parts = ORDER.filter((b) => used.has(b)).map(
    (b) => `  // ${b}\n  (function () {${SCRIPTS[b]}\n  })();`,
  );
  if (!parts.length) return '';
  return `/* Portfolio site scripts. */\n(function () {\n  'use strict';\n${parts.join('\n')}\n})();\n`;
}
