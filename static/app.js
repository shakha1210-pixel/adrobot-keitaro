'use strict';

/* ============================================================
   Adrobot — Keitaro campaign management frontend
   Vanilla JS (ES2020+), no build step, no dependencies.
   API contract matches the FastAPI backend (see docs).
   i18n: RU/UZ, localStorage key "adrobot.lang".
   ============================================================ */

/* ---------------- utils ---------------- */

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

/* integer with thousand separators: 1 234 */
function fmtInt(value) {
  return Math.trunc(num0(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/* numeric string (e.g. payout_value "1.5000") with separators in the integer part */
function fmtDecimalStr(value) {
  if (value === null || value === undefined || value === '') return '0';
  const str = String(value);
  const m = str.match(/^(-?\d+)(\.\d+)?$/);
  if (!m) return esc(str);
  return m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (m[2] || '');
}

/* percents with 1 decimal (CR) */
function fmtPct1(value) {
  return num0(value).toFixed(1) + '%';
}

/* offer share: integers plain, fractions with 1 decimal */
function fmtSharePct(value) {
  const n = num0(value);
  return (Number.isInteger(n) ? String(n) : n.toFixed(1)) + '%';
}

/* ISO time from operations log -> local time */
function fmtDateTimeLocal(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* highlight the search substring */
function highlight(text, query) {
  const safe = esc(text);
  const q = String(query || '').trim();
  if (!q) return safe;
  const idx = safe.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return safe;
  return safe.slice(0, idx) + '<mark>' + safe.slice(idx, idx + q.length) + '</mark>';
}

/* ---------------- icons ---------------- */

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
  external: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>',
};

/* ============================================================
   I18N DATA BLOCK — all user-facing strings live here (RU + UZ).
   Country display names below (COUNTRIES) are part of this block.
   ============================================================ */

const I18N = {
  ru: {
    'app.title': 'Adrobot — управление кампаниями Keitaro',

    'health.checking': 'Проверка подключения…',
    'health.ok': 'Keitaro: подключено',
    'health.unreachable': 'Keitaro: недоступен',
    'health.unconfigured': 'Keitaro: ключ не задан',
    'health.unknown': 'Keitaro: {value}',
    'health.api_down': 'API недоступен',
    'health.title': 'Adrobot API v{version} · БД: {db}',
    'health.db_ok': 'ok',
    'health.db_error': 'ошибка',

    'tab.create': 'Новая кампания',
    'tab.editor': 'Редактор кампаний',
    'tab.history': 'История операций',
    'aria.tabs': 'Разделы',

    'page.create.sub': 'Создание кампании в Keitaro: поток гео-редиректа и поток офферов',
    'page.editor.sub': 'Потоки, фильтры и распределение офферов выбранной кампании',
    'page.history.sub': 'Последние 50 операций Adrobot с API Keitaro',

    'form.name.label': 'Название кампании',
    'form.geo.label': 'Гео (страна)',
    'form.offer.label': 'Оффер Keitaro',
    'form.name.ph': 'Загрузка конфигурации…',
    'form.name.ph.unavailable': 'Конфигурация недоступна',
    'form.geo.ph': 'UZ',
    'form.offer.ph': 'Начните вводить название оффера…',
    'form.geo.hint': 'Выберите страну из списка или введите код из 2 латинских букв',
    'form.geo.err': 'Гео должно быть ровно 2 латинскими буквами (например, UZ)',
    'form.geo.unknown': 'Код «{code}» не найден в списке стран — будет отправлен как есть',
    'form.offer.hint': 'Оффер будет назначен на второй поток кампании',
    'form.offer.hint.ok': 'Оффер выбран — можно создавать кампанию',
    'form.offer.required': 'Выберите оффер из списка — он нужен для второго потока',
    'form.name.hint.prefix': 'Название должно начинаться с префикса «{prefix}»',
    'form.name.hint.ok': 'Соответствует префиксу «{prefix}»',
    'form.name.hint.loading': 'Конфигурация загружается…',
    'form.name.hint.disabled': 'Создание кампаний недоступно — не загружена конфигурация',
    'form.invalid': 'Проверьте поля формы — есть ошибки',
    'form.submit': 'Создать кампанию',
    'aria.geo_list': 'Список стран',
    'aria.offer_list': 'Список офферов',
    'aria.campaign_list': 'Список кампаний',

    'success.title': 'Кампания создана',
    'success.sub': 'Кампания и два потока успешно созданы в Keitaro',
    'btn.goto_editor': 'Перейти в редактор',
    'btn.create_another': 'Создать ещё',
    'toast.campaign_created': 'Кампания создана',

    'chip.domain': 'домен',
    'chip.group': 'группа',
    'chip.source': 'источник',
    'chip.updated': 'обновлено',
    'schema.redirect': 'редирект',
    'schema.offers': 'офферы',
    'stream.fallback': 'Поток {n}',
    'btn.copy': 'Копировать',
    'btn.copied': 'Скопировано',
    'btn.keitaro': 'Keitaro',

    'cb.not_found': 'Ничего не найдено',
    'cb.loading': 'Загрузка…',
    'cb.search_error': 'Ошибка поиска',
    'cb.geo_empty': 'Страна не найдена — введите код вручную (например, UZ)',
    'cb.offers_empty': 'Офферы не найдены — уточните запрос',
    'cb.offers_loading': 'Поиск офферов…',
    'cb.campaigns_empty': 'Кампании не найдены — измените запрос или включите «показать все»',
    'cb.campaigns_loading': 'Поиск кампаний…',

    'editor.picker.ph': 'Найти кампанию по названию или ID…',
    'editor.show_all': 'показать все',
    'editor.empty.title': 'Выберите кампанию',
    'editor.empty.hint': 'Найдите кампанию по названию или ID в поиске выше',
    'editor.streams_empty.title': 'Потоки не найдены',
    'editor.streams_empty.hint': 'У выбранной кампании нет потоков',
    'editor.load_error': 'Не удалось загрузить данные',
    'btn.retry': 'Повторить',
    'toast.campaign_not_found': 'Кампания #{id} не найдена',
    'state.active': 'активна',
    'state.disabled': 'отключена',
    'stat.clicks': 'Клики',
    'stat.unique': 'Уники',
    'stat.conversions': 'Конверсии',
    'stat.cr': 'CR',
    'streams.title': 'Потоки',
    'stream.position': 'Поток {n}',
    'stream.action': 'Действие:',

    'th.offer': 'Оффер',
    'th.share': 'Доля',
    'th.clicks': 'Клики',
    'th.unique': 'Уники',
    'th.conversions': 'Конверсии',
    'th.cr': 'CR',
    'th.actions': 'Действия',
    'offer.offers_empty': 'В потоке пока нет офферов',
    'offer.delete_last': 'Нельзя удалить последний оффер',
    'offer.delete': 'Удалить оффер',
    'offer.add.ph': 'Найти оффер по названию или ID…',
    'btn.add_offer': 'Добавить оффер',
    'toast.offer_added': 'Оффер добавлен — доли пересчитаны',
    'toast.offer_removed': 'Оффер удалён',
    'toast.select_offer': 'Сначала выберите оффер из списка',
    'modal.delete_offer.title': 'Удалить оффер?',
    'modal.delete_offer.body': 'Оффер <strong>{name}</strong> будет удалён из потока. Доли оставшихся офферов будут пересчитаны.',
    'modal.confirm': 'Удалить',
    'modal.cancel': 'Отмена',
    'modal.close': 'Закрыть',
    'toast.close': 'Закрыть уведомление',
    'btn.refresh': 'Обновить',
    'btn.refresh_picker': 'Обновить список кампаний',
    'btn.copy_id': 'Копировать ID оффера',
    'toast.copied': 'Скопировано в буфер обмена',
    'toast.nothing_to_copy': 'Нечего копировать',
    'toast.copy_failed': 'Не удалось скопировать ссылку',
    'offer.selected_chip': 'Оффер #{id}',
    'offer.clear': 'Сбросить выбранный оффер',

    'history.auto_on': 'Автообновление: вкл',
    'history.auto_off': 'Автообновление: выкл',
    'history.refresh': 'Обновить',
    'history.th.time': 'Время',
    'history.th.action': 'Действие',
    'history.th.campaign': 'Кампания',
    'history.th.status': 'Статус',
    'action.create': 'создание',
    'action.add': 'добавление оффера',
    'action.remove': 'удаление оффера',
    'status.error': 'Ошибка',
    'status.error_unknown': 'Неизвестная ошибка',
    'history.empty.title': 'Операций пока нет',
    'history.empty.hint': 'Создайте кампанию или измените офферы потока — операции появятся здесь',

    'meta.banner': 'Не удалось загрузить конфигурацию сервера: {message}. Создание кампаний временно недоступно.',
    'footer.keitaro': 'Keitaro:',
    'footer.prefix': 'Префикс:',
    'footer.domain': 'Домен:',
    'footer.report': 'Отчёт:',

    'lang.switch': 'Язык интерфейса',

    'err.validation': 'Ошибка валидации данных',
    'err.not_found': 'Объект не найден',
    'err.conflict': 'Конфликт состояния данных',
    'err.keitaro_unavailable': 'Keitaro недоступен',
    'err.keitaro_error': 'Ошибка Keitaro',
    'err.keitaro_ambiguous': 'Результат операции неоднозначен — сверьтесь с админ-панелью Keitaro',
    'err.internal': 'Внутренняя ошибка сервера',
    'err.network': 'Нет связи с сервером. Проверьте, что API Adrobot запущен.',
    'err.http': 'Ошибка сервера (HTTP {status})',
  },

  uz: {
    'app.title': 'Adrobot — Keitaro kampaniyalarini boshqarish',

    'health.checking': 'Ulanish tekshirilmoqda…',
    'health.ok': 'Keitaro: ulangan',
    'health.unreachable': 'Keitaro: mavjud emas',
    'health.unconfigured': 'Keitaro: kalit berilmagan',
    'health.unknown': 'Keitaro: {value}',
    'health.api_down': 'API mavjud emas',
    'health.title': 'Adrobot API v{version} · BD: {db}',
    'health.db_ok': 'ok',
    'health.db_error': 'xato',

    'tab.create': 'Yangi kampaniya',
    'tab.editor': 'Kampaniyalar muharriri',
    'tab.history': 'Amallar tarixi',
    'aria.tabs': 'Boʻlimlar',

    'page.create.sub': 'Keitaroda kampaniya yaratish: geo-redirekt oqimi va oferlar oqimi',
    'page.editor.sub': 'Tanlangan kampaniyaning oqimlari, filtrlari va oferlar taqsimoti',
    'page.history.sub': 'Adrobotning Keitaro API bilan oxirgi 50 ta amali',

    'form.name.label': 'Kampaniya nomi',
    'form.geo.label': 'Geo (mamlakat)',
    'form.offer.label': 'Keitaro oferi',
    'form.name.ph': 'Konfiguratsiya yuklanmoqda…',
    'form.name.ph.unavailable': 'Konfiguratsiya mavjud emas',
    'form.geo.ph': 'UZ',
    'form.offer.ph': 'Ofer nomini kirita boshlang…',
    'form.geo.hint': 'Roʻyxatdan mamlakatni tanlang yoki 2 lotin harfdan iborat kod kiriting',
    'form.geo.err': 'Geo aynan 2 lotin harfdan iborat boʻlishi kerak (masalan, UZ)',
    'form.geo.unknown': '«{code}» kodi mamlakatlar roʻyxatida topilmadi — shundayligicha yuboriladi',
    'form.offer.hint': 'Ofer kampaniyaning ikkinchi oqimiga biriktiriladi',
    'form.offer.hint.ok': 'Ofer tanlandi — kampaniyani yaratish mumkin',
    'form.offer.required': 'Roʻyxatdan oferni tanlang — u ikkinchi oqim uchun kerak',
    'form.name.hint.prefix': 'Nomi «{prefix}» prefiksi bilan boshlanishi kerak',
    'form.name.hint.ok': '«{prefix}» prefiksiga mos keladi',
    'form.name.hint.loading': 'Konfiguratsiya yuklanmoqda…',
    'form.name.hint.disabled': 'Kampaniya yaratish mavjud emas — konfiguratsiya yuklanmadi',
    'form.invalid': 'Formani tekshiring — xatolar bor',
    'form.submit': 'Kampaniyani yaratish',
    'aria.geo_list': 'Mamlakatlar roʻyxati',
    'aria.offer_list': 'Oferlar roʻyxati',
    'aria.campaign_list': 'Kampaniyalar roʻyxati',

    'success.title': 'Kampaniya yaratildi',
    'success.sub': 'Kampaniya va ikkita oqim Keitaroda muvaffaqiyatli yaratildi',
    'btn.goto_editor': 'Muharrirga oʻtish',
    'btn.create_another': 'Yana yaratish',
    'toast.campaign_created': 'Kampaniya yaratildi',

    'chip.domain': 'domen',
    'chip.group': 'guruh',
    'chip.source': 'manba',
    'chip.updated': 'yangilangan',
    'schema.redirect': 'redirekt',
    'schema.offers': 'oferlar',
    'stream.fallback': 'Oqim {n}',
    'btn.copy': 'Nusxalash',
    'btn.copied': 'Nusxalandi',
    'btn.keitaro': 'Keitaro',

    'cb.not_found': 'Hech narsa topilmadi',
    'cb.loading': 'Yuklanmoqda…',
    'cb.search_error': 'Qidiruvda xato',
    'cb.geo_empty': 'Mamlakat topilmadi — kodni qoʻlda kiriting (masalan, UZ)',
    'cb.offers_empty': 'Oferlar topilmadi — soʻrovni aniqlashtiring',
    'cb.offers_loading': 'Oferlar qidirilmoqda…',
    'cb.campaigns_empty': 'Kampaniyalar topilmadi — soʻrovni oʻzgartiring yoki «barchasini koʻrsatish»ni yoqing',
    'cb.campaigns_loading': 'Kampaniyalar qidirilmoqda…',

    'editor.picker.ph': 'Kampaniyani nomi yoki ID boʻyicha toping…',
    'editor.show_all': 'barchasini koʻrsatish',
    'editor.empty.title': 'Kampaniyani tanlang',
    'editor.empty.hint': 'Yuqoridagi qidiruv orqali kampaniyani nomi yoki ID boʻyicha toping',
    'editor.streams_empty.title': 'Oqimlar topilmadi',
    'editor.streams_empty.hint': 'Tanlangan kampaniyada oqimlar yoʻq',
    'editor.load_error': 'Maʼlumotlarni yuklab boʻlmadi',
    'btn.retry': 'Qayta urinish',
    'toast.campaign_not_found': 'Kampaniya #{id} topilmadi',
    'state.active': 'faol',
    'state.disabled': 'oʻchirilgan',
    'stat.clicks': 'Kliklar',
    'stat.unique': 'Unikallar',
    'stat.conversions': 'Konversiyalar',
    'stat.cr': 'CR',
    'streams.title': 'Oqimlar',
    'stream.position': 'Oqim {n}',
    'stream.action': 'Amal:',

    'th.offer': 'Ofer',
    'th.share': 'Ulush',
    'th.clicks': 'Kliklar',
    'th.unique': 'Unikallar',
    'th.conversions': 'Konversiyalar',
    'th.cr': 'CR',
    'th.actions': 'Amallar',
    'offer.offers_empty': 'Oqimda hali oferlar yoʻq',
    'offer.delete_last': 'Oxirgi oferni oʻchirib boʻlmaydi',
    'offer.delete': 'Oferni oʻchirish',
    'offer.add.ph': 'Oferni nomi yoki ID boʻyicha toping…',
    'btn.add_offer': 'Ofer qoʻshish',
    'toast.offer_added': 'Ofer qoʻshildi — ulushlar qayta hisoblandi',
    'toast.offer_removed': 'Ofer oʻchirildi',
    'toast.select_offer': 'Avval roʻyxatdan oferni tanlang',
    'modal.delete_offer.title': 'Ofer oʻchirilsinmi?',
    'modal.delete_offer.body': '<strong>{name}</strong> oferi oqimdan oʻchiriladi. Qolgan oferlarning ulushlari qayta hisoblanadi.',
    'modal.confirm': 'Oʻchirish',
    'modal.cancel': 'Bekor qilish',
    'modal.close': 'Yopish',
    'toast.close': 'Bildirishnomani yopish',
    'btn.refresh': 'Yangilash',
    'btn.refresh_picker': 'Kampaniyalar roʻyxatini yangilash',
    'btn.copy_id': 'Ofer ID sini nusxalash',
    'toast.copied': 'Buferga nusxalandi',
    'toast.nothing_to_copy': 'Nusxalash uchun hech narsa yoʻq',
    'toast.copy_failed': 'Havolani nusxalab boʻlmadi',
    'offer.selected_chip': 'Ofer #{id}',
    'offer.clear': 'Tanlangan oferni bekor qilish',

    'history.auto_on': 'Avtoyangilash: yoqilgan',
    'history.auto_off': 'Avtoyangilash: oʻchirilgan',
    'history.refresh': 'Yangilash',
    'history.th.time': 'Vaqt',
    'history.th.action': 'Amal',
    'history.th.campaign': 'Kampaniya',
    'history.th.status': 'Holat',
    'action.create': 'yaratish',
    'action.add': 'ofer qoʻshish',
    'action.remove': 'oferni oʻchirish',
    'status.error': 'Xato',
    'status.error_unknown': 'Nomaʼlum xato',
    'history.empty.title': 'Hozircha amallar yoʻq',
    'history.empty.hint': 'Kampaniya yarating yoki oqim oferlarini oʻzgartiring — amallar shu yerda paydo boʻladi',

    'meta.banner': 'Server konfiguratsiyasini yuklab boʻlmadi: {message}. Kampaniya yaratish vaqtincha mavjud emas.',
    'footer.keitaro': 'Keitaro:',
    'footer.prefix': 'Prefiks:',
    'footer.domain': 'Domen:',
    'footer.report': 'Hisobot:',

    'lang.switch': 'Interfeys tili',

    'err.validation': 'Maʼlumotlarni tekshirishda xato',
    'err.not_found': 'Obʼyekt topilmadi',
    'err.conflict': 'Maʼlumotlar holatida ziddiyat',
    'err.keitaro_unavailable': 'Keitaro mavjud emas',
    'err.keitaro_error': 'Keitaro xatosi',
    'err.keitaro_ambiguous': 'Amal natijasi noaniq — Keitaro admin paneli bilan solishtiring',
    'err.internal': 'Serverning ichki xatosi',
    'err.network': 'Server bilan aloqa yoʻq. Adrobot API ishga tushganini tekshiring.',
    'err.http': 'Server xatosi (HTTP {status})',
  },
};

/* Country data (part of the i18n block): [code, name_ru, name_uz, name_en] */
const COUNTRIES = [
  ['US', 'Соединённые Штаты', 'Qoʻshma Shtatlar', 'United States'],
  ['GB', 'Великобритания', 'Buyuk Britaniya', 'United Kingdom'],
  ['DE', 'Германия', 'Germaniya', 'Germany'],
  ['FR', 'Франция', 'Fransiya', 'France'],
  ['ES', 'Испания', 'Ispaniya', 'Spain'],
  ['IT', 'Италия', 'Italiya', 'Italy'],
  ['RU', 'Россия', 'Rossiya', 'Russia'],
  ['UA', 'Украина', 'Ukraina', 'Ukraine'],
  ['KZ', 'Казахстан', 'Qozogʻiston', 'Kazakhstan'],
  ['UZ', 'Узбекистан', 'Oʻzbekiston', 'Uzbekistan'],
  ['TR', 'Турция', 'Turkiya', 'Turkey'],
  ['PL', 'Польша', 'Polsha', 'Poland'],
  ['NL', 'Нидерланды', 'Niderlandiya', 'Netherlands'],
  ['SE', 'Швеция', 'Shvetsiya', 'Sweden'],
  ['NO', 'Норвегия', 'Norvegiya', 'Norway'],
  ['FI', 'Финляндия', 'Finlandiya', 'Finland'],
  ['DK', 'Дания', 'Daniya', 'Denmark'],
  ['AT', 'Австрия', 'Avstriya', 'Austria'],
  ['CH', 'Швейцария', 'Shveytsariya', 'Switzerland'],
  ['CZ', 'Чехия', 'Chexiya', 'Czechia'],
  ['SK', 'Словакия', 'Slovakiya', 'Slovakia'],
  ['HU', 'Венгрия', 'Vengriya', 'Hungary'],
  ['RO', 'Румыния', 'Ruminiya', 'Romania'],
  ['BG', 'Болгария', 'Bolgariya', 'Bulgaria'],
  ['GR', 'Греция', 'Gretsiya', 'Greece'],
  ['PT', 'Португалия', 'Portugaliya', 'Portugal'],
  ['IE', 'Ирландия', 'Irlandiya', 'Ireland'],
  ['BE', 'Бельгия', 'Belgiya', 'Belgium'],
  ['LU', 'Люксембург', 'Lyuksemburg', 'Luxembourg'],
  ['CN', 'Китай', 'Xitoy', 'China'],
  ['JP', 'Япония', 'Yaponiya', 'Japan'],
  ['KR', 'Южная Корея', 'Janubiy Koreya', 'South Korea'],
  ['IN', 'Индия', 'Hindiston', 'India'],
  ['ID', 'Индонезия', 'Indoneziya', 'Indonesia'],
  ['TH', 'Таиланд', 'Tailand', 'Thailand'],
  ['VN', 'Вьетнам', 'Vetnam', 'Vietnam'],
  ['MY', 'Малайзия', 'Malayziya', 'Malaysia'],
  ['SG', 'Сингапур', 'Singapur', 'Singapore'],
  ['PH', 'Филиппины', 'Filippin', 'Philippines'],
  ['AU', 'Австралия', 'Avstraliya', 'Australia'],
  ['NZ', 'Новая Зеландия', 'Yangi Zelandiya', 'New Zealand'],
  ['CA', 'Канада', 'Kanada', 'Canada'],
  ['MX', 'Мексика', 'Meksika', 'Mexico'],
  ['BR', 'Бразилия', 'Braziliya', 'Brazil'],
  ['AR', 'Аргентина', 'Argentina', 'Argentina'],
  ['CL', 'Чили', 'Chili', 'Chile'],
  ['CO', 'Колумбия', 'Kolumbiya', 'Colombia'],
  ['PE', 'Перу', 'Peru', 'Peru'],
  ['EC', 'Эквадор', 'Ekvador', 'Ecuador'],
  ['EG', 'Египет', 'Misr', 'Egypt'],
  ['ZA', 'ЮАР', 'JAR', 'South Africa'],
  ['NG', 'Нигерия', 'Nigeriya', 'Nigeria'],
  ['KE', 'Кения', 'Keniya', 'Kenya'],
  ['MA', 'Марокко', 'Marokash', 'Morocco'],
  ['AE', 'ОАЭ', 'BAA', 'United Arab Emirates'],
  ['SA', 'Саудовская Аравия', 'Saudiya Arabistoni', 'Saudi Arabia'],
  ['QA', 'Катар', 'Qatar', 'Qatar'],
  ['KW', 'Кувейт', 'Quvayt', 'Kuwait'],
  ['IL', 'Израиль', 'Isroil', 'Israel'],
  ['GE', 'Грузия', 'Gruziya', 'Georgia'],
  ['AM', 'Армения', 'Armaniston', 'Armenia'],
  ['AZ', 'Азербайджан', 'Ozarbayjon', 'Azerbaijan'],
  ['BY', 'Беларусь', 'Belarus', 'Belarus'],
  ['MD', 'Молдова', 'Moldova', 'Moldova'],
  ['LT', 'Литва', 'Litva', 'Lithuania'],
  ['LV', 'Латвия', 'Latviya', 'Latvia'],
  ['EE', 'Эстония', 'Estoniya', 'Estonia'],
  ['KG', 'Киргизия', 'Qirgʻiziston', 'Kyrgyzstan'],
  ['TJ', 'Таджикистан', 'Tojikiston', 'Tajikistan'],
  ['TM', 'Туркменистан', 'Turkmaniston', 'Turkmenistan'],
  ['MN', 'Монголия', 'Mongoliya', 'Mongolia'],
  ['RS', 'Сербия', 'Serbiya', 'Serbia'],
  ['HR', 'Хорватия', 'Xorvatiya', 'Croatia'],
  ['SI', 'Словения', 'Sloveniya', 'Slovenia'],
  ['BA', 'Босния и Герцеговина', 'Bosniya va Gertsegovina', 'Bosnia and Herzegovina'],
  ['ME', 'Черногория', 'Chernogoriya', 'Montenegro'],
  ['MK', 'Северная Македония', 'Shimoliy Makedoniya', 'North Macedonia'],
  ['AL', 'Албания', 'Albaniya', 'Albania'],
  ['CY', 'Кипр', 'Kipr', 'Cyprus'],
  ['MT', 'Мальта', 'Malta', 'Malta'],
  ['IS', 'Исландия', 'Islandiya', 'Iceland'],
  ['PK', 'Пакистан', 'Pokiston', 'Pakistan'],
  ['BD', 'Бангладеш', 'Bangladesh', 'Bangladesh'],
  ['LK', 'Шри-Ланка', 'Shri-Lanka', 'Sri Lanka'],
  ['NP', 'Непал', 'Nepal', 'Nepal'],
  ['KH', 'Камбоджа', 'Kambodja', 'Cambodia'],
  ['LA', 'Лаос', 'Laos', 'Laos'],
  ['MM', 'Мьянма', 'Myanma', 'Myanmar'],
  ['TW', 'Тайвань', 'Tayvan', 'Taiwan'],
  ['HK', 'Гонконг', 'Gonkong', 'Hong Kong'],
  ['UY', 'Уругвай', 'Urugvay', 'Uruguay'],
  ['VE', 'Венесуэла', 'Venesuela', 'Venezuela'],
  ['GT', 'Гватемала', 'Gvatemala', 'Guatemala'],
  ['CR', 'Коста-Рика', 'Kosta-Rika', 'Costa Rica'],
  ['PA', 'Панама', 'Panama', 'Panama'],
  ['DO', 'Доминикана', 'Dominikana', 'Dominican Republic'],
  ['CU', 'Куба', 'Kuba', 'Cuba'],
  ['TN', 'Тунис', 'Tunis', 'Tunisia'],
  ['DZ', 'Алжир', 'Jazoir', 'Algeria'],
  ['GH', 'Гана', 'Gana', 'Ghana'],
  ['ET', 'Эфиопия', 'Efiopiya', 'Ethiopia'],
  ['TZ', 'Танзания', 'Tanzaniya', 'Tanzania'],
  ['IR', 'Иран', 'Eron', 'Iran'],
  ['IQ', 'Ирак', 'Iroq', 'Iraq'],
  ['JO', 'Иордания', 'Iordaniya', 'Jordan'],
  ['LB', 'Ливан', 'Livan', 'Lebanon'],
  ['OM', 'Оман', 'Ummon', 'Oman'],
  ['BH', 'Бахрейн', 'Bahrayn', 'Bahrain'],
];

const COUNTRY_MAP = new Map(COUNTRIES.map((c) => [c[0], c]));

function flagOf(code) {
  return String.fromCodePoint(...[...code].map((ch) => 0x1F1E6 + ch.charCodeAt(0) - 65));
}

function countryName(country) {
  return country[currentLang === 'uz' ? 2 : 1];
}

/* ---------------- i18n helpers ---------------- */

function detectLang() {
  try {
    const saved = localStorage.getItem('adrobot.lang');
    if (saved === 'ru' || saved === 'uz') return saved;
  } catch (err) { /* storage unavailable */ }
  try {
    if (String(navigator.language || '').toLowerCase().startsWith('uz')) return 'uz';
  } catch (err) { /* no navigator */ }
  return 'ru';
}

let currentLang = detectLang();

function t(key, params) {
  let str = (I18N[currentLang] && I18N[currentLang][key])
    ? I18N[currentLang][key]
    : (I18N.ru[key] || key);
  if (params) {
    for (const k of Object.keys(params)) {
      str = str.split(`{${k}}`).join(String(params[k] ?? ''));
    }
  }
  return str;
}

function setLanguage(lang) {
  if (lang !== 'ru' && lang !== 'uz') return;
  if (lang === currentLang) return;
  currentLang = lang;
  try { localStorage.setItem('adrobot.lang', lang); } catch (err) { /* storage unavailable */ }
  applyLanguage();
  document.dispatchEvent(new CustomEvent('adrobot:languagechange', { detail: { language: lang } }));
}

function renderLangSwitch() {
  $$('.lang-btn').forEach((btn) => {
    const active = btn.dataset.lang === currentLang;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function applyLanguage() {
  document.documentElement.lang = currentLang;
  document.title = t('app.title');

  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.dataset.i18nPh)); });
  $$('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  $$('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });

  renderLangSwitch();
  requestAnimationFrame(moveInk);
  renderHealthBadge();
  renderAutoRefreshBtn();
  if (lastMetaError) renderMetaBanner(lastMetaError);

  /* creator tab */
  if (meta) {
    applyMeta();
    updateGeoHint();
    updateOfferHint(lastSelectedOffer ? 'ok' : '');
  } else {
    setCreatorEnabled(false);
    updateGeoHint();
    updateOfferHint('');
  }
  renderOfferSelected(lastSelectedOffer);
  if (lastCreateResult && !createSuccessEl.hidden) {
    renderCreateSuccess(lastCreateResult.campaign, lastCreateResult.streams, lastCreateResult.geo);
  }

  /* editor tab */
  renderEditor();

  /* history tab */
  if (historyLoaded) renderHistory(lastHistoryItems);
}

/* ---------------- state ---------------- */

let meta = null;
let metaAttempted = false;
let creating = false;
let currentTab = 'create';
let lastHealth = null;
let lastSelectedOffer = null;
let lastCreateResult = null;
let historyLoaded = false;
let lastHistoryItems = [];

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

const ERR_KEYS = {
  validation: 'err.validation',
  not_found: 'err.not_found',
  conflict: 'err.conflict',
  keitaro_unavailable: 'err.keitaro_unavailable',
  keitaro_error: 'err.keitaro_error',
  keitaro_ambiguous: 'err.keitaro_ambiguous',
  internal: 'err.internal',
};

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
    throw new ApiError('network', t('err.network'), 0, cause);
  }
  let data = null;
  try {
    data = await response.json();
  } catch (err) { /* body is not JSON */ }
  if (!response.ok) {
    const err = data && data.error ? data.error : null;
    const code = err && err.code ? err.code : 'internal';
    const message = err && err.message
      ? err.message
      : t(ERR_KEYS[code] || 'err.internal');
    throw new ApiError(code, message, response.status, data);
  }
  return data;
}

