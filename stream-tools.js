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
  function audioAdapter(video) {
    if (!video) return null;
    for (const hls of [video.hls, video._hls, window.hls]) {
      if (hls?.media === video && hls.audioTracks?.length) return {
        tracks: hls.audioTracks.map((track, i) => ({ id: String(i), label: track.name || track.lang || `Audio ${i+1}`, atmos: isAtmosTrack(track) })),
        selected: String(hls.audioTrack), set: id => { hls.audioTrack = Number(id); }
      };
    }
    const tracks = Array.from(video.audioTracks || []);
    if (tracks.length) return { tracks: tracks.map((track,i) => ({ id: String(i), label: track.label || track.language || `Audio ${i+1}`, atmos: isAtmosTrack(track) })),
      selected: String(tracks.findIndex(track => track.enabled)), set: id => tracks.forEach((track,i) => { track.enabled = i === Number(id); }) };
    try {
      const jw = typeof window.jwplayer === 'function' ? window.jwplayer() : null;
      if (jw?.getContainer?.()?.contains(video) && jw.getAudioTracks?.().length) return {
        tracks: jw.getAudioTracks().map((track,i) => ({id:String(i),label:track.name || track.language || `Audio ${i+1}`,atmos:isAtmosTrack(track)})),
        selected: String(jw.getCurrentAudioTrack()), set: id => jw.setCurrentAudioTrack(Number(id)) };
    } catch {}
    return null;
  }
  function remember(key, label) { try { localStorage.setItem('layar.playback.' + key, label); } catch {} }
  function setAudio(id) {
    const controller = audioAdapter(currentVideo());
    const track = controller?.tracks.find(track => track.id === String(id));
    if (!track) return false;
    controller.set(track.id); remember('audio', track.label); return true;
  }
  const restored = new WeakMap();
  function restorePreferences() {
    const video = currentVideo(); if (!video) return;
    const done = restored.get(video) || {};
    for (const [key, controller, values] of [['video', adapter(video), 'levels'], ['audio', audioAdapter(video), 'tracks']]) {
      if (done[key] || !controller) continue;
      try { const label = localStorage.getItem('layar.playback.' + key); const match = controller[values].find(v => v.label === label); if (match) controller.set(match.id); } catch {}
      done[key] = true;
    }
    // The saved sound mode is reapplied once the media has a source; Atmos falls back to surround when a title has no Atmos track.
    if (!done.sound && video.readyState > 0) {
      done.sound = true;
      let mode = 'original'; try { mode = localStorage.getItem('layar.playback.sound') || 'original'; } catch {}
      if (mode !== 'original') void setSoundMode(mode).then(result => { if (!result.applied && mode === 'atmos' && result.reason !== 'suspended') return setSoundMode('surround'); });
    }
    restored.set(video, done);
  }
  function snapshot() {
    restorePreferences();
    const video = currentVideo(), controller = adapter(video), audio = audioAdapter(video);
    return { audioTracks: audio?.tracks || [], audioSelected: audio?.selected || '', height: video?.videoHeight || 0, levels: controller?.levels || [], selected: controller?.selected || '', canSelect: !!controller, sound: soundInfo(video) };
  }
  function setQuality(id) {
    const controller = adapter(currentVideo());
    if (!controller || !controller.levels.some(level => level.id === String(id))) return false;
    controller.set(String(id));
    remember('video', controller.levels.find(level => level.id === String(id)).label);
    return true;
  }
  let manifest = parseManifest('');
  // Sound modes. Processing starts only after a listener picks a mode other than "original", so untouched playback is never rerouted.
  const SOUND_MODES = ['original', 'surround', 'atmos'];
  const SPEAKERS = [['FL', -30], ['FR', 30], ['C', 0], ['LFE', 0], ['SL', -110], ['SR', 110]];
  function isAtmosTrack(track) {
    return /(^|\/)JOC($|\/)/i.test(String(track?.channels ?? track?.attrs?.CHANNELS ?? '')) || /atmos/i.test(track?.name || track?.label || '');
  }
  // Seeded noise keeps the room impulse identical between runs, so tests and listening are repeatable.
  function roomImpulse(context, seconds = 1.6) {
    const length = Math.round(context.sampleRate * seconds), buffer = context.createBuffer(2, length, context.sampleRate);
    let seed = 0x2f6b1d;
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let energy = 0;
      for (let i = 0; i < length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; data[i] = (seed / 0xffffffff * 2 - 1) * Math.pow(1 - i / length, 3); energy += data[i] * data[i]; }
      // Unit energy keeps the tail at the level set by its send gain instead of amplifying the input.
      const scale = 1 / Math.sqrt(energy || 1);
      for (let i = 0; i < length; i++) data[i] *= scale;
    }
    return buffer;
  }
  // Builds a 5.1 bed from the input, then renders it for the output device:
  // discrete channels on 5.1+ outputs, HRTF virtual speakers on stereo outputs and headphones.
  function buildSpatial(context, input, { upmix, outputChannels }) {
    const nodes = [];
    const gain = (value = 1, channels) => {
      const node = context.createGain(); node.gain.value = value;
      if (channels) { node.channelCount = channels; node.channelCountMode = 'explicit'; node.channelInterpretation = 'speakers'; }
      nodes.push(node); return node;
    };
    const filter = (type, frequency) => { const node = context.createBiquadFilter(); node.type = type; node.frequency.value = frequency; nodes.push(node); return node; };
    const delay = seconds => { const node = context.createDelay(0.1); node.delayTime.value = seconds; nodes.push(node); return node; };
    const chain = (...list) => { for (let i = 1; i < list.length; i++) list[i - 1].connect(list[i]); return list[list.length - 1]; };
    const bed = {};
    let dry;
    if (upmix) {
      const stereo = gain(1, 2); input.connect(stereo);
      const split = context.createChannelSplitter(2); nodes.push(split); stereo.connect(split);
      const left = gain(), right = gain(); split.connect(left, 0); split.connect(right, 1);
      const mid = gain(), side = gain();
      chain(left, gain(0.5), mid); chain(right, gain(0.5), mid);
      chain(left, gain(0.5), side); chain(right, gain(-0.5), side);
      bed.FL = chain(left, gain(0.8)); bed.FR = chain(right, gain(0.8));
      bed.C = chain(mid, filter('highpass', 150), filter('lowpass', 8000), gain(0.75));
      bed.LFE = chain(mid, filter('lowpass', 110), filter('lowpass', 110), gain(0.9));
      bed.SL = chain(side, delay(0.012), filter('lowpass', 7000), gain(0.9));
      bed.SR = chain(side, delay(0.017), filter('lowpass', 7000), gain(-0.9));
      // A decorrelated room tail feeds the surrounds so the sound extends behind the listener.
      const room = context.createConvolver(); room.normalize = false; room.buffer = roomImpulse(context); nodes.push(room);
      chain(stereo, filter('highpass', 200), gain(0.35), room);
      const roomSplit = context.createChannelSplitter(2); nodes.push(roomSplit); room.connect(roomSplit);
      roomSplit.connect(bed.SL, 0); roomSplit.connect(bed.SR, 1);
      dry = stereo;
    } else {
      const surround = gain(1, 6); input.connect(surround);
      const split = context.createChannelSplitter(6); nodes.push(split); surround.connect(split);
      SPEAKERS.forEach(([name], index) => { bed[name] = gain(); split.connect(bed[name], index); });
      dry = surround;
    }
    let output;
    if (outputChannels >= 6) {
      const merger = context.createChannelMerger(6); nodes.push(merger);
      SPEAKERS.forEach(([name], index) => bed[name].connect(merger, 0, index));
      output = chain(merger, gain(0.9, 6)); output.channelInterpretation = 'discrete';
    } else {
      const mix = gain(1, 2);
      for (const [name, angle] of SPEAKERS) {
        if (name === 'LFE') { chain(bed.LFE, gain(0.6), mix); continue; }
        const panner = context.createPanner(); nodes.push(panner);
        panner.panningModel = 'HRTF'; panner.distanceModel = 'linear'; panner.rolloffFactor = 0; panner.refDistance = 1;
        const x = Math.sin(angle * Math.PI / 180), z = -Math.cos(angle * Math.PI / 180);
        if (panner.positionX) { panner.positionX.value = x; panner.positionY.value = 0; panner.positionZ.value = z; } else panner.setPosition(x, 0, z);
        chain(bed[name], gain(name === 'C' ? 0.7 : 0.85), panner, mix);
      }
      chain(dry, gain(0.3, 2), mix);
      const limiter = context.createDynamicsCompressor(); nodes.push(limiter);
      limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 8; limiter.attack.value = 0.003; limiter.release.value = 0.25;
      output = chain(mix, limiter);
    }
    return { output, channels: outputChannels >= 6 ? 6 : 2, dispose() { for (const node of nodes) { try { node.disconnect(); } catch {} } } };
  }
  const sound = { mode: 'original', context: null, graphs: new WeakMap(), previousTrack: null };
  function canProcess(video) {
    if (!video) return false;
    if (video.srcObject) return true;
    const src = video.currentSrc || video.src || '';
    if (/^blob:/i.test(src)) return true;
    // Cross-origin media without CORS plays silently through Web Audio, so it is left untouched.
    try { return new URL(src, location.href).origin === location.origin || video.crossOrigin != null; } catch { return false; }
  }
  function decodesDolby() {
    try { return !!globalThis.MediaSource?.isTypeSupported?.('audio/mp4; codecs="ec-3"'); } catch { return false; }
  }
  function soundInfo(video = currentVideo()) {
    const tracks = audioAdapter(video)?.tracks || [], processing = canProcess(video);
    const atmosTrack = tracks.some(track => track.atmos);
    const atmosReason = atmosTrack ? '' : manifest.atmos ? (decodesDolby() ? 'atmos-hidden' : 'no-decoder') : 'no-atmos';
    return { mode: sound.mode, output: sound.context?.destination.maxChannelCount || 0, active: (video && sound.graphs.get(video)?.channels) || 0,
      options: [{ id: 'original', available: true, reason: '' }, { id: 'surround', available: processing, reason: processing ? '' : 'cross-origin' }, { id: 'atmos', available: atmosTrack, reason: atmosReason }] };
  }
  async function runningContext() {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!sound.context) sound.context = new AudioContextClass({ latencyHint: 'playback' });
    if (sound.context.state !== 'running') { try { await Promise.race([sound.context.resume(), new Promise(resolve => setTimeout(resolve, 1500))]); } catch {} }
    return sound.context.state === 'running' ? sound.context : null;
  }
  function route(video, mode) {
    const context = sound.context, max = context.destination.maxChannelCount || 2;
    let graph = sound.graphs.get(video);
    if (!graph) {
      graph = { source: context.createMediaElementSource(video), chain: null, channels: 0 };
      sound.graphs.set(video, graph);
      video.addEventListener('play', () => { if (context.state !== 'running') context.resume().catch(() => {}); });
    }
    graph.source.disconnect(); graph.chain?.dispose(); graph.chain = null;
    if (mode === 'original') {
      context.destination.channelCount = max >= 6 ? 6 : 2; context.destination.channelInterpretation = 'speakers';
      graph.source.connect(context.destination); graph.channels = 0; return;
    }
    graph.chain = buildSpatial(context, graph.source, { upmix: mode === 'surround', outputChannels: max });
    context.destination.channelCount = graph.chain.channels;
    context.destination.channelInterpretation = graph.chain.channels === 6 ? 'discrete' : 'speakers';
    graph.chain.output.connect(context.destination); graph.channels = graph.chain.channels;
  }
  async function setSoundMode(mode) {
    const video = currentVideo();
    if (!SOUND_MODES.includes(mode) || !video) return { applied: false, reason: 'no-video', ...soundInfo(video) };
    const option = soundInfo(video).options.find(item => item.id === mode);
    if (!option.available) return { applied: false, reason: option.reason, ...soundInfo(video) };
    // Audio is never routed into a context that is not running, because a suspended context would mute the film.
    const processed = mode !== 'original' || sound.graphs.has(video);
    if (processed && !await runningContext()) return { applied: false, reason: 'suspended', ...soundInfo(video) };
    const tracks = audioAdapter(video);
    if (mode === 'atmos') {
      const atmos = tracks.tracks.find(track => track.atmos);
      if (tracks.selected !== atmos.id) { sound.previousTrack = tracks.selected; tracks.set(atmos.id); }
    } else if (sound.mode === 'atmos' && sound.previousTrack != null && tracks?.tracks.some(track => track.id === sound.previousTrack)) {
      tracks.set(sound.previousTrack); sound.previousTrack = null;
    }
    if (processed) route(video, mode);
    sound.mode = mode; remember('sound', mode);
    return { applied: true, reason: '', ...soundInfo(video) };
  }
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
    host.innerHTML = `<button type="button" data-toggle aria-expanded="false" aria-controls="layar-stream-panel">${say('Kualitas & Suara', 'Playback Quality')}</button>
      <section id="layar-stream-panel" role="dialog" aria-label="${say('Kualitas & Suara', 'Playback Quality')}" hidden>
        <button type="button" data-close>${say('Tutup', 'Close')}</button>
        <p data-active role="status"></p>
        <label>${say('Resolusi', 'Resolution')}<select data-quality aria-label="${say('Resolusi', 'Resolution')}"></select></label>
        <p data-help></p><label>Audio<select data-audio-track aria-label="Audio"></select></label><p data-audio></p>
        <label>${say('Mode suara', 'Sound mode')}<select data-sound aria-label="${say('Mode suara', 'Sound mode')}"></select></label><p data-sound-status role="status"></p>
        <label><input type="checkbox" disabled> Audio passthrough</label>
        <p>${say('Passthrough tidak tersedia di WebView. Di laptop gunakan pengaturan mpv.', 'Passthrough is unavailable in WebView. On a laptop, use mpv settings.')}</p>
      </section>`;
    const style = document.createElement('style');
    style.textContent = `#layar-stream-controls,#layar-stream-controls *{visibility:visible!important;box-sizing:border-box;scrollbar-width:none;-ms-overflow-style:none}
      #layar-stream-controls [hidden]{display:none!important}#layar-stream-controls *::-webkit-scrollbar{display:none!important}
      #layar-stream-controls{position:fixed;right:18px;top:18px;z-index:2147483647;font:14px sans-serif;color:#fff;max-width:calc(100vw - 36px)}
      :where(#layar-stream-controls) button,:where(#layar-stream-controls) select{font:inherit;background:#191919ed;color:#fff;border:1px solid #ffffff66;border-radius:8px;padding:12px;min-height:44px}
      #layar-stream-controls :focus{outline:3px solid white;outline-offset:2px}
      #layar-stream-controls section{width:320px;max-width:100%;max-height:80vh;overflow:auto;background:#151515f5;border:1px solid #ffffff44;border-radius:12px;padding:18px;margin-top:10px;box-shadow:0 8px 30px #0008}
      #layar-stream-controls label{display:flex;gap:10px;align-items:center;justify-content:space-between;margin:12px 0}
      #layar-stream-controls p{font:12px/1.6 sans-serif;color:#ccc;white-space:normal}#layar-stream-controls select{max-width:180px}`;
    document.head.appendChild(style); document.body.appendChild(host);
    const toggle = host.querySelector('[data-toggle]'), panel = host.querySelector('section'), quality = host.querySelector('select');
    const close = () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); };
    const soundSelect = host.querySelector('[data-sound]'), soundStatus = host.querySelector('[data-sound-status]');
    const soundNames = { original: say('Asli', 'Original'), surround: 'Surround 5.1', atmos: 'Dolby Atmos' };
    const soundReasons = {
      'cross-origin': say('Player sumber ini tidak mengizinkan suaranya diolah.', 'This source player does not allow its sound to be processed.'),
      'no-atmos': say('Film ini tidak punya track Dolby Atmos. Pilih Surround 5.1.', 'This title has no Dolby Atmos track. Choose Surround 5.1.'),
      'no-decoder': say('Sumber punya track Atmos, tapi perangkat ini tidak bisa memutar Dolby Digital Plus.', 'The source has an Atmos track, but this device cannot play Dolby Digital Plus.'),
      'atmos-hidden': say('Sumber punya track Atmos, tapi player sumber tidak menampilkannya.', 'The source has an Atmos track, but the source player does not expose it.'),
      suspended: say('Audio belum bisa diaktifkan. Putar video dulu, lalu coba lagi.', 'Audio could not be started. Play the video first, then try again.'),
      'no-video': say('Menunggu video', 'Waiting for video')
    };
    const describeSound = (info, reason) => {
      if (reason) return soundReasons[reason] || '';
      if (!info || info.mode === 'original') return say('Suara asli dari sumber, tanpa diolah.', 'Original source sound, unprocessed.');
      const prefix = info.mode === 'atmos' ? 'Dolby Atmos · ' : '';
      return prefix + (info.active === 6 ? say('Aktif: suara dibagi ke 6 speaker 5.1.', 'Active: sound is split across 6 speakers in 5.1.') : say('Aktif: surround 3D virtual untuk headphone atau speaker stereo.', 'Active: virtual 3D surround for headphones or stereo speakers.'));
    };
    let soundBusy = false;
    const update = () => {
      const info = snapshot();
      const audio = host.querySelector('[data-audio-track]');
      const tracks = info.audioTracks.length ? info.audioTracks : [{id:'original', label:'Original'}];
      const audioSignature = JSON.stringify(tracks);
      if (audio.dataset.tracks !== audioSignature) {
        audio.replaceChildren(...tracks.map(track => { const option = document.createElement('option'); option.value = track.id; option.textContent = track.label; return option; }));
        audio.dataset.tracks = audioSignature;
      }
      audio.disabled = !info.audioTracks.length;
      if (info.audioTracks.length) audio.value = info.audioSelected;
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
      if (!soundBusy) {
        const soundSignature = JSON.stringify(info.sound.options);
        if (soundSelect.dataset.options !== soundSignature) {
          soundSelect.replaceChildren(...info.sound.options.map(item => { const option = document.createElement('option'); option.value = item.id; option.disabled = !item.available; option.textContent = soundNames[item.id] + (item.available ? '' : ' · ' + say('tidak tersedia', 'unavailable')); return option; }));
          soundSelect.dataset.options = soundSignature;
        }
        soundSelect.value = info.sound.mode;
        const unavailable = info.sound.options.filter(item => !item.available && item.reason).map(item => `${soundNames[item.id]}: ${soundReasons[item.reason]}`);
        soundStatus.textContent = [describeSound(info.sound), ...unavailable].join(' ');
      }
    };
    toggle.onclick = () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); update(); if (!panel.hidden) host.querySelector('[data-close]').focus(); };
    host.querySelector('[data-close]').onclick = close;
    host.querySelector('[data-audio-track]').onchange = event => { setAudio(event.target.value); update(); };
    quality.onchange = () => { setQuality(quality.value); update(); };
    soundSelect.onchange = async () => {
      soundBusy = true; soundSelect.disabled = true;
      try { const result = await setSoundMode(soundSelect.value); soundSelect.value = result.mode; soundStatus.textContent = describeSound(result, result.applied ? '' : result.reason); }
      finally { soundSelect.disabled = false; setTimeout(() => { soundBusy = false; }, 3000); }
    };
    host.onkeydown = event => {
      if (event.target.closest('.layar-episode-selector')) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (['ArrowDown', 'ArrowUp', 'Tab'].includes(event.key) && event.target.tagName !== 'SELECT') {
        const nodes = [...host.querySelectorAll('button,select:not(:disabled)')].filter(node => node.getClientRects().length);
        const backwards = event.key === 'ArrowUp' || event.shiftKey;
        const next = (nodes.indexOf(document.activeElement) + (backwards ? -1 : 1) + nodes.length) % nodes.length;
        event.preventDefault(); event.stopPropagation(); nodes[next].focus();
      }
    };
    document.addEventListener('keydown', event => {
      if (host.hidden) return;
      if (['ArrowUp','ArrowDown','Key_Up','Key_Down'].includes(event.key) && !host.contains(document.activeElement)) {
        event.preventDefault(); event.stopImmediatePropagation(); const episodes = host.querySelector('#layar-episode-panel'); if (episodes && !episodes.hidden) episodes.querySelector('button').focus(); else if (!panel.hidden) host.querySelector('[data-close]').focus(); else toggle.focus(); return;
      }
      if (!panel.hidden && ['Escape','BrowserBack','GoBack'].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (host.contains(document.activeElement) && event.key === 'Enter' && document.activeElement.tagName === 'BUTTON') {
        event.preventDefault(); event.stopImmediatePropagation(); document.activeElement.click();
      }
      if (!panel.hidden && event.key === 'Tab') {
        const nodes = [...panel.querySelectorAll('button:not(:disabled),select:not(:disabled)')].filter(n => n.getClientRects().length);
        event.preventDefault(); event.stopImmediatePropagation(); nodes[(nodes.indexOf(document.activeElement)+(event.shiftKey?-1:1)+nodes.length)%nodes.length]?.focus();
      }
      if (!panel.hidden && event.target.tagName === 'SELECT' && ['ArrowLeft','ArrowRight'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation(); host.querySelector('[data-close]').focus();
      }
    }, true);
    if (options.playback?.type === 'tv_series' && window.LayarEpisodes) {
      const current = options.playback, episodes = window.LayarEpisodes;
      const path = location.pathname.match(/season\/(\d+)\/episode\/(\d+)/);
      const activeSeason = Number(path?.[1] || current.season), activeEpisode = Number(path?.[2] || current.episode);
      const episodeButton = document.createElement('button'); episodeButton.textContent = say('Episode','Episodes');
      const overlay = document.createElement('div'); overlay.id = 'layar-episode-panel'; overlay.hidden = true;
      overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-label',episodeButton.textContent);
      overlay.style.cssText = 'position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.45);backdrop-filter:blur(14px) brightness(.6);overflow:auto;padding:24px';
      const content = document.createElement('div'); content.style.cssText = 'width:min(712px,100%);margin:auto;padding:24px;background:#141414e6;border-radius:12px';
      const closeEpisodes = document.createElement('button'); closeEpisodes.textContent = say('Tutup','Close'); closeEpisodes.dataset.episodeClose = '';
      closeEpisodes.style.marginBottom = '20px';
      const selector = document.createElement('div'); content.append(closeEpisodes,selector); overlay.appendChild(content); host.append(episodeButton,overlay);
      let component, session;
      const save = () => { const video = currentVideo(); if (video) episodes.saveProgress(current.slug,activeSeason,activeEpisode,{time:video.currentTime,duration:video.duration}); };
      const closeOverlay = () => { component?.dispose(); component = null; overlay.hidden = true; session?.close(); session = null; episodeButton.focus(); };
      closeEpisodes.onclick = closeOverlay;
      episodeButton.onclick = () => {
        save(); session = episodes.playbackSession(currentVideo()); panel.hidden = true; toggle.setAttribute('aria-expanded','false');
        overlay.hidden = false; closeEpisodes.focus(); component?.dispose();
        component = episodes.mount(selector, {
          slug:current.slug, seasons:current.seasons, season:activeSeason, active:{season:activeSeason,episode:activeEpisode}, focusActive:true, say,
          load: async season => {
            const response = await fetch('/api/series/' + encodeURIComponent(current.slug) + '/season/' + season);
            if (!response.ok) throw new Error(say('Episode gagal dimuat','Could not load episodes'));
            return response.json();
          },
          onSelect: (ep,season,active) => { save(); closeOverlay(); if (!active) location.assign('/series/' + encodeURIComponent(current.slug) + '/season/' + season + '/episode/' + ep.number + '?play=1'); }
        });
      };
      document.addEventListener('keydown', event => {
        if (overlay.hidden) return;
        if (['Escape','BrowserBack','GoBack'].includes(event.key) || [10009,461].includes(event.keyCode)) { event.preventDefault(); event.stopImmediatePropagation(); closeOverlay(); return; }
        if (event.key === 'Tab') {
          const nodes = [...overlay.querySelectorAll('button:not(:disabled)')];
          event.preventDefault(); event.stopImmediatePropagation(); nodes[(nodes.indexOf(document.activeElement)+(event.shiftKey?-1:1)+nodes.length)%nodes.length]?.focus();
        } else if (event.target === closeEpisodes && ['ArrowDown','ArrowRight'].includes(event.key)) {
          event.preventDefault(); event.stopImmediatePropagation(); (selector.querySelector('[aria-current=true]') || selector.querySelector('button'))?.focus();
        }
      }, true);
      const resumed = new WeakSet();
      const progressTimer = setInterval(() => {
        const video = currentVideo();
        if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
        if (!resumed.has(video)) {
          const previous = episodes.readProgress(current.slug,activeSeason,activeEpisode);
          if (episodes.progress(previous) > 0 && episodes.progress(previous) < .95 && video.currentTime < 2) video.currentTime = Math.min(previous.time,video.duration);
          resumed.add(video);
        }
        save();
      }, 2000);
      window.addEventListener('pagehide', () => { save(); component?.dispose(); clearInterval(progressTimer); }, {once:true});
    }
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
  return { parseManifest, audioLabel, qualityLabel, snapshot, setQuality, setAudio, setSoundMode, buildSpatial, isAtmosTrack, receiveManifest, metadata, installControls };
});
