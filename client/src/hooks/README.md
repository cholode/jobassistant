# React Hooks 接口

| Hook | 输入 | 返回与生命周期 |
| --- | --- | --- |
| useAction() | 无 | `{busy, error, setError, run}`；run 接收 `() => Promise<void>`，捕获异常为可读字符串，finally 清 busy |
| useDesktop() | 无 | Snapshot 或 null；先订阅并获取初始快照，卸载取消订阅 |
| usePageReader(page, connected) | 可 undefined 的 PageState、boolean | `{reading, busy, error, read}`；reading 为 PageReading 或 null |
| useRecruitment(connected) | boolean | `{state, busy, error, act}`；state 为 RecruitmentState 或 null |
| useBrowserBounds() | 无 | HTMLDivElement ref；挂载后监听 ResizeObserver 和窗口 resize，卸载清理 |

`run(action)` 捕获错误而不重新抛出；busy 是展示标记，不是互斥锁。`usePageReader.read()` 调 window.desktop.readPage；URL/loading/connected 变化时清空旧结果并递增序号，忽略过期响应。

`useRecruitment.act(action: RecruitmentAction, payload?: unknown)` 提交业务动作，成功后再次读取 state；操作异常存到 error，不向调用者返回具体业务结果。connected 变真时加载状态；当前实现断线不会主动清空已有招聘数据，UI 必须结合 connected 判断可操作性。

useBrowserBounds 的 ref 必须绑定原生网页占位 div，x/y/width/height 单位为 CSS 像素，经 window.desktop.bounds 更新 Electron 视图。useDesktop 把状态交 [store](../stores/README.md)，不直接写后端。

```tsx
const { busy, error, run } = useAction();
// 在事件回调中：
void run(() => window.desktop.agentAction('pause'));
```

底层接口见 [DesktopAPI](../../shared/README.md)。
