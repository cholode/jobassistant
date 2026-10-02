# 平台适配接口

`PlatformAdapter` 定义 `matches(url: URL) -> boolean` 和 `read(browser: BrowserController) -> Promise<PageReading>`。适配器封装 DOM 细节，上层只依赖统一页面数据。

## GenericAdapter

`matches()` 恒为 true，必须作为最后的兜底适配器。`read(browser)` 读取已渲染 document.body.innerText，正文截到 20000 字符，标题截到 512 字符；输出 platform=generic、jobs/messages=[]。明确验证提示使 kind=verification，否则为 unknown，notice 解释当前能力。不能用通用正文当成已验证的职位或聊天结构。

## 分发和扩展

当前 [读取 RPC](../browser/README.md) 按 MockRecruitmentAdapter → GenericAdapter 顺序选择首个匹配项。新增平台需实现接口并在此列表注册，返回值符合 [共享协议](../../shared/README.md)。读取失败交 RPC 包装为失败回执。

DOM 选择器、脚本和平台细节只留在适配层，Python 发送语义命令。自动写入需要单独的审批路径及适配器；实现 read 不表示平台可自动投递。当前写入仅由 [mock](mock/README.md) 提供。
