"""执行器：规划、逐步调用工具、观察并调整剩余计划，限制总步数与总耗时。"""

import asyncio

from .context import AgentContext
from .planning import Plan, Planner
from .tools import ToolRegistry


class PlanExecutor:
    def __init__(
        self,
        planner: Planner,
        tools: ToolRegistry,
        max_steps: int = 8,
        timeout: float = 120,
    ):
        self.planner, self.tools = planner, tools
        self.max_steps, self.timeout = max_steps, timeout

    async def run(self, context: AgentContext):
        async with asyncio.timeout(self.timeout):
            plan = await self.planner.plan(context, self.tools.schemas())
            for _ in range(self.max_steps):
                if not plan.steps:
                    break
                step, *remaining = plan.steps
                trace = {
                    "tool": step.tool,
                    "purpose": step.purpose,
                    "status": "running",
                }
                context.trace.append(trace)
                try:
                    result = await self.tools.call(step.tool, step.arguments, context)
                except BaseException as error:
                    # 记录错误类型而非可能包含密钥的异常正文，取消也不能自动重试。
                    trace.update(status="failed", error=type(error).__name__)
                    raise
                trace["status"] = "completed"
                context.observations[step.tool] = result
                plan = await self.planner.replan(context, Plan(steps=remaining))
            else:
                if plan.steps:
                    raise ValueError("Agent 执行达到步数上限")
            if context.decision is None:
                raise ValueError("计划结束但未产生岗位分析结果")
            return context.decision