/* ---------------- toasts ---------------- */

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
    <button type="button" class="toast-close" aria-label="${esc(t('toast.close'))}">${ICONS.x}</button>`;
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

/* ---------------- confirm modal ---------------- */

const modalRoot = $('#modalRoot');

function confirmModal({ title, message, confirmLabel = t('modal.confirm'), cancelLabel = t('modal.cancel'), danger = true }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <div class="modal-head">
          <h3 id="m-title">${esc(title)}</h3>
          <button type="button" class="icon-btn modal-x" aria-label="${esc(t('modal.close'))}">${ICONS.x}</button>
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

/* ---------------- API health ---------------- */

const healthBadge = $('#healthBadge');

async function checkHealth() {
  let state = 'loading';
  let labelKey = 'health.checking';
  let labelParams = null;
  let titleKey = null;
  let titleParams = null;
  let titleRaw = '';
  let apiVersion = null;
  let databaseStatus = null;
  try {
    const health = await api('/health');
    apiVersion = health.version || null;
    databaseStatus = health.db === 'ok' ? 'ok' : (health.db ? 'error' : null);
    const states = {
      ok: ['ok', 'health.ok'],
      unreachable: ['warn', 'health.unreachable'],
      unconfigured: ['off', 'health.unconfigured'],
    };
    const mapped = states[health.keitaro];
    if (mapped) {
      [state, labelKey] = mapped;
      titleKey = 'health.title';
      titleParams = {
        version: health.version || '?',
        db: health.db === 'ok' ? t('health.db_ok') : t('health.db_error'),
      };
    } else {
      state = 'off';
      labelKey = 'health.unknown';
      labelParams = { value: health.keitaro || '?' };
    }
  } catch (err) {
    state = 'down';
    labelKey = 'health.api_down';
    titleRaw = err.message;
  }
  lastHealth = { state, labelKey, labelParams, titleKey, titleParams, titleRaw, apiVersion, databaseStatus };
  renderHealthBadge();
}

function renderHealthBadge() {
  if (!lastHealth) return;
  const h = lastHealth;
  healthBadge.className = `health health--${h.state}`;
  healthBadge.title = h.titleKey ? t(h.titleKey, h.titleParams) : (h.titleRaw || '');
  if (h.apiVersion) healthBadge.dataset.apiVersion = String(h.apiVersion);
  else delete healthBadge.dataset.apiVersion;
  if (h.databaseStatus) healthBadge.dataset.database = h.databaseStatus;
  else delete healthBadge.dataset.database;
  $('.health-label', healthBadge).textContent = t(h.labelKey, h.labelParams);
}

/* ---------------- meta configuration ---------------- */

let lastMetaError = null;

function renderMetaBanner(err) {
  lastMetaError = err || null;
  const banner = $('#metaBanner');
  if (!err) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.innerHTML = `
    ${ICONS.alert}
    <span>${esc(t('meta.banner', { message: err.message }))}
      <button type="button" class="link-btn" id="metaRetry">${esc(t('btn.retry'))}</button>
    </span>`;
  $('#metaRetry').addEventListener('click', loadMeta);
}

async function loadMeta() {
  try {
    meta = await api('/api/meta');
    renderMetaBanner(null);
    applyMeta();
  } catch (err) {
    meta = null;
    renderMetaBanner(err);
    setCreatorEnabled(false);
  } finally {
    metaAttempted = true;
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
  if (meta.keitaro_url) parts.push(`${t('footer.keitaro')} <a href="${esc(meta.keitaro_url)}" target="_blank" rel="noopener">${esc(meta.keitaro_url)}</a>`);
  if (meta.prefix) parts.push(`${t('footer.prefix')} <code>${esc(meta.prefix)}</code>`);
  if (meta.domain) parts.push(`${t('footer.domain')} <code>${esc(meta.domain)}</code>`);
  if (meta.report) parts.push(`${t('footer.report')} <code>${esc(meta.report.interval || '—')}</code> · <code>${esc(meta.report.timezone || '—')}</code>`);
  footer.hidden = parts.length === 0;
  footer.innerHTML = parts.join('<span class="footer-sep" aria-hidden="true">•</span>');
}

function setCreatorEnabled(enabled) {
  nameInput.disabled = !enabled;
  geoInput.disabled = !enabled;
  offerInput.disabled = !enabled;
  createBtn.disabled = !enabled || creating;
  if (!enabled) {
    nameInput.placeholder = t(metaAttempted ? 'form.name.ph.unavailable' : 'form.name.ph');
    setHint(nameHint, t(metaAttempted ? 'form.name.hint.disabled' : 'form.name.hint.loading'), metaAttempted ? 'error' : '');
  }
}

/* ---------------- tabs ---------------- */

function moveInk() {
  const ink = $('.tab-ink');
  const active = $('.tab.is-active');
  if (!ink || !active) return;
  ink.style.width = `${active.offsetWidth}px`;
  ink.style.transform = `translateX(${active.offsetLeft}px)`;
}
window.addEventListener('resize', moveInk);

function switchTab(name) {
  currentTab = name;
  try { sessionStorage.setItem('adrobot.tab', name); } catch (err) { /* storage unavailable */ }
  ['create', 'editor', 'history'].forEach((key) => {
    const panel = $(`#tab-${key}`);
    const btn = $(`#tab-btn-${key}`);
    const active = key === name;
    panel.hidden = !active;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
    panel.tabIndex = active ? 0 : -1;
  });
  moveInk();
  if (name === 'history') loadHistory();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* ---------------- combobox ---------------- */

