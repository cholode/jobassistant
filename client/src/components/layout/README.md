# 布局导航接口

Sidebar Props：

| 属性 | 类型与含义 |
| --- | --- |
| tab | PanelTab（overview/activity/jobs/settings），当前标签 |
| setTab | `(tab: PanelTab) => void`，切换右侧内容 |
| logCount | number，运行记录计数 |
| setTip | `(tip: string) => void`，显示尚未实现功能提示 |

返回侧边栏 UI。招聘浏览器、职位与投递、运行记录、求职资料通过 setTab 导航；沟通消息、待确认事项仍为提示入口。组件没有网络或数据库副作用，也不自己持有路由状态。

PanelTab 定义来自 [AgentPanel](../agent/README.md)，父层由 [App](../../README.md) 组装。
