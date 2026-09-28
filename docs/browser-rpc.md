# Phase 2：浏览器读取

## 职责边界

`main.py` 只声明接口；`services/browser.py` 负责读取入口，`browser/client.py` 管理异步请求。WebSocket 接收循环分开处理 Agent 指令和 BrowserResult，不在收消息的循环内等待自己的 RPC。

Electron 的 `BrowserRPCBridge` 管理 HTTP 触发与响应回传，`rpc.ts` 校验语义命令并选择适配器。`BrowserController` 隔离 Electron 实现，平台层负责所有 DOM 细节。React 的 `usePageReader` 管理读取生命周期，`PageReader` 只展示结果。

这条链路不使用 MCP，也不依赖模型服务。

## 命令与接口

`POST /browser/read` 需要 `X-Job-Agent-Token`。请求示例：

```json
{"command":"GET_PAGE_DATA","expected_url":"http://127.0.0.1:8765/mock/"}
```

`command` 默认为 `GET_PAGE_DATA`，`expected_url` 可省略。其他可用命令：

| 命令 | 作用 |
| --- | --- |
| GET_PAGE_DATA | 读取当前页面，按适配器返回列表、职位、消息或正文 |
| GET_JOB_DETAIL | 要求当前页是已适配的职位详情页 |
| GET_CHAT_MESSAGES | 要求当前页是已适配的聊天页 |

不接受 `script`、`selector`、坐标或其他额外参数。

后端发送：

```json
{"type":"browser_command","request_id":"uuid","command":"GET_PAGE_DATA","payload":{"expected_url":null}}
```

成功返回 `browser_result`，包含 `success: true` 和 `data`；失败包含 `success: false` 和 `{code, message}`。数据包含 URL、标题、平台、页面类型、正文、读取时间、截断标记、职位列表与聊天消息。Python 使用 Pydantic 再校验数据。

## 边界处理

- 每次请求生成唯一编号，允许并发和乱序响应，最多 16 个等待请求。
- Python 总超时 8 秒，Electron 脚本读取超时 5 秒，工作台 HTTP 超时 10 秒。
- 断开连接会立即拒绝等待中的请求；迟到、重复、未知编号的响应被忽略。
- 读取前后检查 URL 与页面修订号，避免刷新或跳转后显示旧页面结果。
- 工作台切页、刷新或断线时清空结果。页面正文变化但 URL 未变时，展示的是带时间的上次快照，可再次点击读取。
- 错误包括 `DISCONNECTED`、`TIMEOUT`、`NOT_READY`、`STALE_PAGE`、`WRONG_PAGE`、`UNSUPPORTED_COMMAND`。
- 只读请求在暂停状态下可用；恢复不意味着开放自动网页写入。
- 主进程日志仅记录读取状态和类型，不记录网页正文、聊天内容或令牌。
- 正文最多 20000 字符，最多 100 个职位／消息，仅涵盖已渲染数据，不自动滚动抓取或翻页。

## 适配能力

`MockRecruitmentAdapter` 已支持本地列表、详情与聊天；选择器集中于 `platforms/mock/selectors.ts`，由桌面集成测试验证。

`GenericAdapter` 用于域名白名单内的真实招聘网站，读取当前可见正文并提示专用解析未完成。TODO：获得真实页面样本并编写可重复验证的选择器和解析测试后，独立新增 BOSS 等平台适配器；不从模拟站推断真实网站 DOM。

验证提示检测基于可见文本的保守规则，不保证覆盖全部平台。识别到验证页会暂停，并提示用户手动完成；不解决或绕过验证码。

## BrowserController

接口包含导航、读取文本、等待元素、截图和适配器脚本执行。点击、填写与自动导航均有写入检查；Phase 2 的检查始终拒绝，用户工具栏导航走独立的手动 IPC 路径。

`evaluate` 仅供本地受信任适配器使用，不通过 RPC 暴露。页面读取使用 Electron 隔离执行上下文；元素参数使用 JSON 编码，不拼接为未经转义的代码。截图仅用于本地调试，不作为 OCR 输入。

浏览器缩放使用 Electron [WebContents API](https://www.electronjs.org/docs/latest/api/web-contents)，不改变工作台缩放。
