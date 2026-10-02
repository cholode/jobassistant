# Agent 面板组件接口

## AgentPanel

Props：`data: Snapshot | null`、`tab: PanelTab`、`setTab: (tab) => void`、`busy: boolean`、`run: (action: () => Promise<void>) => Promise<void>`。导出的 PanelTab 为 overview/activity/jobs/settings。

overview 展示当前状态、页面读取和通信测试；activity 展示日志；jobs/settings 委托 RecruitmentPanel。通信测试调用 window.desktop.agentAction('ping')，run 处理错误。组件不启动自动投递。

## PageReader

Props：`page?: PageState`、`connected: boolean`。调用 usePageReader，返回包含读取按钮、岗位/聊天/正文结果和错误的 UI。离线、读取中或页面加载时禁用按钮；暂停 Agent 不影响手动读取。

```tsx
<PageReader page={snapshot?.browser} connected={Boolean(snapshot?.connected)} />
```

页面跳转、刷新或断线时 Hook 清理旧结果，迟到响应不能覆盖新页面。数据来自 [共享 PageReading](../../../shared/README.md)，异步契约见 [hooks](../../hooks/README.md)。
