// 自动队列仅允许打开已支持平台的具体岗位，不接受任意导航或脚本。
import type { BrowserController } from './BrowserController.js';

export async function openJob(
  browser: BrowserController,
  origin: string,
  message: { request_id: string; payload: unknown },
  canWrite: () => boolean,
) {
  try {
    const payload = message.payload as { url?: unknown };
    if (
      !payload ||
      Object.keys(payload).some((key) => key !== 'url') ||
      typeof payload.url !== 'string'
    )
      throw new Error('无效岗位地址');
    const url = new URL(payload.url);
    const boss =
      url.origin === 'https://www.zhipin.com' &&
      /^\/job_detail\/[A-Za-z0-9_-]+\.html$/.test(url.pathname) &&
      !url.search &&
      !url.hash;
    if (
      !boss &&
      !(
        url.origin === origin &&
        /^\/mock\/$/.test(url.pathname) &&
        /^#job\/[\w-]+$/.test(url.hash)
      )
    )
      throw new Error('未支持的平台岗位导航');
    if (!canWrite()) throw new Error('已暂停，禁止自动导航');
    await browser.navigate(url.href);
    if (!(await browser.waitFor(boss ? 'h1' : '[data-job-id]', 5000)))
      throw new Error('详情尚未加载');
    const data = {
      url: await browser.getUrl(),
      title: await browser.getPageTitle(),
      platform: boss ? 'boss' : 'mock',
      kind: 'unknown',
      text: '',
      truncated: false,
      read_at: new Date().toISOString(),
      jobs: [],
      messages: [],
    };
    return {
      type: 'browser_result',
      request_id: message.request_id,
      success: true,
      data,
    };
  } catch (error) {
    return {
      type: 'browser_result',
      request_id: message.request_id,
      success: false,
      error: {
        code: 'NAVIGATION_FAILED',
        message: error instanceof Error ? error.message : '岗位导航失败',
      },
    };
  }
}
