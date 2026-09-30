import type { BrowserController } from '../../browser/BrowserController.js';
import { BrowserError } from '../../browser/BrowserController.js';
import type { PageReading } from '../../../shared/browser.js';
import type { PlatformAdapter } from '../PlatformAdapter.js';
import { selectors } from './selectors.js';

export class MockRecruitmentAdapter implements PlatformAdapter {
  constructor(private readonly origin: string) {}
  matches(url: URL) {
    return url.origin === this.origin && url.pathname.startsWith('/mock/');
  }
  async read(browser: BrowserController): Promise<PageReading> {
    if (!(await browser.waitFor(selectors.content, 1500)))
      throw new BrowserError('NOT_READY', '模拟站尚未加载');
    // 一次 DOM 读取生成快照，避免多个字段分别读取时混入不同页面的数据。
    return browser.evaluate<PageReading>(`(() => {
      const s = ${JSON.stringify(selectors)};
      const text = document.body?.innerText || '';
      const clean = (root, selector, max = 500) => (root.querySelector(selector)?.innerText || '').trim().slice(0, max);
      const company = root => { const el = root.querySelector(s.company); return el ? Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim().slice(0, 500) : ''; };
      const job = (root, id, url, detail) => ({ id: id.slice(0, 200), url, title: clean(root, detail ? s.heading : s.title), company: company(root), salary: clean(root, s.salary, 200), location: clean(root, s.location), tags: Array.from(root.querySelectorAll(s.tags)).slice(0, 30).map(el => el.innerText.slice(0, 100)), description: detail ? root.innerText.slice(0, 12000) : '' });
      const data = { url: location.href, title: document.title.slice(0, 512), platform: 'mock', kind: 'job_list', text: text.slice(0, 20000), truncated: text.length > 20000, read_at: new Date().toISOString(), jobs: [], messages: [], notice: '本地模拟数据，不代表真实招聘信息。' };
      if (location.hash.startsWith('#job/')) {
        data.kind = 'job_detail';
        const el = document.querySelector(s.detail);
        if (!el) throw new Error('Job detail not ready');
        data.jobs = [job(el, location.hash.split('/')[1], location.href, true)];
      } else if (location.hash === '#chat' || location.hash.startsWith('#chat/')) {
        data.kind = 'chat';
        data.messages = Array.from(document.querySelectorAll(s.messages)).slice(-100).map(el => ({ sender: el.classList.contains(s.ownMessage) ? 'me' : 'hr', text: el.innerText.slice(0, 4000) }));
      } else {
        data.jobs = Array.from(document.querySelectorAll(s.cards)).slice(0, 100).map(el => job(el, new URL(el.href).hash.split('/')[1] || '', el.href, false));
      }
      return data;
    })()`);
  }
}
