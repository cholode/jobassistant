// 模拟站投递适配器：封装 DOM 操作，逐步检查运行权限和目标会话。

import { BrowserError, type BrowserController } from '../../browser/BrowserController.js';
import { MockRecruitmentAdapter } from './MockRecruitmentAdapter.js';

export interface ApplicationPayload {
  operation_id: string;
  job_url: string;
  source_id: string;
  title: string;
  company: string;
  message: string;
}

// 只包含经测试的模拟站写入；真实网站需要独立适配器，不能复用猜测的选择器。
export class MockApplicationAdapter {
  constructor(
    private readonly browser: BrowserController,
    private readonly origin: string,
    private readonly canWrite: () => boolean,
  ) {}
  private guard() {
    if (!this.canWrite())
      throw new BrowserError('PAUSED', '已暂停或未进入 Copilot，操作已取消');
  }
  async execute(action: string, payload: ApplicationPayload) {
    this.guard();
    // 同时核验当前页与批准的职位地址，确保操作限定在本地模拟站。
    const current = new URL(await this.browser.getUrl());
    const jobUrl = new URL(payload.job_url);
    if (
      current.origin !== this.origin ||
      jobUrl.origin !== this.origin ||
      !current.pathname.startsWith('/mock/') ||
      !/^[a-zA-Z0-9_-]+$/.test(payload.source_id)
    )
      throw new BrowserError('UNSUPPORTED_PLATFORM', '此平台尚未开放自动沟通');
    const reader = new MockRecruitmentAdapter(this.origin);
    if (action === 'CONTACT_HR') {
      if (current.href !== payload.job_url || jobUrl.hash !== `#job/${payload.source_id}`)
        throw new BrowserError('STALE_PAGE', '岗位页面已变化');
      const page = await reader.read(this.browser);
      const job = page.jobs[0];
      if (
        !job ||
        job.title !== payload.title ||
        job.company !== payload.company ||
        job.id !== payload.source_id
      )
        throw new BrowserError('WRONG_JOB', '公司或岗位不一致');
      const selector = `[data-contact-id="${payload.source_id}"]`;
      if ((await this.browser.getText(selector)).includes('继续沟通'))
        throw new BrowserError(
          'ALREADY_CONTACTED',
          '已沟通过该岗位，请手动查看，不重复发起',
        );
      this.guard();
      await this.browser.click(selector);
    } else if (action !== 'SEND_GREETING')
      throw new BrowserError('UNSUPPORTED_COMMAND', '不支持的操作');
    // 动作后验证正确的会话；没有确认公司和岗位就不能发送消息。
    const chat = `[data-chat-job-id="${payload.source_id}"]`;
    if (!(await this.browser.waitFor(chat, 3000)))
      throw new BrowserError('UNVERIFIED_CHAT', '未能确认目标会话');
    const chatText = await this.browser.getText(chat);
    if (!chatText.includes(payload.company) || !chatText.includes(payload.title))
      throw new BrowserError('WRONG_CHAT', '会话与确认的公司或岗位不一致');
    if (action === 'SEND_GREETING') {
      if (!payload.message.trim() || payload.message.length > 1500)
        throw new BrowserError('INVALID_MESSAGE', '招呼语长度不正确');
      const page = await reader.read(this.browser);
      // 先确认是否已存在同样的补充消息；平台默认招呼语不会被再次发送。
      if (
        !page.messages.some(
          (item) => item.sender === 'me' && item.text === payload.message,
        )
      ) {
        this.guard();
        await this.browser.fill(`${chat} .chat-form input`, payload.message);
        this.guard();
        // 点击时再次同步检查输入值，防止填写后被修改却发送了未批准的文本。
        await this.browser.click(`${chat} .chat-form button`, {
          selector: `${chat} .chat-form input`,
          value: payload.message,
        });
      }
    }
    const data = await reader.read(this.browser);
    if (
      action === 'SEND_GREETING' &&
      !data.messages.some((item) => item.sender === 'me' && item.text === payload.message)
    )
      throw new BrowserError('UNVERIFIED_SEND', '未验证发送结果，禁止自动重发');
    return { ...data, operation: { operation_id: payload.operation_id, action } };
  }
}
