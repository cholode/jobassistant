import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI, Snapshot } from '../shared/protocol.js';
// 只暴露受限方法，不把 Node.js 或完整 IPC 对象交给页面。
const api: DesktopAPI = {
  recruitment: (action, payload) =>
    ipcRenderer.invoke('recruitment:request', action, payload),
  readPage: () => ipcRenderer.invoke('browser:read'),
  snapshot: () => ipcRenderer.invoke('desktop:snapshot'),
  subscribe: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Snapshot) =>
      callback(state);
    ipcRenderer.on('desktop:state', listener);
    // React 组件卸载时调用此函数，清理状态订阅。
    return () => ipcRenderer.removeListener('desktop:state', listener);
  },
  navigate: (url) => ipcRenderer.invoke('browser:navigate', url),
  browserZoom: (action) => ipcRenderer.invoke('browser:zoom', action),
  browserAction: (action) => ipcRenderer.invoke('browser:action', action),
  bounds: (bounds) => ipcRenderer.invoke('browser:bounds', bounds),
  agentAction: (action) => ipcRenderer.invoke('agent:action', action),
};
// 招聘网页使用独立视图，不加载此预加载脚本。
contextBridge.exposeInMainWorld('desktop', api);
