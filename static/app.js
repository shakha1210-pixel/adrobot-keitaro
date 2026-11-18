'use strict';

/* ============================================================
   Adrobot — фронтенд панели управления Keitaro
   Ванильный JS (ES2020+), без зависимостей и сборки.
   API-контракт соответствует FastAPI-бэкенду Adrobot.
   ============================================================ */

/* ---------------- утилиты ---------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function num0(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/* целое число с пробелами-разделителями: 1 234 */
function fmtInt(value) {
  return Math.trunc(num0(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/* строка-число (например payout_value "1.5000") с пробелами в целой части */
function fmtDecimalStr(value) {
  if (value === null || value === undefined || value === '') return '0';
  const str = String(value);
  const m = str.match(/^(-?\d+)(\.\d+)?$/);
  if (!m) return esc(str);
  return m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (m[2] || '');
}

/* проценты с 1 десятичным знаком (CR) */
function fmtPct1(value) {
  return num0(value).toFixed(1) + '%';
}

/* доля оффера: целые без знаков, дробные с 1 знаком */
function fmtSharePct(value) {
  const n = num0(value);
  return (Number.isInteger(n) ? String(n) : n.toFixed(1)) + '%';
}

/* ISO-время из журнала операций → локальное время */
function fmtDateTimeLocal(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* подсветка подстроки поиска */
function highlight(text, query) {
  const safe = esc(text);
  const q = String(query || '').trim();
  if (!q) return safe;
  const idx = safe.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return safe;
  return safe.slice(0, idx) + '<mark>' + safe.slice(idx, idx + q.length) + '</mark>';
}

/* ---------------- иконки ---------------- */

const ICONS = {
  search: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M16.6 16.6 21 21"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5L19.5 7"/></svg>',
  copy: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  refresh: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  trash: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  plus: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  alert: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.5 19.5h19L12 3z"/><path d="M12 9.5v4.5"/><path d="M12 17.2v.3"/></svg>',
  info: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5v.3"/></svg>',
  x: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  arrow: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16"/><path d="M13 5l7 7-7 7"/></svg>',
};

/* ---------------- состояние ---------------- */

let meta = null;
let creating = false;
let currentTab = 'create';

/* ---------------- API ---------------- */

class ApiError extends Error {
  constructor(code, message, status, raw) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.raw = raw;
  }
}

async function api(path, { method = 'GET', body } = {}) {
  const options = { method, headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(path, options);
  } catch (cause) {
    throw new ApiError('network', 'Нет связи с сервером. Проверьте, что API Adrobot запущен.', 0, cause);
  }
  let data = null;
  try {
    data = await response.json();
  } catch (err) { /* тело не JSON */ }
  if (!response.ok) {
    const err = data && data.error ? data.error : null;
    throw new ApiError(
      err && err.code ? err.code : 'internal',
      err && err.message ? err.message : `Ошибка сервера (HTTP ${response.status})`,
      response.status,
      data,
    );
  }
  return data;
}

/* ---------------- тосты ---------------- */

const toastRoot = $('#toastRoot');
const TOAST_ICONS = {
  success: ICONS.check,
  error: ICONS.alert,
  warning: ICONS.alert,
  info: ICONS.info,
};

function toast(message, type = 'info', duration = 5000) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || ICONS.info}</span>
    <span class="toast-text">${esc(message)}</span>
    <button type="button" class="toast-close" aria-label="Закрыть уведомление">${ICONS.x}</button>`;
  toastRoot.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-visible')));

  let timer = setTimeout(removeToast, duration);
  function removeToast() {
    clearTimeout(timer);
    el.classList.remove('is-visible');
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  }
  el.querySelector('.toast-close').addEventListener('click', removeToast);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(removeToast, 1600); });
  while (toastRoot.children.length > 5) toastRoot.firstElementChild.remove();
}

/* ---------------- модальное окно подтверждения ---------------- */

const modalRoot = $('#modalRoot');

function confirmModal({ title, message, confirmLabel = 'Удалить', cancelLabel = 'Отмена', danger = true }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <div class="modal-head">
          <h3 id="m-title">${esc(title)}</h3>
          <button type="button" class="icon-btn modal-x" aria-label="Закрыть">${ICONS.x}</button>
        </div>
        <div class="modal-body">${message}</div>
        <div class="modal-actions">
          <button type="button" class="btn btn--ghost" data-act="cancel">${esc(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-act="confirm">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    modalRoot.appendChild(overlay);
    modalRoot.hidden = false;

    const confirmBtn = overlay.querySelector('[data-act="confirm"]');
    let settled = false;
    const close = (value) => {
      if (settled) return;
      settled = true;
      overlay.remove();
      if (!modalRoot.children.length) modalRoot.hidden = true;
      document.removeEventListener('keydown', onKey, { capture: true });
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(false);
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(false);
    });
    overlay.querySelector('.modal-x').addEventListener('click', () => close(false));
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    document.addEventListener('keydown', onKey, { capture: true });
    requestAnimationFrame(() => {
      overlay.classList.add('is-visible');
      confirmBtn.focus();
    });
  });
}

/* ---------------- здоровье API ---------------- */

const healthBadge = $('#healthBadge');

async function checkHealth() {
  let state = 'loading';
  let label = 'Проверка подключения…';
  let title = 'Adrobot API';
  try {
    const health = await api('/health');
    const states = {
      ok: ['ok', 'Keitaro: подключено'],
      unreachable: ['warn', 'Keitaro: недоступен'],
      unconfigured: ['off', 'Keitaro: ключ не задан'],
    };
    const mapped = states[health.keitaro];
    if (mapped) {
      [state, label] = mapped;
      title = `Adrobot API v${esc(health.version || '?')} · БД: ${health.db === 'ok' ? 'ok' : 'ошибка'}`;
    } else {
      state = 'off';
      label = `Keitaro: ${esc(health.keitaro || '?')}`;
    }
  } catch (err) {
    state = 'down';
    label = 'API недоступен';
    title = err.message;
  }
  healthBadge.className = `health health--${state}`;
  healthBadge.title = title;
  $('.health-label', healthBadge).textContent = label;
}

/* ---------------- мета-конфигурация ---------------- */

async function loadMeta() {
  const banner = $('#metaBanner');
  try {
    meta = await api('/api/meta');
    banner.hidden = true;
    applyMeta();
  } catch (err) {
    meta = null;
    banner.hidden = false;
    banner.innerHTML = `
      ${ICONS.alert}
      <span>Не удалось загрузить конфигурацию сервера: ${esc(err.message)}. Создание кампаний временно недоступно.
        <button type="button" class="link-btn" id="metaRetry">Повторить</button>
      </span>`;
    $('#metaRetry').addEventListener('click', loadMeta);
    setCreatorEnabled(false);
  }
}

function applyMeta() {
  nameInput.placeholder = `${meta.prefix}campaign1`;
  setCreatorEnabled(true);
  updateNameHint();
  renderMetaFooter();
}

function renderMetaFooter() {
  const footer = $('#appFooter');
  if (!meta) {
    footer.hidden = true;
    return;
  }
  const parts = [];
  if (meta.keitaro_url) parts.push(`Keitaro: <a href="${esc(meta.keitaro_url)}" target="_blank" rel="noopener">${esc(meta.keitaro_url)}</a>`);
  if (meta.prefix) parts.push(`Префикс: <code>${esc(meta.prefix)}</code>`);
  if (meta.domain) parts.push(`Домен: <code>${esc(meta.domain)}</code>`);
  if (meta.report) parts.push(`Отчёт: <code>${esc(meta.report.interval || '—')}</code> · <code>${esc(meta.report.timezone || '—')}</code>`);
  footer.hidden = parts.length === 0;
  footer.innerHTML = parts.join('<span class="footer-sep" aria-hidden="true">•</span>');
}

function setCreatorEnabled(enabled) {
  nameInput.disabled = !enabled;
  geoInput.disabled = !enabled;
  offerInput.disabled = !enabled;
  createBtn.disabled = !enabled || creating;
  if (!enabled) {
    nameInput.placeholder = 'Конфигурация недоступна';
    setHint(nameHint, 'Создание кампаний недоступно — не загружена конфигурация', 'error');
  }
}

/* ---------------- табы ---------------- */

function switchTab(name) {
  currentTab = name;
  ['create', 'editor', 'history'].forEach((key) => {
    const panel = $(`#tab-${key}`);
    const btn = $(`#tab-btn-${key}`);
    const active = key === name;
    panel.hidden = !active;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
    panel.tabIndex = active ? 0 : -1;
  });
  if (name === 'history') loadHistory();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* ---------------- страны ---------------- */

