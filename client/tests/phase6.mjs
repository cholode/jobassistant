// Phase 6 桌面验收：走真实 IPC / HTTP / WebSocket，写入只发生在本地模拟站。
import { expect } from '@playwright/test';

export async function checkPhase6(ui, web) {
  await ui.getByRole('button', { name: '模拟招聘站', exact: true }).click();
  await web.getByRole('link').filter({ hasText: 'Golang 后端实习生' }).click();
  await ui.getByRole('button', { name: '职位与投递', exact: true }).click();
  await ui.getByRole('button', { name: '分析当前页面职位', exact: true }).click();
  await expect(ui.locator('.read-job').filter({ hasText: '星桥演示科技' })).toBeVisible();
  await ui.getByRole('combobox', { name: '运行模式' }).selectOption('auto');
  await ui.getByRole('button', { name: '恢复 Agent', exact: true }).click();
  await ui.getByRole('button', { name: '自动任务看板', exact: true }).click();
  await ui.getByText(/选择已分析岗位/).click();
  await ui.getByRole('checkbox', { name: /星桥演示科技/ }).check();
  await ui.getByRole('button', { name: '启动所选岗位自动沟通', exact: true }).click();
  await expect(ui.getByLabel('本岗复盘意见')).toBeVisible({ timeout: 20000 });
  await ui
    .getByLabel('本岗复盘意见')
    .fill('已核对目标岗位与实际消息，无私人缺口；发送回执正确。');
  await ui.getByRole('button', { name: '复盘通过，继续下一岗', exact: true }).click();
  await expect(
    ui.getByText('本轮结束 · 候选岗位已处理完，未达到目标可补充链接'),
  ).toBeVisible({
    timeout: 20000,
  });
  const messages = await web.evaluate(
    () => JSON.parse(localStorage.getItem('mock-sessions'))['5'],
  );
  expect(messages.contacts).toBe(1);
  expect(messages.messages).toHaveLength(2);
  expect(messages.messages[1].text).not.toContain('未体现');
  await ui.getByRole('button', { name: '停止自动任务', exact: true }).click();
  await expect
    .poll(() => ui.evaluate(() => window.desktop.snapshot().then((s) => s.agent.status)))
    .toBe('paused');
  await ui.getByRole('button', { name: '投递历史与核对', exact: true }).click();
  await ui.getByLabel('筛选投递历史').fill('星桥');
  await expect(ui.locator('.read-job')).toHaveCount(1);
  await expect(ui.locator('.read-job')).toContainText('WAITING_REPLY');
  await ui.getByRole('button', { name: '沟通消息', exact: true }).click();
  await ui.getByRole('button', { name: '记录当前聊天', exact: true }).click();
  await expect(ui.locator('.read-job')).toContainText(messages.messages[1].text);
  await ui.getByRole('button', { name: 'Agent 执行追踪', exact: true }).click();
  await expect(ui.getByRole('heading', { name: 'Agent 执行追踪' })).toBeVisible();
  await expect(ui.locator('details.read-job').first()).toBeVisible();
  await ui.getByRole('button', { name: '模型设置', exact: true }).click();
  await expect(ui.getByLabel('API Key（留空保留原密钥）')).toHaveValue('');
  console.log(
    'PASS: Auto queue → verified send → immediate stop → history → chat snapshot → tracing → redacted settings.',
  );
}
