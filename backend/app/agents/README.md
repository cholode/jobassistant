# Agent 内核接口

岗位分析使用确定性的 Plan-and-Execute + Reflection，工具均不操作网页。业务服务通过 JobAgent 门面调用；执行记忆与业务数据库、审批检查点分开保存。

## 门面与上下文

| 文件 / 接口 | 输入 → 输出 | 约定 |
| --- | --- | --- |
| `job_agent.JobAgent(memory, planner=None, retriever=None)` | MemoryStore、可选 Planner/Retriever → 实例 | 默认 JobPlanner 和岗位工具注册器 |
| `await JobAgent.evaluate(job, config)` | Job、RecruitmentConfig → JobDecision | 每轮创建独立上下文，保存成功/失败执行记忆；异常继续向上传播 |
| `context.AgentContext.create(job, config)` | 领域模型 → AgentContext | 深复制输入；每轮独立 run_id、observations、memories、trace、candidate、decision |
| `AgentContext.scope` | 属性 → str | 当前岗位和完整配置的指纹，隔离过期资料 |
| `AgentContext.model_input(max_chars=32000)` | 字符预算 → str | 保留完整当前材料，最多补入 6 条历史；当前材料超限抛 ValueError |

## 规划与执行

`PlanStep(tool, purpose, arguments={})` 和 `Plan(steps)` 为 Pydantic 模型，拒绝额外字段；Plan 最多 8 步。Planner 协议要求异步 `plan(context, tools) -> Plan`、`replan(context, remaining) -> Plan`。

JobPlanner 默认顺序：filter_job → recall_memory → analyze_job → reflect_decision。已有最终 decision 时结束剩余计划。`PlanExecutor(planner, tools, max_steps=8, timeout=120)` 的 `await run(context) -> JobDecision` 逐步记录 trace、observations 并重新规划；步数超限或没有最终结果抛 ValueError，超时抛 TimeoutError。

## 工具注册

`Tool(name, description, arguments, handler, read_only=True, timeout=45)`：arguments 是 Pydantic 模型类，handler 签名为 `async (AgentContext, BaseModel) -> dict`。

- `ToolRegistry.register(tool) -> None`：同名或非正 timeout 抛 ValueError。
- `schemas() -> list[dict]`：仅提供只读工具的 name/description/parameters。
- `await call(name, arguments, context) -> dict`：校验参数并限制耗时；未注册或写入工具抛 ValueError，参数不合法抛 ValidationError。
- `build_job_tools(memory, retriever=None) -> ToolRegistry`：注册上述四个工具，参数均为拒绝额外字段的 EmptyArguments。

## 分析、反思与文本

`await JobAnalyzer.evaluate(job, config, context=None) -> JobDecision` 先硬规则、再规则或模型分析。llm 模式需要 OPENAI_API_KEY/JOB_AGENT_MODEL，模型请求超时 40 秒且不自动重试；详情不足时使用规则分析。模型异常向上传播。

`DecisionReflector.reflect(context, candidate) -> ReflectionResult` 深复制并校验硬条件、技能、事实索引及材料完整性；ReflectionResult 包含 decision 和 feedback。反思是确定性检查，没有额外模型调用。

`greeting(job, decision, config) -> str` 只引用技能、用户原始事实及已确认实习时间，最多 1500 字符；不发送消息。

## memory.py 持久化契约

MemoryStore：`recall(scope, limit=3) -> list[dict]`、`remember(scope, run_id, record) -> None`、`forget(scope) -> None`。SQLiteMemory(path: Path, capacity=500) 创建数据库，按最新顺序返回，recall 实际限制 0–20；同 run_id 只写一次，全库仅保留 capacity 条，capacity 必须正数。

可选 Retriever：`await retrieve(query, scope, limit) -> list[dict]`。记录必须含 source 和 text；当前默认不接 RAG，检索材料只作为历史参考。

```python
from pathlib import Path
from app.agents.job_agent import JobAgent
from app.agents.memory import SQLiteMemory

agent = JobAgent(SQLiteMemory(Path("private/agent-memory.db")))
decision = await agent.evaluate(job, config)  # 在异步函数内使用
```

模型与参数见 [jobs](../jobs/README.md)，整体设计见 [Agent 架构](../../../docs/agent-architecture.md)。
