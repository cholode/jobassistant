# Python 浏览器 RPC 接口

后端通过已认证的桌面 WebSocket 发送语义命令。此目录没有浏览器实例、CSS 选择器或脚本执行接口。

## protocol.py

| 模型 | 字段与约束 |
| --- | --- |
| BrowserReadRequest | `command` 默认 GET_PAGE_DATA，可选 GET_JOB_DETAIL/GET_CHAT_MESSAGES；`expected_url` 可空、最多 4096 字符；拒绝额外字段 |
| JobSummary | id/title/company/salary/location/url/tags/description；description 最多 12000，tags 最多 30 项 |
| ChatMessage | sender=hr/me/unknown，text 最多 4000 字符 |
| PageReading | url/title/platform/kind/text/truncated/read_at/jobs/messages/notice/operation |
| BrowserErrorData | code（≤100）、message（≤1000） |
| BrowserResult | type=browser_result、request_id（≤100）、success；可空 data: PageReading、error: BrowserErrorData |

PageReading 的 platform 为 mock/generic；kind 为 job_list/job_detail/chat/unknown/verification。正文最多 20000 字符，jobs/messages 各最多 100 项；operation 为可空 dict，用于写入回执。BrowserResult 的 Python 模型不强制 data/error 互斥；RPC 客户端额外检查成功时必须有 data。

## client.py

`BrowserRPCClient(timeout: float = 8)` 保存当前 socket 和等待请求；上限为 16 个 pending。

| 方法 | 输入 → 输出 | 说明 |
| --- | --- | --- |
| `attach(socket)` | WebSocket → None | 登记已认证连接 |
| `detach(socket)` | WebSocket → None | 仅解除同一连接；等待请求收到 DISCONNECTED |
| `await send(message)` | dict → None | 使用发送锁；不可在断线时发送 |
| `receive(result)` | BrowserResult → None | 按 request_id 唤醒等待者；忽略未知、重复和迟到结果 |
| `await request(request)` | BrowserReadRequest → PageReading | 只读请求入口 |
| `await execute(command, payload)` | 字符串、dict → PageReading | 内部通用语义请求，供已审批写入流程使用 |

异常为 `BrowserRPCError(code, message)`。本地错误包括 DISCONNECTED、BUSY、TIMEOUT、INVALID_RESULT；桌面失败时透传其错误码，缺失错误详情时使用 READ_FAILED。超时覆盖发送与等待两个阶段；完成、取消或失败均清理 pending，不自动重试。

## 线协议示例

```json
{"type":"browser_command","request_id":"rpc-1","command":"GET_PAGE_DATA","payload":{"expected_url":null}}
```

成功回执为 `{type:"browser_result", request_id, success:true, data:PageReading}`；失败为 `{type:"browser_result", request_id, success:false, error:{code,message}}`。请求编号必须原样返回。

读命令经 `request` 发起；CONTACT_HR/SEND_GREETING 经审批服务 `execute` 发起，不能通过 `/browser/read` 传入。桌面实现见 [Electron browser](../../../client/electron/browser/README.md)，HTTP 错误映射见 [services](../services/README.md)。
