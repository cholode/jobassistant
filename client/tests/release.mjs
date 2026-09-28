import { _electron as electron, expect } from '@playwright/test';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const root = path.resolve('..');
const executablePath = process.env.RELEASE_EXE || path.join(root, 'release/v0.0.1/win-unpacked/Job Agent.exe');
const env = { ...process.env, JOB_AGENT_USER_DATA: path.join(root, 'logs', `release-profile-${Date.now()}`) };
delete env.ELECTRON_RUN_AS_NODE;
delete env.JOB_AGENT_TOKEN;
delete env.JOB_AGENT_DEV_URL;
let desktop;
let backendOrigin;
try {
  desktop = await electron.launch({ executablePath, env, timeout: 120000 });
  const ui = await desktop.firstWindow();
  await expect.poll(() => ui.evaluate(() => window.desktop.snapshot().then(s => s.connected)), { timeout: 30000 }).toBe(true);
  const state = await ui.evaluate(() => window.desktop.snapshot());
  expect(state.agent.status).toBe('paused');
  backendOrigin = new URL(state.browser.home).origin;
  await expect.poll(() => desktop.windows().length).toBe(2);
  const web = desktop.windows().find(page => page !== ui);
  await expect(web.getByText('好工作，')).toBeVisible();
  await expect(ui.getByText('发现下一份可能')).toHaveCount(0);
  await ui.getByRole('button', { name: '测试双向通信' }).click();
  await expect.poll(() => ui.evaluate(() => window.desktop.snapshot().then(s => s.logs.some(l => l.text.includes('通信检查成功'))))).toBe(true);
  await ui.getByRole('button', { name: '模拟招聘站', exact: true }).click();
  await expect(web.getByText('好工作，')).toBeVisible();
  await mkdir(path.join(root, 'logs'), { recursive: true });
  await ui.screenshot({ path: path.join(root, 'logs/release-0.0.1.png') });
  console.log('Packaged app: backend connected, paused, mock page loaded, ping and navigation passed.');
} finally {
  await desktop?.close();
}
await expect.poll(async () => {
  try { await fetch(`${backendOrigin}/health`, { signal: AbortSignal.timeout(500) }); return false; }
  catch { return true; }
}, { timeout: 10000 }).toBe(true);
console.log('Backend stopped after app exit.');
