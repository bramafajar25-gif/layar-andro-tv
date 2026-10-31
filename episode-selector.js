'use strict';
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LayarEpisodes = factory();
})(globalThis, function() {
  const css = `
.layar-episode-selector{color:#eee;font:14px/1.5 system-ui,sans-serif;width:100%;min-width:0;text-align:left}
.layar-episode-selector *{box-sizing:border-box}
.layar-episode-selector .le-layout{display:grid;grid-template-columns:auto minmax(0,1fr);gap:20px;min-height:0}
.layar-episode-selector .le-seasons{display:flex;flex-direction:column;gap:4px;align-self:start;max-height:65vh;overflow:auto;padding:4px 10px 8px 0;border-right:1px solid #ffffff30;scrollbar-width:none}
.layar-episode-selector button{font:inherit;cursor:pointer;color:inherit}
.layar-episode-selector .le-season{flex-shrink:0;white-space:nowrap;background:transparent;border:0;border-right:2px solid transparent;border-radius:0;min-height:44px;padding:10px 12px;text-align:right;color:#9a9a9a;transition:color .15s}
.layar-episode-selector .le-season:hover{color:#fff}
.layar-episode-selector .le-season[aria-pressed=true]{border-color:#e50914;color:#fff;font-weight:650}
.layar-episode-selector .le-body{display:flex;flex-direction:column;min-width:0;min-height:0}
.layar-episode-selector .le-heading{display:flex;align-items:baseline;justify-content:space-between;margin:0 0 12px;gap:12px;flex-shrink:0}
.layar-episode-selector h3{margin:0;font-size:22px;color:#fff}
.layar-episode-selector .le-count{color:#aaa;font-size:13px;white-space:nowrap}
.layar-episode-selector .le-list{display:flex;flex-direction:column;gap:10px;min-height:0}
.layar-episode-selector .le-card{display:grid;grid-template-columns:minmax(110px,40%) minmax(0,1fr);align-items:stretch;width:100%;padding:0;border:1px solid #ffffff10;border-radius:8px;background:#151719;overflow:hidden;text-align:left;white-space:normal;min-height:44px;flex-shrink:0;transition:background .15s,border-color .15s}
.layar-episode-selector .le-card:hover:not(:disabled){background:#1f2225}
.layar-episode-selector .le-card[aria-current=true]{border-color:#e50914}
.layar-episode-selector .le-art{display:block;position:relative;width:100%;aspect-ratio:16/9;align-self:start;background:#292b2d;overflow:hidden}
.layar-episode-selector .le-art img{width:100%;height:100%;object-fit:cover;display:block}
.layar-episode-selector .le-duration{position:absolute;right:6px;bottom:6px;padding:2px 6px;background:#000c;border-radius:4px;font-size:11px;color:#fff}
.layar-episode-selector .le-copy{display:flex;flex-direction:column;min-width:0;padding:10px 12px}
.layar-episode-selector .le-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:15px;line-height:1.3;font-weight:650;color:#fff}
.layar-episode-selector .le-description{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:5px 0 8px;color:#b0b0b0;font:13px/1.45 system-ui,sans-serif}
.layar-episode-selector .le-footer{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:auto;font-size:13px}
.layar-episode-selector .le-action{font-weight:650}.layar-episode-selector .le-badge{background:#e50914;border-radius:4px;padding:2px 7px;font-size:11px;color:#fff}
.layar-episode-selector progress{display:block;width:100%;height:3px;margin:0 0 8px;accent-color:#e50914;background:#555;border:0;-webkit-appearance:none;appearance:none}
.layar-episode-selector progress::-webkit-progress-bar{background:#555}.layar-episode-selector progress::-webkit-progress-value{background:#e50914}
.layar-episode-selector button:disabled{opacity:.5;cursor:default}
.layar-episode-selector button:focus{outline:none}
.layar-episode-selector button:focus-visible{outline:3px solid #fff;outline-offset:-3px}
.layar-episode-selector .le-retry{background:#333;border:1px solid #777;padding:12px;border-radius:6px;margin-top:10px}
@media(max-width:600px){.layar-episode-selector .le-layout{grid-template-columns:minmax(0,1fr);gap:12px}.layar-episode-selector .le-seasons{flex-direction:row;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:1px solid #ffffff30;max-height:none;padding:0;gap:2px}.layar-episode-selector .le-season{border-right:0;border-bottom:2px solid transparent;text-align:center;padding:10px 14px}.layar-episode-selector .le-card{grid-template-columns:minmax(0,42%) minmax(0,1fr)}.layar-episode-selector .le-copy{padding:8px 10px}.layar-episode-selector .le-title{font-size:14px}.layar-episode-selector .le-description{font-size:12px;margin:3px 0 6px}}
`;
  function installStyle() {
    if (document.getElementById('layar-episode-style')) return;
    const style = document.createElement('style'); style.id = 'layar-episode-style'; style.textContent = css;
    document.head.appendChild(style);
  }
  function normalize(raw) {
    const data = raw.data || raw;
    return ((data.season || data).episodes || []).filter(ep => ep.isPublished !== false).map(ep => ({
      number: Number(ep.number ?? ep.episodeNumber), title: ep.title || ep.name || '',
      overview: ep.overview || '', still: ep.still || ep.stillPath || '', runtime: Number(ep.runtime) || 0,
      available: ep.available !== false && ep.hasVideo !== false
    })).filter(ep => Number.isInteger(ep.number) && ep.number > 0).sort((a,b) => a.number-b.number);
  }
  function progress(value) {
    const time = Number(value?.time), duration = Number(value?.duration);
    return Number.isFinite(time) && Number.isFinite(duration) && duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0;
  }
  function key(slug, season, episode) { return `${slug}:${season}:${episode}`; }
  function readProgress(slug, season, episode) {
    try {
      const id = key(slug, season, episode);
      const native = globalThis.AndroidBridge || globalThis.LayarEpisodeProgress;
      return JSON.parse(native?.getEpisodeProgress ? native.getEpisodeProgress(id) : localStorage.getItem('layar.episode.' + id)) || {};
    } catch { return {}; }
  }
  function saveProgress(slug, season, episode, value) {
    if (!Number.isFinite(value.time) || !Number.isFinite(value.duration) || value.duration <= 0 || value.time < 0) return;
    try {
      const id = key(slug, season, episode), json = JSON.stringify({time:value.time,duration:value.duration});
      if (globalThis.LayarEpisodeProgress?.saveEpisodeProgress) globalThis.LayarEpisodeProgress.saveEpisodeProgress(id, json);
      else localStorage.setItem('layar.episode.' + id, json);
    } catch {}
  }
  function node(tag, className, text) { const el = document.createElement(tag); el.className = className; if (text != null) el.textContent = text; return el; }
  function card(ep, options) {
    const {season, active, slug, say} = options;
    const row = node('button','le-card'); row.type = 'button'; row.disabled = !ep.available;
    row.dataset.episode = ep.number;
    if (active) row.setAttribute('aria-current','true');
    const art = node('span','le-art');
    if (/^\/[a-zA-Z0-9/_.-]+$/.test(ep.still)) { const img = document.createElement('img'); img.src = 'https://image.tmdb.org/t/p/w300' + ep.still; img.alt = ''; img.loading = 'lazy'; img.onerror = () => img.remove(); art.appendChild(img); }
    if (ep.runtime) art.appendChild(node('span','le-duration', ep.runtime + ' min'));
    const copy = node('span','le-copy'); copy.appendChild(node('span','le-title', `Eps ${ep.number} - ${ep.title || 'Episode ' + ep.number}`));
    copy.appendChild(node('span','le-description', ep.overview || say('Sinopsis episode belum tersedia.','Episode synopsis unavailable.')));
    const ratio = progress((options.readProgress || readProgress)(slug,season,ep.number));
    if (ratio > 0) { const bar = document.createElement('progress'); bar.max = 1; bar.value = ratio; bar.setAttribute('aria-label',say('Progress tontonan','Watch progress')); copy.appendChild(bar); }
    const footer = node('span','le-footer');
    footer.appendChild(node('span','le-action',!ep.available ? say('Belum tersedia','Unavailable') : ratio > 0 && ratio < .95 ? say('Lanjutkan','Resume') : say('Tonton','Watch')));
    if (active) footer.appendChild(node('span','le-badge',say('Sedang Diputar','Now Playing')));
    copy.appendChild(footer); row.append(art,copy);
    row.onclick = () => options.onSelect(ep, season, active);
    return row;
  }
  function mount(container, options) {
    installStyle(); container.classList.add('layar-episode-selector');
    const say = options.say || ((id) => id);
    const layout = node('div','le-layout'), seasons = node('nav','le-seasons'), body = node('div','le-body');
    seasons.setAttribute('aria-label',say('Pilih season','Choose season'));
    const heading = node('div','le-heading'), count = node('span','le-count'); heading.append(node('h3','',say('Episode','Episodes')),count);
    const list = node('div','le-list'); list.setAttribute('aria-live','polite'); body.append(heading,list); layout.append(seasons,body); container.replaceChildren(layout);
    let request = 0, disposed = false, selected, currentEpisodes = [];
    const available = (options.seasons || []).filter(s => s.number > 0).sort((a,b) => a.number-b.number);
    async function selectSeason(season, focusActive = false) {
      if (disposed) return;
      selected = Number(season); currentEpisodes = []; const token = ++request;
      for (const button of seasons.children) button.setAttribute('aria-pressed',String(Number(button.dataset.season) === selected));
      list.textContent = say('Memuat episode…','Loading episodes…'); count.textContent = '';
      options.onChange?.(selected, []);
      try {
        const episodes = normalize(await options.load(selected));
        if (disposed || token !== request) return;
        currentEpisodes = episodes; list.replaceChildren(); count.textContent = `${episodes.length} ${say('episode','episodes')}`;
        for (const ep of episodes) list.appendChild(card(ep,{...options,say,season:selected,active:options.active?.season === selected && options.active?.episode === ep.number}));
        if (!episodes.length) list.textContent = say('Belum ada episode.','No episodes available.');
        options.onChange?.(selected, episodes);
        if (focusActive) (list.querySelector('[aria-current=true]:not(:disabled)') || list.querySelector('button:not(:disabled)') || seasons.querySelector('[aria-pressed=true]'))?.focus();
      } catch (error) {
        if (disposed || token !== request) return;
        list.textContent = error.message; const retry = node('button','le-retry',say('Coba lagi','Retry')); retry.onclick = () => selectSeason(selected,focusActive); list.appendChild(retry);
      }
    }
    for (const season of available) { const button = node('button','le-season','Season ' + season.number); button.type = 'button'; button.dataset.season = season.number; button.onclick = () => { void selectSeason(season.number); }; seasons.appendChild(button); }
    // Arrow keys move within the selector. With releaseEdges, keys at its edges bubble so the host's spatial navigation can leave it.
    const onKey = event => {
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Key_Up','Key_Down'].includes(event.key)) return;
      const tabs = [...seasons.querySelectorAll('button')], rows = [...list.querySelectorAll('button:not(:disabled)')];
      const inSeasons = seasons.contains(event.target), group = inSeasons ? tabs : rows;
      const across = getComputedStyle(seasons).flexDirection === 'row';
      const up = ['ArrowUp','Key_Up'].includes(event.key), down = ['ArrowDown','Key_Down'].includes(event.key);
      const toList = across ? down : event.key === 'ArrowRight', toSeasons = across ? up : event.key === 'ArrowLeft';
      const step = across && inSeasons ? (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0) : (up ? -1 : down ? 1 : 0);
      let target;
      if (inSeasons && toList) target = rows.find(n => n.getAttribute('aria-current') === 'true') || rows[0];
      else if (!inSeasons && toSeasons && (!across || rows.indexOf(event.target) === 0)) target = tabs.find(n => n.getAttribute('aria-pressed') === 'true');
      else if (step) {
        const i = group.indexOf(event.target), next = group[Math.max(0,Math.min(group.length-1,i+step))];
        if (next !== event.target) target = next;
        else if (!inSeasons && step > 0) { event.preventDefault(); event.stopPropagation(); return; } // The last episode holds focus.
      }
      if (!target) { if (!options.releaseEdges) { event.preventDefault(); event.stopPropagation(); } return; }
      event.preventDefault(); event.stopPropagation(); target.focus(); target.scrollIntoView?.({block:'nearest',inline:'nearest'});
    };
    container.addEventListener('keydown',onKey);
    if (available.length) void selectSeason(available.some(s => s.number === Number(options.season)) ? options.season : available[0].number,options.focusActive);
    else list.textContent = say('Belum ada season.','No seasons available.');
    return { selectSeason, get season() { return selected; }, get episodes() { return currentEpisodes; }, dispose() { disposed = true; ++request; container.removeEventListener('keydown',onKey); } };
  }
  // Opening the selector never changes playback; dismissal therefore preserves both states.
  function playbackSession(video) {
    const paused = video?.paused;
    return { close() { if (!video || !video.isConnected || video.paused === paused) return; if (paused) video.pause(); else video.play()?.catch?.(() => {}); } };
  }
  return {mount,card,normalize,progress,readProgress,saveProgress,playbackSession,css};
});
