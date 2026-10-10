// Visual/layout smoke check using an isolated backend and Electron profile.
import { _electron as electron, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { freePort } from './fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = await freePort();
const id = randomUUID();
const env = {
  ...process.env,
  JOB_AGENT_TOKEN: id,
  JOB_AGENT_BACKEND_URL: `http://127.0.0.1:${port}`,
  JOB_AGENT_DATA_DIR: path.join(root, 'logs', `candy-data-${id}`),
  JOB_AGENT_USER_DATA: path.join(root, 'logs', `candy-profile-${id}`),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.JOB_AGENT_DEV_URL;
const backend = spawn(
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
  { cwd: path.join(root, 'backend'), env, windowsHide: true, stdio: 'ignore' },
);
let desktop;
try {
  await expect
    .poll(
      async () =>
        (await fetch(`${env.JOB_AGENT_BACKEND_URL}/health`).catch(() => null))?.status,
      { timeout: 15000 },
    )
    .toBe(200);
  desktop = await electron.launch({ args: [path.join(root, 'client')], env });
  const ui = await desktop.firstWindow();
  await expect(ui.locator('.connection')).toHaveText('本地服务已连接');
  await expect(ui.locator('.summary-jobs strong')).toHaveText('0');
  await ui.getByRole('button', { name: '职位与投递', exact: true }).click();
  await expect(
    ui.getByRole('button', { name: '职位与投递', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    ui.getByRole('button', { name: '招聘浏览器', exact: true }),
  ).not.toHaveAttribute('aria-current', 'page');
  await ui.getByRole('button', { name: '分析当前页面职位', exact: true }).click();
  await expect
    .poll(async () => Number(await ui.locator('.summary-jobs strong').textContent()), {
      timeout: 15000,
    })
    .toBeGreaterThan(0);
  await mkdir(path.join(root, 'logs'), { recursive: true });
  for (const [width, height] of [
    [1586, 992],
    [1100, 720],
  ]) {
    await desktop.evaluate(
      ({ BrowserWindow }, size) =>
        BrowserWindow.getAllWindows()[0].setContentSize(...size),
      [width, height],
    );
    // Windows fractional display scaling can round a DIP by one pixel.
    await expect
      .poll(async () => Math.abs((await ui.evaluate(() => window.innerWidth)) - width))
      .toBeLessThanOrEqual(1);
    const slot = await ui.locator('.browser-slot').boundingBox();
    expect(slot.width).toBeGreaterThan(350);
    expect(slot.height).toBeGreaterThan(300);
    const panel = await ui.locator('.copilot').boundingBox();
    expect(panel.x + panel.width).toBeLessThanOrEqual(width);
    expect(
      await ui.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    const image = await desktop.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'),
    );
    await writeFile(
      path.join(root, `logs/candy-${width}.png`),
      Buffer.from(image, 'base64'),
    );
  }
  backend.kill();
  await expect(ui.locator('.connection')).toHaveText('正在连接本地服务', {
    timeout: 15000,
  });
  await expect(ui.locator('.summary-jobs strong')).toHaveText('—');
  await expect(ui.getByRole('button', { name: 'Auto 自动执行' })).toBeDisabled();
  console.log(
    'PASS: live summary, selected navigation, 1586/1100px layout, offline stats and controls.',
  );
} finally {
  if (desktop) await desktop.close();
  if (!backend.killed) backend.kill();
}
