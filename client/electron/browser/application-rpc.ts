// 投递 RPC 入口：校验固定载荷，将适配器结果包装成关联请求的回执。

import type { BrowserController } from './BrowserController.js';
import { BossApplicationAdapter } from '../platforms/boss/BossApplicationAdapter.js';
import {
  MockApplicationAdapter,
  type ApplicationPayload,
} from '../platforms/mock/MockApplicationAdapter.js';

// 操作绑定留在主进程适配器内，不向网页或渲染进程暴露。
const bossAdapters = new WeakMap<BrowserController, BossApplicationAdapter>();

export async function executeApplicationCommand(
  browser: BrowserController,
  origin: string,
  message: { request_id: string; command: string; payload: ApplicationPayload },
  canWrite: () => boolean,
) {
  try {
    const payload = message.payload;

    // 白名单载荷仅描述业务目标，不接受脚本或任意选择器。
    const keys = ['operation_id', 'job_url', 'source_id', 'title', 'company', 'message'];
    if (
      !payload ||
      keys.some((key) => typeof payload[key as keyof ApplicationPayload] !== 'string') ||
      Object.keys(payload).some((key) => !keys.includes(key))
    ) {
      throw new Error('无效的投递指令');
    }

    let adapter: MockApplicationAdapter | BossApplicationAdapter;
    if (new URL(payload.job_url).origin === 'https://www.zhipin.com') {
      if (!bossAdapters.has(browser))
        bossAdapters.set(browser, new BossApplicationAdapter(browser, canWrite));
      adapter = bossAdapters.get(browser)!;
    } else adapter = new MockApplicationAdapter(browser, origin, canWrite);
    const data = await adapter.execute(message.command, payload);
    return {
      type: 'browser_result',
      request_id: message.request_id,
      success: true,
      data,
    };
  } catch (error) {
    // 请求编号保持不变，Python 才能把失败回执关联到正在等待的调用。
    return {
      type: 'browser_result',
      request_id: message.request_id,
      success: false,
      error: {
        code: 'APPLICATION_FAILED',
        message: error instanceof Error ? error.message : '执行失败',
      },
    };
  }
}
