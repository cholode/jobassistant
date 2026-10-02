# LangGraph 工作流接口

本目录负责节点顺序和人工中断；实际浏览器副作用委托 [RecruitmentService](../services/README.md)。

## discovery.py

`build_discovery(rpc, repository, agent)` 返回编译后的图，依赖分别支持 `request`、岗位持久化接口、`evaluate`。`await graph.ainvoke({})` 返回 DiscoveryState：`page: dict`、`records: list[dict]`。

顺序为读取当前页 → 去重/过滤/分析/保存 → 结束。最多分析当前页前 30 条岗位，不翻页。已有完整详情时不会用列表摘要覆盖，而是保留详情、更新 URL 并按当前资料重新分析。verification 或无已适配岗位时抛 ValueError；上层服务映射为 HTTP 400。

## application.py

`build_application(service, checkpointer)` 返回带检查点的图。ApplicationState 包含 `application_id: str` 和可选 `approved: bool`。

```python
config = {"configurable": {"thread_id": operation_id}}
await graph.ainvoke({"application_id": application_id}, config)
# 在 approval 节点中断后，经业务服务完成授权和资料校验，再恢复：
from langgraph.types import Command
await graph.ainvoke(Command(resume={"approved": True}), config)
```

以上是服务内部用法；外部调用者使用 HTTP prepare/approve，不能跳过服务校验。thread_id 必须沿用该轮 operation_id。

批准路径：approval → verify_page → contact_hr → send_greeting → END。拒绝路径：approval → reject → END，记录置 REJECTED。中断展示 application_id/company/title/message；审批节点重放不点击或发送。

状态通常为 WAITING_USER_CONFIRMATION → APPROVED → CONTACTING → CONTACTED → SENDING → WAITING_REPLY。图异常由服务落库为 ERROR 或 UNCERTAIN；数据库恢复将中断执行标为 UNCERTAIN，不能把检查点恢复理解成可安全重发。图自身不负责认证。
