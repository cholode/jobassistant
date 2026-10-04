// BOSS 专用快照：依据已观察到的标题、详情区和聊天输入框读取当前页面。
// 不调用站点私有接口；无法定位当前会话时不把联系人列表当作消息。
import type { BrowserController } from '../../browser/BrowserController.js';
import type { PageReading } from '../../../shared/browser.js';
import type { PlatformAdapter } from '../PlatformAdapter.js';

export interface BossSnapshot {
  page: PageReading;
  context: string;
  input: string;
  draft: string;
  send: string;
  contact: string;
  contacted: boolean;
}

// 此函数在 Electron 隔离上下文执行，只生成快照和精确元素路径，不写网页。
function inspectBoss(): BossSnapshot {
  const visible = (el: Element) =>
    el instanceof HTMLElement && el.getClientRects().length > 0;
  const textOf = (el: Element | null) => ((el as HTMLElement)?.innerText || '').trim();
  // 输入工具栏也有隐藏菜单列表；消息列表必须可见且位于输入框之前。
  const messageList = (root: HTMLElement) => {
    const editor = root.querySelector(
      '#chat-input, textarea[placeholder="请简短描述您的问题"]',
    );
    return Array.from(root.querySelectorAll('ul')).find(
      (list) =>
        visible(list) &&
        editor &&
        Boolean(list.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
  };
  const chatHeader = (root: HTMLElement) => {
    const list = messageList(root);
    if (!list) return '';
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEndBefore(list);
    return range.toString().replace(/\s+/g, ' ').trim().slice(0, 2000);
  };
  const path = (el: Element | null): string => {
    if (!el) return '';
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts: string[] = [];
    for (
      let node: Element | null = el;
      node && node !== document.documentElement;
      node = node.parentElement
    ) {
      const index = Array.from(node.parentElement?.children || []).indexOf(node) + 1;
      parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`);
    }
    return `html > ${parts.join(' > ')}`;
  };
  const fullText = document.body?.innerText || '';
  const page: PageReading = {
    url: location.href,
    title: document.title.slice(0, 512),
    platform: 'boss',
    kind: 'unknown',
    text: fullText.slice(0, 20000),
    truncated: fullText.length > 20000,
    read_at: new Date().toISOString(),
    jobs: [],
    messages: [],
    notice: '',
  };
  const result: BossSnapshot = {
    page,
    context: '',
    input: '',
    draft: '',
    send: '',
    contact: '',
    contacted: false,
  };
  if (
    /请完成.{0,12}(验证|验证码)|拖动滑块|人机验证|安全验证|登录已失效|今日.{0,10}沟通.{0,8}上限/.test(
      fullText,
    )
  ) {
    page.kind = 'verification';
    page.notice = '检测到验证或平台上限，请人工处理。';
    return result;
  }
  const identity = location.pathname.match(/^\/job_detail\/([A-Za-z0-9_-]+)\.html$/);
  const titleParts = document.title.match(/^「(.+)招聘」_(.+)招聘-BOSS直聘$/);
  if (identity && titleParts) {
    const title = titleParts[1];
    const company = titleParts[2];
    const heading = Array.from(document.querySelectorAll('h1')).find(
      (el) => textOf(el) === title,
    );
    const start = fullText.indexOf('职位描述');
    const end = fullText.indexOf('BOSS 安全提示', start);
    const salary = fullText
      .slice(fullText.indexOf(title) + title.length)
      .match(/\d+(?:\.\d+)?\s*[-–~至]\s*\d+(?:\.\d+)?\s*(?:元\/天|[kK])(?:[^\n]*)/);
    const header = heading?.parentElement?.parentElement;
    const headerText = textOf(header || null);
    // 只读取当前招聘者名片中的活跃标记，职位正文或推荐岗位的“今日活跃”不能作证。
    const activityLabels = Array.from(document.querySelectorAll('.job-boss-info'))
      .filter(visible)
      .flatMap((card) => Array.from(card.querySelectorAll('*')))
      .filter((el) => visible(el) && el.children.length === 0)
      .map(textOf)
      .filter((text) => /^(?:当前在线|在线|刚刚在线|.{1,20}活跃)$/.test(text));
    const recruiterActivity = [...new Set(activityLabels)];
    if (heading && start >= 0 && end > start && salary && headerText.includes(title)) {
      page.kind = 'job_detail';
      page.jobs = [
        {
          id: identity[1],
          title,
          company,
          salary: salary[0].slice(0, 200),
          location: headerText
            .replace(title, '')
            .replace(salary[0], '')
            .trim()
            .slice(0, 500),
          url: location.origin + location.pathname,
          tags: [],
          description: fullText.slice(start, end).slice(0, 12000),
          recruiter_activity: recruiterActivity.length === 1 ? recruiterActivity[0] : '',
        },
      ];
    }
    const links = Array.from(document.querySelectorAll('a,button')).filter(visible);
    result.contact = path(links.find((el) => textOf(el) === '立即沟通') || null);
    result.contacted = links.some((el) => textOf(el) === '继续沟通');
    if (result.contacted) page.notice = '已沟通过该岗位，跳过重复联系';
    if (/该职位已关闭|职位已下线|职位已停止招聘/.test(fullText))
      page.notice = '岗位已关闭，跳过';
  }
  const input = Array.from(
    document.querySelectorAll('#chat-input, textarea[placeholder="请简短描述您的问题"]'),
  ).find(visible);
  if (input) {
    // 找到只包含当前会话的最小区域，联系人搜索框出现即停止向外扩展。
    let root: HTMLElement | null = input.parentElement;
    let send: Element | undefined;
    while (root && root !== document.body) {
      if (root.querySelector('input[placeholder*="联系人"]')) break;
      send = Array.from(root.querySelectorAll('button,a,span,div'))
        .filter(visible)
        .find(
          (el) =>
            textOf(el) === '发送' &&
            !Array.from(el.children).some((child) => textOf(child) === '发送'),
        );
      if (
        send &&
        messageList(root) &&
        // 详情页浮层按已读取的公司绑定，不能用有限的 HR 头衔枚举判断身份。
        // 脱离详情的会话读取仍保守识别；真正发送另外核对公司、岗位和操作编号。
        (page.jobs[0]?.company
          ? chatHeader(root)
              .replace(/\s+/g, '')
              .includes(page.jobs[0].company.replace(/\s+/g, ''))
          : location.pathname === '/web/geek/chat'
            ? Boolean(chatHeader(root).trim())
            : /查看职位|人事|人资|招聘|主管|负责人|创始人|经理|总监|HR/i.test(
                chatHeader(root),
              ))
      )
        break;
      root = root.parentElement;
    }
    if (
      root &&
      root !== document.body &&
      !root.querySelector('input[placeholder*="联系人"]') &&
      send
    ) {
      // 只取消息列表之前的会话标题，不混入底部隐藏的换电话等确认框。
      result.context = chatHeader(root);
      result.input = path(input);
      result.draft = input instanceof HTMLTextAreaElement ? input.value : textOf(input);
      result.send = path(send);
      // 仅将带明确送达/已读标识的消息判为己方；其余保守标为未知。
      page.messages = Array.from(messageList(root)?.querySelectorAll('li') || [])
        .filter(visible)
        .filter((el) => !textOf(el).includes('你与该职位竞争者PK情况'))
        .slice(-100)
        .map((el) => {
          const text = textOf(el);
          const own = /(?:^|\n)(?:送达|已读|已发送)(?:\n|$)/.test(text);
          return {
            sender: own ? ('me' as const) : ('unknown' as const),
            text: text
              .replace(/^(?:\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2})\s*/, '')
              .replace(/(?:^|\n)(?:送达|已读|已发送)(?:\n|$)/g, '')
              .trim()
              .slice(0, 4000),
          };
        });
      page.kind = 'chat';
      page.title = result.context.slice(0, 512);
      page.text = textOf(root).slice(0, 20000);
    }
  }
  if (page.kind === 'unknown')
    page.notice = 'BOSS 页面结构未核实，请打开独立职位详情或当前聊天后重试。';
  return result;
}

export class BossRecruitmentAdapter implements PlatformAdapter {
  matches(url: URL) {
    return url.origin === 'https://www.zhipin.com';
  }
  async inspect(browser: BrowserController): Promise<BossSnapshot> {
    return browser.evaluate(`(${inspectBoss.toString()})()`);
  }
  async read(browser: BrowserController) {
    return (await this.inspect(browser)).page;
  }
}
