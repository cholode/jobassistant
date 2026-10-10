// Phase 6 桌面验收：走真实 IPC / HTTP / WebSocket，写入只发生在本地模拟站。
import { expect } from '@playwright/test';

export async function checkPhase6(ui, web) {
  await ui.getByRole('button', { name: '模拟招聘站', exact: true }).click();
  await web.getByRole('link').filter({ hasText: 'Golang 后端实习生' }).click();
  await ui.getByRole('button', { name: '职位与投递', exact: true }).click();
  await ui.getByRole('button', { name: '分析当前页面职位', exact: true }).click();
  await expect(ui.locator('.read-job').filter({ hasText: '星桥演示科技' })).toBeVisible();
  await ui.getByRole('button', { name: '开始投递', exact: true }).click();
  await expect(ui.getByLabel('岗位来源')).toHaveValue('search');
  await expect(ui.getByLabel('候选职位链接')).toHaveCount(0);
  await expect(
    ui.getByRole('checkbox', { name: '每投一岗停下来复盘' }),
  ).not.toBeChecked();
  await ui.getByLabel('岗位来源').selectOption('selected');
  await ui.getByRole('checkbox', { name: '每投一岗停下来复盘' }).check();
  const start = ui.getByRole('button', { name: '开始投递所选岗位', exact: true });
  await expect(start).toBeDisabled();
  await expect(
    ui.getByText('请粘贴职位链接，或展开下方列表选择已分析岗位。'),
  ).toBeVisible();
  await ui.locator('summary').filter({ hasText: '选择已分析岗位' }).click();
  await ui.getByRole('checkbox', { name: /星桥演示科技/ }).check();
  await expect(start).toBeDisabled();
  await ui.getByRole('button', { name: 'Auto 自动执行' }).click();
  await expect(ui.getByText('请点击顶部“恢复 Agent”。')).toBeVisible();
  await ui.getByRole('button', { name: '恢复 Agent', exact: true }).click();
  await expect(start).toBeEnabled();
  await start.click();
  await expect(ui.getByLabel('本岗复盘意见')).toBeVisible({ timeout: 20000 });
  // 实时状态来自 WebSocket，等待复盘时不能继续显示“正在发送”。
  const activity = ui.getByRole('region', { name: 'Agent 当前任务' });
  await expect(activity).toContainText('等待本岗复盘');
  await expect(activity).toContainText('星桥演示科技');
  await expect(activity).toContainText('已沟通 1/20');
  await ui
    .getByLabel('本岗复盘意见')
    .fill('已核对目标岗位与实际消息，无私人缺口；发送回执正确。');
  await ui.getByRole('button', { name: '复盘通过，继续下一岗', exact: true }).click();
  await expect(
    ui.getByText('本轮结束 · 候选岗位已处理完，未达到目标可补充链接'),
  ).toBeVisible({
    timeout: 20000,
  });
  await expect(activity).toContainText('本轮任务已结束');
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
  await expect(activity).toBeVisible();
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
