# 招聘组件接口

| 组件 | Props | 回调 / 行为 |
| --- | --- | --- |
| RecruitmentPanel | connected: boolean、agent?: AgentState、settings?: boolean（默认 false） | useRecruitment 加载状态；settings 时显示资料，否则显示岗位和确认卡 |
| ProfileForm | initial: RecruitmentConfig、busy: boolean、save: (value: RecruitmentConfig) => void | 本地编辑，提交整个配置 |
| ApprovalCard | item: ApplicationRecord、enabled: boolean、busy: boolean、approve: (approved: boolean, message: string) => void | 编辑招呼语后确认或拒绝，展示记录状态和错误 |

ProfileForm 只在初次挂载以 initial 初始化本地 state；后续 Props 改变不会自动覆盖草稿。技能等文本按逗号/中文逗号/换行拆分，后端清理空项。ApprovalCard 也持有消息草稿；父组件用 id/status/message 组合 key 重新挂载更新。

业务动作：discover 分析当前页；prepare 传 `{job_id}`；approve 传 `{id, approved, message}`；config 传完整配置。打开职位调用 window.desktop.navigate，导航错误单独显示。

批准按钮的 enabled 取决于 Copilot + running，但最终授权和状态校验仍由后端执行。ERROR/UNCERTAIN 等状态来自返回记录；不能以请求成功就认定消息发送成功。

模型见 [shared](../../../shared/README.md)，动作与错误处理见 [useRecruitment](../../hooks/README.md)，网络接口见 [API](../../../../backend/app/api/README.md)。
