'use strict';
const $ = selector => document.querySelector(selector);
if (!window.layarDesktop && window.AndroidBridge) {
  window.layarDesktop = {
    api: async resource => {
      const res = await fetch('/api/source?resource=' + encodeURIComponent(resource));
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Sumber belum bisa dimuat.');
      return data;
    },
    settings: async () => {
      try { return JSON.parse(window.AndroidBridge.getSettings()); }
      catch { return { quality: 'auto', blockAds: true, passthrough: false, nativePath: '', language: 'id' }; }
    },
    setLanguage: async value => {
      window.AndroidBridge.setLanguage(value);
      return value;
    },
    saveSettings: async value => {
      window.AndroidBridge.saveSettings(JSON.stringify(value));
      return value;
    },
    chooseNative: async () => ({ nativePath: '' }),
    native: async () => {},
    openFile: async () => ({ opened: false }),
    play: async options => {
      window.AndroidBridge.play(JSON.stringify(options));
    },
    closePlayer: async () => {
      window.AndroidBridge.closePlayer();
    },
    fullscreen: async () => {},
    openSource: async options => {
      window.AndroidBridge.openSource(options ? JSON.stringify(options) : '');
    },
    onPlayerStatus: callback => {
      window.__layarPlayerStatus = callback;
    }
  };
}
const desktop = window.layarDesktop;
const SOURCE = 'https://z2.idlixku.com';
const IMG = 'https://image.tmdb.org/t/p/';
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem('layar.v2.' + key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('layar.v2.' + key, JSON.stringify(value)); } catch {} }
};
const i18n = window.LayarI18n.createI18n(storage.get('language', 'id'));
const t = (key, values) => i18n.t(key, values);
function applyInterfaceLanguage() {
  document.documentElement.lang = i18n.language;
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  for (const attribute of ['title', 'aria-label', 'placeholder']) {
    document.querySelectorAll(`[data-i18n-${attribute}]`).forEach(node => node.setAttribute(attribute, t(node.getAttribute('data-i18n-' + attribute))));
  }
  $('#language').value = i18n.language;
}
async function changeLanguage(value) {
  if (!['id', 'en'].includes(value) || value === i18n.language) return;
  const wasSettings = !!$('#languagePreference');
  const item = !$('#modal').classList.contains('hidden') && !wasSettings ? detail : null;
  const season = Number($('#detailSeason')?.value);
  i18n.setLanguage(value); storage.set('language', value);
  applyInterfaceLanguage();
  render();
  if (wasSettings) { await openSettings(); $('#languagePreference')?.focus(); }
  else if (item) {
    renderDetail(item);
    if (season && $('#detailSeason') && Number($('#detailSeason').value) !== season) { $('#detailSeason').value = String(season); loadDetailEpisodes(item, season); }
  }
  if (playback) {
    $('#playerSubtitle').textContent = playback.episode ? `Season ${playback.season} · Episode ${playback.episode.number} — ${playback.episode.title}` : `${playback.item.year} · ${runtime(playback.item.runtime)}`;
    if (playback.item.type === 'tv_series') loadPlayerEpisodes(sidebarSeason || playback.season);
    if (externalPlaying) $('#playerMessage').innerHTML = `<p>${t('Film diputar di mpv.')}</p><small>${t('Tutup mpv untuk kembali ke player internal.')}</small>`;
    else if (lastPlayerStatus) handlePlayerStatus(lastPlayerStatus);
  }
  try { await desktop?.setLanguage?.(value); } catch (error) { toast(errorText(error)); }
}
const image = (path, size = 'w500') => !path ? '' : /^\/[a-zA-Z0-9_.-]+$/.test(path) ? IMG + size + path : '';
const keyOf = item => item.type + ':' + item.slug;
const typeLabel = item => item.type === 'tv_series' ? t("SERIES") : t("FILM");
const runtime = n => n ? (n >= 60 ? `${Math.floor(n / 60)} ${i18n.language === 'en' ? 'h' : 'j'}${n % 60 ? ` ${n % 60} m` : ''}` : n + ' m') : '';
const saved = item => storage.get('list', []).some(x => keyOf(x) === keyOf(item));
const historyOf = item => storage.get('history', []).find(x => keyOf(x.item) === keyOf(item));
let viewToken = 0, detailToken = 0, episodeToken = 0, playerEpisodeToken = 0;
let currentTab = 'home', currentQuery = '', homeData, detail, playback, focusBeforeModal, searchTimer, toastTimer;
let sidebarSeason = 0;
let settingsToken = 0, capabilityPromise, streamFormats = {}, externalPlaying = false, lastPlayerStatus;
function qualityLabel(height) { return height >= 2160 ? '4K UHD' : height >= 1080 ? '1080p' : height ? height + 'p' : ''; }
function probeCapabilities() {
  return capabilityPromise ||= (async () => {
    async function probe(config) { try { return await navigator.mediaCapabilities.decodingInfo({ type: 'media-source', ...config }); } catch { return { supported: false, smooth: false, powerEfficient: false }; } }
    const [avc, hevc, dolby, atmos] = await Promise.all([
      probe({ video: { contentType: 'video/mp4; codecs="avc1.640033"', width: 3840, height: 2160, bitrate: 20000000, framerate: 30 } }),
      probe({ video: { contentType: 'video/mp4; codecs="hvc1.1.6.L153.B0"', width: 3840, height: 2160, bitrate: 20000000, framerate: 30 } }),
      probe({ audio: { contentType: 'audio/mp4; codecs="ec-3"', channels: '6', bitrate: 768000, samplerate: 48000 } }),
      probe({ audio: { contentType: 'audio/mp4; codecs="ec-3"', channels: '16', bitrate: 768000, samplerate: 48000, spatialRendering: true } })
    ]);
    return { avc, hevc, dolby, atmos };
  })();
}

