import { expect } from '@playwright/test';

export async function checkController(desktop, moduleUrl) {
  const result = await desktop.evaluate(async ({ BrowserWindow }, moduleUrl) => {
    const require = process.getBuiltinModule('module').createRequire(process.execPath);
    const { ElectronBrowserController } = require(process.getBuiltinModule('url').fileURLToPath(moduleUrl));
    const contents = BrowserWindow.getAllWindows()[0].contentView.children[0].webContents;
    const controller = new ElectronBrowserController(contents, url => url.includes('/mock/'), () => false);
    const blocked = [];
    for (const action of [() => controller.click('a'), () => controller.fill('input', 'test'), () => controller.navigate(contents.getURL())]) {
      try { await action(); } catch (error) { blocked.push(error.code); }
    }
    return {
      title: await controller.getText('.job-title'),
      titles: await controller.getTexts('.job-title'),
      present: await controller.waitFor('.jobs', 100),
      absent: await controller.waitFor('.not-present', 10),
      screenshot: (await controller.screenshot()).startsWith('data:image/png;base64,'), blocked,
    };
  }, moduleUrl);
  expect(result.title).toBe('Python 后端开发工程师');
  expect(result.titles).toHaveLength(3);
  expect(result.present).toBe(true);
  expect(result.absent).toBe(false);
  expect(result.screenshot).toBe(true);
  expect(result.blocked).toEqual(['MANUAL_MODE', 'MANUAL_MODE', 'MANUAL_MODE']);
}
