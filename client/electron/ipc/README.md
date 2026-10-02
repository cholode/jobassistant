# 招聘 IPC 接口

`registerRecruitmentIPC(ipc: IpcMain, trusted, backend: string, token: string)` 注册 recruitment:request。trusted 签名为 `(event: Electron.IpcMainInvokeEvent) => boolean`；返回 false 时抛 Untrusted IPC sender。

Renderer 使用 `window.desktop.recruitment(action, payload?)`：

| action | payload | HTTP 映射 | 结果 |
| --- | --- | --- | --- |
| state | 无 | GET /recruitment/state | RecruitmentState |
| config | RecruitmentConfig | PUT /recruitment/config | RecruitmentState |
| discover | 无 | POST /recruitment/discover | 本轮岗位记录数组 |
| prepare | `{job_id: string}` | POST /recruitment/prepare | 投递记录 |
| approve | `{id: string, approved: boolean, message?: string}` | POST /recruitment/applications/{id}/approve | 投递记录 |

approve 的 id 必须匹配 36 位小写十六进制/连字符格式；进入 HTTP 请求体时移除 id，只保留 approved/message。未支持 action、错误 id 或非布尔 approved 在本地拒绝。其他业务字段由后端 Pydantic 校验。

代理自动附加令牌、Content-Type，超时 120 秒。非成功 HTTP 响应抛 Error：detail 是字符串时使用原信息，否则显示“请求未通过校验，请检查输入”。图执行失败可能返回正常 HTTP 及 ERROR/UNCERTAIN 状态记录，调用者应检查状态。

```typescript
const state = await window.desktop.recruitment('state');
const card = await window.desktop.recruitment('prepare', { job_id });
```

这里只允许固定业务路由，不提供任意后端路径、HTTP 方法或令牌读取。对端契约见 [招聘 API](../../../backend/app/api/README.md)。
