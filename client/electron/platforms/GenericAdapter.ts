import type { BrowserController } from '../browser/BrowserController.js';
import type { PageReading } from '../../shared/browser.js';
import type { PlatformAdapter } from './PlatformAdapter.js';

// 通用降级只读取已渲染的正文，不假定真实招聘站的职位或聊天选择器。
export class GenericAdapter implements PlatformAdapter {
  matches() {
    return true;
  }
  async read(browser: BrowserController): Promise<PageReading> {
    const data = await browser.evaluate<{
      url: string;
      title: string;
      text: string;
      truncated: boolean;
    }>(`(() => {
      const text = document.body?.innerText || '';
      return { url: location.href, title: document.title.slice(0, 512), text: text.slice(0, 20000), truncated: text.length > 20000 };
    })()`);
    // 仅对明确验证提示做保守检测，不根据正文出现“登录”二字就判定异常。
    const verification =
      /请完成.{0,12}(验证|验证码)|拖动滑块|人机验证|安全验证|登录已失效/.test(data.text);
    return {
      ...data,
      platform: 'generic',
      kind: verification ? 'verification' : 'unknown',
      read_at: new Date().toISOString(),
      jobs: [],
      messages: [],
      notice: verification
        ? '检测到验证提示，请手动完成后重新读取。'
        : '当前网站使用通用正文读取；职位和聊天专用适配器尚未验证。',
    };
  }
}
