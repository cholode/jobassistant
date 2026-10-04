// BOSS 投递状态机：每次动作核对目标，发送前核对正文，发送后必须取得己方消息回执。
import { BrowserError, type BrowserController } from '../../browser/BrowserController.js';
import type { ApplicationPayload } from '../mock/MockApplicationAdapter.js';
import { BossRecruitmentAdapter, type BossSnapshot } from './BossRecruitmentAdapter.js';

export class BossApplicationAdapter {
  private readonly reader = new BossRecruitmentAdapter();
  // 只在当前进程中保留已核对的会话；重启后不接受未完成操作的发送重放。
  private readonly contacts = new Map<string, string>();
  constructor(
    private readonly browser: BrowserController,
    private readonly canWrite: () => boolean,
  ) {}
  private guard() {
    if (!this.canWrite()) throw new BrowserError('PAUSED', 'Agent 已暂停');
  }
  private checkChat(snapshot: BossSnapshot, payload: ApplicationPayload) {
    const compact = (text: string) => text.replace(/\s+/g, '');
    if (snapshot.page.kind === 'verification')
      throw new BrowserError('VERIFICATION', snapshot.page.notice);
    const detail = snapshot.page.jobs[0];
    const sameJob =
      snapshot.context.includes(payload.title) ||
      (detail?.id === payload.source_id &&
        detail.title === payload.title &&
        detail.company === payload.company);
    if (
      snapshot.page.kind !== 'chat' ||
      !snapshot.input ||
      !snapshot.send ||
      !compact(snapshot.context).includes(compact(payload.company)) ||
      !sameJob
    )
      throw new BrowserError(
        'WRONG_CHAT',
        `未核实当前会话的公司和岗位，已停止（页面：${snapshot.page.kind}；会话：${snapshot.context.slice(0, 160)}）`,
      );
  }
  async execute(action: string, payload: ApplicationPayload) {
    this.guard();
    const current = new URL(await this.browser.getUrl());
    const jobUrl = new URL(payload.job_url);
    if (
      !this.reader.matches(current) ||
      !this.reader.matches(jobUrl) ||
      jobUrl.pathname !== `/job_detail/${payload.source_id}.html` ||
      !/^[A-Za-z0-9_-]+$/.test(payload.source_id)
    )
      throw new BrowserError('WRONG_JOB', '不是已核对的 BOSS 岗位');
    let snapshot = await this.reader.inspect(this.browser);
    if (action === 'CONTACT_HR') {
      const job = snapshot.page.jobs[0];
      if (
        current.pathname !== jobUrl.pathname ||
        snapshot.page.kind !== 'job_detail' ||
        !job ||
        job.id !== payload.source_id ||
        job.title !== payload.title ||
        job.company !== payload.company
      )
        throw new BrowserError('WRONG_JOB', '当前岗位与确认内容不一致');
      if (snapshot.contacted)
        throw new BrowserError('ALREADY_CONTACTED', '已沟通过该岗位，不重复发起');
      if (!snapshot.contact)
        throw new BrowserError('MISSING_CONTACT', '未找到立即沟通入口');
      this.guard();
      await this.browser.click(snapshot.contact);
      // 只读等待，不重试点击；跳转期间的读取异常可等待下一次快照。
      // 完整聊天页跳转和联系人加载比详情浮层慢；只延长只读等待，不重复点击。
      const deadline = Date.now() + 15000;
      let lastError: unknown;
      do {
        this.guard();
        try {
          snapshot = await this.reader.inspect(this.browser);
          this.checkChat(snapshot, payload);
          this.contacts.set(payload.operation_id, snapshot.context);
          break;
        } catch (error) {
          lastError = error;
          if (error instanceof BrowserError && error.code === 'VERIFICATION') throw error;
          if (Date.now() >= deadline) throw error;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } while (Date.now() < deadline);
      if (!this.contacts.has(payload.operation_id))
        throw lastError || new BrowserError('UNVERIFIED_CHAT', '未取得目标会话回执');
    } else if (action === 'SEND_GREETING') {
      this.checkChat(snapshot, payload);
      if (this.contacts.get(payload.operation_id) !== snapshot.context)
        throw new BrowserError('STALE_CHAT', '会话已变化或程序已重启，禁止继续发送');
      if (!payload.message.trim() || payload.message.length > 1500)
        throw new BrowserError('INVALID_MESSAGE', '消息长度不正确');
      const sent = (value: BossSnapshot) =>
        value.page.messages.some((x) => x.sender === 'me' && x.text === payload.message);
      if (!sent(snapshot)) {
        if (snapshot.draft && snapshot.draft !== payload.message)
          throw new BrowserError('EXISTING_DRAFT', '输入框已有其他草稿，请人工核对');
        this.guard();
        await this.browser.fill(snapshot.input, payload.message);
        snapshot = await this.reader.inspect(this.browser);
        this.checkChat(snapshot, payload);
        if (this.contacts.get(payload.operation_id) !== snapshot.context)
          throw new BrowserError('STALE_CHAT', '填写后会话已变化');
        this.guard();
        await this.browser.click(snapshot.send, {
          selector: snapshot.input,
          value: payload.message,
        });
        const deadline = Date.now() + 3000;
        do {
          snapshot = await this.reader.inspect(this.browser);
          this.checkChat(snapshot, payload);
          if (sent(snapshot)) break;
          await new Promise((resolve) => setTimeout(resolve, 200));
        } while (Date.now() < deadline);
        if (!sent(snapshot))
          throw new BrowserError('UNVERIFIED_SEND', '未取得送达回执，不自动重发');
      }
      this.contacts.delete(payload.operation_id);
    } else throw new BrowserError('UNSUPPORTED_COMMAND', '未知投递动作');
    return {
      ...snapshot.page,
      operation: { operation_id: payload.operation_id, action },
    };
  }
}
