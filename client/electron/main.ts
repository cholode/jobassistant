import { app, BrowserWindow, WebContentsView, ipcMain, Menu, session, dialog } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Snapshot } from '../shared/protocol.js';
import { ElectronBrowserController } from './browser/ElectronBrowserController.js';
import { BrowserRPCBridge } from './browser/BrowserRPCBridge.js';

// 主进程负责原生窗口、招聘网页、后端连接；React 只通过预加载桥接调用它。
const here = path.dirname(fileURLToPath(import.meta.url));
let backend = 'http://127.0.0.1:8765';
let home = `${backend}/mock/`;
// 发布版每次启动生成新令牌；开发版与启动脚本共享令牌。
const token = app.isPackaged ? randomUUID() + randomUUID() : process.env.JOB_AGENT_TOKEN;
let backendProcess: ChildProcess | undefined;
if (!token) throw new Error('Launch using scripts/dev.ps1 (JOB_AGENT_TOKEN missing)');
if (process.env.JOB_AGENT_USER_DATA) app.setPath('userData', process.env.JOB_AGENT_USER_DATA);
const allowedHosts = new Set(['www.zhipin.com', 'www.liepin.com', 'www.zhaopin.com', 'www.nowcoder.com']);
let window: BrowserWindow;
let browser: WebContentsView;
let browserRPC: BrowserRPCBridge;
let browserZoom = 1;
let socket: WebSocket | undefined;
let quitting = false;
let reconnect: ReturnType<typeof setTimeout> | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
// 按请求编号保存等待中的操作，用于匹配响应、计算往返延迟和处理超时。
const pending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; start: number; type: string; quiet: boolean }>();
const state: Snapshot = { connected: false, agent: { status: 'paused', mode: 'manual', revision: 0, page: { url: '', title: '' } }, browser: { zoom: 1, url: home, title: '本地模拟招聘站', loading: true, canBack: false, canForward: false }, logs: [], latency: null };

