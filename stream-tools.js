'use strict';
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (!root.LayarStream) root.LayarStream = factory();
})(globalThis, function() {
  function attributes(line) {
    const fields = {};
    for (const match of line.matchAll(/([\w-]+)=("[^"]*"|[^,\r\n]*)/g)) fields[match[1]] = match[2].replace(/^"|"$/g, '');
    return fields;
  }
  function audioLabel(channels, codecs = '') {
    if (/(^|\/)JOC($|\/)/i.test(channels)) return 'Dolby Atmos';
    const count = Number(String(channels).split('/')[0]);
    if (count === 2) return 'Stereo 2.0';
    if (count === 1) return 'Mono 1.0';
    if (count === 6 && /(^|,)ac-3(,|$)/i.test(codecs)) return 'Dolby Digital 5.1';
    if (count === 6 && /(^|,)ec-3(,|$)/i.test(codecs)) return 'Dolby Digital Plus 5.1';
    if (count > 2) return `Surround (${count} ch)`;
    if (/(^|,)ec-3(,|$)/i.test(codecs)) return 'Dolby Digital Plus';
    if (/(^|,)ac-3(,|$)/i.test(codecs)) return 'Dolby Digital';
    return '';
  }
  function parseManifest(text) {
    const resolutions = new Set(), codecs = new Set(), channels = new Set(), audioFormats = new Set();
    const media = [], variants = [];
    if (String(text).trimStart().startsWith('#EXTM3U')) {
      for (const line of text.split(/\r?\n/)) {
        if (!/^#EXT-X-(STREAM-INF|MEDIA):/.test(line)) continue;
        const data = attributes(line);
        if (/^#EXT-X-STREAM-INF:/.test(line)) variants.push(data);
        else if (data.TYPE === 'AUDIO') media.push(data);
      }
      for (const data of variants) {
        if (/^\d+x\d+$/.test(data.RESOLUTION || '')) resolutions.add(Number(data.RESOLUTION.split('x')[1]));
        for (const codec of (data.CODECS || '').split(',')) if (codec.trim()) codecs.add(codec.trim());
        if (!data.AUDIO) { const label = audioLabel('', data.CODECS); if (label) audioFormats.add(label); }
      }
      for (const data of media) {
        if (data.CHANNELS) channels.add(data.CHANNELS);
        // Only associate a codec with its own AUDIO group; never combine unrelated variants.
        const linkedCodecs = variants.filter(v => v.AUDIO === data['GROUP-ID']).map(v => v.CODECS || '').join(',');
        const label = audioLabel(data.CHANNELS || '', linkedCodecs);
        if (label) audioFormats.add(label);
      }
    }
    return { resolutions: [...resolutions].sort((a,b) => b-a), codecs: [...codecs], channels: [...channels],
      atmos: [...channels].some(value => /(^|\/)JOC($|\/)/i.test(value)), audioFormats: [...audioFormats] };
  }
  function qualityLabel(height) { return height >= 2160 ? '4K UHD' : height ? `${height}p` : 'Auto'; }
  function currentVideo() {
    const root = document.querySelector('[data-layar-player]');
    if (/sponsored|bersponsor|lewati dalam|skip in/i.test(root?.querySelector('.hero-player-titlebar')?.textContent || '')) return null;
    return root?.querySelector('video') || null;
  }
  function adapter(video) {
    if (!video) return null;
    // Public player instances only. Do not replace video URLs or bypass source sessions.
    for (const hls of [video.hls, video._hls, window.hls]) {
      if (hls?.media === video && Array.isArray(hls.levels) && hls.levels.length) {
        return { levels: [{ id: '-1', label: 'Auto' }, ...hls.levels.map((level, index) => ({ id: String(index), label: qualityLabel(level.height) }))],
          selected: String(hls.autoLevelEnabled ? -1 : hls.currentLevel), set: id => { hls.currentLevel = Number(id); } };
      }
    }
    try {
      const jw = typeof window.jwplayer === 'function' ? window.jwplayer() : null;
      if (jw?.getContainer?.()?.contains(video) && jw.getQualityLevels?.().length) {
        return { levels: jw.getQualityLevels().map((level, index) => ({ id: String(index), label: level.label || qualityLabel(level.height) })),
          selected: String(jw.getCurrentQuality()), set: id => jw.setCurrentQuality(Number(id)) };
      }
    } catch {}
    return null;
  }
  function snapshot() {
    const video = currentVideo(), controller = adapter(video);
    return { height: video?.videoHeight || 0, levels: controller?.levels || [], selected: controller?.selected || '', canSelect: !!controller };
  }
  function setQuality(id) {
    const controller = adapter(currentVideo());
    if (!controller || !controller.levels.some(level => level.id === String(id))) return false;
    controller.set(String(id));
    return true;
  }
  let manifest = parseManifest('');
  function receiveManifest(text) {
    const next = parseManifest(text);
    // A child media playlist has no variants. Keep its master's metadata.
    if (next.resolutions.length || next.audioFormats.length) manifest = next;
  }
  function metadata() { return manifest; }
  function installControls(options = {}) {
    if (!document.body || document.getElementById('layar-stream-controls')) return;
    const en = options.language === 'en';
    const say = (id, english) => en ? english : id;
    const host = document.createElement('div');
    host.id = 'layar-stream-controls';
    host.innerHTML = `<button type="button" data-toggle aria-expanded="false" aria-controls="layar-stream-panel">${say('Kualitas & audio', 'Quality & audio')}</button>
      <section id="layar-stream-panel" role="dialog" aria-label="${say('Kualitas & audio', 'Quality & audio')}" hidden>
        <button type="button" data-close>${say('Tutup', 'Close')}</button>
        <p data-active role="status"></p>
        <label>${say('Resolusi', 'Resolution')}<select data-quality aria-label="${say('Resolusi', 'Resolution')}"></select></label>
        <p data-help></p><p data-audio></p>
        <label><input type="checkbox" disabled> Audio passthrough</label>
        <p>${say('Passthrough tidak tersedia di WebView. Di laptop gunakan pengaturan mpv.', 'Passthrough is unavailable in WebView. On a laptop, use mpv settings.')}</p>
      </section>`;
    const style = document.createElement('style');
    style.textContent = `#layar-stream-controls,#layar-stream-controls *{visibility:visible!important;box-sizing:border-box;scrollbar-width:none;-ms-overflow-style:none}
      #layar-stream-controls [hidden]{display:none!important}#layar-stream-controls *::-webkit-scrollbar{display:none!important}
      #layar-stream-controls{position:fixed;right:18px;top:18px;z-index:2147483647;font:14px sans-serif;color:#fff;max-width:calc(100vw - 36px)}
      #layar-stream-controls button,#layar-stream-controls select{font:inherit;background:#191919ed;color:#fff;border:1px solid #ffffff66;border-radius:8px;padding:12px;min-height:44px}
      #layar-stream-controls :focus{outline:3px solid white;outline-offset:2px}
      #layar-stream-controls section{width:320px;max-width:100%;max-height:80vh;overflow:auto;background:#151515f5;border:1px solid #ffffff44;border-radius:12px;padding:18px;margin-top:10px;box-shadow:0 8px 30px #0008}
      #layar-stream-controls label{display:flex;gap:10px;align-items:center;justify-content:space-between;margin:12px 0}
      #layar-stream-controls p{font:12px/1.6 sans-serif;color:#ccc;white-space:normal}#layar-stream-controls select{max-width:180px}`;
    document.head.appendChild(style); document.body.appendChild(host);
    const toggle = host.querySelector('[data-toggle]'), panel = host.querySelector('section'), quality = host.querySelector('select');
    const close = () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); };
    const update = () => {
      const info = snapshot();
      host.hidden = !currentVideo();
      host.querySelector('[data-active]').textContent = info.height ? `${say('Aktif', 'Active')}: ${qualityLabel(info.height)}` : say('Menunggu video', 'Waiting for video');
      const levels = info.canSelect ? info.levels : [{ id: 'source', label: say('Menu sumber', 'Source menu') }];
      const signature = JSON.stringify(levels);
      if (quality.dataset.levels !== signature) {
        quality.replaceChildren(...levels.map(level => { const option = document.createElement('option'); option.value = level.id; option.textContent = level.label; return option; }));
        quality.dataset.levels = signature;
      }
      quality.disabled = !info.canSelect;
      if (info.canSelect) quality.value = info.selected;
      host.querySelector('[data-help]').textContent = info.canSelect ? say('Auto menyesuaikan koneksi.', 'Auto adapts to your connection.') : say('Gunakan menu kualitas player sumber. Pilihan tidak diekspos oleh player ini.', 'Use the source player quality menu. This player does not expose its quality choices.');
      host.querySelector('[data-audio]').textContent = `${say('Audio di sumber', 'Source audio')}: ${manifest.audioFormats.join(' / ') || say('Belum terdeteksi', 'Not detected')}`;
    };
    toggle.onclick = () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); update(); if (!panel.hidden) host.querySelector('[data-close]').focus(); };
    host.querySelector('[data-close]').onclick = close;
    quality.onchange = () => { setQuality(quality.value); update(); };
    host.onkeydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (!panel.hidden && ['ArrowDown', 'ArrowUp', 'Tab'].includes(event.key) && event.target.tagName !== 'SELECT') {
        const nodes = [...host.querySelectorAll('button,select:not(:disabled)')].filter(node => node.getClientRects().length);
        const backwards = event.key === 'ArrowUp' || event.shiftKey;
        const next = (nodes.indexOf(document.activeElement) + (backwards ? -1 : 1) + nodes.length) % nodes.length;
        event.preventDefault(); event.stopPropagation(); nodes[next].focus();
      }
    };
    // Inspect only manifests already requested by this playback page, with a bounded reader.
    const seen = new Set();
    let inspecting = false;
    async function inspect() {
      if (inspecting || !currentVideo() || manifest.audioFormats.length || seen.size >= 24) return;
      const entry = performance.getEntriesByType('resource').find(resource => /\.m3u8(?:\?|$)/i.test(resource.name) && !seen.has(resource.name));
      if (!entry) return;
      seen.add(entry.name); inspecting = true;
      try {
        const response = await fetch(entry.name, { credentials: 'include' });
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader(); let text = '', length = 0; const decoder = new TextDecoder();
        try { while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.length; if (length > 262144) break; text += decoder.decode(chunk.value, { stream: true }); } }
        finally { await reader.cancel(); }
        if (length <= 262144) receiveManifest(text);
      } catch {} finally { inspecting = false; }
    }
    update();
    const timer = setInterval(() => { if (!host.isConnected) { clearInterval(timer); return; } update(); if (options.inspectManifests) void inspect(); }, 2500);
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  }
  return { parseManifest, audioLabel, qualityLabel, snapshot, setQuality, receiveManifest, metadata, installControls };
});
