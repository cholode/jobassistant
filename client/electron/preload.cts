import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI, Snapshot } from '../shared/protocol.js';
const api: DesktopAPI = {
  snapshot: () => ipcRenderer.invoke('desktop:snapshot'),
  subscribe: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Snapshot) => callback(state);
    ipcRenderer.on('desktop:state', listener);
    return () => ipcRenderer.removeListener('desktop:state', listener);
  },
  navigate: (url) => ipcRenderer.invoke('browser:navigate', url),
  browserAction: (action) => ipcRenderer.invoke('browser:action', action),
  bounds: (bounds) => ipcRenderer.invoke('browser:bounds', bounds),
  agentAction: (action) => ipcRenderer.invoke('agent:action', action),
};
contextBridge.exposeInMainWorld('desktop', api);
