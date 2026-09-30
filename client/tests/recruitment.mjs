// 桌面端到端测试：仅在模拟站验证资料、分析、人工确认与消息发送闭环。

import { expect } from '@playwright/test';

export async function checkRecruitment(ui, web) {
  // ui 是工作台页面，web 是内嵌招聘网页；两边分别核对界面和实际消息。
  await ui.getByRole('button', { name: '求职资料与规则', exact: true }).first().click();
  await ui.getByLabel('求职姓名').fill('测试求职者');
  await ui
    .getByLabel('简历事实')
    .fill(
      '独立开发 Go 招聘服务，使用 MySQL、Redis 和 Docker。\n完成 Go IM 项目，使用 Kafka 和 gRPC。',
    );
  await ui.getByLabel('每周可实习天数').fill('5');
  await ui.getByLabel('至少可实习月数').fill('6');
  await ui.getByRole('button', { name: '保存求职资料', exact: true }).click();
  await expect
    .poll(() =>
      ui.evaluate(() =>
        window.desktop.recruitment('state').then((s) => s.config.profile.name),
      ),
    )
    .toBe('测试求职者');
  await ui.getByRole('button', { name: '职位与投递', exact: true }).click();
  await ui.getByRole('button', { name: '分析当前页面职位', exact: true }).click();
  const go = ui.locator('.read-job').filter({ hasText: 'Go 后端开发实习生' });
  await expect(go).toBeVisible();
  await expect(go.getByRole('button', { name: '生成投递确认卡' })).toBeDisabled();
  await go.getByRole('button', { name: '打开职位' }).click();
  await expect(
    web.getByRole('heading', { name: 'Go 后端开发实习生', exact: true }),
  ).toBeVisible();
  await ui.getByRole('button', { name: '分析当前页面职位', exact: true }).click();
  await expect(go.getByRole('button', { name: '生成投递确认卡' })).toBeEnabled();
  await go.getByRole('button', { name: '生成投递确认卡' }).click();
  // 审批卡生成后应无沟通记录，且 Manual 模式下不能确认执行。
  const card = ui.getByTestId('approval-card');
  await expect(card).toContainText('待确认');
  expect(
    await web.evaluate(
      () => JSON.parse(localStorage.getItem('mock-sessions') || '{}')['4'],
    ),
  ).toBeUndefined();
  await expect(card.getByRole('button', { name: '确认沟通并发送此消息' })).toBeDisabled();
  await ui.getByRole('combobox', { name: '运行模式' }).selectOption('copilot');
  await expect
    .poll(() => ui.evaluate(() => window.desktop.snapshot().then((s) => s.agent.mode)))
    .toBe('copilot');
  await ui.getByRole('button', { name: '恢复 Agent', exact: true }).click();
  await expect
    .poll(() => ui.evaluate(() => window.desktop.snapshot().then((s) => s.agent.status)))
    .toBe('running');
  const text = await card.getByLabel('待确认招呼语').inputValue();
  await card.getByRole('button', { name: '确认沟通并发送此消息' }).click();
  await expect(card).toContainText('已沟通，等待回复', { timeout: 15000 });
  expect(web.url()).toContain('#chat/4');
  // 不只检查成功提示，还检查模拟站保存的沟通次数与实际发送文本。
  const session = await web.evaluate(
    () => JSON.parse(localStorage.getItem('mock-sessions'))['4'],
  );
  expect(session.contacts).toBe(1);
  expect(session.messages.filter((item) => item.text === text)).toHaveLength(1);
  // 重放同一批准请求，验证持久化状态阻止重复发起沟通和补充消息。
  await ui.evaluate(async () => {
    const state = await window.desktop.recruitment('state');
    await window.desktop.recruitment('approve', {
      id: state.applications[0].id,
      approved: true,
    });
  });
  expect(
    (await web.evaluate(() => JSON.parse(localStorage.getItem('mock-sessions'))['4']))
      .messages,
  ).toHaveLength(2);
  await ui.getByRole('button', { name: '暂停 Agent', exact: true }).click();
  console.log(
    'PASS: profile → discovery → Go detail analysis → approval → contact → tailored greeting → persistent duplicate protection.',
  );
}
