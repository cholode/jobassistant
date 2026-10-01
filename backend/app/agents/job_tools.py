"""岗位工具组装：业务实现与通用工具注册器分离，所有工具均不操作网页。"""

from ..jobs.models import JobDecision
from ..jobs.rules import hard_filter
from .analysis import JobAnalyzer
from .memory import MemoryStore, Retriever
from .reflection import DecisionReflector
from .tools import EmptyArguments, Tool, ToolRegistry


def build_job_tools(
    memory: MemoryStore, retriever: Retriever | None = None
) -> ToolRegistry:
    registry = ToolRegistry()
    analyzer, reflector = JobAnalyzer(), DecisionReflector()

    async def filter_job(context, _arguments):
        blocked = hard_filter(context.job, context.config.preferences)
        if blocked:
            context.decision = JobDecision(
                decision="skip",
                match_score=0,
                strengths=[],
                concerns=blocked,
                reason="硬规则排除，不调用模型",
            )
        return {"blocked": blocked}

    async def recall(context, _arguments):
        context.memories = memory.recall(context.scope, 3)
        # RAG 暂不启用；注入后也只能作为有来源的参考，不能修改用户事实。
        if retriever is not None:
            records = await retriever.retrieve(context.job.title, context.scope, 3)
            context.memories.extend(
                {"source": item["source"], "text": str(item["text"])[:2000]}
                for item in records[:3]
                if item.get("source") and item.get("text")
            )
        return {"count": len(context.memories)}

    async def analyze(context, _arguments):
        context.candidate = await analyzer.evaluate(
            context.job, context.config, context
        )
        return {"candidate": context.candidate.decision}

    async def reflect(context, _arguments):
        if context.candidate is None:
            raise ValueError("反思前必须先完成岗位分析")
        result = reflector.reflect(context, context.candidate)
        context.decision = result.decision
        return {"feedback": result.feedback, "decision": result.decision.decision}

    for name, description, handler in [
        ("filter_job", "校验岗位是否符合用户硬条件", filter_job),
        ("recall_memory", "读取当前材料对应的历史参考", recall),
        ("analyze_job", "使用规则或模型生成候选分析", analyze),
        ("reflect_decision", "复核候选结果的规则、证据及遗漏项", reflect),
    ]:
        registry.register(Tool(name, description, EmptyArguments, handler))
    return registry
