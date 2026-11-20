'use strict';

/* Adrobot FX layer: boot sequence, pointer light, scramble, confetti.
   Independent of app.js: only reads #healthBadge classes and #createSuccess[hidden]. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const BG = '#07080a';

  /* ---------- pointer light ---------- */
  if (!reduced && matchMedia('(pointer: fine)').matches) {
    let raf = 0, px = 0, py = 0;
    addEventListener('pointermove', (e) => {
      px = e.clientX; py = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        root.style.setProperty('--mx', px + 'px');
        root.style.setProperty('--my', py + 'px');
      });
    }, { passive: true });
  }

  /* ---------- text scramble ---------- */
  function scramble(el) {
    if (reduced || !el) return;
    const fin = el.textContent;
    const chars = '01#/<>_';
    const D = 420, t0 = performance.now();
    (function f(now) {
      const k = Math.min((now - t0) / D, 1);
      const keep = Math.floor(k * fin.length);
      el.textContent = fin.slice(0, keep) + Array.from(fin.slice(keep), (c) => (c === ' ' ? ' ' : chars[(Math.random() * chars.length) | 0])).join('');
      if (k < 1) requestAnimationFrame(f); else el.textContent = fin;
    })(t0);
  }
  const activeTitle = () => $('.tab-panel:not([hidden]) h1');
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-active')) return;
      setTimeout(() => scramble(activeTitle()), 0);
    });
  });

  /* ---------- language switch: sync pulse, then translated-text glitch ---------- */
  document.addEventListener('adrobot:languagechange', () => {
    if (reduced) return;
    root.classList.add('is-language-switching');
    const visibleText = Array.from(document.querySelectorAll('[data-i18n], [data-i18n-ph], [data-i18n-title]'))
      .filter((el) => !el.closest('[hidden]') && el.getClientRects().length > 0);
    setTimeout(() => {
      root.classList.remove('is-language-switching');
      visibleText.forEach((el) => {
        el.classList.remove('fx-lang-glitch');
        void el.offsetWidth;
        el.classList.add('fx-lang-glitch');
        setTimeout(() => el.classList.remove('fx-lang-glitch'), 420);
      });
      scramble(activeTitle());
    }, 105);
  });

  /* ---------- pixel confetti on campaign created ---------- */
  const created = $('#createSuccess');
  function burst() {
    const r = created.getBoundingClientRect();
    const ox = r.left + Math.min(r.width / 2, 520);
    const oy = Math.max(60, Math.min(r.top + 40, innerHeight * 0.5));
    const c = document.createElement('canvas');
    c.className = 'fx-confetti';
    c.width = innerWidth; c.height = innerHeight;
    document.body.appendChild(c);
    const g = c.getContext('2d');
    const cols = ['#ff3347', '#e8e9ee', '#4ade80', '#ff3347'];
    const ps = Array.from({ length: 64 }, () => {
      const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9;
      return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, s: 4 + ((Math.random() * 3) | 0) * 2, c: cols[(Math.random() * cols.length) | 0] };
    });
    const t0 = performance.now();
    (function f(now) {
      const t = (now - t0) / 1000;
      g.clearRect(0, 0, c.width, c.height);
      for (const p of ps) {
        p.vy += 0.35; p.vx *= 0.985; p.x += p.vx; p.y += p.vy;
        g.globalAlpha = Math.max(0, 1 - t / 1.3);
        g.fillStyle = p.c;
        g.fillRect(Math.round(p.x / 4) * 4, Math.round(p.y / 4) * 4, p.s, p.s);
      }
      if (t < 1.3) requestAnimationFrame(f); else c.remove();
    })(t0);
  }
  if (created && !reduced) {
    new MutationObserver(() => { if (!created.hidden) burst(); }).observe(created, { attributes: true, attributeFilter: ['hidden'] });
  }

  /* ---------- pixel-built boot sequence ---------- */
  const boot = $('#boot');
  const MARK_A = [
    '................',
    '.......AA.......',
    '......####......',
    '.....##..##.....',
    '.....##..##.....',
    '....##....##....',
    '....##....##....',
    '...##########...',
    '...##########...',
    '..##........##..',
    '..##........##..',
    '.##..........##.',
    '.##..........##.',
    '##............##',
    '##............##',
    '................',
  ];
  const MARK_COLORS = { '#': '#e8e9ee', A: '#ff3347' };
  const HEALTH_LABEL = {
    ok: ['CONNECTED', 'ok'],
    warn: ['UNREACHABLE', 'fail'],
    off: ['NO KEY', 'wait'],
    down: ['API DOWN', 'fail'],
  };

  function dissolve(duration) {
    if (!boot) return;
    const w = innerWidth, h = innerHeight;
    const size = Math.max(24, Math.round(Math.min(w, h) / 22));
    const cols = Math.ceil(w / size), rows = Math.ceil(h / size);
    const canvas = document.createElement('canvas');
    canvas.className = 'boot-cover';
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    const cx = cols / 2, cy = rows / 2, maxDistance = Math.hypot(cx, cy) || 1;
    const cells = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const distance = Math.hypot(x - cx, y - cy) / maxDistance;
        cells.push({ x, y, at: (distance * 0.72 + Math.random() * 0.28) * duration });
      }
    }
    cells.sort((a, b) => a.at - b.at);
    boot.appendChild(canvas);
    boot.classList.add('is-dissolving');
    setTimeout(() => scramble(activeTitle()), 100);

    let index = 0;
    const startedAt = performance.now();
    (function step(now) {
      const elapsed = now - startedAt;
      while (index < cells.length && cells[index].at <= elapsed) {
        const cell = cells[index++];
        ctx.clearRect(cell.x * size, cell.y * size, size, size);
      }
      if (index < cells.length) {
        requestAnimationFrame(step);
      } else {
        boot.remove();
        document.body.classList.remove('is-booting');
      }
    })(startedAt);
  }

  function startBoot() {
    if (!boot) return;
    if (reduced) {
      boot.remove();
      document.body.classList.remove('is-booting');
      return;
    }

    let short = false;
    try {
      short = sessionStorage.getItem('adrobot.boot') === '1';
      sessionStorage.setItem('adrobot.boot', '1');
    } catch (err) { /* storage unavailable: use the full sequence */ }
    boot.classList.toggle('is-short', short);
    document.body.classList.add('is-booting');

    const mark = $('#bootMark');
    const ctx = mark && mark.getContext('2d');
    const logEl = $('#bootLog'), countEl = $('#bootCount'), barEl = $('#bootBar');
    if (!ctx || !logEl || !countEl || !barEl) {
      boot.remove();
      document.body.classList.remove('is-booting');
      return;
    }

    const pixels = [];
    MARK_A.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== '.') pixels.push({ x, y, ch, delay: Math.random() * (short ? 120 : 520) });
    }));

    /* Pull current Keitaro/API and DB state from the badge app.js updates. */
    const badge = $('#healthBadge');
    let healthState = null, apiVersion = null, databaseState = null;
    const readHealth = () => {
      const match = badge && badge.className.match(/health--([\w-]+)/);
      if (!match || match[1] === 'loading') return;
      healthState = match[1];
      apiVersion = badge.dataset.apiVersion || null;
      databaseState = badge.dataset.database || null;
    };
    readHealth();
    const observer = badge ? new MutationObserver(readHealth) : null;
    if (observer) observer.observe(badge, { attributes: true, attributeFilter: ['class', 'data-api-version', 'data-database'] });

    function bootRows(progress, now) {
      const rows = [];
      if (progress >= 0.12) rows.push(['CORE', 'READY', 'ok']);
      if (progress >= 0.32) {
        const status = HEALTH_LABEL[healthState] || ['CHECKING', 'wait'];
        rows.push(['KEITARO LINK', status[0], status[1]]);
      }
      if (progress >= 0.5) rows.push(['API VERSION', apiVersion ? `v${apiVersion}` : 'WAIT', apiVersion ? 'ok' : 'wait']);
      if (progress >= 0.68) {
        const db = databaseState === 'ok' ? ['OK', 'ok'] : databaseState === 'error' ? ['ERROR', 'fail'] : ['WAIT', 'wait'];
        rows.push(['DATABASE LINK', db[0], db[1]]);
      }
      if (progress >= 0.82) {
        rows.push(['SYSTEM CLOCK', new Date().toLocaleTimeString(undefined, { hour12: false }), '']);
      }
      return rows;
    }

    let skip = false;
    const onSkip = () => { skip = true; };
    addEventListener('keydown', onSkip, { once: true });
    addEventListener('pointerdown', onSkip, { once: true });

    const FULL_MS = 1200, SHORT_MS = 250, HEALTH_WAIT_MS = 2200;
    const startedAt = performance.now();
    let phase = 'run', blinkAt = 0, lastLogSignature = '';

    (function frame(now) {
      const elapsed = now - startedAt;
      const blink = phase === 'blink';
      ctx.clearRect(0, 0, 16, 16);
      for (const pixel of pixels) {
        if (elapsed < pixel.delay) continue;
        ctx.fillStyle = blink && pixel.ch === 'A' ? '#17191e' : (elapsed - pixel.delay < 75 ? '#ff3347' : MARK_COLORS[pixel.ch]);
        ctx.fillRect(pixel.x, pixel.y, 1, 1);
      }

      const progress = Math.min(elapsed / (short ? SHORT_MS : FULL_MS), 1);
      const percent = Math.round(progress * 100);
      barEl.style.width = percent + '%';
      barEl.setAttribute('aria-valuenow', String(percent));
      if (!short) countEl.textContent = String(percent).padStart(3, '0');

      const rows = short ? [] : bootRows(progress, now);
      const signature = rows.map((row) => row.join('|')).join('\n');
      if (signature !== lastLogSignature) {
        logEl.replaceChildren();
        rows.forEach(([key, value, state]) => {
          const line = document.createElement('div');
          line.className = 'boot-row';
          const prefix = document.createElement('span');
          prefix.className = 'boot-prefix';
          prefix.textContent = '›';
          const label = document.createElement('span');
          label.className = 'boot-key';
          label.textContent = key;
          const result = document.createElement('b');
          result.className = 'boot-value' + (state ? ` ${state}` : '');
          result.textContent = value;
          line.append(prefix, label, result);
          logEl.appendChild(line);
        });
        lastLogSignature = signature;
      }

      if (phase === 'run') {
        const ready = skip || (short ? elapsed >= SHORT_MS : progress >= 1 && (healthState || elapsed >= HEALTH_WAIT_MS));
        if (ready) {
          phase = 'blink';
          blinkAt = now;
        }
      } else if (now - blinkAt > (skip ? 35 : (short ? 20 : 150))) {
        removeEventListener('keydown', onSkip);
        removeEventListener('pointerdown', onSkip);
        if (observer) observer.disconnect();
        dissolve(skip ? 190 : (short ? 100 : 520));
        return;
      }
      requestAnimationFrame(frame);
    })(startedAt);
  }

  try {
    startBoot();
  } catch (err) {
    if (boot) boot.remove();
    document.body.classList.remove('is-booting');
  }
})();