async function api(resource) {
  if (desktop) return desktop.api(resource);
  if (location.protocol === 'file:') throw new Error(t("Buka Layar lewat Layar.vbs untuk menjalankan aplikasi desktop."));
  const response = await fetch('/api/source?resource=' + encodeURIComponent(resource), { signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || t("Sumber belum bisa dimuat."));
  return data;
}
function errorText(error) {
  const message = (error?.message || 'Koneksi ke IDLIX terputus. Coba lagi.').replace(/^Error invoking remote method '[^']+': Error: /, '');
  if (i18n.language === 'en' && /^IDLIX belum bisa dimuat \(\d+\)\.$/.test(message)) return message.replace('IDLIX belum bisa dimuat', 'Could not load IDLIX');
  return t(message);
}
function element(tag, className, html) { const node = document.createElement(tag); node.className = className || ''; if (html != null) node.innerHTML = html; return node; }
function toast(text) { const node = $('#toast'); node.textContent = text; node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 3200); }
function metadata(item) {
  return `${item.rating ? `<span class="rating">★ ${item.rating.toFixed(1)}</span>` : ''}<span>${esc(item.year)}</span>${item.type === 'tv_series' && item.numberOfSeasons ? `<span>${t("{count} season", { count: item.numberOfSeasons })}</span>` : item.runtime ? `<span>${runtime(item.runtime)}</span>` : ''}${item.quality ? `<span class="quality">${esc(item.quality)}</span>` : ''}`;
}
function listButton(item, compact = false) { return compact ? icon(saved(item) ? 'check' : 'plus') : icon(saved(item) ? 'check' : 'plus') + (saved(item) ? t("Di Daftarku") : t("Daftarku")); }
function toggleList(item) {
  const list = storage.get('list', []), exists = saved(item);
  storage.set('list', exists ? list.filter(x => keyOf(x) !== keyOf(item)) : [item, ...list]);
  document.querySelectorAll('[data-save]').forEach(button => { if (button.dataset.save === keyOf(item)) { button.innerHTML = listButton(item, button.classList.contains('icon-button')); button.setAttribute('aria-pressed', String(!exists)); } });
  toast(exists ? t("Dihapus dari Daftarku") : t("Ditambahkan ke Daftarku"));
}
function card(item, recent, landscape = false, rank = null) {
  const button = element('button', 'card' + (landscape ? ' landscape-card' : ''));
  button.title = `${item.title}${item.year ? ' (' + item.year + ')' : ''}`;
  const src = image(landscape ? item.backdrop || item.poster : item.poster, landscape ? 'w500' : 'w342');
  const topBadge = rank ? `<span class="card-rank-badge">TOP 10</span>` : '';
  button.innerHTML = `<div class="card-art">${src ? `<img src="${src}" alt="${esc(item.title)}" loading="lazy" decoding="async">` : `<span class="no-image">${esc(item.title)}</span>`}<span class="card-type">${landscape ? `<b>L</b>` : typeLabel(item)}</span>${topBadge}<span class="card-shade"></span>${landscape ? `<span class="card-overlay-title">${esc(item.title)}</span>` : ''}<span class="card-play">${icon('play')}</span>${recent?.episode ? `<span class="recent-tag">S${recent.season} · E${recent.episode}</span>` : ''}</div><span class="card-caption">${esc(item.title)}</span><span class="card-meta"><span>${esc(item.year)}</span>${item.rating ? `<span class="score">★ ${item.rating.toFixed(1)}</span>` : ''}<span>${item.type === 'tv_series' ? t("Series") : t("Film")}</span></span>`;
  button.setAttribute('aria-label', recent?.episode ? t("{title}, terakhir Season {season} Episode {episode}", { title: item.title, season: recent.season, episode: recent.episode }) : item.title);
  button.querySelector('img')?.addEventListener('error', event => { event.target.replaceWith(element('span', 'no-image', esc(item.title))); }, { once: true });
  button.onclick = () => openDetail(item);
  return button;
}
const rowNames = { 'Trending Now': 'Lagi ramai ditonton', 'Trending in Indonesia': 'Populer di Indonesia', 'Trending in Your Country': 'Populer di Indonesia', 'Network Originals': 'Dari jaringan favoritmu', Collections: 'Pilihan buat malam ini', 'Recently Added Movies': 'Film yang baru hadir', 'Recently Added Series': 'Series yang baru hadir' };
function makeRow(title, items, opts = {}) {
  const section = element('section', 'row');
  section.innerHTML = `<div class="row-heading"><h2>${esc(title)}</h2><div class="row-tools"><button data-dir="-1" aria-label="${esc(t("Geser {title} ke kiri", { title }))}">‹</button><button data-dir="1" aria-label="${esc(t("Geser {title} ke kanan", { title }))}">›</button></div></div><div class="track"></div>`;
  const track = section.querySelector('.track');
  const isTrending = /ramai|populer|trending|pilihan/i.test(title);
  items.forEach((item, idx) => track.append(card(item, opts.history?.find(x => keyOf(x.item) === keyOf(item)), true, isTrending && idx < 10 ? (idx + 1) : null)));
  section.querySelectorAll('[data-dir]').forEach(button => { button.onclick = () => track.scrollBy({ left: Number(button.dataset.dir) * track.clientWidth * .8, behavior: 'smooth' }); });
  return section;
}
function renderHero(items) {
  const hero = element('section', 'hero');
  const pool = items.filter(x => x.backdrop).slice(0, 6);
  if (!pool.length) return hero;
  function show(index) {
    const item = pool[index];
    const maturity = item.rating ? (item.rating >= 7.5 ? '18+' : (item.rating >= 6 ? '13+' : 'SU')) : '13+';
    const tagline = item.genres?.length ? item.genres.slice(0, 2).join(' • ') : (item.type === 'tv_series' ? t("Series Populer") : t("Film Populer"));
    hero.innerHTML = `
      <img class="hero-image" src="${image(item.backdrop, 'w1280')}" alt="" fetchpriority="high">
      <div class="hero-vignette"></div>
      <div class="hero-content">
        <div class="hero-kicker"><span class="hero-monogram">L</span> <span class="hero-type-tag">${typeLabel(item)}</span></div>
        <div class="hero-title">${image(item.logo) ? `<img class="hero-logo" src="${image(item.logo, 'w500')}" alt="${esc(item.title)}">` : `<h1>${esc(item.title)}</h1>`}</div>
        <div class="hero-meta">${metadata(item)}</div>
        <div class="hero-tagline">${icon('sparkle')}<span>${esc(tagline)}</span></div>
        <p class="hero-overview">${esc(item.overview || t("Temukan cerita berikutnya buat ditonton malam ini."))}</p>
        <div class="btns">
          <button class="btn primary hero-play" data-action="play">${icon('play')} <span>${item.type === 'tv_series' ? t("Pilih episode") : t("Putar")}</span></button>
          <button class="btn secondary hero-info" data-action="detail">${icon('info')} <span>${t("Info lainnya")}</span></button>
          <button class="icon-button hero-save" data-save="${esc(keyOf(item))}" aria-label="${esc(t("Simpan ke Daftarku") + " · " + item.title)}" aria-pressed="${saved(item)}">${listButton(item, true)}</button>
        </div>
      </div>
      <div class="hero-maturity"><span>${maturity}</span></div>
      <div class="hero-bottom"><div class="hero-dots">${pool.map((_, i) => `<button data-slide="${i}" class="${index === i ? 'active' : ''}" aria-label="${t("Pilihan")} ${i + 1}" aria-pressed="${index === i}"></button>`).join('')}</div><span class="hero-source">${t("KATALOG IDLIX")}</span></div>`;
    hero.querySelector('.hero-logo')?.addEventListener('error', event => event.target.replaceWith(element('h1', '', esc(item.title))), { once: true });
    hero.querySelector('[data-action=play]').onclick = async event => {
      if (item.type === 'tv_series') return openDetail(item, true);
      const button = event.currentTarget; button.disabled = true;
      try { const movie = await api('movies/' + item.slug); if (!movie.hasVideo) return toast(t("Video belum tersedia dari sumber.")); await startPlayback(movie); }
      catch (error) { toast(errorText(error)); } finally { button.disabled = false; }
    };
    hero.querySelector('[data-action=detail]').onclick = () => openDetail(item);
    hero.querySelector('[data-save]').onclick = () => toggleList(item);
    hero.querySelectorAll('[data-slide]').forEach(button => { button.onclick = () => show(Number(button.dataset.slide)); });
  }
  show(0); return hero;
}
function showPageError(container, error, retry) {
  container.innerHTML = `<section class="status-panel"><span class="eyebrow">LAYAR · IDLIX</span><h1>${t("Belum bisa terhubung.")}</h1><p>${esc(errorText(error))}</p><div class="btns"><button class="btn primary" data-retry>${t("Coba lagi")}</button><button class="btn" data-source>${t("Buka IDLIX ↗")}</button></div></section>`;
  container.querySelector('[data-retry]').onclick = retry;
  container.querySelector('[data-source]').onclick = () => openExternal();
}
async function renderHome(token) {
  const main = $('#main');
  main.innerHTML = `<div class="skeleton skeleton-hero"></div><div class="row"><div class="track">` + `<div class="skeleton card"></div>`.repeat(7) + `</div></div>`;
  try {
    const data = await api('homepage');
    if (token !== viewToken) return;
    homeData = data;
    main.replaceChildren(renderHero(data.featured.length ? data.featured : data.rows[0]?.items || []));
    const rows = element('div', 'home-rows');
    const history = storage.get('history', []);
    const seen = new Set();
    for (const row of data.rows) {
      if (!row.title || row.type === 'tmdb_trending') continue;
      const label = t(rowNames[row.title] || row.title);
      if (seen.has(label)) continue;
      seen.add(label); rows.append(makeRow(label, row.items));
    }
    if (history.length) {
      const recent = makeRow(t("Terakhir kamu putar"), history.map(x => x.item), { history });
      if (rows.firstElementChild) rows.firstElementChild.after(recent); else rows.append(recent);
    }
    main.append(rows);
  } catch (error) { if (token === viewToken) showPageError(main, error, render); }
  finally { if (token === viewToken) main.setAttribute('aria-busy', 'false'); }
}
function showEmpty(grid, title, text) { grid.innerHTML = ''; const node = element('div', 'empty', `${icon('search')}<h2>${esc(title)}</h2><p>${esc(text)}</p>`); grid.replaceWith(node); }
function gridPage(token, { title, subtitle, fetchPage, sort = false, items }) {
  const page = element('section', 'grid-page');
  page.innerHTML = `<div class="page-heading"><div><span class="eyebrow">${t("KOLEKSI LAYAR")}</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${sort ? `<select id="sort" aria-label="${esc(t("Urutkan katalog"))}"><option value="latest">${t("Baru ditambahkan")}</option><option value="popular">${t("Paling populer")}</option></select>` : ''}</div><div class="grid"></div><button class="btn load-more hidden">${t("Muat lebih banyak")}</button>`;
  $('#main').replaceChildren(page);
  const grid = page.querySelector('.grid'), more = page.querySelector('.load-more');
  let pageNumber = 0, sortValue = 'latest', requestId = 0;
  const seen = new Set();
  async function load(reset = false) {
    const request = ++requestId;
    if (reset) { pageNumber = 0; seen.clear(); grid.replaceChildren(); }
    const nextPage = pageNumber + 1;
    if (!pageNumber) { grid.innerHTML = `<div class="skeleton card"></div>`.repeat(12); }
    more.disabled = true; more.textContent = t("Memuat…");
    try {
      const data = await fetchPage(nextPage, sortValue);
      if (token !== viewToken || request !== requestId) return;
      if (!pageNumber) grid.replaceChildren();
      for (const item of data.items) { if (!seen.has(keyOf(item))) { seen.add(keyOf(item)); grid.append(card(item)); } }
      pageNumber = nextPage;
      more.classList.toggle('hidden', pageNumber >= data.pages);
      if (!seen.size) showEmpty(grid, t("Belum ada hasil"), currentQuery ? t("Coba judul asli atau kata kunci yang lebih singkat.") : t("Judul akan muncul di sini saat tersedia."));
    } catch (error) {
      if (token !== viewToken || request !== requestId) return;
      if (!pageNumber) {
        grid.innerHTML = `<div class="empty"><p>${esc(errorText(error))}</p><button class="btn" data-retry>${t("Coba lagi")}</button></div>`;
        grid.querySelector('[data-retry]').onclick = () => load(true);
      } else toast(errorText(error));
    } finally { if (request === requestId) { more.disabled = false; more.textContent = t("Muat lebih banyak"); $('#main').setAttribute('aria-busy', 'false'); } }
  }
  more.onclick = () => load();
  page.querySelector('#sort')?.addEventListener('change', event => { sortValue = event.target.value; load(true); });
  if (items) { items.forEach(item => grid.append(card(item))); if (!items.length) showEmpty(grid, t("Daftarku masih kosong"), t("Simpan film atau series lewat tombol + supaya gampang ditemukan lagi.")); $('#main').setAttribute('aria-busy', 'false'); }
  else load();
}
function render() {
  const token = ++viewToken;
  document.body.classList.toggle('catalog-view', !!currentQuery || currentTab !== 'home');
  $('#main').setAttribute('aria-busy', 'true');
  window.scrollTo(0, 0);
  if (currentQuery) gridPage(token, { title: t("Hasil untuk “{query}”", { query: currentQuery }), subtitle: t("Film dan series dari katalog IDLIX."), fetchPage: page => api('search?' + new URLSearchParams({ q: currentQuery, page, limit: 24 })) });
  else if (currentTab === 'home') renderHome(token);
  else if (currentTab === 'list') gridPage(token, { title: t("Daftarku"), subtitle: t("Cerita yang kamu simpan untuk nanti."), items: storage.get('list', []) });
  else gridPage(token, { title: currentTab === 'movie' ? t("Film") : t("Series"), subtitle: currentTab === 'movie' ? t("Satu film lagi sebelum hari berganti.") : t("Satu episode selalu berujung satu season."), sort: true, fetchPage: (page, sort) => api(`${currentTab === 'movie' ? 'movies' : 'series'}?page=${page}&limit=24&sort=${sort}`) });
}
function setTab(tab) {
  clearTimeout(searchTimer); currentTab = tab; currentQuery = ''; $('#search').value = '';
  document.querySelectorAll('[data-tab]').forEach(button => { button.classList.toggle('active', button.dataset.tab === tab); button.setAttribute('aria-current', button.dataset.tab === tab ? 'page' : 'false'); });
  render();
}

