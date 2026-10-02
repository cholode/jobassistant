# 浏览器控制与 RPC 接口

BrowserController 是平台适配器依赖的抽象；ElectronBrowserController 实现实际 WebContents 操作；BrowserRPCBridge 负责后端与浏览器之间的语义消息。

## BrowserController

| 方法 | 输入 → 返回 |
| --- | --- |
| getUrl / getPageTitle | 无 → Promise<string> |
| navigate | url: string → Promise<void> |
| back / forward / reload | 无 → Promise<void> |
| getText / getTexts | selector: string → Promise<string / string[]> |
| click | selector、可选 expectedInput:{selector,value} → Promise<void> |
| fill | selector、text → Promise<void> |
| waitFor | selector、可选 timeout 毫秒 → Promise<boolean> |
| evaluate<T> | 受信任 script → Promise<T> |
| screenshot | 无 → Promise<string>（图片 data URL） |
| getRevision / isLoading | 无 → number / boolean，同步 |

`ElectronBrowserController(contents, allowed, canWrite)` 注入 WebContents 与权限判断。navigate/back/forward/reload/click/fill 检查写权限；evaluate 仅供可信适配器使用，禁止暴露为任意 RPC。脚本在隔离 world 999 运行，5 秒超时；页面刷新和 hash 跳转递增 revision，失效读取抛 STALE_PAGE。waitFor 默认 5000ms，参数范围 0–10000ms；等待不到元素返回 false。getText 最多 20000 字符；getTexts 最多 100 项，每项 4000 字符。

异常为 `BrowserError(code, message)` 或底层 Error，可能包含 CLOSED、UNSUPPORTED_URL、MANUAL_MODE、STALE_PAGE、TIMEOUT、INVALID_TIMEOUT 等。click 可在同段脚本中核验输入值再点击，避免发送被更改的文本。

## 语义分发

`await executeBrowserCommand(browser, origin, message: BrowserCommand) -> BrowserResult` 仅支持三种读取命令。payload 仅含 expected_url（字符串或 null），拒绝额外字段。检测加载状态、前后 URL/revision，以及详情/聊天命令所需页面类型；通过模拟适配器或通用适配器读取。

`await executeApplicationCommand(browser, origin, message, canWrite)` 支持写入分流；message 含 request_id/command/payload。payload 必须正好是六个字符串字段，见 [模拟适配器](../platforms/mock/README.md)。失败包装为 APPLICATION_FAILED 回执，成功返回 PageReading 与 operation。

## BrowserRPCBridge

构造函数 `(browser, backend, token, canWrite = () => false)`。

- `await handleCommand(socket, message)`：按命令分发；仅向原请求 socket 返回结果；无有效 request_id 时忽略。
- `await readPage() -> PageReading`：捕获 URL/revision，以令牌请求后端 `/browser/read`，HTTP 超时 10 秒；返回前再次核验页面，失败抛 Error/BrowserError。

调用者是 [Electron 主进程](../README.md)，协议对端是 [Python RPC](../../../backend/app/browser/README.md)。底层选择器和脚本不属于公共网络协议。