const COUNTRIES = [
  ['US', 'Соединённые Штаты', 'United States'],
  ['GB', 'Великобритания', 'United Kingdom'],
  ['DE', 'Германия', 'Germany'],
  ['FR', 'Франция', 'France'],
  ['ES', 'Испания', 'Spain'],
  ['IT', 'Италия', 'Italy'],
  ['RU', 'Россия', 'Russia'],
  ['UA', 'Украина', 'Ukraine'],
  ['KZ', 'Казахстан', 'Kazakhstan'],
  ['UZ', 'Узбекистан', 'Uzbekistan'],
  ['TR', 'Турция', 'Turkey'],
  ['PL', 'Польша', 'Poland'],
  ['NL', 'Нидерланды', 'Netherlands'],
  ['SE', 'Швеция', 'Sweden'],
  ['NO', 'Норвегия', 'Norway'],
  ['FI', 'Финляндия', 'Finland'],
  ['DK', 'Дания', 'Denmark'],
  ['AT', 'Австрия', 'Austria'],
  ['CH', 'Швейцария', 'Switzerland'],
  ['CZ', 'Чехия', 'Czechia'],
  ['SK', 'Словакия', 'Slovakia'],
  ['HU', 'Венгрия', 'Hungary'],
  ['RO', 'Румыния', 'Romania'],
  ['BG', 'Болгария', 'Bulgaria'],
  ['GR', 'Греция', 'Greece'],
  ['PT', 'Португалия', 'Portugal'],
  ['IE', 'Ирландия', 'Ireland'],
  ['BE', 'Бельгия', 'Belgium'],
  ['LU', 'Люксембург', 'Luxembourg'],
  ['CN', 'Китай', 'China'],
  ['JP', 'Япония', 'Japan'],
  ['KR', 'Южная Корея', 'South Korea'],
  ['IN', 'Индия', 'India'],
  ['ID', 'Индонезия', 'Indonesia'],
  ['TH', 'Таиланд', 'Thailand'],
  ['VN', 'Вьетнам', 'Vietnam'],
  ['MY', 'Малайзия', 'Malaysia'],
  ['SG', 'Сингапур', 'Singapore'],
  ['PH', 'Филиппины', 'Philippines'],
  ['AU', 'Австралия', 'Australia'],
  ['NZ', 'Новая Зеландия', 'New Zealand'],
  ['CA', 'Канада', 'Canada'],
  ['MX', 'Мексика', 'Mexico'],
  ['BR', 'Бразилия', 'Brazil'],
  ['AR', 'Аргентина', 'Argentina'],
  ['CL', 'Чили', 'Chile'],
  ['CO', 'Колумбия', 'Colombia'],
  ['PE', 'Перу', 'Peru'],
  ['EC', 'Эквадор', 'Ecuador'],
  ['EG', 'Египет', 'Egypt'],
  ['ZA', 'ЮАР', 'South Africa'],
  ['NG', 'Нигерия', 'Nigeria'],
  ['KE', 'Кения', 'Kenya'],
  ['MA', 'Марокко', 'Morocco'],
  ['AE', 'ОАЭ', 'United Arab Emirates'],
  ['SA', 'Саудовская Аравия', 'Saudi Arabia'],
  ['QA', 'Катар', 'Qatar'],
  ['KW', 'Кувейт', 'Kuwait'],
  ['IL', 'Израиль', 'Israel'],
  ['GE', 'Грузия', 'Georgia'],
  ['AM', 'Армения', 'Armenia'],
  ['AZ', 'Азербайджан', 'Azerbaijan'],
  ['BY', 'Беларусь', 'Belarus'],
  ['MD', 'Молдова', 'Moldova'],
  ['LT', 'Литва', 'Lithuania'],
  ['LV', 'Латвия', 'Latvia'],
  ['EE', 'Эстония', 'Estonia'],
  ['KG', 'Киргизия', 'Kyrgyzstan'],
  ['TJ', 'Таджикистан', 'Tajikistan'],
  ['TM', 'Туркменистан', 'Turkmenistan'],
  ['MN', 'Монголия', 'Mongolia'],
  ['RS', 'Сербия', 'Serbia'],
  ['HR', 'Хорватия', 'Croatia'],
  ['SI', 'Словения', 'Slovenia'],
  ['BA', 'Босния и Герцеговина', 'Bosnia and Herzegovina'],
  ['ME', 'Черногория', 'Montenegro'],
  ['MK', 'Северная Македония', 'North Macedonia'],
  ['AL', 'Албания', 'Albania'],
  ['CY', 'Кипр', 'Cyprus'],
  ['MT', 'Мальта', 'Malta'],
  ['IS', 'Исландия', 'Iceland'],
  ['PK', 'Пакистан', 'Pakistan'],
  ['BD', 'Бангладеш', 'Bangladesh'],
  ['LK', 'Шри-Ланка', 'Sri Lanka'],
  ['NP', 'Непал', 'Nepal'],
  ['KH', 'Камбоджа', 'Cambodia'],
  ['LA', 'Лаос', 'Laos'],
  ['MM', 'Мьянма', 'Myanmar'],
  ['TW', 'Тайвань', 'Taiwan'],
  ['HK', 'Гонконг', 'Hong Kong'],
  ['UY', 'Уругвай', 'Uruguay'],
  ['VE', 'Венесуэла', 'Venezuela'],
  ['GT', 'Гватемала', 'Guatemala'],
  ['CR', 'Коста-Рика', 'Costa Rica'],
  ['PA', 'Панама', 'Panama'],
  ['DO', 'Доминикана', 'Dominican Republic'],
  ['CU', 'Куба', 'Cuba'],
  ['TN', 'Тунис', 'Tunisia'],
  ['DZ', 'Алжир', 'Algeria'],
  ['GH', 'Гана', 'Ghana'],
  ['ET', 'Эфиопия', 'Ethiopia'],
  ['TZ', 'Танзания', 'Tanzania'],
  ['IR', 'Иран', 'Iran'],
  ['IQ', 'Ирак', 'Iraq'],
  ['JO', 'Иордания', 'Jordan'],
  ['LB', 'Ливан', 'Lebanon'],
  ['OM', 'Оман', 'Oman'],
  ['BH', 'Бахрейн', 'Bahrain'],
];

