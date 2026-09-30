import { _electron as electron, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readPageFromPanel } from './page-reading.mjs';
import { freePort } from './fixtures.mjs';
import { checkController } from './browser-controller.mjs';
import { checkRecruitment } from './recruitment.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const token = randomUUID();
const port = await freePort();
const backendURL = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  JOB_AGENT_TOKEN: token,
  JOB_AGENT_BACKEND_URL: backendURL,
  JOB_AGENT_DATA_DIR: path.join(root, 'logs', `test-data-${Date.now()}`),
  JOB_AGENT_USER_DATA: path.join(root, 'logs', `test-profile-${Date.now()}`),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.JOB_AGENT_DEV_URL;
let backend;
let desktop;
const errors = [];
const startBackend = () => {
  backend = spawn(
    path.join(root, 'backend/.venv/Scripts/python.exe'),
    [
      '-m',
      'uvicorn',
      'app.main:create_app',
      '--factory',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    { cwd: path.join(root, 'backend'), env, windowsHide: true, stdio: 'pipe' },
  );
  backend.stderr.on('data', () => {});
};
try {
  const existing = await fetch(`${backendURL}/health`).catch(() => null);
  if (existing)
    throw new Error('Close the running desktop preview before tests (port 8765).');
  startBackend();
  await expect
    .poll(async () => (await fetch(`${backendURL}/health`).catch(() => null))?.status, {
      timeout: 15000,
    })
    .toBe(200);
  desktop = await electron.launch({
    args: [path.join(root, 'client')],
    env,
    timeout: 20000,
  });
  const ui = await desktop.firstWindow();
  ui.on('pageerror', (error) => errors.push(error.message));
  await expect(ui.getByRole('textbox', { name: '网页地址' })).toBeVisible();
  await expect
    .poll(() => ui.evaluate(() => window.desktop.snapshot().then((s) => s.connected)))
    .toBe(true);
  await expect.poll(() => desktop.windows().length).toBe(2);
  const web = desktop.windows().find((page) => page !== ui);
  await expect(web.getByText('好工作，')).toBeVisible();
  await checkController(
    desktop,
    pathToFileURL(
      path.join(
        root,
        'client/dist-electron/electron/browser/ElectronBrowserController.js',
      ),
    ).href,
  );
  // 同时检查控件比例和真实网页缩放，防止只更新界面数字。
  const zoomFactors = () =>
    desktop.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return {
        shell: window.webContents.getZoomFactor(),
        page: window.contentView.children[0].webContents.getZoomFactor(),
      };
    });
  await ui.getByRole('button', { name: '放大网页', exact: true }).click();
  await expect(ui.getByRole('button', { name: '重置网页缩放' })).toHaveText('110%');
  expect((await zoomFactors()).page).toBeCloseTo(1.1);
  expect((await zoomFactors()).shell).toBe(1);
  await ui.getByRole('button', { name: '缩小网页', exact: true }).click();
  expect((await zoomFactors()).page).toBeCloseTo(1);
  await ui.getByRole('button', { name: '缩小网页', exact: true }).click();
  await ui.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(web.getByText('好工作，')).toBeVisible();
  expect((await zoomFactors()).page).toBeCloseTo(0.9);
  await ui.evaluate(async () => {
    for (let i = 0; i < 20; i++) await window.desktop.browserZoom('out');
  });
  await expect(ui.getByRole('button', { name: '缩小网页', exact: true })).toBeDisabled();
  expect((await zoomFactors()).page).toBeCloseTo(0.5);
  await ui.evaluate(async () => {
    for (let i = 0; i < 20; i++) await window.desktop.browserZoom('in');
  });
  await expect(ui.getByRole('button', { name: '放大网页', exact: true })).toBeDisabled();
  expect((await zoomFactors()).page).toBeCloseTo(2);
  await ui.getByRole('button', { name: '重置网页缩放' }).click();
  expect((await zoomFactors()).page).toBeCloseTo(1);
  const isolation = await web.evaluate(() => ({
    require: typeof globalThis.require,
    bridge: typeof globalThis.desktop,
  }));
  expect(isolation).toEqual({ require: 'undefined', bridge: 'undefined' });
  const listReading = await readPageFromPanel(ui, '职位列表');
  await expect(listReading).toContainText('远山科技');
  await expect(listReading).toContainText('AI 应用开发工程师');
  const wrongPage = await fetch(`${backendURL}/browser/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Job-Agent-Token': token },
    body: JSON.stringify({ command: 'GET_JOB_DETAIL' }),
  });
  expect(wrongPage.status).toBe(502);
  expect((await wrongPage.json()).detail.code).toBe('WRONG_PAGE');
  await ui.getByRole('button', { name: '恢复 Agent', exact: true }).click();
  await expect
    .poll(() => ui.evaluate(() => window.desktop.snapshot().then((s) => s.agent.status)))
    .toBe('running');
  await ui.getByRole('button', { name: '暂停 Agent', exact: true }).click();
  await expect
    .poll(() => ui.evaluate(() => window.desktop.snapshot().then((s) => s.agent.status)))
    .toBe('paused');
  await web.getByRole('link').filter({ hasText: 'Python 后端开发工程师' }).click();
  await expect(web.getByRole('heading', { name: 'Python 后端开发工程师' })).toBeVisible();
  await expect(ui.getByTestId('page-reading')).toHaveCount(0);
  const detailReading = await readPageFromPanel(ui, '职位详情');
  await expect(detailReading).toContainText('Python 后端开发工程师');
  await expect(detailReading).toContainText('20–35K');
  await ui.getByRole('button', { name: '恢复 Agent', exact: true }).click();
  await expect
    .poll(() =>
      ui.evaluate(() => window.desktop.snapshot().then((s) => s.agent.page.url)),
    )
    .toContain('#job/1');
  await ui.getByRole('button', { name: '暂停 Agent', exact: true }).click();
  await web.getByRole('link', { name: '模拟沟通 →' }).click();
  await web.getByRole('textbox', { name: '模拟消息' }).fill('这是手动接管测试');
  await web.getByRole('button', { name: '模拟发送' }).click();
  await expect(web.getByText('这是手动接管测试')).toBeVisible();
  const chatReading = await readPageFromPanel(ui, '聊天消息');
  await expect(chatReading).toContainText('方便聊聊你的项目经历吗');
  await expect(chatReading).toContainText('这是手动接管测试');
  await ui.getByRole('button', { name: '测试双向通信' }).click();
  await expect
    .poll(() =>
      ui.evaluate(() =>
        window.desktop
          .snapshot()
          .then((s) => s.logs.some((l) => l.text.includes('通信检查成功'))),
      ),
    )
    .toBe(true);
  const blocked = await ui.evaluate(() =>
    window.desktop.navigate('https://example.com').then(
      () => false,
      () => true,
    ),
  );
  expect(blocked).toBe(true);
  backend.kill();
  await expect
    .poll(() => ui.evaluate(() => window.desktop.snapshot().then((s) => s.connected)), {
      timeout: 10000,
    })
    .toBe(false);
  await expect
    .poll(() => ui.evaluate(() => window.desktop.snapshot().then((s) => s.agent.status)))
    .toBe('paused');
  startBackend();
  await expect
    .poll(() => ui.evaluate(() => window.desktop.snapshot().then((s) => s.connected)), {
      timeout: 15000,
    })
    .toBe(true);
  expect(
    await ui.evaluate(() => window.desktop.snapshot().then((s) => s.agent.status)),
  ).toBe('paused');
  await ui.getByRole('button', { name: '模拟招聘站', exact: true }).click();
  await expect(web.getByText('好工作，')).toBeVisible();
  await readPageFromPanel(ui, '职位列表');
  await checkRecruitment(ui, web);
  await mkdir(path.join(root, 'logs'), { recursive: true });
  const screenshot = await desktop.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const image = await window.capturePage();
    return image.toPNG().toString('base64');
  });
  await writeFile(
    path.join(root, 'logs/phase4-preview.png'),
    Buffer.from(screenshot, 'base64'),
  );
  await web.screenshot({ path: path.join(root, 'logs/mock-preview.png') });
  expect(errors).toEqual([]);
  console.log(
    'PASS: zoom, BrowserController, Python Browser RPC, mock list/detail/chat reading, navigation invalidation, sandbox, pause/manual input and reconnect.',
  );
} finally {
  if (desktop) await desktop.close();
  if (backend && !backend.killed) backend.kill();
}
