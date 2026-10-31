'use strict';
// Run with npm run test:episodes-browser. Uses real Chromium without showing a window.
const {app,BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'layar-episodes-')));
app.whenReady().then(async () => {
  const win = new BrowserWindow({show:false,width:1280,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false}});
  try {
    await win.loadURL('data:text/html,<html><head></head><body style="background:%23111"><div id="before" style="width:600px"></div><div id="overlay" style="width:600px"></div></body></html>');
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'../episode-selector.js'),'utf8'));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const assert = (ok,message) => { if (!ok) throw new Error(message); };
      const episodes = {episodes:[{number:1,title:'First',overview:'Story one',runtime:42,available:true},{number:2,title:'Second',overview:'Story two',runtime:45,available:true},{number:3,title:'Soon',available:false}]};
      const opts = {slug:'show',seasons:[{number:1},{number:2}],season:1,load:async()=>episodes,readProgress:()=>({time:120,duration:240}),onSelect:()=>{}};
      const before = document.querySelector('#before'), overlay = document.querySelector('#overlay');
      const a = LayarEpisodes.mount(before,opts);
      const b = LayarEpisodes.mount(overlay,{...opts,active:{season:1,episode:2},focusActive:true});
      await new Promise(resolve=>setTimeout(resolve,20));
      assert(document.activeElement.dataset.episode === '2','Focus must land on active episode');
      assert(overlay.querySelector('.le-badge').textContent === 'Sedang Diputar','Current episode badge missing');
      const first = before.querySelector('.le-card'), other = overlay.querySelector('.le-card');
      assert(first.outerHTML === other.outerHTML,'Same episode must use identical markup in both views');
      assert(getComputedStyle(first).backgroundColor === getComputedStyle(other).backgroundColor,'Styles differ');
      const art = first.querySelector('.le-art').getBoundingClientRect(); assert(Math.abs(art.width/art.height-16/9)<.01,'Thumbnail is not 16:9');
      assert(first.querySelector('progress').value === .5,'Progress must reflect recorded playback');
      assert(first.querySelector('.le-action').textContent === 'Lanjutkan','Resume action missing');
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
      assert(document.activeElement.dataset.season === '1','Left should focus selected season');
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
      assert(document.activeElement.dataset.episode === '2','Right should return to active episode');
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
      assert(document.activeElement.dataset.episode === '2','Navigation must skip unavailable episode');
      let resolveOld;
      const c = LayarEpisodes.mount(overlay,{...opts,load:season=>season===1?new Promise(resolve=>resolveOld=resolve):Promise.resolve({episodes:[{number:9,title:'New season',available:true}]})});
      await c.selectSeason(2); resolveOld(episodes); await Promise.resolve();
      assert(overlay.querySelector('[data-episode]').dataset.episode === '9','Stale season request replaced current list');
      c.dispose(); a.dispose(); b.dispose();
      return 'Shared markup, 16:9 thumbnails, active focus, progress, D-pad and stale requests passed';
    })()`);
    console.log(result);
    // Check the injected Android overlay against the same renderer with a mock media element.
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'../stream-tools.js'),'utf8'));
    console.log(await win.webContents.executeJavaScript(`(async()=>{
      document.body.innerHTML='<div data-layar-player><video></video></div>';
      const video=document.querySelector('video'); let paused=true;
      Object.defineProperty(video,'paused',{get:()=>paused}); Object.defineProperty(video,'duration',{get:()=>600});
      video.play=()=>{paused=false;return Promise.resolve()}; video.pause=()=>{paused=true};
      window.fetch=async()=>({ok:true,json:async()=>({episodes:[{number:1,title:'One',available:true},{number:2,title:'Two',available:true}]})});
      LayarStream.installControls({playback:{type:'tv_series',slug:'show',season:1,episode:2,seasons:[{number:1}]}});
      const trigger=[...document.querySelectorAll('#layar-stream-controls > button')].find(b=>b.textContent==='Episode');
      if(!trigger)throw new Error('Episode trigger missing while paused');
      for(const initial of [true,false]){
        paused=initial;trigger.click();await new Promise(r=>setTimeout(r,20));
        if(document.activeElement.dataset.episode!=='2')throw new Error('Injected active focus missing');
        const panel=document.querySelector('#layar-episode-panel');
        if(getComputedStyle(panel).backdropFilter!=='blur(14px) brightness(0.6)')throw new Error('Incorrect backdrop');
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
        if(document.activeElement.dataset.season!=='1')throw new Error('Injected D-pad interception');
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        if(!panel.hidden || paused!==initial || document.activeElement!==trigger)throw new Error('Dismissal failed to restore state/focus');
      }
      return 'Injected overlay: PLAYING/PAUSED trigger, blur, D-pad, Escape and restored focus passed';
    })()`));
    const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<link[^>]*>/g,'');
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await win.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'../cinema.css'),'utf8'));
    for (const file of ['i18n.js','episode-selector.js']) await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'../'+file),'utf8'));
    await win.webContents.executeJavaScript(`
      window.testItem={type:'tv_series',slug:'test-series',title:'Test Series',seasons:[{number:1}],year:2024};
      window.testEpisodes={episodes:[{number:1,title:'First',overview:'Synopsis',runtime:42,available:true},{number:2,title:'Second',runtime:45,available:true}]};
      window.playCalls=[];
      window.layarDesktop={api:async resource=>resource.includes('/season/')?testEpisodes:testItem,
        play:async options=>playCalls.push(options),bounds:()=>{},onPlayerStatus:()=>{},playerVisible:async()=>{},closePlayer:async()=>{}};
      document.querySelector('#introSplash').remove();
    `);
    const appSource = fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
    await win.webContents.executeJavaScript(appSource.slice(0,appSource.lastIndexOf('\ninitNetflixIntro();')));
    console.log(await win.webContents.executeJavaScript(`(async()=>{
      currentTab='series';
      const poster=card(testItem); poster.click(); await new Promise(r=>setTimeout(r,30));
      const pre=document.querySelector('#detailEpisodeSelector .le-card');
      if(!pre || playCalls.length)throw new Error('Series poster must open pre-watch selector');
      const preMarkup=pre.outerHTML;
      document.querySelector('#detailEpisodeSelector [data-episode="2"]').click(); await new Promise(r=>setTimeout(r,20));
      if(playCalls.length!==1 || playCalls[0].episode!==2)throw new Error('Pre-watch selection failed');
      document.querySelector('#playerSidebar').focus(); await openPlayerEpisodes(); await new Promise(r=>setTimeout(r,30));
      if(document.querySelector('#overlayEpisodeSelector .le-card').outerHTML!==preMarkup)throw new Error('App pre-watch/overlay markup differs');
      if(document.activeElement.dataset.episode!=='2')throw new Error('App active episode focus missing');
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      if(!document.querySelector('#modal').classList.contains('hidden') || playCalls.length!==1)throw new Error('Escape restarted playback');
      if(document.activeElement.id!=='playerSidebar')throw new Error('Player trigger focus not restored');
      await openPlayerEpisodes(); await new Promise(r=>setTimeout(r,20));
      document.querySelector('#overlayEpisodeSelector [data-episode="1"]').click(); await new Promise(r=>setTimeout(r,20));
      if(playCalls.length!==2 || playCalls[1].episode!==1 || !document.querySelector('#modal').classList.contains('hidden'))throw new Error('Episode switching failed');
      return 'App integration: series pre-watch, identical overlay, active focus, Escape and episode switching passed';
    })()`));
    app.exit(0);
  } catch(error) {console.error(error);app.exit(1);}
});