function openModal() { focusBeforeModal = document.activeElement; $('#modal').classList.remove('hidden'); document.body.classList.add('locked'); $('#modal').scrollTop = 0; $('#modal').focus(); }
function closeModal() { ++detailToken; ++episodeToken; ++settingsToken; $('#modal').classList.add('hidden'); $('#dialog').replaceChildren(); detail = null; if (!playback) document.body.classList.remove('locked'); focusBeforeModal?.focus?.(); if (currentTab === 'list') render(); }
async function openDetail(item, focusEpisodes = false) {
  openModal(); const token = ++detailToken;
  $('#dialog').innerHTML = `<button class="icon-button dialog-close" data-close aria-label="${esc(t("Tutup"))}">${icon('close')}</button><div class="loading"><span class="spinner"></span><p>${t("Memuat {title}…", { title: esc(item.title) })}</p></div>`;
  try {
    const data = await api(`${item.type === 'tv_series' ? 'series' : 'movies'}/${item.slug}`);
    if (token !== detailToken) return;
    detail = data; renderDetail(data);
    if (focusEpisodes && item.type === 'tv_series') $('.episode-section')?.scrollIntoView({ block: 'start' });
  } catch (error) {
    if (token !== detailToken) return;
    $('#dialog').innerHTML = `<button class="icon-button dialog-close" data-close aria-label="${esc(t("Tutup"))}">${icon('close')}</button><div class="empty"><h2>${t("Detail belum bisa dimuat")}</h2><p>${esc(errorText(error))}</p><button class="btn" data-retry>${t("Coba lagi")}</button></div>`;
    $('#dialog [data-retry]').onclick = () => openDetail(item, focusEpisodes);
  }
}
function renderDetail(item) {
  const last = historyOf(item), series = item.type === 'tv_series';
  const availableSeasons = item.seasons.filter(s => s.number > 0).sort((a, b) => a.number - b.number);
  const initialSeason = availableSeasons.find(s => s.number === last?.season)?.number || availableSeasons[0]?.number;
  $('#dialog').innerHTML = `<button class="icon-button dialog-close" data-close aria-label="${esc(t("Tutup"))}">${icon('close')}</button><div class="detail-art" style="background-image:url('${image(item.backdrop, 'w1280')}')"><div class="detail-title"><span class="eyebrow">${typeLabel(item)} · IDLIX</span><h2>${esc(item.title)}</h2><div class="btns"><button class="btn primary" data-play ${item.hasVideo === false && !series ? 'disabled' : ''}>${icon('play')}${series ? last?.episode ? t("Pilih episode · Terakhir S{season} E{episode}", { season: last.season, episode: last.episode }) : t("Pilih episode") : t("Putar film")}</button><button class="icon-button" data-save="${esc(keyOf(item))}" aria-label="${esc(t("Simpan ke Daftarku"))}" aria-pressed="${saved(item)}">${listButton(item, true)}</button></div></div></div><div class="detail-copy"><div><div class="hero-meta">${metadata(item)}</div><p>${esc(item.overview || t("Sinopsis belum tersedia."))}</p></div><div class="metadata">${item.cast.length ? `<p><b>${t("Pemeran:")}</b> ${esc(item.cast.join(', '))}</p>` : ''}${item.genres.length ? `<p><b>${t("Genre:")}</b> ${esc(item.genres.join(', '))}</p>` : ''}${item.director ? `<p><b>${t("Sutradara:")}</b> ${esc(item.director)}</p>` : ''}<p><b>${t("Sumber:")}</b> z2.idlixku.com</p></div></div>${series ? `<section class="episode-section"><div class="episode-heading"><h3>${t("Episode")}</h3><span class="episode-count"></span><select id="detailSeason" aria-label="${esc(t("Pilih season"))}" ${!availableSeasons.length ? 'disabled' : ''}>${availableSeasons.length ? availableSeasons.map(s => `<option value="${s.number}" ${s.number === initialSeason ? 'selected' : ''}>Season ${s.number}${s.count ? ' · ' + t('{count} episode', { count: s.count }) : ''}</option>`).join('') : `<option>${t("Belum tersedia")}</option>`}</select></div><div id="detailEpisodes"></div><p class="source-note">${t("Pilih episode dan mulai menonton. Pop-up diblokir; iklan dilewati otomatis saat tersedia.")}</p></section>` : `<section class="movie-source"><h3>${t("Siap untuk nonton?")}</h3><p>${item.hasVideo ? t("Putar langsung di Layar. Kualitas dan audio mengikuti video asli; waktu tunggu server masih dapat berlaku.") : t("Video belum tersedia dari sumber IDLIX.")}</p></section>`}`;
  $('#dialog [data-save]').onclick = () => toggleList(item);
  $('#dialog [data-play]').onclick = () => {
    if (series) { $('.episode-section').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('#detailSeason').focus({ preventScroll: true }); }
    else startPlayback(item);
  };
  if (series) {
    $('#detailSeason').onchange = event => loadDetailEpisodes(item, Number(event.target.value));
    if (initialSeason) loadDetailEpisodes(item, initialSeason);
    else $('#detailEpisodes').innerHTML = `<div class="empty">${t("Belum ada season yang tersedia dari sumber.")}</div>`;
  }
}
function episodeRow(item, season, episode, active) {
  const button = element('button', 'episode' + (active ? ' selected' : ''));
  button.disabled = !episode.available;
  button.setAttribute('aria-label', t("Putar {title}, Season {season}, Episode {episode}: {name}", { title: item.title, season, episode: episode.number, name: episode.title }) + (!episode.available ? t(", belum tersedia") : ""));
  button.innerHTML = `<span class="ep-number">${episode.number}</span><div class="ep-art">${image(episode.still) ? `<img src="${image(episode.still, 'w300')}" alt="" loading="lazy">` : ''}${icon('play')}</div><div class="ep-info"><div class="ep-title"><span>${esc(episode.title)}</span><span class="ep-runtime">${runtime(episode.runtime)}</span></div><p class="ep-overview">${esc(episode.overview || t("Sinopsis episode belum tersedia."))}</p>${!episode.available ? `<span class="ep-unavailable">${t("Video belum tersedia")}</span>` : ''}</div>`;
  button.onclick = () => startPlayback(item, season, episode);
  return button;
}
async function loadDetailEpisodes(item, season) {
  const token = ++episodeToken, node = $('#detailEpisodes'), last = historyOf(item);
  node.innerHTML = `<div class="loading"><span class="spinner"></span><p>${t("Memuat episode…")}</p></div>`;
  try {
    const data = await api(`series/${item.slug}/season/${season}`);
    if (token !== episodeToken || !node.isConnected) return;
    node.replaceChildren();
    $('.episode-count').textContent = t('{count} episode', { count: data.episodes.length });
    data.episodes.forEach(episode => node.append(episodeRow(item, season, episode, season === last?.season && episode.number === last?.episode)));
    if (!data.episodes.length) node.innerHTML = `<div class="empty">${t("Season ini belum punya episode yang tersedia.")}</div>`;
  } catch (error) {
    if (token !== episodeToken || !node.isConnected) return;
    node.innerHTML = `<div class="empty"><p>${esc(errorText(error))}</p><button class="btn" data-retry>${t("Muat episode lagi")}</button></div>`;
    node.querySelector('[data-retry]').onclick = () => loadDetailEpisodes(item, season);
  }
}
function playbackOptions(value = playback) { return { type: value.item.type, slug: value.item.slug, season: value.season, episode: value.episode?.number }; }
function externalUrl(options) {
  if (!options) return SOURCE;
  return options.type === 'movie' ? `${SOURCE}/movie/${options.slug}?play=1` : `${SOURCE}/series/${options.slug}/season/${options.season}/episode/${options.episode}?play=1`;
}
function openExternal(options) { if (desktop) desktop.openSource(options).catch(error => toast(errorText(error))); else window.open(externalUrl(options), '_blank', 'noopener,noreferrer'); }
function updateBounds() {
  // Android opens a separate Activity and has no Electron surface to resize.
  if (!playback || typeof desktop?.bounds !== 'function') return;
  const rect = $('#playerSurface').getBoundingClientRect();
  desktop.bounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
}
async function startPlayback(item, season, episode) {
  if (!desktop) { openExternal({ type: item.type, slug: item.slug, season, episode: episode?.number }); toast(t("Player di dalam Layar tersedia lewat Layar.vbs.")); return; }
  if (item.type === 'tv_series' && (!episode || !episode.available)) return;
  const wasPlaying = !!playback;
  playback = { item, season, episode };
  streamFormats = {}; externalPlaying = false; lastPlayerStatus = null;
  if (!$('#modal').classList.contains('hidden')) closeModal();
  document.body.classList.add('locked');
  $('#player').classList.remove('hidden');
  $('#playerTitle').textContent = item.title;
  $('#playerSubtitle').textContent = episode ? `Season ${season} · Episode ${episode.number} — ${episode.title}` : `${item.year} · ${runtime(item.runtime)}`;
  $('#playerMessage').innerHTML = `<span class="spinner"></span><p>${t("Menyiapkan player IDLIX…")}</p>`;
  $('#playerNote').textContent = t("Menyiapkan sesi. Pop-up diblokir; iklan dilewati saat tersedia.");
  $('#streamInfo').textContent = t("MENYIAPKAN VIDEO");
  $('#subtitleInfo').textContent = t('Subtitle: cek menu CC');
  $('#subtitleInfo').title = t('Belum dapat memastikan sub Indo. Pilih Indonesia / Indonesian di menu CC atau Subtitle jika tersedia.');
  $('#nativePlayer').disabled = true;
  const series = item.type === 'tv_series';
  $('#playerSidebar').classList.toggle('hidden', !series);
  if (!wasPlaying || !series) $('#player').classList.toggle('no-sidebar', !series);
  if (series) {
    $('#playerSeason').innerHTML = item.seasons.filter(s => s.number > 0).sort((a,b) => a.number - b.number).map(s => `<option value="${s.number}" ${s.number === season ? 'selected' : ''}>Season ${s.number}</option>`).join('');
    loadPlayerEpisodes(season);
  }
  const current = playback;
  try {
    updateBounds();
    await desktop.play(playbackOptions(current));
    if (playback !== current) return;
    const history = storage.get('history', []).filter(x => keyOf(x.item) !== keyOf(item));
    storage.set('history', [{ item, season: season || null, episode: episode?.number || null, at: Date.now() }, ...history].slice(0, 20));
  } catch (error) { if (playback === current) { $('#playerMessage').innerHTML = `<p>${esc(errorText(error))}</p>`; $('#playerNote').textContent = t("Gunakan Muat ulang atau Buka sumber."); } }
}
async function loadPlayerEpisodes(season) {
  const token = ++playerEpisodeToken, item = playback?.item;
  if (!item) return;
  sidebarSeason = season;
  const node = $('#playerEpisodes');
  node.innerHTML = `<div class="loading"><span class="spinner"></span></div>`;
  try {
    const data = await api(`series/${item.slug}/season/${season}`);
    if (token !== playerEpisodeToken || !playback) return;
    node.replaceChildren();
    data.episodes.forEach(episode => node.append(episodeRow(item, season, episode, season === playback.season && episode.number === playback.episode?.number)));
    node.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
    if (!data.episodes.length) node.innerHTML = `<p class="empty">${t("Belum ada episode.")}</p>`;
  } catch (error) {
    if (token !== playerEpisodeToken || !playback) return;
    node.innerHTML = `<div class="empty"><p>${esc(errorText(error))}</p><button class="btn" data-retry>${t("Coba lagi")}</button></div>`;
    node.querySelector('[data-retry]').onclick = () => loadPlayerEpisodes(season);
  }
}
async function closePlayer() {
  ++playerEpisodeToken;
  playback = null;
  $('#player').classList.add('hidden');
  document.body.classList.remove('locked');
  try { await desktop?.closePlayer(); } catch {}
  if (currentTab === 'home') render();
}
async function openSettings() {
  if (!$('#languagePreference')) openModal(); ++detailToken; const token = ++settingsToken;
  $('#dialog').innerHTML = `<button class="icon-button dialog-close" data-close aria-label="${esc(t("Tutup"))}">${icon('close')}</button><div class="loading"><span class="spinner"></span><p>${t("Memeriksa ruang tonton…")}</p></div>`;
  try {
    const [preferences, capabilities] = await Promise.all([desktop?.settings() || { quality: 'auto', blockAds: true, passthrough: false, nativePath: '' }, probeCapabilities()]);
    if (token !== settingsToken) return;
    const fourK = capabilities.avc.supported || capabilities.hevc.supported;
    $('#dialog').innerHTML = `<button class="icon-button dialog-close" data-close aria-label="${esc(t("Tutup"))}">${icon('close')}</button><div class="settings-body"><span class="eyebrow">LAYAR / DESKTOP EDITION 03</span><h2>${t("Atur pengalamanmu.")}</h2><p>${t("Ruang tonton pribadi, langsung di laptop. Pengaturan tersimpan otomatis.")}</p><label class="settings-row"><span><b>${t("Bahasa tampilan")}</b><small>${t("Bahasa menu Layar, terpisah dari subtitle dan sinopsis sumber.")}</small></span><select id="languagePreference" aria-label="${esc(t("Bahasa tampilan"))}"><option value="id">Bahasa Indonesia</option><option value="en">English</option></select></label><p class="source-note">${t("Judul dan sinopsis tetap mengikuti bahasa dari sumber; mengganti bahasa menu tidak menerjemahkan film atau membuat subtitle baru.")}</p><h3>${t("Subtitle")}</h3><p>${t("Sub Indo tidak dijamin untuk semua judul. Saat menonton, pilih Indonesia / Indonesian di menu CC atau Subtitle player sumber.")}</p><p class="source-note">${t("Subtitle dari situs belum diteruskan ke mpv. Untuk file lokal, gunakan subtitle bawaan file atau tambahkan file subtitle sendiri di mpv.")}</p><h3>${t("Selama menonton")}</h3><label class="settings-row"><span><b>${t("Lewati iklan otomatis")}</b><small>${t("Blokir jaringan iklan dan klik Lewati saat tersedia. Waktu tunggu server dan verifikasi tetap mengikuti sumber.")}</small></span><input id="adPreference" type="checkbox" ${preferences.blockAds ? 'checked' : ''} ${!desktop ? 'disabled' : ''}></label><h3>${t("Player eksternal · mpv")}</h3><div class="settings-row"><div><b>${t("Pemutar untuk format cinema")}</b><small>${t("Gunakan mpv untuk file 4K, HEVC, dan audio multikanal lewat Buka file. Stream HLS kompatibel juga bisa diteruskan; sumber dengan player khusus tetap diputar di Layar.")}</small><p id="nativePath" class="native-status">${esc(preferences.nativePath ? t("mpv sudah dipilih") : t("Belum dihubungkan"))}</p></div><button id="chooseNative" class="btn" ${!desktop ? 'disabled' : ''}>${t("Pilih mpv.exe")}</button></div><label class="settings-row"><span><b>${t("Kualitas stream di mpv")}</b><small>${t("Hemat: bitrate hingga 2 Mbps. Seimbang: hingga 8 Mbps. Maksimum: kualitas tertinggi sumber, termasuk 4K bila tersedia. Player internal memakai pilihan kualitas sumber.")}</small></span><select id="qualityPreference" ${!desktop ? 'disabled' : ''}><option value="eco">${t("Hemat")}</option><option value="auto">${t("Seimbang")}</option><option value="maximum">${t("Maksimum / 4K")}</option></select></label><label class="settings-row"><span><b>Dolby Atmos / DTS · passthrough</b><small>${t("Di mpv, teruskan audio asli E-AC-3 atau TrueHD ke perangkat HDMI yang mendukung. Membutuhkan track Atmos asli; matikan untuk speaker laptop biasa.")}</small></span><input id="passthroughPreference" type="checkbox" ${preferences.passthrough ? 'checked' : ''} ${!desktop ? 'disabled' : ''}></label><h3>${t("Kemampuan player internal di laptop ini")}</h3><div class="capabilities"><div class="capability"><b>4K UHD</b><span>${fourK ? t("Decoder 2160p terdeteksi") : t("Decoder 2160p belum terdeteksi")}</span></div><div class="capability"><b>HEVC</b><span>${capabilities.hevc.supported ? t("Decoder tersedia") : t("Gunakan mpv jika dibutuhkan")}</span></div><div class="capability"><b>Dolby Atmos</b><span>${capabilities.atmos.supported ? t("Decoder spasial terdeteksi") : capabilities.dolby.supported ? t("Dolby Digital Plus tersedia; Atmos belum terkonfirmasi") : t("Decoder internal belum mendukung; gunakan passthrough mpv")}</span></div></div><p class="source-note">${t("Pemeriksaan decoder bukan jaminan keluaran speaker atau headphone. Resolusi, HDR, dan audio asli bergantung pada sumber. Layar tidak mengubah video HD menjadi 4K atau audio stereo menjadi Atmos.")}</p><p class="source-note">${t("Daftarku dan riwayat episode disimpan di laptop. Katalog: IDLIX · Gambar: TMDB.")}</p></div>`;
    $('#qualityPreference').value = preferences.quality;
    $('#languagePreference').value = i18n.language;
    $('#languagePreference').onchange = event => changeLanguage(event.target.value).catch(error => toast(errorText(error)));
    const controls = [$('#adPreference'), $('#qualityPreference'), $('#passthroughPreference')];
    async function save() {
      const value = { blockAds: $('#adPreference').checked, quality: $('#qualityPreference').value, passthrough: $('#passthroughPreference').checked };
      controls.forEach(control => { control.disabled = true; });
      try { await desktop.saveSettings(value); toast(t("Pengaturan disimpan. Berlaku pada pemutaran berikutnya.")); }
      catch (error) { toast(errorText(error)); }
      finally { if (token === settingsToken) controls.forEach(control => { control.disabled = false; }); }
    }
    controls.forEach(control => { control.onchange = save; });
    $('#chooseNative').onclick = async () => {
      try { const result = await desktop.chooseNative(); if (token === settingsToken) $('#nativePath').textContent = result.nativePath ? t("mpv sudah dipilih") : t("Belum dihubungkan"); }
      catch (error) { toast(errorText(error)); }
    };
  } catch (error) { if (token === settingsToken) $('#dialog').innerHTML = `<button class="icon-button dialog-close" data-close aria-label="${esc(t("Tutup"))}">${icon('close')}</button><div class="empty"><p>${esc(errorText(error))}</p></div>`; }
}

