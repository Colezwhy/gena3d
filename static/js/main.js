(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const play = v => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };

  /* ───────── scroll progress + active section ───────── */
  const progress = $('.progress');
  const onScroll = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    progress.style.transform = `scaleX(${max > 0 ? h.scrollTop / max : 0})`;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const navLinks = $$('.nav a');
  const navById = new Map(navLinks.map(a => [a.getAttribute('href').slice(1), a]));
  const navIO = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    navLinks.forEach(a => a.classList.remove('is-active'));
    const a = navById.get(e.target.id);
    if (a) a.classList.add('is-active');
  }), { rootMargin: '-40% 0px -55% 0px' });
  navById.forEach((_, id) => { const s = document.getElementById(id); if (s) navIO.observe(s); });

  /* ───────── hero: texture | geometry split viewer ─────────
     Each source video is two 512×512 renders side by side: texture on the left, normals on the right.
     The canvas shows the texture half, and the normal half to the right of the split line. */
  const stage = $('#vw-stage');
  const canvas = $('#vw-canvas');
  const ctx = canvas.getContext('2d');
  const vid = $('#vw-video');
  const line = $('#vw-line');
  const knob = $('#vw-knob');
  const chips = $$('.vw-chip');
  let split = 0.5, lastUser = -1e9, dragging = false, heroVisible = true, poster = null, phase = 0, lastT = 0;
  const SWEEP_AMP = 0.3, SWEEP_PERIOD = 7000, IDLE_MS = 3500;

  function source() {
    if (vid.readyState >= 2 && vid.videoWidth) return [vid, vid.videoWidth, vid.videoHeight];
    if (poster && poster.complete && poster.naturalWidth) return [poster, poster.naturalWidth, poster.naturalHeight];
    return null;
  }
  function draw() {
    const W = canvas.width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, W);
    const s = source();
    if (!s) return;
    const [src, w, h] = s;
    const half = w / 2;
    ctx.drawImage(src, 0, 0, half, h, 0, 0, W, W);
    const x = Math.round(split * W);
    if (x < W) ctx.drawImage(src, half + (x / W) * half, 0, half - (x / W) * half, h, x, 0, W - x, W);
  }
  function setSplit(f) {
    split = clamp(f, 0, 1);
    const pct = (split * 100).toFixed(2) + '%';
    line.style.left = pct;
    knob.style.left = pct;
    knob.setAttribute('aria-valuenow', String(Math.round(split * 100)));
    knob.setAttribute('aria-valuetext', `${Math.round(split * 100)}% texture`);
  }
  function sizeCanvas() {
    const r = stage.getBoundingClientRect();
    const px = Math.round(clamp(r.width * Math.min(2, window.devicePixelRatio || 1), 256, 1024));
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    draw();
  }
  function frame(t) {
    if (!heroVisible) return;
    const dt = Math.min(64, t - (lastT || t));
    lastT = t;
    if (!reduceMotion && !dragging && t - lastUser > IDLE_MS) {
      phase += (dt / SWEEP_PERIOD) * Math.PI * 2;
      setSplit(0.5 + SWEEP_AMP * Math.sin(phase));
    }
    draw();
    requestAnimationFrame(frame);
  }
  function touch() {
    lastUser = performance.now();
    stage.classList.add('touched');
    // resume the sweep from wherever the user left the line
    phase = Math.asin(clamp((split - 0.5) / SWEEP_AMP, -1, 1));
  }
  const fromEvent = e => { const r = stage.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
  stage.addEventListener('pointerdown', e => {
    dragging = true;
    stage.setPointerCapture(e.pointerId);
    setSplit(fromEvent(e)); touch(); draw();
  });
  stage.addEventListener('pointermove', e => {
    if (dragging || e.pointerType === 'mouse') { setSplit(fromEvent(e)); touch(); draw(); }
  });
  const endDrag = () => { if (dragging) { dragging = false; touch(); } };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  knob.addEventListener('keydown', e => {
    const step = e.shiftKey ? 0.1 : 0.05;
    let f = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') f = split - step;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') f = split + step;
    if (e.key === 'Home') f = 0;
    if (e.key === 'End') f = 1;
    if (f === null) return;
    e.preventDefault();
    setSplit(f); touch(); draw();
  });
  const thumbs = $('#vw-thumbs');
  const viewsLabel = $('#vw-views');
  function showInputs(chip) {
    const srcs = chip.dataset.inputs.split(',');
    thumbs.dataset.kind = chip.dataset.kind;
    thumbs.dataset.n = String(srcs.length);
    thumbs.style.setProperty('--n', String(Math.min(srcs.length, chip.dataset.kind === 'photo' ? 2 : 4)));
    thumbs.replaceChildren(...srcs.map(src => { const im = new Image(); im.src = src; im.alt = ''; return im; }));
    viewsLabel.textContent = srcs.length === 1 ? '1 view' : srcs.length + ' views';
  }
  function loadObject(slug) {
    chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.slug === slug)));
    showInputs(chips.find(c => c.dataset.slug === slug));
    poster = new Image();
    poster.onload = draw;
    poster.src = `static/video/g/${slug}.jpg`;
    vid.src = `static/video/g/${slug}.mp4`;
    vid.load();
    if (!reduceMotion && heroVisible) play(vid);
  }
  chips.forEach(c => c.addEventListener('click', () => loadObject(c.dataset.slug)));
  vid.addEventListener('loadeddata', draw);
  new ResizeObserver(sizeCanvas).observe(stage);
  new IntersectionObserver(([e]) => {
    const was = heroVisible;
    heroVisible = e.isIntersecting;
    if (heroVisible) {
      if (!reduceMotion) play(vid);
      if (!was) { lastT = 0; requestAnimationFrame(frame); }
    } else if (!vid.paused) vid.pause();
  }, { threshold: 0.05 }).observe(stage);
  setSplit(0.5);
  loadObject(chips[0].dataset.slug);
  requestAnimationFrame(frame);

  /* ───────── overview demo video ───────── */
  const demo = $('#demo-video');
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !reduceMotion) play(demo); else if (!demo.paused) demo.pause();
  }, { threshold: 0.3 }).observe(demo);

  /* ───────── tablists ───────── */
  function tablist(tabs, onSelect) {
    const select = tab => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const p = document.getElementById(t.getAttribute('aria-controls'));
        if (p) p.hidden = !on;
      });
      if (onSelect) onSelect(tab);
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', e => {
        let j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') j = 0;
        if (e.key === 'End') j = tabs.length - 1;
        if (j === null) return;
        e.preventDefault();
        tabs[j].focus();
        select(tabs[j]);
      });
    });
  }
  tablist($$('#gallery [role="tab"]'));
  tablist($$('#fig-tabs [role="tab"]'));

  /* ───────── 360° gallery ───────── */
  const grids = $$('.g-grid');
  const modeBtns = $$('#gallery .seg button');
  modeBtns.forEach(b => b.addEventListener('click', () => {
    modeBtns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    grids.forEach(g => { g.dataset.mode = b.dataset.mode; });
  }));
  $$('.g-flip').forEach(btn => btn.addEventListener('click', () => {
    const card = btn.closest('.g-card');
    const on = card.classList.toggle('flip');
    btn.setAttribute('aria-pressed', String(on));
  }));
  // load each video only when its card comes near the viewport; pause it when it leaves
  const galleryIO = new IntersectionObserver(entries => entries.forEach(e => {
    const v = e.target;
    if (e.isIntersecting) {
      if (!v.getAttribute('src')) { v.src = v.dataset.src; v.preload = 'auto'; }
      if (!reduceMotion) play(v);
    } else if (!v.paused) v.pause();
  }), { rootMargin: '120px 0px', threshold: 0.1 });
  $$('.g-media video').forEach(v => galleryIO.observe(v));

  /* ───────── lightbox ───────── */
  const lb = $('#lightbox'), lbImg = $('#lb-img'), lbClose = $('#lb-close');
  let lbReturn = null;
  const closeLB = () => { lb.hidden = true; document.body.style.overflow = ''; if (lbReturn) lbReturn.focus(); };
  $$('[data-zoom]').forEach(b => b.addEventListener('click', () => {
    const img = b.querySelector('img');
    lbReturn = b;
    lbImg.src = b.dataset.zoom;
    lbImg.alt = b.dataset.alt || (img ? img.alt : '');
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    lbClose.focus();
  }));
  lbClose.addEventListener('click', closeLB);
  lb.addEventListener('click', e => { if (e.target === lb) closeLB(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) closeLB(); });

  /* ───────── copy BibTeX ───────── */
  const copyBtn = $('#copy-bib');
  copyBtn.addEventListener('click', () => {
    const pre = $('#bib-text');
    const label = copyBtn.lastElementChild;
    const done = t => { label.textContent = t; setTimeout(() => { label.textContent = 'Copy'; }, 1600); };
    const select = () => {
      const r = document.createRange();
      r.selectNodeContents(pre);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      done('Selected');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pre.textContent).then(() => done('Copied'), select);
    else select();
  });
})();
