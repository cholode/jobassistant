# 本地模拟站接口

index.html、style.css、app.js 组成静态演示站，由后端挂载 `/mock/`。不提供招聘 HTTP API，交互通过 hash 和 DOM 完成；数据为虚构岗位。

| 入口 | 行为 |
| --- | --- |
| `/mock/` | 岗位列表，支持页面内搜索/城市筛选 |
| `/mock/#job/<id>` | 详情和发起沟通入口 |
| `/mock/#chat/<id>` | 对应岗位的独立模拟会话 |

app.js 根据 hash 渲染内容；会话在 localStorage 的 mock-sessions 键保存，刷新后保留，不发送到真实招聘平台。样式与 data-* 属性被桌面适配器消费，修改时需同步适配和测试。

## DOM 契约

列表 `.jobs .job`、岗位 `.job-title/.company-name/.salary/.meta/.tags span`、详情 `.detail`、正文 `#content`、消息 `.bubble` 与己方 mine 类供读取适配器使用。

写入适配依赖 `[data-contact-id="<id>"]`、`[data-chat-job-id="<id>"]` 以及该会话内 `.chat-form input/button`。会话文本须包含公司和职位，发送后在 DOM 中显示己方消息，供回执核验。

开发时通过 [启动脚本](../scripts/README.md) 打开，发布版使用后端动态端口，不应写死 8765。对端详见 [模拟适配器](../client/electron/platforms/mock/README.md)。