document.querySelectorAll('[data-tab]').forEach(button => { button.onclick = () => setTab(button.dataset.tab); });
$('#home').onclick = () => setTab('home');
$('#settings').onclick = openSettings;
$('#language').onchange = event => changeLanguage(event.target.value).catch(error => toast(errorText(error)));
$('#cinemaSettings').onclick = openSettings;
$('#openFile').onclick = async () => {
  if (!desktop) return toast(t("Buka Layar.vbs untuk memutar file lokal."));
  try { const result = await desktop.openFile(); if (result.opened) toast(t("File dibuka di mpv.")); }
  catch (error) { toast(errorText(error)); }
};
$('#search').addEventListener('input', event => {
  clearTimeout(searchTimer); ++viewToken;
  currentQuery = event.target.value.trim();
  searchTimer = setTimeout(render, 350);
});
$('.search')?.addEventListener('click', () => {
  $('#search').focus();
  window.AndroidBridge?.showKeyboard?.();
});
$('.search')?.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target !== $('#search')) {
    event.preventDefault();
    $('#search').focus();
    window.AndroidBridge?.showKeyboard?.();
  }
});
$('#search').addEventListener('focus', () => {
  window.AndroidBridge?.showKeyboard?.();
});
$('#search').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    $('#search').blur();
    window.AndroidBridge?.hideKeyboard?.();
  }
});
$('#modal').onclick = event => { if (event.target === $('#modal') || event.target.closest('[data-close]')) closeModal(); };
$('#playerBack').onclick = closePlayer;
$('#playerSeason').onchange = event => loadPlayerEpisodes(Number(event.target.value));
$('#playerSidebar').onclick = () => { $('#player').classList.toggle('no-sidebar'); updateBounds(); };
$('#fullscreen').onclick = () => desktop?.fullscreen();
$('#openSource').onclick = () => { if (playback) openExternal(playbackOptions()); };
$('#retryPlayer').onclick = () => { if (playback) startPlayback(playback.item, playback.season, playback.episode); };
$('#nativePlayer').onclick = async () => {
  const current = playback;
  $('#nativePlayer').disabled = true;
  try {
    await desktop.native();
    if (playback !== current) return;
    externalPlaying = true;
    $('#playerMessage').innerHTML = `<p>${t("Film diputar di mpv.")}</p><small>${t("Tutup mpv untuk kembali ke player internal.")}</small>`;
    $('#playerNote').textContent = t("Player internal dijeda selama mpv terbuka.");
  } catch (error) { toast(errorText(error)); }
  finally { if (playback === current) $('#nativePlayer').disabled = externalPlaying; }
};
new ResizeObserver(updateBounds).observe($('#playerSurface'));
function handlePlayerStatus(status) {
  lastPlayerStatus = status;
  if (status.state === 'local-error') { toast(t(status.message)); return; }
  if (!playback) return;
  if (status.state === 'close-request') { closePlayer(); return; }
  if (status.state === 'error') { $('#playerNote').textContent = t(status.message); }
  else if (status.state === 'loaded') $('#playerNote').textContent = t("Menyiapkan video. Verifikasi atau waktu tunggu dapat diminta sumber.");
  else if (status.state === 'stream') {
    if (status.resolutions) streamFormats = status;
    $('#nativePlayer').disabled = !status.externalReady || externalPlaying;
    $('#nativePlayer').title = t("Putar stream yang sama dengan mpv yang dipilih di Pengaturan");
  } else if (status.state === 'metrics' && !externalPlaying) {
    const detected = status.hasIndonesianSubtitles === true;
    $('#subtitleInfo').textContent = t(detected ? 'Sub Indo terdeteksi' : 'Subtitle: cek menu CC');
    $('#subtitleInfo').title = t(detected ? 'Sub Indo terdeteksi' : status.subtitleTracks?.length ? 'Track subtitle lain terdeteksi; cek menu CC.' : 'Belum dapat memastikan sub Indo. Pilih Indonesia / Indonesian di menu CC atau Subtitle jika tersedia.');
    const actual = qualityLabel(status.height);
    const available = streamFormats.resolutions?.[0];
    $('#streamInfo').textContent = [actual ? actual + ' ' + t('AKTIF') : t("MENYIAPKAN VIDEO"), available ? t('SUMBER') + ' ' + qualityLabel(available) : '', streamFormats.atmos ? t("ATMOS DI SUMBER") : ''].filter(Boolean).join(' · ');
    if (status.playing) $('#playerNote').textContent = t("Selamat menonton.") + (status.skipped ? t(" Iklan dilewati otomatis.") : '');
    if (status.playing && !status.externalReady) $('#nativePlayer').title = t("Sumber ini memakai player khusus. Gunakan player internal; mpv tetap tersedia untuk file lokal lewat Buka file.");
  } else if (status.state === 'external-closed') {
    externalPlaying = false; $('#nativePlayer').disabled = false; $('#playerNote').textContent = t(status.message);
  }
}
desktop?.onPlayerStatus(handlePlayerStatus);
window.addEventListener('scroll', () => $('#nav').classList.toggle('solid', scrollY > 35), { passive: true });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { if (playback) closePlayer(); else if (!$('#modal').classList.contains('hidden')) closeModal(); }
  if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !playback && $('#modal').classList.contains('hidden')) { event.preventDefault(); $('#search').focus(); }
  if (event.key === 'Tab' && !$('#modal').classList.contains('hidden')) {
    const nodes = [...$('#dialog').querySelectorAll('button:not(:disabled),select:not(:disabled),a[href]')].filter(node => node.getClientRects().length);
    const first = nodes[0], last = nodes.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('#modal'))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === $('#modal'))) { event.preventDefault(); first?.focus(); }
  }
});

