"""岗位 Agent 门面：创建上下文，运行计划与反思，再保存可追溯的执行记忆。"""

from .context import AgentContext
from .executor import PlanExecutor
from .job_tools import build_job_tools
from .memory import MemoryStore, Retriever
from .planning import JobPlanner, Planner


class JobAgent:
    def __init__(
        self,
        memory: MemoryStore,
        planner: Planner | None = None,
        retriever: Retriever | None = None,
    ):
        self.memory = memory
        self.tools = build_job_tools(memory, retriever)
        self.executor = PlanExecutor(planner or JobPlanner(), self.tools)

    async def evaluate(self, job, config):
        # 每次调用独立创建上下文，同一个 Agent 可复用而不共享短期状态。
        context = AgentContext.create(job, config)
        try:
            decision = await self.executor.run(context)
        except Exception as error:
            self.memory.remember(
                context.scope,
                context.run_id,
                {
                    "status": "failed",
                    "error": type(error).__name__,
                    "trace": context.trace,
                },
            )
            raise
        self.memory.remember(
            context.scope,
            context.run_id,
            {
                "status": "completed",
                "decision": decision.decision,
                "source": decision.source,
                "reflection": context.observations.get("reflect_decision", {}),
                "trace": context.trace,
            },
        )
        return decision
