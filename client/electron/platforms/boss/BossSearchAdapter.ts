// 自主寻岗只访问公开搜索页，从可见职位链接读取候选，不使用站点私有接口。
import type { BrowserController } from '../../browser/BrowserController.js';
import type { PageReading } from '../../../shared/browser.js';

function readSearch(): PageReading {
  const text = document.body?.innerText || '';
  const result: PageReading = {
    url: location.href,
    title: document.title.slice(0, 512),
    platform: 'boss',
    kind: 'unknown',
    text: text.slice(0, 20000),
    truncated: text.length > 20000,
    read_at: new Date().toISOString(),
    jobs: [],
    messages: [],
    notice: '',
  };
  const visible = (el: Element) => el.getClientRects().length > 0;
  if (
    /请完成.{0,12}(验证|验证码)|拖动滑块|人机验证|安全验证|登录已失效|扫码登录|短信登录|今日.{0,10}沟通.{0,8}上限/.test(
      text,
    )
  ) {
    result.kind = 'verification';
    result.notice = '搜索需要登录、人工验证或已达平台上限，请处理后重新启动。';
    return result;
  }
  if (location.pathname !== '/web/geek/job') return result;
  const seen = new Set<string>();
  for (const link of Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href]'),
  ).filter(visible)) {
    const url = new URL(link.href, location.href);
    const match = url.pathname.match(/^\/job_detail\/([A-Za-z0-9_-]+)\.html$/);
    if (url.origin !== 'https://www.zhipin.com' || !match || seen.has(match[1])) continue;
    seen.add(match[1]);
    result.jobs.push({
      id: match[1],
      url: url.origin + url.pathname,
      title: (link.innerText || '').trim().slice(0, 500),
      company: '',
      salary: '',
      location: '',
      tags: [],
      description: '',
    });
    if (result.jobs.length === 100) break;
  }
  // 没有职位链接并不等于搜索结束，必须有页面明确的空结果提示。
  if (
    result.jobs.length ||
    /暂无相关职位|没有找到相关职位|未找到相关职位|暂无符合条件的职位/.test(text)
  )
    result.kind = 'job_list';
  return result;
}

export async function searchBossJobs(
  browser: BrowserController,
  payload: unknown,
  canWrite: () => boolean,
): Promise<PageReading> {
  const value = payload as { keyword?: unknown; page?: unknown };
  if (
    !value ||
    Object.keys(value).some((key) => !['keyword', 'page'].includes(key)) ||
    typeof value.keyword !== 'string' ||
    !value.keyword.trim() ||
    value.keyword.length > 100 ||
    typeof value.page !== 'number' ||
    !Number.isInteger(value.page) ||
    value.page < 1 ||
    value.page > 30
  )
    throw new Error('无效搜索参数');
  if (!canWrite()) throw new Error('已暂停，禁止自动搜索');
  const target = new URL('https://www.zhipin.com/web/geek/job');
  target.searchParams.set('query', value.keyword.trim());
  target.searchParams.set('city', '100010000'); // 全国搜索，城市与经验等条件在详情中复核。
  target.searchParams.set('page', String(value.page));
  await browser.navigate(target.href);
  const revision = browser.getRevision();
  const expected = await browser.getUrl();
  if (
    new URL(expected).origin !== target.origin ||
    new URL(expected).pathname !== target.pathname
  )
    throw new Error('搜索页发生跳转，请检查登录或验证状态');
  for (let attempt = 0; attempt < 40; attempt++) {
    if (!canWrite()) throw new Error('已暂停，搜索停止');
    if (revision !== browser.getRevision() || expected !== (await browser.getUrl()))
      throw new Error('搜索期间页面已变化，请重新启动');
    const page = await browser.evaluate<PageReading>(`(${readSearch.toString()})()`);
    if (
      revision !== browser.getRevision() ||
      page.url !== expected ||
      expected !== (await browser.getUrl())
    )
      throw new Error('搜索结果已过期，请重新启动');
    if (page.kind === 'verification') throw new Error(page.notice);
    if (page.kind === 'job_list') return page;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('搜索结果未加载或页面结构不受支持，已停止，请检查网页');
}
