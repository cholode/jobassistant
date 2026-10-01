"""Plan-and-Execute 规划契约与岗位规划器；当前使用确定性计划，不依赖模型规划。"""

from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from .context import AgentContext


class PlanStep(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tool: str
    purpose: str
    arguments: dict = Field(default_factory=dict)


class Plan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    steps: list[PlanStep] = Field(max_length=8)


class Planner(Protocol):
    async def plan(self, context: AgentContext, tools: list[dict]) -> Plan: ...
    async def replan(self, context: AgentContext, remaining: Plan) -> Plan: ...


class JobPlanner:
    async def plan(self, context: AgentContext, tools: list[dict]) -> Plan:
        return Plan(
            steps=[
                PlanStep(tool="filter_job", purpose="先排除不符合硬条件的岗位"),
                PlanStep(tool="recall_memory", purpose="读取相同材料下的历史分析参考"),
                PlanStep(tool="analyze_job", purpose="根据当前事实分析匹配与缺口"),
                PlanStep(
                    tool="reflect_decision",
                    purpose="复核规则、证据索引和待核实项后修正结论",
                ),
            ]
        )

    async def replan(self, context: AgentContext, remaining: Plan) -> Plan:
        # 硬规则排除或已取得最终决策就停止，不执行多余检索和模型调用。
        return Plan(steps=[]) if context.decision is not None else remaining
