// 完整自主流程：测试只点击启动，搜索/翻页/详情/沟通均由应用完成，网络全部离线替换。
import { expect } from '@playwright/test';

export async function checkAutoSearch(ui, web) {
  const visits = [];
  const routePattern = 'https://www.zhipin.com/**';
  await web.route(routePattern, async (route) => {
    const url = new URL(route.request().url());
    visits.push(url.pathname + url.search);
    if (url.pathname === '/web/geek/job') {
      const key =
        url.searchParams.get('page') === '1' ? 'inactive-search' : 'active-search';
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><meta charset="utf-8"><title>搜索结果</title>
        <a href="/job_detail/${key}.html?tracking=offline">Go 后端实习生</a>
        <a hidden href="/job_detail/hidden-search.html">隐藏推荐</a>
        <a href="https://example.com/job_detail/unsafe.html">外部链接</a>`,
      });
      return;
    }
    if (!/^\/job_detail\/(in)?active-search\.html$/.test(url.pathname)) {
      await route.abort();
      return;
    }
    const activity = url.pathname.includes('inactive') ? '月内活跃' : '3日内活跃';
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><meta charset="utf-8">
      <title>「Go开发实习生招聘」_自主搜索演示公司招聘-BOSS直聘</title>
      <section><div><h1>Go开发实习生</h1><span>200-300元/天</span><p>上海 经验不限 本科</p><button id="contact">立即沟通</button></div>
      <h3>职位描述</h3><p>使用 Go 和 MySQL 开发后端服务，实习至少6个月，每周5天。</p>
      <div class="job-boss-info"><h2>张女士<span>${activity}</span></h2><p>自主搜索演示公司 · HR</p></div>
      <h3>BOSS 安全提示</h3></section>
      <section id="chat" hidden><header>自主搜索演示公司 · HR · Go开发实习生</header><ul id="messages"></ul>
      <div id="chat-input" contenteditable="true"></div><button id="send">发送</button></section>
      <script>
        document.querySelector('#contact').onclick=()=>{document.querySelector('#chat').hidden=false;};
        document.querySelector('#send').onclick=()=>{const li=document.createElement('li');li.innerText='已发送\\n'+document.querySelector('#chat-input').innerText;document.querySelector('#messages').append(li);document.querySelector('#chat-input').innerText='';};
      </script>`,
    });
  });
  try {
    await ui.evaluate(async () => {
      const { config } = await window.desktop.recruitment('state');
      config.preferences.daily_limit = 0;
      config.preferences.keywords = ['Go'];
      await window.desktop.recruitment('config', config);
    });
    await ui.getByRole('button', { name: '开始投递', exact: true }).click();
    await expect(ui.getByLabel('岗位来源')).toHaveValue('search');
    await ui.getByLabel('本轮目标沟通数').fill('1');
    await ui.getByRole('button', { name: 'Auto 自动执行' }).click();
    await ui.getByRole('button', { name: '恢复 Agent', exact: true }).click();
    await ui
      .getByRole('button', { name: '启动 Agent 自动找岗并沟通', exact: true })
      .click();
    await expect(ui.getByText('本轮结束 · 已达到本轮目标')).toBeVisible({
      timeout: 30000,
    });
    expect(visits.filter((url) => url.startsWith('/web/geek/job'))).toHaveLength(2);
    expect(visits.some((url) => url.includes('hidden-search'))).toBe(false);
    await expect(web.locator('#messages li')).toHaveCount(1);
    const state = await ui.evaluate(() => window.desktop.recruitment('console'));
    expect(state.auto.sent_count).toBe(1);
    expect(state.auto.review_each).toBe(false);
    expect(
      state.auto.items.some(
        (item) => item.status === 'skipped' && item.reason.includes('活跃'),
      ),
    ).toBe(true);
    await ui.getByRole('button', { name: '停止自动任务', exact: true }).click();
    console.log(
      'PASS: autonomous search → inactive recruiter skipped → next page → verified communication, without supplied URLs or manual review (offline).',
    );
  } finally {
    await web.unroute(routePattern);
  }
}