function publish() {
  // 将状态快照推送给工作台，不向招聘网页暴露内部状态。
  if (window && !window.isDestroyed()) window.webContents.send('desktop:state', state);
}
function log(text: string, kind: 'info' | 'success' | 'warning' = 'info') {
  // 运行记录仅存在内存中，保留最近 80 条，避免长时间运行持续占用内存。
  state.logs = [{ id: randomUUID(), time: new Date().toISOString(), text, kind }, ...state.logs].slice(0, 80);
  publish();
}
function allowed(url: string): boolean {
  // 导航仅允许本地模拟站及指定 HTTPS 招聘域名，拒绝 URL 内嵌账号密码。
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return false;
    return (parsed.origin === backend && parsed.pathname.startsWith('/mock/')) || (parsed.protocol === 'https:' && (!parsed.port || parsed.port === '443') && allowedHosts.has(parsed.hostname));
  } catch { return false; }
}
function readPage() {
  // 从真实浏览视图读取地址、标题及历史导航状态，更新工作台显示。
  if (!browser || browser.webContents.isDestroyed()) return;
  const wc = browser.webContents;
  state.browser = { home, zoom: browserZoom, url: wc.getURL() || home, title: wc.getTitle() || '正在打开页面', loading: wc.isLoading(), canBack: wc.navigationHistory.canGoBack(), canForward: wc.navigationHistory.canGoForward() };
  publish();
}
function request(type: string, quiet = false): Promise<void> {
  // 每次发送都先刷新页面信息；5 秒无响应则暂停并断开连接。
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
  // WebSocket 首帧认证，随后接收状态；意外断连时暂停并安排重连。
  if (quitting) return;
  socket = new WebSocket(`${backend.replace('http', 'ws')}/ws`);
  const connection = socket;
  socket.onopen = () => connection.send(JSON.stringify({ token }));
  socket.onmessage = ({ data }) => {
    try {
      const message = JSON.parse(String(data));
      if (message.type === 'browser_command') {
        // 只读请求异步处理，不能阻塞心跳、暂停及其他状态消息。
        void browserRPC.handleCommand(connection, message).catch(() => log('浏览器读取响应失败', 'warning'));
        return;
      }
      if (message.type === 'connected') {
        state.connected = true;
        state.agent = message.state;
        log('FastAPI 已连接 · WebSocket 双向通道就绪', 'success');
        void request('page').catch((error: Error) => log(error.message, 'warning'));
      } else if (message.type === 'agent_state' || message.type === 'pong') {
        state.agent = message.state;
      }
      // 完成对应操作的 Promise，让前端结束等待状态。
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
  socket.onerror = () => { /* 统一由 onclose 负责暂停、清理和重连。 */ };
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
// 缩放仅作用于内嵌网页，按 10% 调整，并限制在 50%～200%。
function changeBrowserZoom(action: unknown) {
  if (!['in', 'out', 'reset'].includes(String(action))) throw new Error('Unknown zoom action');
  browserZoom = action === 'reset' ? 1 : Math.max(0.5, Math.min(2, Math.round((browserZoom + (action === 'in' ? 0.1 : -0.1)) * 10) / 10));
  browser.webContents.setZoomFactor(browserZoom);
  readPage();
}

function registerIPC() {
  // 仅接受工作台主框架发出的 IPC，防止网页或子框架调用本机能力。
  const handle = (channel: string, handler: (...args: any[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted IPC sender');
      return handler(...args);
    });
  };
  handle('desktop:snapshot', () => state);
  handle('browser:read', async () => {
    if (!state.connected) throw new Error('后端尚未连接');
    try {
      const data = await browserRPC.readPage();
      log(`页面已读取 · ${data.platform} · ${data.kind}`, 'success');
      return data;
    } catch (error) {
      log('页面读取失败，请检查页面状态后重试', 'warning');
      throw error;
    }
  });
  handle('browser:zoom', changeBrowserZoom);
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
    // React 上报占位区域；裁剪到窗口范围后设置原生网页视图的位置与尺寸。
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

async function startBundledBackend() {
  // 启动打包的 Python 后端并隐藏控制台；开发模式无需执行此步骤。
  const child = spawn(path.join(process.resourcesPath, 'backend', 'job-agent-backend.exe'), [], {
    env: { ...process.env, JOB_AGENT_TOKEN: token }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  backendProcess = child;
  // 持续读取错误输出，避免子进程因管道写满而阻塞。
  child.stderr?.on('data', () => {});
  // 等待后端通过标准输出报告端口；收到端口不代表 HTTP 服务已经就绪。
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('后端启动超时')), 30000);
    let output = '';
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('后端启动失败')); });
    child.stdout?.on('data', (chunk) => {
      output = (output + String(chunk)).slice(-4096);
      const match = output.match(/JOB_AGENT_PORT=(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
  });
  backend = `http://127.0.0.1:${port}`;
  home = `${backend}/mock/`;
  state.browser.url = home; state.browser.home = home;
  // 再通过健康接口确认服务可用，之后才加载模拟站和建立 WebSocket。
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('后端意外退出');
    try { if ((await fetch(`${backend}/health`, { signal: AbortSignal.timeout(500) })).ok) return; } catch { /* wait for Uvicorn */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('后端未能就绪');
}

app.whenReady().then(async () => {
  if (app.isPackaged) await startBundledBackend();
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({ width: 1440, height: 940, minWidth: 1100, minHeight: 720, title: 'Job Agent · 求职工作台', backgroundColor: '#f6f7f9', show: false, webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  // 招聘网页使用独立持久会话保存登录状态，与工作台隔离且不开放 Node.js。
  const isolatedSession = session.fromPartition('persist:recruitment');
  isolatedSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  isolatedSession.setPermissionCheckHandler(() => false);
  isolatedSession.on('will-download', (event) => { event.preventDefault(); log('Phase 1 暂不支持文件下载', 'warning'); });
  browser = new WebContentsView({ webPreferences: { session: isolatedSession, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  // Phase 2 只开放读取；底层自动点击、输入和导航始终由写入开关拦截。
  const controller = new ElectronBrowserController(browser.webContents, allowed, () => false);
  browserRPC = new BrowserRPCBridge(controller, backend, token!);
  // 手动模式统一处理按钮与 Ctrl+滚轮，避免原生缩放和界面比例不一致。
  browser.webContents.setZoomMode('manual');
  browser.webContents.on('zoom-changed', (_event, direction) => changeBrowserZoom(direction));
  browser.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return;
    const action = ['+', '='].includes(input.key) ? 'in' : input.key === '-' ? 'out' : input.key === '0' ? 'reset' : null;
    if (action) { event.preventDefault(); changeBrowserZoom(action); }
  });
  browser.setBackgroundColor('#ffffff');
  window.contentView.addChildView(browser);
  browser.setBounds({ x: 232, y: 220, width: 700, height: 500 });
  // 网页加载、标题变化与页内跳转都需要同步到工作台。
  browser.webContents.on('did-start-loading', readPage);
  browser.webContents.on('did-stop-loading', readPage);
  browser.webContents.on('did-navigate', readPage);
  browser.webContents.on('did-navigate-in-page', () => {
    readPage();
    if (state.connected) void request('page').catch(() => {});
  });
  browser.webContents.on('page-title-updated', readPage);
  browser.webContents.on('did-finish-load', () => {
    browser.webContents.setZoomFactor(browserZoom);
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
    // 新窗口请求改为在当前视图打开，继续应用域名限制。
    if (allowed(url)) void browser.webContents.loadURL(url).catch(() => log('新页面打开失败', 'warning'));
    else log('已阻止未授权的新窗口', 'warning');
    return { action: 'deny' };
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  // 先注册通信接口，再加载开发服务器页面或打包后的本地页面。
  registerIPC();
  window.on('closed', () => { browser.webContents.close(); app.quit(); });
  if (process.env.JOB_AGENT_DEV_URL === 'http://127.0.0.1:5173') await window.loadURL(process.env.JOB_AGENT_DEV_URL);
  else await window.loadFile(path.join(here, '../../dist/index.html'));
  window.show();
  void browser.webContents.loadURL(home).catch(() => log('模拟站未启动，请检查后端', 'warning'));
  connect();
  heartbeat = setInterval(() => { if (state.connected) void request('ping', true).catch(() => {}); }, 15000);
}).catch((error: Error) => { dialog.showErrorBox('Job Agent 启动失败', error.message); app.quit(); });
// 退出时停止重连和心跳，并结束本应用启动的后端，避免残留后台进程。
app.on('before-quit', () => { quitting = true; clearTimeout(reconnect); clearInterval(heartbeat); socket?.close(); backendProcess?.kill(); });
app.on('window-all-closed', () => app.quit());