const COUNTRY_MAP = new Map(COUNTRIES.map((c) => [c[0], c]));

function flagOf(code) {
  return String.fromCodePoint(...[...code].map((ch) => 0x1F1E6 + ch.charCodeAt(0) - 65));
}

/* ---------------- комбобокс ---------------- */

const comboboxRegistry = new Set();
document.addEventListener('click', (event) => {
  comboboxRegistry.forEach((cb) => {
    if (!cb.root.contains(event.target)) cb.close();
  });
});

class Combobox {
  constructor(options) {
    this.root = options.root;
    this.input = options.input;
    this.list = options.list;
    this.search = options.search;
    this.renderItem = options.renderItem;
    this.valueOf = options.valueOf || ((item) => String(item));
    this.onSelect = options.onSelect || (() => {});
    this.onInput = options.onInput || (() => {});
    this.debounceMs = typeof options.debounceMs === 'number' ? options.debounceMs : 300;
    this.emptyText = options.emptyText || 'Ничего не найдено';
    this.loadingText = options.loadingText || 'Загрузка…';

    this.open = false;
    this.items = [];
    this.active = -1;
    this.pending = false;
    this.errorText = '';
    this.reqId = 0;
    this.timer = null;
    this.selected = null;

    this.list.addEventListener('mousedown', (event) => event.preventDefault());
    this.list.addEventListener('click', (event) => {
      const itemBtn = event.target.closest('.cb-item');
      if (itemBtn) this.choose(Number(itemBtn.dataset.idx));
    });
    this.input.addEventListener('focus', () => { this.query(); });
    this.input.addEventListener('input', () => {
      this.onInput(this.input.value);
      this.selected = null;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.query(), this.debounceMs);
    });
    this.input.addEventListener('keydown', (event) => this.handleKeydown(event));

    const caret = $('.cb-caret', this.root);
    if (caret) caret.addEventListener('click', () => { this.input.focus(); this.query(); });

    comboboxRegistry.add(this);
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-expanded', 'false');
    this.input.setAttribute('aria-autocomplete', 'list');
    if (this.list.id) this.input.setAttribute('aria-controls', this.list.id);
  }

  query() {
    const q = this.input.value;
    this.openList();
    const reqId = ++this.reqId;
    this.pending = true;
    this.errorText = '';
    this.render();
    Promise.resolve(this.search(q))
      .then((items) => {
        if (reqId !== this.reqId) return;
        this.pending = false;
        this.items = Array.isArray(items) ? items : [];
        this.active = this.items.length > 0 ? 0 : -1;
        this.render();
      })
      .catch((err) => {
        if (reqId !== this.reqId) return;
        this.pending = false;
        this.items = [];
        this.active = -1;
        this.errorText = err && err.message ? err.message : 'Ошибка поиска';
        this.render();
      });
  }

  openList() {
    this.open = true;
    this.root.classList.add('is-open');
    this.input.setAttribute('aria-expanded', 'true');
    this.render();
  }

  close() {
    if (!this.open && this.list.hidden) return;
    this.open = false;
    this.root.classList.remove('is-open');
    this.input.setAttribute('aria-expanded', 'false');
    this.render();
  }

  render() {
    if (!this.open) {
      this.list.hidden = true;
      return;
    }
    this.list.hidden = false;
    if (this.pending) {
      this.list.innerHTML = `<div class="cb-status"><span class="spinner" aria-hidden="true"></span>${esc(this.loadingText)}</div>`;
      return;
    }
    if (this.errorText) {
      this.list.innerHTML = `<div class="cb-error">${ICONS.alert}<span>${esc(this.errorText)}</span></div>`;
      return;
    }
    if (this.items.length === 0) {
      this.list.innerHTML = `<div class="cb-status cb-status--empty">${esc(this.emptyText)}</div>`;
      return;
    }
    this.list.innerHTML = this.items.map((item, idx) => {
      const activeCls = idx === this.active ? ' is-active' : '';
      return `<button type="button" class="cb-item${activeCls}" role="option" aria-selected="${idx === this.active}" data-idx="${idx}">${this.renderItem(item, this.input.value)}</button>`;
    }).join('');
  }

  handleKeydown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.open) { this.query(); return; }
      if (this.items.length > 0) {
        this.active = (this.active + 1) % this.items.length;
        this.render();
        this.scrollActiveIntoView();
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open) { this.query(); return; }
      if (this.items.length > 0) {
        this.active = (this.active - 1 + this.items.length) % this.items.length;
        this.render();
        this.scrollActiveIntoView();
      }
    } else if (event.key === 'Enter') {
      if (this.open && this.active >= 0 && this.items[this.active]) {
        event.preventDefault();
        this.choose(this.active);
      }
    } else if (event.key === 'Escape') {
      if (this.open) {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      }
    } else if (event.key === 'Tab') {
      this.close();
    }
  }

  scrollActiveIntoView() {
    const activeEl = this.list.querySelector('.cb-item.is-active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  choose(idx) {
    const item = this.items[idx];
    if (!item) return;
    this.selected = item;
    this.input.value = this.valueOf(item);
    this.close();
    this.onSelect(item);
  }

  setExternal(item, label) {
    this.selected = item;
    this.input.value = String(label ?? '');
    this.close();
  }
}

/* ---------------- подсказки полей ---------------- */

function setHint(el, text, state) {
  el.textContent = text;
  el.dataset.state = state || '';
}

function markInvalid(input, hintEl, message) {
  input.classList.add('is-invalid');
  setHint(hintEl, message, 'error');
}

/* ---------------- пустые состояния ---------------- */

let emptyIllustrationId = 0;

