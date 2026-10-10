# React 工作台接口

main.tsx 将 App 挂载到 index.html 的根节点，App.tsx 组合侧边栏、浏览器区域和 Agent 面板。styles.css 提供页面样式，desktop.d.ts 声明 window.desktop 的类型。

`candy-theme.css` 在基础样式之后加载，统一糖果波普主题（蓝色侧栏、彩色统计卡、黑色描边）。顶部 `WorkspaceSummary` 每次请求结束后等待 3 秒读取现有 console 统计，断线或请求失败显示占位符。模式按钮通过原有 agentAction 切换；招聘网页由原生视图渲染，不随主题修改。`node client/tests/candy-layout.mjs`（仓库根目录）验证实时统计、断线和两种窗口尺寸，截图写入 logs。

输入主要来自 [Snapshot](../shared/README.md)；用户操作通过 window.desktop 提交。React 不直接持有令牌、WebContents、模型客户端或数据库。

| 子目录 | 对外契约 |
| --- | --- |
| [components](components/README.md) | React Props 与交互回调 |
| [hooks](hooks/README.md) | 订阅、异步动作、页面读取、招聘状态 |
| [stores](stores/README.md) | 最近一次桌面快照 |

初次加载 Snapshot 为 null，组件应显示等待状态；connected=false 时不得假定后端可用。useAction/useRecruitment/usePageReader 捕获错误用于显示，不把业务失败当作成功反馈。原生网页区域通过 bounds IPC 定位，不是 React 内嵌 iframe。

开发验证见 [client 命令](../README.md)，完整交互验证见 [tests](../tests/README.md)。
