# 模拟站适配接口

本目录仅适配同源 `/mock/`，配合 [模拟站](../../../../mock-site/README.md) 验证完整链路。

## 读取

`MockRecruitmentAdapter(origin: string)` 实现 PlatformAdapter：`matches(url)` 判断模拟站 origin/path，`await read(browser) -> PageReading` 将列表、详情、聊天映射为 job_list/job_detail/chat。selectors.ts 导出 selectors 常量，集中保存 cards/title/company/salary/location/tags/detail/heading/messages/ownMessage/content 对应选择器。

输出 platform=mock，岗位为 JobSummary，聊天为 ChatMessage。读取只涵盖当前已加载页面。页面变化检测由上层 RPC 和控制器共同完成。

## 写入

`MockApplicationAdapter(browser, origin, canWrite)`；`await execute(action: string, payload: ApplicationPayload)` 返回带 operation 的 PageReading，失败抛 BrowserError。

ApplicationPayload 六个必需字符串字段：

| 字段 | 含义 |
| --- | --- |
| operation_id | 此轮审批执行标识，原样回传 |
| job_url | 已批准的完整职位地址 |
| source_id | 模拟站岗位 ID，只允许字母、数字、下划线、连字符 |
| title / company | 已批准的目标职位和公司 |
| message | 最终批准的招呼语，发送时非空且最多 1500 字符 |

CONTACT_HR 核对当前 URL、`#job/<source_id>`、岗位信息及未沟通状态后点击；SEND_GREETING 核对目标会话后填入并发送，不重复发送已有相同己方消息。写入前多次检查 canWrite；输入与已批准文本不一致时不得点击。

成功回执 operation 为 `{operation_id, action}`；发送成功还需看到完全一致的己方消息。典型错误包括 PAUSED、UNSUPPORTED_PLATFORM、STALE_PAGE、WRONG_JOB、ALREADY_CONTACTED、UNVERIFIED_CHAT、WRONG_CHAT、INVALID_MESSAGE、UNVERIFIED_SEND；外层写 RPC 将错误包装为 APPLICATION_FAILED。

新增或修改模拟站 DOM 时同步维护读取选择器、写入 data-* 属性和 [桌面测试](../../../tests/README.md)。
