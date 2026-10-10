// 固定搜索命令桥接：参数只能是关键词和页号，不能传入任意 URL 或脚本。
import type { BrowserController } from './BrowserController.js';
import type { BrowserResult } from '../../shared/browser.js';
import { searchBossJobs } from '../platforms/boss/BossSearchAdapter.js';

export async function searchJobs(
  browser: BrowserController,
  message: { request_id: string; payload: unknown },
  canWrite: () => boolean,
): Promise<BrowserResult> {
  try {
    const data = await searchBossJobs(browser, message.payload, canWrite);
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
        code: 'SEARCH_FAILED',
        message: error instanceof Error ? error.message : '搜索失败',
      },
    };
  }
}
