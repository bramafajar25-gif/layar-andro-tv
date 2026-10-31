'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('layarDesktop', {
  api: resource => ipcRenderer.invoke('layar:api', resource),
  settings: () => ipcRenderer.invoke('layar:settings'),
  setLanguage: language => ipcRenderer.invoke('layar:set-language', language),
  saveSettings: value => ipcRenderer.invoke('layar:save-settings', value),
  chooseNative: () => ipcRenderer.invoke('layar:choose-native'),
  native: () => ipcRenderer.invoke('layar:native'),
  openFile: () => ipcRenderer.invoke('layar:open-file'),
  play: options => ipcRenderer.invoke('layar:play', options),
  playerBackdrop: () => ipcRenderer.invoke('layar:player-backdrop'),
  playerAudio: id => ipcRenderer.invoke('layar:player-audio', id),
  playerQuality: id => ipcRenderer.invoke('layar:player-quality', id),
  playerSound: mode => ipcRenderer.invoke('layar:player-sound', mode),
  playerVisible: visible => ipcRenderer.invoke('layar:player-visible', visible),
  bounds: rect => ipcRenderer.send('layar:bounds', rect),
  closePlayer: () => ipcRenderer.invoke('layar:close-player'),
  fullscreen: () => ipcRenderer.invoke('layar:fullscreen'),
  openSource: options => ipcRenderer.invoke('layar:open-source', options),
  onPlayerStatus: callback => {
    const listener = (_, status) => callback(status);
    ipcRenderer.on('layar:player-status', listener);
    return () => ipcRenderer.removeListener('layar:player-status', listener);
  }
});