function emptyState(title, hint) {
  const gradId = `eg${++emptyIllustrationId}`;
  return `
    <div class="empty-state">
      <svg class="empty-illus" viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#6D5DF6"/>
            <stop offset="1" stop-color="#22D3EE"/>
          </linearGradient>
        </defs>
        <rect x="16" y="16" width="88" height="88" rx="20" fill="none" stroke="#1F2A44" stroke-width="2" stroke-dasharray="5 7"/>
        <circle cx="58" cy="56" r="21" fill="none" stroke="#2A3A5F" stroke-width="2"/>
        <circle cx="58" cy="56" r="7" fill="url(#${gradId})" opacity="0.9"/>
        <path d="M73.5 71.5 L87 85" stroke="#2A3A5F" stroke-width="3" stroke-linecap="round"/>
        <circle cx="34" cy="34" r="3" fill="url(#${gradId})" opacity="0.55"/>
        <circle cx="88" cy="30" r="2.5" fill="#22D3EE" opacity="0.4"/>
      </svg>
      <h3 class="empty-title">${esc(title)}</h3>
      <p class="empty-hint">${esc(hint)}</p>
    </div>`;
}

function errorState(message, retryLabel = 'Повторить', retryAttr = '') {
  return `
    <div class="empty-state">
      <span class="empty-error">${ICONS.alert}</span>
      <h3 class="empty-title">Не удалось загрузить данные</h3>
      <p class="empty-hint">${esc(message)}</p>
      <button type="button" class="btn btn--ghost btn--sm" ${retryAttr}>${esc(retryLabel)}</button>
    </div>`;
}

/* ---------------- Вкладка 1: создание кампании ---------------- */

const nameInput = $('#nameInput');
const nameHint = $('#nameHint');
const geoInput = $('#geoInput');
const geoHint = $('#geoHint');
const offerInput = $('#offerInput');
const offerHint = $('#offerHint');
const offerIdInput = $('#offerIdInput');
const offerSelectedEl = $('#offerSelected');
const formErrorEl = $('#formError');
const createBtn = $('#createBtn');
const creatorForm = $('#creatorForm');
const creatorFormWrap = $('#creatorFormWrap');
const createSuccessEl = $('#createSuccess');

function campaignPrefix() {
  return meta ? (meta.prefix || '') : '';
}

function updateNameHint() {
  const prefix = campaignPrefix();
  const value = nameInput.value;
  if (!meta) {
    setHint(nameHint, 'Конфигурация загружается…', '');
    return;
  }
  if (!value) {
    setHint(nameHint, `Название должно начинаться с префикса «${prefix}»`, '');
    return;
  }
  if (value.startsWith(prefix)) {
    setHint(nameHint, `Соответствует префиксу «${prefix}»`, 'ok');
  } else {
    setHint(nameHint, `Название должно начинаться с префикса «${prefix}»`, 'error');
  }
}

function updateGeoHint() {
  const value = geoInput.value;
  if (!value) {
    setHint(geoHint, 'Выберите страну из списка или введите код из 2 латинских букв', '');
    return;
  }
  if (!/^[A-Z]{2}$/.test(value)) {
    setHint(geoHint, 'Гео должно быть ровно 2 латинскими буквами (например, UZ)', 'error');
    return;
  }
  const country = COUNTRY_MAP.get(value);
  if (country) setHint(geoHint, `${flagOf(country[0])} ${country[1]}`, 'ok');
  else setHint(geoHint, `Код «${value}» не найден в списке стран — будет отправлен как есть`, 'warn');
}

function updateOfferHint(state = '') {
  if (state === 'ok') {
    setHint(offerHint, 'Оффер выбран — можно создавать кампанию', 'ok');
    return;
  }
  setHint(offerHint, 'Оффер будет назначен на второй поток кампании', '');
}

function renderOfferSelected(offer) {
  if (!offer) {
    offerSelectedEl.hidden = true;
    offerSelectedEl.innerHTML = '';
    return;
  }
  offerSelectedEl.hidden = false;
  offerSelectedEl.innerHTML = `
    <span class="chip chip--payout">${ICONS.check} Оффер #${fmtInt(offer.id)}</span>
    <span class="chip">${esc(offer.name)}</span>
    <span class="chip chip--mono">${fmtDecimalStr(offer.payout_value)} ${esc(offer.payout_currency || '')}</span>
    <button type="button" class="icon-btn icon-btn--sm" id="clearOfferBtn" aria-label="Сбросить выбранный оффер" title="Сбросить">${ICONS.x}</button>`;
  $('#clearOfferBtn').addEventListener('click', () => {
    offerIdInput.value = '';
    offerInput.value = '';
    renderOfferSelected(null);
    updateOfferHint('');
    offerInput.focus();
  });
}

const geoCombo = new Combobox({
  root: $('#geoCombo'),
  input: geoInput,
  list: $('#geoList'),
  debounceMs: 0,
  search: (query) => {
    const q = String(query || '').trim().toUpperCase();
    if (!q) return COUNTRIES.slice(0, 40);
    const lower = q.toLowerCase();
    return COUNTRIES
      .filter(([code, ru, en]) => code.startsWith(q) || ru.toLowerCase().includes(lower) || en.toLowerCase().includes(lower))
      .slice(0, 40);
  },
  renderItem: (country) => `<span class="cb-item-flag">${flagOf(country[0])}</span><span class="cb-item-main">${esc(country[0])} — ${esc(country[1])}</span>`,
  valueOf: (country) => country[0],
  onSelect: () => {
    geoInput.classList.remove('is-invalid');
    updateGeoHint();
  },
  onInput: () => {
    const clean = geoInput.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2);
    if (geoInput.value !== clean) geoInput.value = clean;
    geoInput.classList.remove('is-invalid');
    updateGeoHint();
  },
  emptyText: 'Страна не найдена — введите код вручную (например, UZ)',
});

const offerCombo = new Combobox({
  root: $('#offerCombo'),
  input: offerInput,
  list: $('#offerList'),
  debounceMs: 300,
  search: async (query) => {
    const q = String(query || '').trim();
    const url = q ? `/api/offers?q=${encodeURIComponent(q)}` : '/api/offers';
    const data = await api(url);
    return data.items || [];
  },
  renderItem: (offer, query) => `
    <span class="offer-opt">
      <span class="offer-opt-name">${highlight(offer.name, query)}</span>
      <span class="offer-opt-meta">
        <span class="chip chip--mono">#${fmtInt(offer.id)}</span>
        ${offer.country ? `<span class="chip">${esc(offer.country)}</span>` : ''}
        <span class="chip chip--payout">${fmtDecimalStr(offer.payout_value)} ${esc(offer.payout_currency || '')}</span>
      </span>
    </span>`,
  valueOf: (offer) => offer.name,
  onSelect: (offer) => {
    offerIdInput.value = String(offer.id);
    renderOfferSelected(offer);
    offerInput.classList.remove('is-invalid');
    updateOfferHint('ok');
  },
  onInput: () => {
    offerIdInput.value = '';
    renderOfferSelected(null);
    offerInput.classList.remove('is-invalid');
    updateOfferHint('');
  },
  emptyText: 'Офферы не найдены — уточните запрос',
  loadingText: 'Поиск офферов…',
});

nameInput.addEventListener('input', () => {
  nameInput.classList.remove('is-invalid');
  updateNameHint();
});

creatorForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (creating || !meta) return;
  formErrorEl.hidden = true;

  let firstInvalid = null;
  const invalid = (input, hintEl, message) => {
    markInvalid(input, hintEl, message);
    if (!firstInvalid) firstInvalid = input;
  };

  const name = nameInput.value.trim();
  const geo = geoInput.value.trim();
  if (!name.startsWith(campaignPrefix())) {
    invalid(nameInput, nameHint, `Название должно начинаться с префикса «${campaignPrefix()}»`);
  }
  if (!/^[A-Z]{2}$/.test(geo)) {
    invalid(geoInput, geoHint, 'Гео должно быть ровно 2 латинскими буквами (например, UZ)');
  }
  if (!offerIdInput.value) {
    invalid(offerInput, offerHint, 'Выберите оффер из списка — он нужен для второго потока');
  }
  if (firstInvalid) {
    toast('Проверьте поля формы — есть ошибки', 'warning');
    firstInvalid.focus();
    return;
  }

  creating = true;
  createBtn.classList.add('is-loading');
  createBtn.disabled = true;
  try {
    const result = await api('/api/campaigns', {
      method: 'POST',
      body: { name, geo, offer_id: Number(offerIdInput.value) },
    });
    renderCreateSuccess(result.campaign, result.streams, geo);
    toast('Кампания создана', 'success');
  } catch (err) {
    if (err.code === 'validation' || err.code === 'conflict') {
      formErrorEl.hidden = false;
      formErrorEl.innerHTML = `${ICONS.alert}<span>${esc(err.message)}</span>`;
    }
    toast(err.message, 'error');
  } finally {
    creating = false;
    createBtn.classList.remove('is-loading');
    createBtn.disabled = false;
  }
});

function renderCreateSuccess(campaign, streams, geo) {
  creatorFormWrap.hidden = true;
  createSuccessEl.hidden = false;
  const safeUrl = campaign && campaign.url ? campaign.url : '';
  createSuccessEl.innerHTML = `
    <div class="success-head">
      <span class="success-icon">${ICONS.check}</span>
      <div>
        <h2>Кампания создана</h2>
        <p class="page-sub">Кампания и два потока успешно созданы в Keitaro</p>
      </div>
    </div>
    <div class="card campaign-card">
      <div class="cc-head">
        <div class="cc-title">
          <h3>${esc(campaign && campaign.name ? campaign.name : '—')}</h3>
          <span class="chip chip--mono">ID ${fmtInt(campaign && campaign.id)}</span>
          <span class="chip chip--mono">alias ${esc(campaign && campaign.alias ? campaign.alias : '—')}</span>
        </div>
      </div>
      <div class="cc-meta">
        <span class="chip chip--accent">домен ${esc(campaign && campaign.domain ? campaign.domain : '—')}</span>
        <span class="chip chip--accent">группа ${esc(campaign && campaign.group ? campaign.group : '—')}</span>
        <span class="chip chip--accent">источник ${esc(campaign && campaign.source ? campaign.source : '—')}</span>
      </div>
      <div class="cc-url">
        <span class="cc-url-text">${esc(safeUrl)}</span>
        <button type="button" class="btn btn--ghost btn--sm" data-copy="${esc(safeUrl)}">${ICONS.copy}<span>Копировать</span></button>
      </div>
    </div>
    <div class="streams-mini-grid">
      ${(streams || []).map((stream, idx) => renderStreamMini(stream, idx, geo)).join('')}
    </div>
    <div class="form-actions">
      <button type="button" id="gotoEditorBtn" class="btn btn--primary">${ICONS.arrow}<span>Перейти в редактор</span></button>
      <button type="button" id="createAnotherBtn" class="btn btn--ghost">Создать ещё</button>
    </div>`;
  $('#gotoEditorBtn').addEventListener('click', () => gotoEditor(campaign));
  $('#createAnotherBtn').addEventListener('click', resetCreator);
}

function renderStreamMini(stream, idx, geo) {
  const isOffers = !!(stream && (stream.is_offer_stream || stream.schema === 'offers'));
  const offerNames = ((stream && stream.offers) || []).map((o) => o.offer_name).filter(Boolean);
  const geoFilter = ((stream && stream.filters) || []).find((f) => f.name === 'country_code');
  const geoValue = geoFilter && geoFilter.payload && geoFilter.payload.length ? geoFilter.payload.join(', ') : (geo || '');
  const target = stream && stream.action_payload ? stream.action_payload : '';
  return `
    <div class="card stream-mini">
      <div class="stream-mini-head">
        <span class="pos-badge">№${fmtInt((stream && stream.position) || idx + 1)}</span>
        <span class="stream-mini-name">${esc(stream && stream.name ? stream.name : `Поток ${idx + 1}`)}</span>
        <span class="chip chip--schema">${isOffers ? 'офферы' : 'редирект'}</span>
      </div>
      <div class="stream-mini-body">
        <span class="muted">→</span>
        ${isOffers
          ? `<span>${esc(offerNames.join(', ') || '—')}</span>`
          : `<a class="link" href="${esc(target)}" target="_blank" rel="noopener">${esc(target || '—')}</a>`}
      </div>
      ${isOffers
        ? ''
        : `<div class="stream-mini-filters"><span class="chip chip--filter"><span class="chip-key">country_code</span> = ${esc(geoValue || '—')}</span></div>`}
    </div>`;
}

function resetCreator() {
  creatorForm.reset();
  offerIdInput.value = '';
  renderOfferSelected(null);
  [nameInput, geoInput, offerInput].forEach((el) => el.classList.remove('is-invalid'));
  formErrorEl.hidden = true;
  createSuccessEl.hidden = true;
  creatorFormWrap.hidden = false;
  updateNameHint();
  updateGeoHint();
  updateOfferHint('');
  nameInput.focus();
}

/* ---------------- Вкладка 2: редактор кампаний ---------------- */

const editorState = {
  campaign: null,
  stats: null,
  streams: null,
  loading: false,
  refreshing: false,
  error: '',
  lastId: null,
};

const campaignInput = $('#campaignInput');
const showAllToggle = $('#showAllToggle');
const editorContent = $('#editorContent');

const STATE_LABELS = { active: 'активна', disabled: 'отключена' };

function stateLabel(state) {
  return STATE_LABELS[state] || String(state || '—');
}