const comboboxRegistry = new Set();
document.addEventListener('click', (event) => {
  comboboxRegistry.forEach((cb) => {
    if (event.target.closest('[data-combo-keep]')) return;
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
    this.emptyTextKey = options.emptyTextKey || null;
    this.loadingTextKey = options.loadingTextKey || null;

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
        this.errorText = err && err.message ? err.message : t('cb.search_error');
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
      this.list.innerHTML = `<div class="cb-status"><span class="spinner" aria-hidden="true"></span>${esc(t(this.loadingTextKey || 'cb.loading'))}</div>`;
      return;
    }
    if (this.errorText) {
      this.list.innerHTML = `<div class="cb-error">${ICONS.alert}<span>${esc(this.errorText)}</span></div>`;
      return;
    }
    if (this.items.length === 0) {
      this.list.innerHTML = `<div class="cb-status cb-status--empty">${esc(t(this.emptyTextKey || 'cb.not_found'))}</div>`;
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

/* ---------------- field hints ---------------- */

function setHint(el, text, state) {
  el.textContent = text;
  el.dataset.state = state || '';
}

function markInvalid(input, hintEl, message) {
  input.classList.add('is-invalid');
  setHint(hintEl, message, 'error');
}

/* ---------------- empty / error states ---------------- */

let emptyIllustrationId = 0;

function emptyState(title, hint) {
  const gradId = `eg${++emptyIllustrationId}`;
  return `
    <div class="empty-state">
      <svg class="empty-illus" viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#9aa8ff"/>
            <stop offset="1" stop-color="#9aa8ff"/>
          </linearGradient>
        </defs>
        <rect x="16" y="16" width="88" height="88" rx="20" fill="none" stroke="#262b35" stroke-width="2" stroke-dasharray="5 7"/>
        <circle cx="58" cy="56" r="21" fill="none" stroke="#363c49" stroke-width="2"/>
        <circle cx="58" cy="56" r="7" fill="url(#${gradId})" opacity="0.9"/>
        <path d="M73.5 71.5 L87 85" stroke="#363c49" stroke-width="3" stroke-linecap="round"/>
        <circle cx="34" cy="34" r="3" fill="url(#${gradId})" opacity="0.55"/>
        <circle cx="88" cy="30" r="2.5" fill="#9aa8ff" opacity="0.4"/>
      </svg>
      <h3 class="empty-title">${esc(title)}</h3>
      <p class="empty-hint">${esc(hint)}</p>
    </div>`;
}

function errorState(message, retryLabel = t('btn.retry'), retryAttr = '') {
  return `
    <div class="empty-state">
      <span class="empty-error">${ICONS.alert}</span>
      <h3 class="empty-title">${esc(t('editor.load_error'))}</h3>
      <p class="empty-hint">${esc(message)}</p>
      <button type="button" class="btn btn--ghost btn--sm" ${retryAttr}>${esc(retryLabel)}</button>
    </div>`;
}

/* ---------------- Tab 1: campaign creator ---------------- */

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
    setHint(nameHint, t(metaAttempted ? 'form.name.hint.disabled' : 'form.name.hint.loading'), metaAttempted ? 'error' : '');
    return;
  }
  if (!value) {
    setHint(nameHint, t('form.name.hint.prefix', { prefix }), '');
    return;
  }
  if (value.startsWith(prefix)) {
    setHint(nameHint, t('form.name.hint.ok', { prefix }), 'ok');
  } else {
    setHint(nameHint, t('form.name.hint.prefix', { prefix }), 'error');
  }
}

function updateGeoHint() {
  const value = geoInput.value;
  if (!value) {
    setHint(geoHint, t('form.geo.hint'), '');
    return;
  }
  if (!/^[A-Z]{2}$/.test(value)) {
    setHint(geoHint, t('form.geo.err'), 'error');
    return;
  }
  const country = COUNTRY_MAP.get(value);
  if (country) setHint(geoHint, `${flagOf(country[0])} ${countryName(country)}`, 'ok');
  else setHint(geoHint, t('form.geo.unknown', { code: value }), 'warn');
}

function updateOfferHint(state = '') {
  if (state === 'ok') {
    setHint(offerHint, t('form.offer.hint.ok'), 'ok');
    return;
  }
  setHint(offerHint, t('form.offer.hint'), '');
}

function renderOfferSelected(offer) {
  lastSelectedOffer = offer || null;
  if (!offer) {
    offerSelectedEl.hidden = true;
    offerSelectedEl.innerHTML = '';
    return;
  }
  offerSelectedEl.hidden = false;
  offerSelectedEl.innerHTML = `
    <span class="chip chip--payout">${ICONS.check} ${esc(t('offer.selected_chip', { id: fmtInt(offer.id) }))}</span>
    <span class="chip">${esc(offer.name)}</span>
    <span class="chip chip--mono">${fmtDecimalStr(offer.payout_value)} ${esc(offer.payout_currency || '')}</span>
    <button type="button" class="icon-btn icon-btn--sm" id="clearOfferBtn" aria-label="${esc(t('offer.clear'))}" title="${esc(t('offer.clear'))}">${ICONS.x}</button>`;
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
      .filter(([code, ru, uz, en]) => code.startsWith(q) || ru.toLowerCase().includes(lower) || uz.toLowerCase().includes(lower) || en.toLowerCase().includes(lower))
      .slice(0, 40);
  },
  renderItem: (country) => `<span class="cb-item-flag">${flagOf(country[0])}</span><span class="cb-item-main">${esc(country[0])} — ${esc(countryName(country))}</span>`,
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
  emptyTextKey: 'cb.geo_empty',
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
  emptyTextKey: 'cb.offers_empty',
  loadingTextKey: 'cb.offers_loading',
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
  const prefix = campaignPrefix();
  if (!name.startsWith(prefix)) {
    invalid(nameInput, nameHint, t('form.name.hint.prefix', { prefix }));
  }
  if (!/^[A-Z]{2}$/.test(geo)) {
    invalid(geoInput, geoHint, t('form.geo.err'));
  }
  if (!offerIdInput.value) {
    invalid(offerInput, offerHint, t('form.offer.required'));
  }
  if (firstInvalid) {
    toast(t('form.invalid'), 'warning');
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
    toast(t('toast.campaign_created'), 'success');
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

/* Keitaro admin link button (rendered when meta.admin_url is present) */
function keitaroBtn() {
  if (!meta || !meta.admin_url) return '';
  return `<a class="btn btn--ghost btn--sm" href="${esc(meta.admin_url)}" target="_blank" rel="noopener" title="${esc(t('btn.keitaro'))}">${ICONS.external}<span>${esc(t('btn.keitaro'))}</span></a>`;
}

function renderCreateSuccess(campaign, streams, geo) {
  lastCreateResult = { campaign, streams, geo };
  creatorFormWrap.hidden = true;
  createSuccessEl.hidden = false;
  const safeUrl = campaign && campaign.url ? campaign.url : '';
  createSuccessEl.innerHTML = `
    <div class="success-head">
      <span class="success-icon">${ICONS.check}</span>
      <div>
        <h2>${esc(t('success.title'))}</h2>
        <p class="page-sub">${esc(t('success.sub'))}</p>
      </div>
    </div>
    <div class="card campaign-card">
      <div class="cc-head">
        <div class="cc-title">
          <h3>${esc(campaign && campaign.name ? campaign.name : '—')}</h3>
          <span class="chip chip--mono">ID ${fmtInt(campaign && campaign.id)}</span>
          <span class="chip chip--mono">alias ${esc(campaign && campaign.alias ? campaign.alias : '—')}</span>
        </div>
        <div class="cc-actions">${keitaroBtn()}</div>
      </div>
      <div class="cc-meta">
        <span class="chip chip--accent">${esc(t('chip.domain'))} ${esc(campaign && campaign.domain ? campaign.domain : '—')}</span>
        <span class="chip chip--accent">${esc(t('chip.group'))} ${esc(campaign && campaign.group ? campaign.group : '—')}</span>
        <span class="chip chip--accent">${esc(t('chip.source'))} ${esc(campaign && campaign.source ? campaign.source : '—')}</span>
      </div>
      <div class="cc-url">
        <span class="cc-url-text">${esc(safeUrl)}</span>
        <button type="button" class="btn btn--ghost btn--sm" data-copy="${esc(safeUrl)}">${ICONS.copy}<span>${esc(t('btn.copy'))}</span></button>
      </div>
    </div>
    <div class="streams-mini-grid">
      ${(streams || []).map((stream, idx) => renderStreamMini(stream, idx, geo)).join('')}
    </div>
    <div class="form-actions">
      <button type="button" id="gotoEditorBtn" class="btn btn--primary">${ICONS.arrow}<span>${esc(t('btn.goto_editor'))}</span></button>
      <button type="button" id="createAnotherBtn" class="btn btn--ghost">${esc(t('btn.create_another'))}</button>
    </div>`;
  $('#gotoEditorBtn').addEventListener('click', () => gotoEditor(campaign));
  $('#createAnotherBtn').addEventListener('click', resetCreator);
}

function isOfferStream(stream) {
  // Реальный Keitaro хранит офферы в schema="landings"; "offers" — legacy.
  return !!(stream && (stream.is_offer_stream || stream.schema === 'offers' || stream.schema === 'landings'));
}

function renderStreamMini(stream, idx, geo) {
  const isOffers = isOfferStream(stream);
  const offerNames = ((stream && stream.offers) || []).map((o) => o.offer_name).filter(Boolean);
  const geoFilter = ((stream && stream.filters) || []).find((f) => f.name === 'country' || f.name === 'country_code');
  const geoValue = geoFilter && geoFilter.payload && geoFilter.payload.length ? geoFilter.payload.join(', ') : (geo || '');
  const target = stream && stream.action_payload ? stream.action_payload : '';
  return `
    <div class="card stream-mini">
      <div class="stream-mini-head">
        <span class="pos-badge">№${fmtInt((stream && stream.position) || idx + 1)}</span>
        <span class="stream-mini-name">${esc(stream && stream.name ? stream.name : t('stream.fallback', { n: idx + 1 }))}</span>
        <span class="chip chip--schema">${esc(isOffers ? t('schema.offers') : t('schema.redirect'))}</span>
      </div>
      <div class="stream-mini-body">
        <span class="muted">→</span>
        ${isOffers
          ? `<span>${esc(offerNames.join(', ') || '—')}</span>`
          : `<a class="link" href="${esc(target)}" target="_blank" rel="noopener">${esc(target || '—')}</a>`}
      </div>
      ${isOffers
        ? ''
        : `<div class="stream-mini-filters"><span class="chip chip--filter"><span class="chip-key">${esc(geoFilter ? geoFilter.name : 'country')}</span> = ${esc(geoValue || '—')}</span></div>`}
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
  lastCreateResult = null;
  updateNameHint();
  updateGeoHint();
  updateOfferHint('');
  nameInput.focus();
}

/* ---------------- Tab 2: campaign editor ---------------- */

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
const campaignRefreshBtn = $('#campaignRefreshBtn');

const STATE_KEYS = { active: 'state.active', disabled: 'state.disabled' };

function stateLabel(state) {
  const key = STATE_KEYS[state];
  return key ? t(key) : String(state || '—');
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
  emptyTextKey: 'cb.campaigns_empty',
  loadingTextKey: 'cb.campaigns_loading',
});

showAllToggle.addEventListener('change', () => {
  campaignCombo.query();
});

campaignRefreshBtn.addEventListener('click', () => {
  campaignRefreshBtn.classList.add('is-spinning');
  campaignCombo.query();
  setTimeout(() => campaignRefreshBtn.classList.remove('is-spinning'), 700);
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
    // Refresh'dan keyin tanlangan kampaniyani tiklash uchun
    try { sessionStorage.setItem('adrobot.campaign', String(id)); } catch (err) { /* storage unavailable */ }
    renderEditor();
  } catch (err) {
    editorState.loading = false;
    editorState.campaign = null;
    editorState.streams = null;
    editorState.error = err.message;
    if (err.code === 'not_found') toast(t('toast.campaign_not_found', { id: fmtInt(id) }), 'error');
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
      root.innerHTML = `<div class="card">${errorState(editorState.error, t('btn.retry'), 'data-retry-campaign')}</div>`;
    } else {
      root.innerHTML = `<div class="card">${emptyState(t('editor.empty.title'), t('editor.empty.hint'))}</div>`;
    }
    return;
  }
  root.innerHTML = `
    <div id="editorHeaderWrap">${renderCampaignHeader(editorState.campaign, editorState.stats)}</div>
    <div id="streamsSection">${renderStreamsSection()}</div>`;
  initAddOfferCombos();
  animateCounts(root);
}

function animateCounts(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $$('[data-count]', root).forEach((el) => {
    const end = Number(el.dataset.count) || 0;
    const pct = el.dataset.pct === '1';
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min((now - t0) / 800, 1);
      const v = end * (1 - Math.pow(1 - k, 3));
      el.textContent = pct ? fmtPct1(v) : fmtInt(v);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
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
          <span class="chip chip--state chip--state-${esc(campaign.state || 'disabled')}">${esc(stateLabel(campaign.state))}</span>
        </div>
        <div class="cc-actions">
          ${keitaroBtn()}
          <button type="button" class="icon-btn" id="refreshCampaignBtn" aria-label="${esc(t('btn.refresh'))}" title="${esc(t('btn.refresh'))}">${ICONS.refresh}</button>
        </div>
      </div>
      <div class="cc-meta">
        <span class="chip">${esc(t('chip.domain'))} ${esc(campaign.domain || '—')}</span>
        <span class="chip">${esc(t('chip.group'))} ${esc(campaign.group || '—')}</span>
        <span class="chip">${esc(t('chip.source'))} ${esc(campaign.source || '—')}</span>
        ${campaign.updated_at ? `<span class="chip chip--muted">${esc(t('chip.updated'))} ${esc(campaign.updated_at)}</span>` : ''}
      </div>
      <div class="cc-url">
        <span class="cc-url-text">${esc(url || '—')}</span>
        <button type="button" class="btn btn--ghost btn--sm" data-copy="${esc(url)}">${ICONS.copy}<span>${esc(t('btn.copy'))}</span></button>
      </div>
      <div class="stats-grid">
        ${statTile(t('stat.clicks'), fmtInt(stats.clicks), false, num0(stats.clicks))}
        ${statTile(t('stat.unique'), fmtInt(stats.unique_clicks), false, num0(stats.unique_clicks))}
        ${statTile(t('stat.conversions'), fmtInt(stats.conversions), false, num0(stats.conversions))}
        ${statTile(t('stat.cr'), fmtPct1(stats.cr), true, num0(stats.cr))}
      </div>
    </div>`;
}

function statTile(label, value, accent = false, raw = null) {
  return `
    <div class="stat-tile">
      <div class="stat-tile-label">${esc(label)}</div>
      <div class="stat-tile-value${accent ? ' stat-tile-value--accent' : ''}"${raw !== null ? ` data-count="${raw}" data-pct="${accent ? 1 : 0}"` : ''}>${esc(value)}</div>
    </div>`;
}

function renderStreamsSection() {
  const streams = editorState.streams || [];
  if (!streams.length) {
    return `
      <div class="section-head"><h2>${esc(t('streams.title'))}</h2><span class="chip chip--muted">0</span></div>
      <div class="card">${emptyState(t('editor.streams_empty.title'), t('editor.streams_empty.hint'))}</div>`;
  }
  return `
    <div class="section-head"><h2>${esc(t('streams.title'))}</h2><span class="chip chip--muted">${streams.length}</span></div>
    <div class="streams-grid">${streams.map((stream, idx) => renderStreamCard(stream, idx)).join('')}</div>`;
}

function renderStreamCard(stream, idx) {
  const isOffers = isOfferStream(stream);
  const filters = stream.filters || [];
  return `
    <div class="card stream-card">
      <div class="stream-card-head">
        <span class="pos-badge">${esc(t('stream.position', { n: fmtInt(stream.position || idx + 1) }))}</span>
        <span class="stream-name">${esc(stream.name || t('stream.fallback', { n: idx + 1 }))}</span>
        <span class="chip chip--schema">${esc(isOffers ? t('schema.offers') : t('schema.redirect'))}</span>
        <span class="chip chip--state chip--state-${esc(stream.state || 'disabled')}">${esc(stateLabel(stream.state))}</span>
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
      <span class="muted">${esc(t('stream.action'))}</span>
      ${target
        ? `<a class="link" href="${esc(target)}" target="_blank" rel="noopener">→ ${esc(target)}</a>`
        : '<span class="muted">—</span>'}
    </div>`;
}

const SHARE_GRADIENTS = ['#9aa8ff', '#7dd3c0', '#c4b5fd', '#f5b45a', '#f4a3c4'];

function renderOffersBlock(stream) {
  const offers = stream.offers || [];
  const totalShare = offers.reduce((sum, offer) => sum + num0(offer.share), 0);
  const rows = offers.map((offer, idx) => renderOfferRow(stream, offer, idx, offers.length, totalShare)).join('');
  const body = rows || `<tr><td colspan="7"><div class="table-empty">${esc(t('offer.offers_empty'))}</div></td></tr>`;
  return `
    <div class="offers-block">
      <div class="table-scroll">
        <table class="table offers-table">
          <thead>
            <tr>
              <th>${esc(t('th.offer'))}</th>
              <th>${esc(t('th.share'))}</th>
              <th class="num">${esc(t('th.clicks'))}</th>
              <th class="num">${esc(t('th.unique'))}</th>
              <th class="num">${esc(t('th.conversions'))}</th>
              <th class="num">${esc(t('th.cr'))}</th>
              <th class="num" aria-label="${esc(t('th.actions'))}"></th>
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
  const tooltip = last ? t('offer.delete_last') : t('offer.delete');
  return `
    <tr style="--i:${idx}">
      <td>
        <div class="offer-cell">
          <span class="offer-cell-name">${esc(offer.offer_name || '—')}</span>
          <button type="button" class="chip chip--mono chip--sm chip--btn" data-copy-id="${esc(String(offer.offer_id))}" aria-label="${esc(t('btn.copy_id'))}" title="${esc(t('btn.copy_id'))}">#${fmtInt(offer.offer_id)}</button>
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
        <input class="input" type="text" autocomplete="off" spellcheck="false" placeholder="${esc(t('offer.add.ph'))}">
        <button type="button" class="cb-caret" tabindex="-1" aria-hidden="true">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="cb-list" role="listbox" hidden></div>
      </div>
      <button type="button" class="btn btn--primary btn--sm" data-add-offer data-stream="${esc(String(stream.id))}" disabled>${ICONS.plus}<span>${esc(t('btn.add_offer'))}</span></button>
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
      emptyTextKey: 'cb.offers_empty',
      loadingTextKey: 'cb.offers_loading',
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
    toast(t('toast.select_offer'), 'warning');
    return;
  }
  btn.disabled = true;
  btn.classList.add('is-loading');
  try {
    await api(`/api/campaigns/${editorState.campaign.id}/streams/${streamId}/offers`, {
      method: 'POST',
      body: { offer_id: offerId },
    });
    toast(t('toast.offer_added'), 'success');
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
    title: t('modal.delete_offer.title'),
    message: t('modal.delete_offer.body', { name: esc(offerName) }),
    confirmLabel: t('modal.confirm'),
    cancelLabel: t('modal.cancel'),
    danger: true,
  });
  if (!confirmed) return;
  btn.disabled = true;
  btn.classList.add('is-loading');
  try {
    await api(`/api/campaigns/${campaignId}/streams/${streamId}/offers/${offerId}`, { method: 'DELETE' });
    toast(t('toast.offer_removed'), 'success');
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

/* ---------------- Tab 3: operations history ---------------- */

let historyLoading = false;
let historyAuto = false;
let historyTimer = null;

const historyWrap = $('#historyWrap');
const refreshHistoryBtn = $('#refreshHistoryBtn');
const autoRefreshBtn = $('#autoRefreshBtn');

const ACTION_BADGES = {
  create_campaign: { labelKey: 'action.create', cls: 'badge--create' },
  add_offer: { labelKey: 'action.add', cls: 'badge--add' },
  remove_offer: { labelKey: 'action.remove', cls: 'badge--remove' },
};

async function loadHistory() {
  if (historyLoading) return;
  historyLoading = true;
  refreshHistoryBtn.classList.add('is-loading');
  try {
    const data = await api('/api/operations?limit=50');
    historyLoaded = true;
    lastHistoryItems = data.items || [];
    renderHistory(lastHistoryItems);
  } catch (err) {
    historyWrap.innerHTML = errorState(err.message, t('btn.retry'), 'data-retry-history');
    toast(err.message, 'error');
  } finally {
    historyLoading = false;
    refreshHistoryBtn.classList.remove('is-loading');
  }
}

function renderHistory(items) {
  if (!items.length) {
    historyWrap.innerHTML = emptyState(t('history.empty.title'), t('history.empty.hint'));
    return;
  }
  historyWrap.innerHTML = `
    <div class="table-scroll">
      <table class="table ops-table">
        <thead>
          <tr><th>${esc(t('history.th.time'))}</th><th>${esc(t('history.th.action'))}</th><th>${esc(t('history.th.campaign'))}</th><th>${esc(t('history.th.status'))}</th></tr>
        </thead>
        <tbody>${items.map((op, i) => renderOpRow(op, i)).join('')}</tbody>
      </table>
    </div>`;
}

function renderOpRow(op, i = 0) {
  const action = ACTION_BADGES[op.action] || { labelKey: null, cls: '' };
  const actionLabel = action.labelKey ? t(action.labelKey) : esc(op.action || '—');
  const ok = op.status === 'ok';
  const idChip = (op.keitaro_campaign_id !== null && op.keitaro_campaign_id !== undefined)
    ? `<span class="chip chip--mono chip--sm">#${fmtInt(op.keitaro_campaign_id)}</span>`
    : '';
  const campaignCell = op.campaign_name
    ? `<div class="op-campaign">${idChip}<span>${esc(op.campaign_name)}</span></div>`
    : (idChip || '<span class="muted">—</span>');
  const statusCell = ok
    ? `<span class="badge badge--ok">${ICONS.check}<span>OK</span></span>`
    : `<span class="badge badge--err" data-tooltip="${esc(op.error || t('status.error_unknown'))}">${ICONS.alert}<span>${esc(t('status.error'))}</span></span>`;
  return `
    <tr style="--i:${Math.min(i, 14)}">
      <td class="time-cell">${fmtDateTimeLocal(op.created_at)}</td>
      <td><span class="badge ${action.cls}">${actionLabel}</span></td>
      <td>${campaignCell}</td>
      <td>${statusCell}</td>
    </tr>`;
}

function renderAutoRefreshBtn() {
  autoRefreshBtn.classList.toggle('is-on', historyAuto);
  autoRefreshBtn.innerHTML = `<span class="auto-dot" aria-hidden="true"></span>${esc(t(historyAuto ? 'history.auto_on' : 'history.auto_off'))}`;
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

/* ---------------- clipboard ---------------- */

async function copyText(text, btn) {
  if (!text) {
    toast(t('toast.nothing_to_copy'), 'warning');
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
    toast(t('toast.copied'), 'success');
    if (btn) {
      const original = btn.innerHTML;
      btn.classList.add('is-copied');
      btn.innerHTML = `${ICONS.check}<span>${esc(t('btn.copied'))}</span>`;
      setTimeout(() => {
        btn.classList.remove('is-copied');
        btn.innerHTML = original;
      }, 1600);
    }
  } else {
    toast(t('toast.copy_failed'), 'error');
  }
}

/* ---------------- delegated clicks ---------------- */

document.addEventListener('click', (event) => {
  const copyBtn = event.target.closest('[data-copy]');
  if (copyBtn) {
    copyText(copyBtn.dataset.copy || '', copyBtn);
    return;
  }
  const copyIdBtn = event.target.closest('[data-copy-id]');
  if (copyIdBtn) {
    copyText(copyIdBtn.dataset.copyId || '', copyIdBtn);
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

/* ---------------- init ---------------- */

function init() {
  applyLanguage();
  $$('.tab').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  $$('.lang-btn').forEach((btn) => btn.addEventListener('click', () => setLanguage(btn.dataset.lang)));
  renderAutoRefreshBtn();
  checkHealth();
  setInterval(checkHealth, 30000);
  loadMeta();
  renderEditor();

  // Refresh'dan keyin tab va tanlangan kampaniyani tiklash
  let savedTab = null;
  try { savedTab = sessionStorage.getItem('adrobot.tab'); } catch (err) { /* storage unavailable */ }
  let savedCampaign = null;
  try { savedCampaign = sessionStorage.getItem('adrobot.campaign'); } catch (err) { /* storage unavailable */ }
  if (savedTab === 'editor' || savedTab === 'history') {
    switchTab(savedTab);
    if (savedTab === 'editor' && savedCampaign) {
      const id = Number(savedCampaign);
      if (Number.isInteger(id) && id > 0) {
        campaignCombo.setExternal(null, '# ' + id);
        openCampaign(id, null);
      }
    }
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveInk);
  moveInk();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
