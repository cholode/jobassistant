# 布局导航接口

Sidebar Props：

| 属性 | 类型与含义 |
| --- | --- |
| tab | PanelTab，当前右侧面板标签 |
| setTab | `(tab: PanelTab) => void`，切换右侧内容 |
| logCount | number，运行记录计数 |
| setTip | `(tip: string) => void`，显示尚未实现功能提示 |

返回侧边栏 UI。招聘浏览器、开始投递、职位与投递、运行记录、求职资料、沟通消息、投递历史、执行追踪和模型设置通过 setTab 导航。当前入口使用 aria-current 标识。组件没有网络或数据库副作用，也不自己持有路由状态。

WorkspaceSummary 接收 connected 和 setTab，通过已有 console 接口读取 jobs / recommended / pending 统计；每次请求完成后等待 3 秒刷新，卸载时清理定时器，断线或失败不显示旧数字。彩色卡片导航至职位与投递面板。

PanelTab 定义来自 [AgentPanel](../agent/README.md)，父层由 [App](../../README.md) 组装。