function initNetflixIntro() {
  const splash = $('#introSplash');
  if (!splash) return;

  let audioStarted = false;
  function playIntroTaDum() {
    if (audioStarted) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const runTaDum = () => {
        if (audioStarted) return;
        audioStarted = true;
        const now = ctx.currentTime;
        const t0 = now + 0.03;

        // 1. Transient Click / Percussion strike (the sharp "Ta")
        const clickOsc = ctx.createOscillator();
        const clickGain = ctx.createGain();
        clickOsc.type = 'sine';
        clickOsc.frequency.setValueAtTime(1600, t0);
        clickOsc.frequency.exponentialRampToValueAtTime(180, t0 + 0.04);
        clickGain.gain.setValueAtTime(0.35, t0);
        clickGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.045);
        clickOsc.connect(clickGain);
        clickGain.connect(ctx.destination);
        clickOsc.start(t0);
        clickOsc.stop(t0 + 0.05);

        // Sub kick strike
        const kickOsc = ctx.createOscillator();
        const kickGain = ctx.createGain();
        kickOsc.type = 'triangle';
        kickOsc.frequency.setValueAtTime(150, t0);
        kickOsc.frequency.exponentialRampToValueAtTime(42, t0 + 0.12);
        kickGain.gain.setValueAtTime(0.6, t0);
        kickGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
        kickOsc.connect(kickGain);
        kickGain.connect(ctx.destination);
        kickOsc.start(t0);
        kickOsc.stop(t0 + 0.15);

        // 2. Cinematic D-Minor Chord Swell (the signature "DUM" at t0 + 0.09s)
        const t1 = t0 + 0.09;

        // Deep sub fundamental D1 (36.7Hz) & D2 (73.4Hz)
        const subOsc = ctx.createOscillator();
        const subGain = ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(73.42, t1);
        subOsc.frequency.exponentialRampToValueAtTime(36.71, t1 + 0.45);
        subGain.gain.setValueAtTime(0.001, t1);
        subGain.gain.linearRampToValueAtTime(0.65, t1 + 0.07);
        subGain.gain.exponentialRampToValueAtTime(0.001, t1 + 2.0);
        subOsc.connect(subGain);
        subGain.connect(ctx.destination);
        subOsc.start(t1);
        subOsc.stop(t1 + 2.1);

        // Cinematic Chord Harmonics with detuning & resonant sweep
        const chordTones = [
          { f: 73.42, type: 'sawtooth', vol: 0.28, detune: -5 },
          { f: 110.0, type: 'sawtooth', vol: 0.25, detune: 6 },
          { f: 146.83, type: 'triangle', vol: 0.26, detune: -3 },
          { f: 174.61, type: 'sawtooth', vol: 0.20, detune: 5 }, // Iconic minor third tension
          { f: 220.0, type: 'triangle', vol: 0.16, detune: -4 },
          { f: 293.66, type: 'sine', vol: 0.12, detune: 3 }
        ];

        chordTones.forEach(tone => {
          const osc = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const gain = ctx.createGain();

          osc.type = tone.type;
          osc.frequency.setValueAtTime(tone.f, t1);
          osc.detune.setValueAtTime(tone.detune, t1);

          filter.type = 'lowpass';
          filter.Q.setValueAtTime(3.2, t1);
          filter.frequency.setValueAtTime(380, t1);
          filter.frequency.exponentialRampToValueAtTime(2600, t1 + 0.26); // Bright bloom
          filter.frequency.exponentialRampToValueAtTime(130, t1 + 2.1);  // Dark warm decay

          gain.gain.setValueAtTime(0.001, t1);
          gain.gain.linearRampToValueAtTime(tone.vol, t1 + 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, t1 + 2.2);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.start(t1);
          osc.stop(t1 + 2.3);
        });
      };

      if (ctx.state === 'running') {
        runTaDum();
      } else {
        ctx.resume().then(() => {
          if (ctx.state === 'running') runTaDum();
        }).catch(() => {});
        const unlock = () => {
          ctx.resume().then(() => {
            if (ctx.state === 'running') runTaDum();
          }).catch(() => {});
          window.removeEventListener('pointerdown', unlock);
          window.removeEventListener('keydown', unlock);
        };
        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
      }
    } catch (_) {}
  }

  playIntroTaDum();

  let dismissed = false;
  function dismissSplash() {
    if (dismissed) return;
    dismissed = true;
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.remove();
    }, 550);
  }

  setTimeout(dismissSplash, 1950);
  splash.addEventListener('click', dismissSplash);
  window.addEventListener('keydown', () => {
    if (!dismissed) dismissSplash();
  }, { once: true });
}

initNetflixIntro();
applyInterfaceLanguage();
Promise.resolve(desktop?.setLanguage?.(i18n.language)).catch(error => toast(errorText(error)));
render();
