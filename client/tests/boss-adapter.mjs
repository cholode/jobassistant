// BOSS DOM 契约回归：网络路由完全替换为测试页面，绝不向真实招聘方发消息。
import { expect } from '@playwright/test';

export async function checkBossAdapter(desktop, ui, web, moduleRoot) {
  const url = 'https://www.zhipin.com/job_detail/local-contract-test.html';
  await web.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><meta charset="utf-8">
    <title>「Go开发实习生招聘」_测试公司招聘-BOSS直聘</title>
    <section id="detail"><div><h1>Go开发实习生</h1><span>200-300元/天</span><p>上海 5天/周 6个月 本科</p><button id="contact">立即沟通</button></div>
    <h3>职位描述</h3><p>使用 Go 和 MySQL 开发后端服务，团队今日活跃。</p>
    <div class="job-boss-info"><img alt="招聘者头像"><h2>张女士<span>3日内活跃</span></h2><p>测试公司 · HR</p></div>
    <h3>BOSS 安全提示</h3></section>
    <section id="chat" hidden><header>测试公司 · 人资专员</header><div><ul id="messages"></ul>
    <footer>发简历 换电话<div id="chat-input" contenteditable="true"></div><button id="send">发送</button><ul hidden><li>确认交换电话</li></ul></footer></div></section>
    <script>
      // 模拟完整聊天页较慢的初始化，回归原先四秒超时导致空会话的问题。
      document.querySelector('#contact').onclick=()=>{setTimeout(()=>{document.querySelector('#chat').hidden=false;}, 5000);};
      document.querySelector('#chat-input').addEventListener('input', event => { document.querySelector('#chat-input').dataset.nativeInput = String(event.isTrusted); });
      document.querySelector('#send').onclick=()=>{if(document.querySelector('#chat-input').dataset.nativeInput !== 'true') return; const li=document.createElement('li');li.innerText='已发送\\n'+document.querySelector('#chat-input').innerText;document.querySelector('#messages').append(li);document.querySelector('#chat-input').innerText='';};
    </script>`,
    }),
  );
  await ui.evaluate((url) => window.desktop.navigate(url), url);
  await expect(
    web.getByRole('heading', { name: 'Go开发实习生', exact: true }),
  ).toBeVisible();
  const result = await desktop.evaluate(
    async ({ BrowserWindow }, { moduleRoot, url }) => {
      const require = process.getBuiltinModule('module').createRequire(process.execPath);
      const load = (value) =>
        require(process.getBuiltinModule('url').fileURLToPath(value));
      const { ElectronBrowserController } = load(
        `${moduleRoot}/browser/ElectronBrowserController.js`,
      );
      const { BossRecruitmentAdapter } = load(
        `${moduleRoot}/platforms/boss/BossRecruitmentAdapter.js`,
      );
      const { BossApplicationAdapter } = load(
        `${moduleRoot}/platforms/boss/BossApplicationAdapter.js`,
      );
      const controller = new ElectronBrowserController(
        BrowserWindow.getAllWindows()[0].contentView.children[0].webContents,
        (value) => value === url || value === 'https://www.zhipin.com/web/geek/chat',
        () => true,
      );
      const reader = new BossRecruitmentAdapter();
      const before = await reader.read(controller);
      const adapter = new BossApplicationAdapter(controller, () => true);
      const payload = {
        operation_id: 'test',
        source_id: 'local-contract-test',
        job_url: url,
        title: 'Go开发实习生',
        company: '测试公司',
        message: '开发 Go 招聘后端项目，期待进一步沟通。',
      };
      await adapter.execute('CONTACT_HR', payload);
      // 更换公司应被拒绝，输入框和聊天内容不得被修改。
      let rejected = false;
      try {
        await adapter.execute('SEND_GREETING', { ...payload, company: '另一家公司' });
      } catch {
        rejected = true;
      }
      const after = await adapter.execute('SEND_GREETING', payload);
      // 完整会话不依赖招聘者头衔枚举，但仍应提取公司与岗位供发送核验。
      await BrowserWindow.getAllWindows()[0].contentView.children[0].webContents
        .executeJavaScript(`(() => {
        history.replaceState(null, '', '/web/geek/chat');
        document.querySelector('#detail').hidden = true;
        document.querySelector('#chat header').textContent = '测试公司 · CTO · Go开发实习生';
      })()`);
      const fullChat = await reader.inspect(controller);
      return { before, after, rejected, fullChat };
    },
    { moduleRoot, url },
  );
  expect(result.before.kind).toBe('job_detail');
  expect(result.before.jobs[0].company).toBe('测试公司');
  expect(result.before.jobs[0].recruiter_activity).toBe('3日内活跃');
  expect(result.rejected).toBe(true);
  expect(result.fullChat.page.kind).toBe('chat');
  expect(result.fullChat.context).toContain('测试公司 · CTO · Go开发实习生');
  expect(result.after.messages).toEqual([
    { sender: 'me', text: '开发 Go 招聘后端项目，期待进一步沟通。' },
  ]);
  expect(await web.locator('#chat-input').innerText()).toBe('');
  await web.unroute(url);
  console.log(
    'PASS: BOSS detail parsing, wrong-recipient rejection, contenteditable send and delivery receipt (offline fixture).',
  );
}
