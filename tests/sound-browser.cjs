'use strict';
// Run with npm run test:sound-browser. Renders the surround engine in real Chromium and measures every output channel.
const {app,BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'layar-sound-')));
app.whenReady().then(async () => {
  const win = new BrowserWindow({show:false,width:800,height:600,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  try {
    const page = path.join(app.getPath('userData'),'sound.html');
    fs.writeFileSync(page,'<!doctype html><html><body><div data-layar-player><video></video></div></body></html>');
    await win.loadFile(page);
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'../stream-tools.js'),'utf8'));
    console.log(await win.webContents.executeJavaScript(`(async () => {
      const assert = (ok,message) => { if (!ok) throw new Error(message); };
      const rate = 48000, seconds = 1;
      // Renders a two-channel input through the engine and returns the RMS level of each output channel.
      async function render(outputs, fill, options) {
        const context = new OfflineAudioContext(outputs, rate*seconds, rate);
        const buffer = context.createBuffer(2, rate*seconds, rate);
        for (let i = 0; i < buffer.length; i++) { const [l,r] = fill(i/rate); buffer.getChannelData(0)[i] = l; buffer.getChannelData(1)[i] = r; }
        const source = context.createBufferSource(); source.buffer = buffer;
        const chain = LayarStream.buildSpatial(context, source, options); chain.output.connect(context.destination);
        context.destination.channelCount = outputs; context.destination.channelInterpretation = outputs === 6 ? 'discrete' : 'speakers';
        source.start(); const result = await context.startRendering();
        return Array.from({length:outputs},(_,c) => { const d = result.getChannelData(c).subarray(rate*0.2); let s = 0; for (const v of d) s += v*v; return Math.sqrt(s/d.length); });
      }
      const tone = (f,t) => 0.4*Math.sin(2*Math.PI*f*t);
      // 5.1 output: [FL, FR, C, LFE, SL, SR]
      const centred = await render(6, t => [tone(1000,t)+tone(60,t), tone(1000,t)+tone(60,t)], {upmix:true, outputChannels:6});
      assert(centred[2] > 0.1, 'Centred sound must reach the centre speaker: '+centred);
      assert(centred[3] > 0.05, 'Bass must reach the LFE channel: '+centred);
      assert(centred[4] < centred[0]/2 && centred[5] < centred[1]/2, 'Centred sound must stay mostly in front: '+centred);
      const wide = await render(6, t => [tone(1000,t), -tone(1000,t)], {upmix:true, outputChannels:6});
      assert(wide[4] > 0.1 && wide[5] > 0.1, 'Wide stereo must reach both surround speakers: '+wide);
      assert(wide[2] < 0.01, 'Out-of-phase sound must cancel in the centre: '+wide);
      // Stereo output: HRTF virtual speakers. A left-only input must also reach the right ear, which plain stereo never does.
      const plain = [0.4/Math.SQRT2, 0];
      const virtual = await render(2, t => [tone(1000,t), 0], {upmix:true, outputChannels:2});
      assert(virtual[1] > 0.05, 'Virtual surround must cross-feed the right ear: '+virtual);
      assert(Math.abs(virtual[0]-plain[0]) > 0.02 || virtual[1] > 0.05, 'Virtual surround must change the stereo image');
      // Atmos path: a 5.1 bed is rendered without upmixing. A rear-left-only input must reach both ears.
      const context = new OfflineAudioContext(2, rate, rate), bed = context.createBuffer(6, rate, rate);
      for (let i = 0; i < rate; i++) bed.getChannelData(4)[i] = tone(1000,i/rate);
      const source = context.createBufferSource(); source.buffer = bed;
      const chain = LayarStream.buildSpatial(context, source, {upmix:false, outputChannels:2}); chain.output.connect(context.destination); source.start();
      const rendered = await context.startRendering(), ears = [0,1].map(c => Math.max(...rendered.getChannelData(c).subarray(rate*0.2).map(Math.abs)));
      assert(ears[0] > 0.05 && ears[1] > 0.02, 'A 5.1 rear channel must be rendered binaurally: '+ears);
      // Live playback: a same-origin video switches modes and the source keeps playing.
      const wav = (() => { const n = rate, b = new DataView(new ArrayBuffer(44+n*4)); const w = (o,s) => [...s].forEach((c,i) => b.setUint8(o+i,c.charCodeAt(0)));
        w(0,'RIFF'); b.setUint32(4,36+n*4,true); w(8,'WAVEfmt '); b.setUint32(16,16,true); b.setUint16(20,1,true); b.setUint16(22,2,true); b.setUint32(24,rate,true); b.setUint32(28,rate*4,true); b.setUint16(32,4,true); b.setUint16(34,16,true); w(36,'data'); b.setUint32(40,n*4,true);
        for (let i = 0; i < n; i++) { const v = Math.round(tone(440,i/rate)*32767); b.setInt16(44+i*4,v,true); b.setInt16(46+i*4,v,true); } return new Blob([b.buffer],{type:'audio/wav'}); })();
      const video = document.querySelector('video'); video.loop = true; video.src = URL.createObjectURL(wav);
      await new Promise(r => video.addEventListener('loadeddata', r, {once:true})); await video.play();
      const surround = await LayarStream.setSoundMode('surround');
      assert(surround.applied && surround.mode === 'surround' && [2,6].includes(surround.active), 'Live surround failed: '+JSON.stringify(surround));
      const atmos = await LayarStream.setSoundMode('atmos');
      assert(!atmos.applied && atmos.reason === 'no-atmos' && atmos.mode === 'surround', 'Atmos must not be faked on a stereo title');
      const original = await LayarStream.setSoundMode('original');
      assert(original.applied && original.active === 0 && !video.paused, 'Switching back to original failed');
      return 'Surround engine: centre, LFE, surround split, HRTF virtual, 5.1 bed and live mode switching passed';
    })()`));
    app.exit(0);
  } catch(error) {console.error(error);app.exit(1);}
});
