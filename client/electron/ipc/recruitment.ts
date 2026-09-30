// 招聘 IPC 代理：可信工作台通过固定业务动作访问本地后端。

import type { IpcMain } from 'electron';

// 仅注册固定业务用例，不向 Renderer 开放任意后端路径或令牌。
export function registerRecruitmentIPC(
  ipc: IpcMain,
  trusted: (event: Electron.IpcMainInvokeEvent) => boolean,
  backend: string,
  token: string,
) {
  ipc.handle('recruitment:request', async (event, action: unknown, payload: unknown) => {
    if (!trusted(event)) throw new Error('Untrusted IPC sender');

    const routes: Record<string, { path: string; method: string }> = {
      state: { path: '/state', method: 'GET' },
      config: { path: '/config', method: 'PUT' },
      discover: { path: '/discover', method: 'POST' },
      prepare: { path: '/prepare', method: 'POST' },
    };

    let route = routes[String(action)];
    let body = payload;

    // 审批路径只接受记录 ID；不允许渲染进程自行拼接后端地址。
    if (action === 'approve') {
      const value = payload as { id?: unknown; approved?: unknown; message?: unknown };
      if (
        !value ||
        typeof value.id !== 'string' ||
        !/^[0-9a-f-]{36}$/.test(value.id) ||
        typeof value.approved !== 'boolean'
      ) {
        throw new Error('无效确认参数');
      }
      route = { path: `/applications/${value.id}/approve`, method: 'POST' };
      body = { approved: value.approved, message: value.message };
    }

    if (!route) throw new Error('不支持的招聘操作');

    const response = await fetch(`${backend}/recruitment${route.path}`, {
      method: route.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Job-Agent-Token': token,
      },
      body: route.method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(120000),
    });

    // 后端校验失败时提取可读错误，由界面统一显示。
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        typeof data.detail === 'string' ? data.detail : '请求未通过校验，请检查输入',
      );
    }
    return data;
  });
}