const campaignCombo = new Combobox({
  root: $('#campaignCombo'),
  input: campaignInput,
  list: $('#campaignList'),
  debounceMs: 300,
  search: async (query) => {
    const prefixParam = showAllToggle.checked ? 0 : 1;
    const q = String(query || '').trim();
    const url = `/api/campaigns?prefix=${prefixParam}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
    const data = await api(url);
    return data.items || [];
  },
  renderItem: (campaign, query) => `
    <span class="cp-opt">
      <span class="cp-opt-name">${highlight(campaign.name, query)}</span>
      <span class="cp-opt-meta">
        <span class="chip chip--mono">#${fmtInt(campaign.id)}</span>
        <span class="state-dot state-dot--${esc(campaign.state || 'disabled')}" aria-hidden="true"></span>
        ${campaign.alias ? `<span class="cp-opt-alias">${esc(campaign.alias)}</span>` : ''}
      </span>
    </span>`,
  valueOf: (campaign) => campaign.name,
  onSelect: (campaign) => openCampaign(campaign.id, campaign),
  emptyText: 'Кампании не найдены — измените запрос или включите «показать все»',
  loadingText: 'Поиск кампаний…',
});

showAllToggle.addEventListener('change', () => {
  campaignCombo.query();
});

async function openCampaign(id, campaignHint) {
  editorState.loading = true;
  editorState.error = '';
  editorState.lastId = id;
  renderEditor();
  try {
    const data = await api(`/api/campaigns/${id}`);
    editorState.campaign = (data && data.campaign) || campaignHint || null;
    editorState.stats = (data && data.stats) || {};
    editorState.streams = (data && data.streams) || [];
    editorState.loading = false;
    renderEditor();
  } catch (err) {
    editorState.loading = false;
    editorState.campaign = null;
    editorState.streams = null;
    editorState.error = err.message;
    if (err.code === 'not_found') toast(`Кампания #${fmtInt(id)} не найдена`, 'error');
    else toast(err.message, 'error');
    renderEditor();
  }
}

function renderEditor() {
  const root = editorContent;
  if (editorState.loading) {
    root.innerHTML = editorSkeleton();
    return;
  }
  if (!editorState.campaign) {
    if (editorState.error) {
      root.innerHTML = `<div class="card">${errorState(editorState.error, 'Повторить', 'data-retry-campaign')}</div>`;
    } else {
      root.innerHTML = `<div class="card">${emptyState('Выберите кампанию', 'Найдите кампанию по названию или ID в поиске выше')}</div>`;
    }
    return;
  }
  root.innerHTML = `
    <div id="editorHeaderWrap">${renderCampaignHeader(editorState.campaign, editorState.stats)}</div>
    <div id="streamsSection">${renderStreamsSection()}</div>`;
  initAddOfferCombos();
}

function renderCampaignHeader(campaign, stats) {
  const url = campaign.url || '';
  return `
    <div class="card campaign-card">
      <div class="cc-head">
        <div class="cc-title">
          <h3>${esc(campaign.name || '—')}</h3>
          <span class="chip chip--mono">ID ${fmtInt(campaign.id)}</span>
          <span class="chip chip--mono">alias ${esc(campaign.alias || '—')}</span>
          <span class="chip chip--state chip--state-${esc(campaign.state || 'disabled')}">${stateLabel(campaign.state)}</span>
        </div>
        <div class="cc-actions">
          <button type="button" class="icon-btn" id="refreshCampaignBtn" aria-label="Обновить данные кампании" title="Обновить">${ICONS.refresh}</button>
        </div>
      </div>
      <div class="cc-meta">
        <span class="chip">домен ${esc(campaign.domain || '—')}</span>
        <span class="chip">группа ${esc(campaign.group || '—')}</span>
        <span class="chip">источник ${esc(campaign.source || '—')}</span>
        ${campaign.updated_at ? `<span class="chip chip--muted">обновлено ${esc(campaign.updated_at)}</span>` : ''}
      </div>
      <div class="cc-url">
        <span class="cc-url-text">${esc(url || '—')}</span>
        <button type="button" class="btn btn--ghost btn--sm" data-copy="${esc(url)}">${ICONS.copy}<span>Копировать</span></button>
      </div>
      <div class="stats-grid">
        ${statTile('Клики', fmtInt(stats.clicks))}
        ${statTile('Уники', fmtInt(stats.unique_clicks))}
        ${statTile('Конверсии', fmtInt(stats.conversions))}
        ${statTile('CR', fmtPct1(stats.cr), true)}
      </div>
    </div>`;
}

function statTile(label, value, accent = false) {
  return `
    <div class="stat-tile">
      <div class="stat-tile-label">${esc(label)}</div>
      <div class="stat-tile-value${accent ? ' stat-tile-value--accent' : ''}">${esc(value)}</div>
    </div>`;
}

function renderStreamsSection() {
  const streams = editorState.streams || [];
  if (!streams.length) {
    return `
      <div class="section-head"><h2>Потоки</h2><span class="chip chip--muted">0</span></div>
      <div class="card">${emptyState('Потоки не найдены', 'У выбранной кампании нет потоков')}</div>`;
  }
  return `
    <div class="section-head"><h2>Потоки</h2><span class="chip chip--muted">${streams.length}</span></div>
    <div class="streams-grid">${streams.map((stream, idx) => renderStreamCard(stream, idx)).join('')}</div>`;
}

function renderStreamCard(stream, idx) {
  const isOffers = !!(stream.is_offer_stream || stream.schema === 'offers');
  const filters = stream.filters || [];
  return `
    <div class="card stream-card">
      <div class="stream-card-head">
        <span class="pos-badge">Поток ${fmtInt(stream.position || idx + 1)}</span>
        <span class="stream-name">${esc(stream.name || `Поток ${idx + 1}`)}</span>
        <span class="chip chip--schema">${isOffers ? 'офферы' : 'редирект'}</span>
        <span class="chip chip--state chip--state-${esc(stream.state || 'disabled')}">${stateLabel(stream.state)}</span>
      </div>
      ${!isOffers && filters.length
        ? `<div class="stream-filters">${filters.map((f) => `<span class="chip chip--filter"><span class="chip-key">${esc(f.name)}</span> = ${esc((f.payload || []).join(', '))}</span>`).join('')}</div>`
        : ''}
      <div class="stream-action">
        ${isOffers ? renderOffersBlock(stream) : renderRedirectAction(stream)}
      </div>
    </div>`;
}

function renderRedirectAction(stream) {
  const target = stream.action_payload;
  return `
    <div class="redirect-row">
      <span class="muted">Действие:</span>
      ${target
        ? `<a class="link" href="${esc(target)}" target="_blank" rel="noopener">→ ${esc(target)}</a>`
        : '<span class="muted">—</span>'}
    </div>`;
}

const SHARE_GRADIENTS = [
  'linear-gradient(90deg, #6D5DF6, #22D3EE)',
  'linear-gradient(90deg, #22D3EE, #34D399)',
  'linear-gradient(90deg, #34D399, #A78BFA)',
  'linear-gradient(90deg, #F59E0B, #FBBF24)',
  'linear-gradient(90deg, #F472B6, #6D5DF6)',
];

function renderOffersBlock(stream) {
  const offers = stream.offers || [];
  const totalShare = offers.reduce((sum, offer) => sum + num0(offer.share), 0);
  const rows = offers.map((offer, idx) => renderOfferRow(stream, offer, idx, offers.length, totalShare)).join('');
  const body = rows || '<tr><td colspan="7"><div class="table-empty">В потоке пока нет офферов</div></td></tr>';
  return `
    <div class="offers-block">
      <div class="table-scroll">
        <table class="table offers-table">
          <thead>
            <tr>
              <th>Оффер</th>
              <th>Доля</th>
              <th class="num">Клики</th>
              <th class="num">Уники</th>
              <th class="num">Конверсии</th>
              <th class="num">CR</th>
              <th class="num" aria-label="Действия"></th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      ${renderAddOfferRow(stream)}
    </div>`;
}

function renderOfferRow(stream, offer, idx, count, totalShare) {
  const share = num0(offer.share);
  const width = totalShare > 0 ? (share / totalShare) * 100 : (count > 0 ? 100 / count : 0);
  const last = count <= 1;
  const tooltip = last ? 'Нельзя удалить последний оффер' : 'Удалить оффер';
  return `
    <tr>
      <td>
        <div class="offer-cell">
          <span class="offer-cell-name">${esc(offer.offer_name || '—')}</span>
          <span class="chip chip--mono chip--sm">#${fmtInt(offer.offer_id)}</span>
        </div>
      </td>
      <td>
        <div class="share-cell">
          <div class="share-track"><div class="share-fill" style="width:${width.toFixed(2)}%;background:${SHARE_GRADIENTS[idx % SHARE_GRADIENTS.length]}"></div></div>
          <span class="share-num">${fmtSharePct(offer.share)}</span>
        </div>
      </td>
      <td class="num">${fmtInt(offer.clicks)}</td>
      <td class="num">${fmtInt(offer.unique_clicks)}</td>
      <td class="num">${fmtInt(offer.conversions)}</td>
      <td class="num">${fmtPct1(offer.cr)}</td>
      <td class="num">
        <button type="button" class="icon-btn icon-btn--danger" data-del-offer
          data-campaign-id="${esc(String(editorState.campaign.id))}"
          data-stream-id="${esc(String(stream.id))}"
          data-offer-id="${esc(String(offer.offer_id))}"
          data-offer-name="${esc(offer.offer_name || '')}"
          data-tooltip="${esc(tooltip)}"
          aria-label="${esc(tooltip)}"
          ${last ? 'disabled' : ''}>${ICONS.trash}</button>
      </td>
    </tr>`;
}

function renderAddOfferRow(stream) {
  return `
    <div class="add-offer-row">
      <div class="combobox add-offer-combo" data-combo-for="${esc(String(stream.id))}">
        <input class="input" type="text" autocomplete="off" spellcheck="false" placeholder="Найти оффер по названию или ID…">
        <button type="button" class="cb-caret" tabindex="-1" aria-hidden="true">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="cb-list" role="listbox" hidden></div>
      </div>
      <button type="button" class="btn btn--primary btn--sm" data-add-offer data-stream="${esc(String(stream.id))}" disabled>${ICONS.plus}<span>Добавить оффер</span></button>
    </div>`;
}

function initAddOfferCombos() {
  $$('.add-offer-combo').forEach((root) => {
    const streamId = root.dataset.comboFor;
    const input = $('.input', root);
    const list = $('.cb-list', root);
    new Combobox({
      root,
      input,
      list,
      debounceMs: 300,
      search: async (query) => {
        const q = String(query || '').trim();
        const url = q ? `/api/offers?q=${encodeURIComponent(q)}` : '/api/offers';
        const data = await api(url);
        return data.items || [];
      },
      renderItem: (offer, query) => `
        <span class="offer-opt">
          <span class="offer-opt-name">${highlight(offer.name, query)}</span>
          <span class="offer-opt-meta">
            <span class="chip chip--mono">#${fmtInt(offer.id)}</span>
            ${offer.country ? `<span class="chip">${esc(offer.country)}</span>` : ''}
            <span class="chip chip--payout">${fmtDecimalStr(offer.payout_value)} ${esc(offer.payout_currency || '')}</span>
          </span>
        </span>`,
      valueOf: (offer) => offer.name,
      onSelect: (offer) => {
        input.dataset.offerId = String(offer.id);
        setAddBtn(streamId, true);
      },
      onInput: () => {
        delete input.dataset.offerId;
        setAddBtn(streamId, false);
      },
      emptyText: 'Офферы не найдены — уточните запрос',
      loadingText: 'Поиск офферов…',
    });
  });
}

function setAddBtn(streamId, enabled) {
  const btn = $(`[data-add-offer][data-stream="${streamId}"]`);
  if (btn) btn.disabled = !enabled;
}

async function refreshStreams() {
  if (!editorState.campaign) return;
  try {
    const data = await api(`/api/campaigns/${editorState.campaign.id}`);
    editorState.campaign = data.campaign || editorState.campaign;
    editorState.stats = data.stats || editorState.stats;
    editorState.streams = data.streams || [];
    renderStreamsOnly();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderStreamsOnly() {
  const section = $('#streamsSection');
  if (section) section.innerHTML = renderStreamsSection();
  initAddOfferCombos();
}

async function refreshCampaign(btn) {
  if (!editorState.campaign || editorState.refreshing) return;
  editorState.refreshing = true;
  if (btn) btn.classList.add('is-spinning');
  try {
    const data = await api(`/api/campaigns/${editorState.campaign.id}`);
    editorState.campaign = data.campaign || editorState.campaign;
    editorState.stats = data.stats || editorState.stats;
    editorState.streams = data.streams || editorState.streams;
    renderEditor();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    editorState.refreshing = false;
    if (btn) btn.classList.remove('is-spinning');
  }
}

function gotoEditor(campaign) {
  switchTab('editor');
  campaignCombo.setExternal(campaign, campaign && campaign.name ? campaign.name : '');
  openCampaign(campaign.id, campaign);
}

async function handleAddOffer(btn) {
  if (!editorState.campaign) return;
  const streamId = btn.dataset.stream;
  const comboRoot = $(`.add-offer-combo[data-combo-for="${streamId}"]`);
  const input = comboRoot ? $('.input', comboRoot) : null;
  const offerId = input && input.dataset.offerId ? Number(input.dataset.offerId) : 0;
  if (!offerId) {
    toast('Сначала выберите оффер из списка', 'warning');
    return;
  }
  btn.disabled = true;
  btn.classList.add('is-loading');
  try {
    await api(`/api/campaigns/${editorState.campaign.id}/streams/${streamId}/offers`, {
      method: 'POST',
      body: { offer_id: offerId },
    });
    toast('Оффер добавлен — доли пересчитаны', 'success');
    await refreshStreams();
  } catch (err) {
    toast(err.message, 'error');
    btn.classList.remove('is-loading');
    btn.disabled = false;
    if (err.code === 'not_found') await refreshStreams();
  }
}

async function handleDeleteOffer(btn) {
  const campaignId = btn.dataset.campaignId;
  const streamId = btn.dataset.streamId;
  const offerId = btn.dataset.offerId;
  const offerName = btn.dataset.offerName || `#${offerId}`;
  const confirmed = await confirmModal({
    title: 'Удалить оффер?',
    message: `Оффер <strong>${esc(offerName)}</strong> будет удалён из потока. Доли оставшихся офферов будут пересчитаны.`,
    confirmLabel: 'Удалить',
    danger: true,
  });
  if (!confirmed) return;
  btn.disabled = true;
  btn.classList.add('is-loading');
  try {
    await api(`/api/campaigns/${campaignId}/streams/${streamId}/offers/${offerId}`, { method: 'DELETE' });
    toast('Оффер удалён', 'success');
    await refreshStreams();
  } catch (err) {
    toast(err.message, 'error');
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
}

function editorSkeleton() {
  return `
    <div class="card campaign-card">
      <div class="skel skel--title"></div>
      <div class="skel skel--row"></div>
      <div class="stats-grid">
        <div class="stat-tile"><div class="skel skel--w50"></div><div class="skel skel--w30"></div></div>
        <div class="stat-tile"><div class="skel skel--w50"></div><div class="skel skel--w30"></div></div>
        <div class="stat-tile"><div class="skel skel--w50"></div><div class="skel skel--w30"></div></div>
        <div class="stat-tile"><div class="skel skel--w50"></div><div class="skel skel--w30"></div></div>
      </div>
    </div>
    <div class="card">
      <div class="skel skel--title"></div>
      <div class="skel skel--block"></div>
    </div>`;
}

/* ---------------- Вкладка 3: история операций ---------------- */

let historyLoading = false;
let historyAuto = false;
let historyTimer = null;

const historyWrap = $('#historyWrap');
const refreshHistoryBtn = $('#refreshHistoryBtn');
const autoRefreshBtn = $('#autoRefreshBtn');

const ACTION_BADGES = {
  create_campaign: { label: 'создание', cls: 'badge--create' },
  add_offer: { label: 'добавление оффера', cls: 'badge--add' },
  remove_offer: { label: 'удаление оффера', cls: 'badge--remove' },
};

async function loadHistory() {
  if (historyLoading) return;
  historyLoading = true;
  refreshHistoryBtn.classList.add('is-loading');
  try {
    const data = await api('/api/operations?limit=50');
    renderHistory(data.items || []);
  } catch (err) {
    historyWrap.innerHTML = errorState(err.message, 'Повторить', 'data-retry-history');
    toast(err.message, 'error');
  } finally {
    historyLoading = false;
    refreshHistoryBtn.classList.remove('is-loading');
  }
}

function renderHistory(items) {
  if (!items.length) {
    historyWrap.innerHTML = emptyState('Операций пока нет', 'Создайте кампанию или измените офферы потока — операции появятся здесь');
    return;
  }
  historyWrap.innerHTML = `
    <div class="table-scroll">
      <table class="table ops-table">
        <thead>
          <tr><th>Время</th><th>Действие</th><th>Кампания</th><th>Статус</th></tr>
        </thead>
        <tbody>${items.map(renderOpRow).join('')}</tbody>
      </table>
    </div>`;
}

function renderOpRow(op) {
  const action = ACTION_BADGES[op.action] || { label: esc(op.action || '—'), cls: '' };
  const ok = op.status === 'ok';
  const idChip = (op.keitaro_campaign_id !== null && op.keitaro_campaign_id !== undefined)
    ? `<span class="chip chip--mono chip--sm">#${fmtInt(op.keitaro_campaign_id)}</span>`
    : '';
  const campaignCell = op.campaign_name
    ? `<div class="op-campaign">${idChip}<span>${esc(op.campaign_name)}</span></div>`
    : (idChip || '<span class="muted">—</span>');
  const statusCell = ok
    ? `<span class="badge badge--ok">${ICONS.check}<span>OK</span></span>`
    : `<span class="badge badge--err" data-tooltip="${esc(op.error || 'Неизвестная ошибка')}">${ICONS.alert}<span>Ошибка</span></span>`;
  return `
    <tr>
      <td class="time-cell">${fmtDateTimeLocal(op.created_at)}</td>
      <td><span class="badge ${action.cls}">${action.label}</span></td>
      <td>${campaignCell}</td>
      <td>${statusCell}</td>
    </tr>`;
}

function renderAutoRefreshBtn() {
  autoRefreshBtn.classList.toggle('is-on', historyAuto);
  autoRefreshBtn.innerHTML = `<span class="auto-dot" aria-hidden="true"></span>Автообновление: ${historyAuto ? 'вкл' : 'выкл'}`;
}

autoRefreshBtn.addEventListener('click', () => {
  historyAuto = !historyAuto;
  renderAutoRefreshBtn();
  if (historyAuto) {
    if (historyTimer) clearInterval(historyTimer);
    historyTimer = setInterval(() => {
      if (currentTab === 'history' && !document.hidden) loadHistory();
    }, 15000);
  } else if (historyTimer) {
    clearInterval(historyTimer);
    historyTimer = null;
  }
});

refreshHistoryBtn.addEventListener('click', loadHistory);

/* ---------------- копирование в буфер ---------------- */

async function copyText(text, btn) {
  if (!text) {
    toast('Нечего копировать', 'warning');
    return;
  }
  let copied = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch (err) { copied = false; }
  if (!copied) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      copied = document.execCommand('copy');
      ta.remove();
    } catch (err) { copied = false; }
  }
  if (copied) {
    toast('Скопировано в буфер обмена', 'success');
    if (btn) {
      const original = btn.innerHTML;
      btn.classList.add('is-copied');
      btn.innerHTML = `${ICONS.check}<span>Скопировано</span>`;
      setTimeout(() => {
        btn.classList.remove('is-copied');
        btn.innerHTML = original;
      }, 1600);
    }
  } else {
    toast('Не удалось скопировать ссылку', 'error');
  }
}

/* ---------------- делегированные клики ---------------- */

document.addEventListener('click', (event) => {
  const copyBtn = event.target.closest('[data-copy]');
  if (copyBtn) {
    copyText(copyBtn.dataset.copy || '', copyBtn);
    return;
  }
  const delBtn = event.target.closest('[data-del-offer]');
  if (delBtn) {
    if (!delBtn.disabled) handleDeleteOffer(delBtn);
    return;
  }
  const addBtn = event.target.closest('[data-add-offer]');
  if (addBtn) {
    handleAddOffer(addBtn);
    return;
  }
  const refreshBtn = event.target.closest('#refreshCampaignBtn');
  if (refreshBtn) {
    refreshCampaign(refreshBtn);
    return;
  }
  const retryCampaign = event.target.closest('[data-retry-campaign]');
  if (retryCampaign) {
    openCampaign(editorState.lastId, null);
    return;
  }
  const retryHistory = event.target.closest('[data-retry-history]');
  if (retryHistory) {
    loadHistory();
    return;
  }
});

/* ---------------- инициализация ---------------- */

function init() {
  $$('.tab').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  checkHealth();
  setInterval(checkHealth, 30000);
  loadMeta();
  renderEditor();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
