import type { BrowserCommand, BrowserResult } from '../../shared/browser.js';
import { BrowserError, type BrowserController } from './BrowserController.js';
import { GenericAdapter } from '../platforms/GenericAdapter.js';
import { MockRecruitmentAdapter } from '../platforms/mock/MockRecruitmentAdapter.js';

// RPC 白名单刻意不包含 evaluate、click、fill、navigate 等低层能力。
export async function executeBrowserCommand(browser: BrowserController, origin: string, message: BrowserCommand): Promise<BrowserResult> {
  const request_id = message.request_id;
  try {
    if (!['GET_PAGE_DATA', 'GET_JOB_DETAIL', 'GET_CHAT_MESSAGES'].includes(message.command)) throw new BrowserError('UNSUPPORTED_COMMAND', '当前阶段只支持读取页面');
    if (!message.payload || Object.keys(message.payload).some(key => key !== 'expected_url') || (message.payload.expected_url !== null && typeof message.payload.expected_url !== 'string')) throw new BrowserError('INVALID_PAYLOAD', '无效的读取参数');
    const revision = browser.getRevision();
    const url = await browser.getUrl();
    if (browser.isLoading()) throw new BrowserError('NOT_READY', '页面正在加载，请稍后重试');
    if (message.payload.expected_url && message.payload.expected_url !== url) throw new BrowserError('STALE_PAGE', '页面已变化，请重新读取');
    const adapters = [new MockRecruitmentAdapter(origin), new GenericAdapter()];
    const adapter = adapters.find(item => item.matches(new URL(url)))!;
    const data = await adapter.read(browser);
    if (revision !== browser.getRevision() || url !== await browser.getUrl() || data.url !== url) throw new BrowserError('STALE_PAGE', '页面已变化，请重新读取');
    if (message.command === 'GET_JOB_DETAIL' && data.kind !== 'job_detail') throw new BrowserError('WRONG_PAGE', '当前页面不是已适配的职位详情页');
    if (message.command === 'GET_CHAT_MESSAGES' && data.kind !== 'chat') throw new BrowserError('WRONG_PAGE', '当前页面不是已适配的聊天页');
    return { type: 'browser_result', request_id, success: true, data };
  } catch (error) {
    return { type: 'browser_result', request_id, success: false, error: { code: error instanceof BrowserError ? error.code : 'READ_FAILED', message: error instanceof Error ? error.message.slice(0, 1000) : '读取失败' } };
  }
}
