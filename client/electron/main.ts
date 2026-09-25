import { app, BrowserWindow, WebContentsView, ipcMain, Menu, session } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Snapshot } from '../shared/protocol.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = 'http://127.0.0.1:8765';
const home = `${backend}/mock/`;
const token = process.env.JOB_AGENT_TOKEN;
if (!token) throw new Error('Launch using scripts/dev.ps1 (JOB_AGENT_TOKEN missing)');
if (process.env.JOB_AGENT_USER_DATA) app.setPath('userData', process.env.JOB_AGENT_USER_DATA);
const allowedHosts = new Set(['www.zhipin.com', 'www.liepin.com', 'www.zhaopin.com', 'www.nowcoder.com']);
let window: BrowserWindow;
let browser: WebContentsView;
let socket: WebSocket | undefined;
let quitting = false;
let reconnect: ReturnType<typeof setTimeout> | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
const pending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; start: number; type: string; quiet: boolean }>();
const state: Snapshot = { connected: false, agent: { status: 'paused', mode: 'manual', revision: 0, page: { url: '', title: '' } }, browser: { url: home, title: '本地模拟招聘站', loading: true, canBack: false, canForward: false }, logs: [], latency: null };

function publish() {
  if (window && !window.isDestroyed()) window.webContents.send('desktop:state', state);
}
function log(text: string, kind: 'info' | 'success' | 'warning' = 'info') {
  state.logs = [{ id: randomUUID(), time: new Date().toISOString(), text, kind }, ...state.logs].slice(0, 80);
  publish();
}
function allowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return false;
    return (parsed.origin === backend && parsed.pathname.startsWith('/mock/')) || (parsed.protocol === 'https:' && (!parsed.port || parsed.port === '443') && allowedHosts.has(parsed.hostname));
  } catch { return false; }
}
function readPage() {
  if (!browser || browser.webContents.isDestroyed()) return;
  const wc = browser.webContents;
  state.browser = { url: wc.getURL() || home, title: wc.getTitle() || '正在打开页面', loading: wc.isLoading(), canBack: wc.navigationHistory.canGoBack(), canForward: wc.navigationHistory.canGoForward() };
  publish();
}
function request(type: string, quiet = false): Promise<void> {
  if (!state.connected || socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('后端尚未连接，请稍后重试'));
  readPage();
  const request_id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(request_id);
      state.agent.status = 'paused';
      state.connected = false;
      publish();
      socket?.close();
      reject(new Error('后端响应超时，已暂停'));
    }, 5000);
    pending.set(request_id, { resolve, reject, timer, start: Date.now(), type, quiet });
    socket!.send(JSON.stringify({ type, request_id, page: { url: state.browser.url, title: state.browser.title } }));
  });
}
function connect() {
  if (quitting) return;
  socket = new WebSocket(`${backend.replace('http', 'ws')}/ws`);
  socket.onopen = () => socket?.send(JSON.stringify({ token }));
  socket.onmessage = ({ data }) => {
    try {
      const message = JSON.parse(String(data));
      if (message.type === 'connected') {
        state.connected = true;
        state.agent = message.state;
        log('FastAPI 已连接 · WebSocket 双向通道就绪', 'success');
        void request('page').catch((error: Error) => log(error.message, 'warning'));
      } else if (message.type === 'agent_state' || message.type === 'pong') {
        state.agent = message.state;
      }
      const task = pending.get(message.request_id);
      if (task) {
        clearTimeout(task.timer);
        pending.delete(message.request_id);
        if (message.type === 'error') task.reject(new Error(message.message));
        else {
          state.latency = Date.now() - task.start;
          if (task.type === 'resume') log('已刷新当前页面 · 工作流恢复', 'success');
          if (task.type === 'pause') log('工作流已暂停 · 网页由你接管', 'warning');
          if (task.type === 'ping' && !task.quiet) log(`通信检查成功 · ${state.latency} ms`, 'success');
          task.resolve();
        }
      }
      publish();
    } catch { log('收到无法解析的后端消息', 'warning'); }
  };
  socket.onerror = () => { /* onclose handles reconnect and fail-closed state. */ };
  socket.onclose = () => {
    state.connected = false;
    state.agent.status = 'paused';
    state.latency = null;
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('后端连接中断，已暂停')); }
    pending.clear();
    if (!quitting) {
      log('后端离线 · 已暂停，2 秒后重连', 'warning');
      reconnect = setTimeout(connect, 2000);
    }
  };
}
function registerIPC() {
  const handle = (channel: string, handler: (...args: any[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted IPC sender');
      return handler(...args);
    });
  };
  handle('desktop:snapshot', () => state);
  handle('browser:navigate', async (url: unknown) => {
    if (typeof url !== 'string' || !allowed(url)) throw new Error('仅允许本地模拟站及列表中的招聘网站（HTTPS）');
    await browser.webContents.loadURL(url);
  });
  handle('browser:action', async (action: unknown) => {
    const wc = browser.webContents;
    if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (action === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    else if (action === 'reload') wc.reload();
    else if (action === 'home') await wc.loadURL(home);
    else if (!['back', 'forward'].includes(String(action))) throw new Error('Unknown browser action');
  });
  handle('browser:bounds', (rect: { x: number; y: number; width: number; height: number }) => {
    if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) throw new Error('Invalid browser bounds');
    const [w, h] = window.getContentSize();
    const x = Math.max(0, Math.min(w, Math.round(rect.x)));
    const y = Math.max(0, Math.min(h, Math.round(rect.y)));
    browser.setBounds({ x, y, width: Math.max(0, Math.min(w - x, Math.round(rect.width))), height: Math.max(0, Math.min(h - y, Math.round(rect.height))) });
  });
  handle('agent:action', async (action: unknown) => {
    if (!['pause', 'resume', 'ping'].includes(String(action))) throw new Error('Unknown agent action');
    if (action === 'pause') { state.agent.status = 'paused'; publish(); }
    await request(String(action));
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({ width: 1440, height: 940, minWidth: 1100, minHeight: 720, title: 'Job Agent · 求职工作台', backgroundColor: '#f6f7f9', show: false, webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const isolatedSession = session.fromPartition('persist:recruitment');
  isolatedSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  isolatedSession.setPermissionCheckHandler(() => false);
  isolatedSession.on('will-download', (event) => { event.preventDefault(); log('Phase 1 暂不支持文件下载', 'warning'); });
  browser = new WebContentsView({ webPreferences: { session: isolatedSession, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  browser.setBackgroundColor('#ffffff');
  window.contentView.addChildView(browser);
  browser.setBounds({ x: 232, y: 220, width: 700, height: 500 });
  browser.webContents.on('did-start-loading', readPage);
  browser.webContents.on('did-stop-loading', readPage);
  browser.webContents.on('did-navigate', readPage);
  browser.webContents.on('did-navigate-in-page', () => {
    readPage();
    if (state.connected) void request('page').catch(() => {});
  });
  browser.webContents.on('page-title-updated', readPage);
  browser.webContents.on('did-finish-load', () => {
    readPage();
    log(`页面已就绪 · ${state.browser.title}`);
    if (state.connected) void request('page').catch((error: Error) => log(error.message, 'warning'));
  });
  browser.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (code !== -3 && isMainFrame) log(`页面加载失败：${description}，可重试或返回模拟站`, 'warning');
  });
  browser.webContents.on('will-navigate', (event, url) => { if (!allowed(url)) { event.preventDefault(); log('已阻止未授权网页跳转', 'warning'); } });
  browser.webContents.on('will-redirect', (event, url) => { if (!allowed(url)) { event.preventDefault(); log('已阻止未授权网页重定向', 'warning'); } });
  browser.webContents.setWindowOpenHandler(({ url }) => {
    if (allowed(url)) void browser.webContents.loadURL(url).catch(() => log('新页面打开失败', 'warning'));
    else log('已阻止未授权的新窗口', 'warning');
    return { action: 'deny' };
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  registerIPC();
  window.on('closed', () => { browser.webContents.close(); app.quit(); });
  if (process.env.JOB_AGENT_DEV_URL === 'http://127.0.0.1:5173') await window.loadURL(process.env.JOB_AGENT_DEV_URL);
  else await window.loadFile(path.join(here, '../../dist/index.html'));
  window.show();
  void browser.webContents.loadURL(home).catch(() => log('模拟站未启动，请检查后端', 'warning'));
  connect();
  heartbeat = setInterval(() => { if (state.connected) void request('ping', true).catch(() => {}); }, 15000);
});
app.on('before-quit', () => { quitting = true; clearTimeout(reconnect); clearInterval(heartbeat); socket?.close(); });
app.on('window-all-closed', () => app.quit());
