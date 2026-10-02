# 浏览器区域组件接口

| 组件 | Props | 交互与输出 |
| --- | --- | --- |
| BrowserPane | data: Snapshot 或 null；run: 异步动作包装器 | 原生视图占位、快捷站点、地址栏 |
| BrowserToolbar | data、url: string、setUrl: (url) => void、run | 导航、前进/后退、刷新、缩放 |

run 类型为 `(action: () => Promise<void>) => Promise<void>`。BrowserPane 跟随实际 browser.url 更新地址文本，模拟站入口优先使用 browser.home，以适配发布版动态端口。useBrowserBounds 将占位元素尺寸经 IPC 同步给 WebContentsView。

工具栏提交地址时，非 http 开头文本加 https:// 前缀，最终地址仍由主进程白名单校验。缩放动作 in/out/reset 调用 window.desktop.browserZoom；实际倍率由 Snapshot.browser.zoom 回传。操作失败交 run 展示。

组件返回 UI，不返回页面 DOM 或网页数据；读取能力见 [PageReader](../agent/README.md)，原生控制见 [electron](../../../electron/README.md)。
