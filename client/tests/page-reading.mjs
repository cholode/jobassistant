import { expect } from '@playwright/test';

// 通过实际工作台按钮触发 Python → Electron RPC，不能用直接 DOM 读取替代。
export async function readPageFromPanel(ui, kind) {
  const button = ui.getByRole('button', { name: '读取当前页面', exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  const result = ui.getByTestId('page-reading');
  await expect(result).toBeVisible();
  await expect(result).toContainText(kind);
  return result;
}
