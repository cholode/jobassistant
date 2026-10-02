# UI 组件接口索引

组件接收类型化 Props 并返回 React UI；副作用通过传入回调或 hooks/window.desktop 触发。组件之间不直接修改对方状态。

| 目录 | 组件 | 职责 |
| --- | --- | --- |
| [agent](agent/README.md) | AgentPanel、PageReader | Agent 状态、日志、读取结果及业务面板 |
| [browser](browser/README.md) | BrowserPane、BrowserToolbar | 原生网页占位、导航和缩放 |
| [jobs](jobs/README.md) | RecruitmentPanel、ProfileForm、ApprovalCard | 资料、岗位分析、人工确认 |
| [layout](layout/README.md) | Sidebar | 导航与功能入口 |

共享回调 `run(action: () => Promise<void>): Promise<void>` 来自 useAction，用于 busy/error 展示。Snapshot 可以为 null；异步招聘数据由 useRecruitment 管理。类型见 [shared](../../shared/README.md)，状态逻辑见 [hooks](../hooks/README.md)。
