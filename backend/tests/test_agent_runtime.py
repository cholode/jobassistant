"""Agent 内核测试：独立验证上下文隔离、持久记忆、受控工具和反思纠错。"""

import asyncio

import pytest
from pydantic import ValidationError
from test_recruitment import page

from app.agents.context import AgentContext
from app.agents.executor import PlanExecutor
from app.agents.job_agent import JobAgent
from app.agents.memory import SQLiteMemory
from app.agents.planning import Plan, PlanStep
from app.agents.reflection import DecisionReflector
from app.agents.tools import EmptyArguments, Tool, ToolRegistry
from app.jobs.models import JobDecision, RecruitmentConfig
from app.jobs.parser import parse_job


def context():
    config = RecruitmentConfig()
    config.profile.facts = ["Go 服务使用 Redis 缓存", "参加校园活动"]
    return AgentContext.create(parse_job(page().jobs[0], "mock", True), config)


def test_context_snapshot_scope_and_budget():
    first = context()
    second = AgentContext.create(first.job, first.config)
    first.config.profile.facts.append("新增经历")
    assert len(second.config.profile.facts) == 2
    assert first.scope != second.scope
    second.memories = [{"text": "旧记忆" * 20000}]
    text = second.model_input(3000)
    assert "Go 服务使用 Redis 缓存" in text
    assert "旧记忆" not in text
    with pytest.raises(ValueError, match="预算"):
        second.model_input(10)


def test_memory_restart_capacity_scope_and_forget(tmp_path):
    path = tmp_path / "memory.db"
    memory = SQLiteMemory(path, capacity=2)
    memory.remember("a", "1", {"value": 1})
    memory.remember("b", "2", {"value": 2})
    memory.remember("b", "2", {"value": 999})
    memory.remember("b", "3", {"value": 3})
    restored = SQLiteMemory(path, capacity=2)
    assert restored.recall("a") == []
    assert restored.recall("b") == [{"value": 3}, {"value": 2}]
    restored.forget("b")
    assert restored.recall("b") == []


@pytest.mark.asyncio
async def test_tools_validation_permissions_and_timeout():
    registry = ToolRegistry()
    calls = []

    async def handler(ctx, args):
        calls.append(ctx.run_id)
        return {}

    registry.register(Tool("read", "读取", EmptyArguments, handler))
    registry.register(Tool("send", "发送", EmptyArguments, handler, read_only=False))
    with pytest.raises(ValueError, match="已注册"):
        registry.register(Tool("read", "读取", EmptyArguments, handler))
    with pytest.raises(ValueError, match="未注册"):
        await registry.call("missing", {}, context())
    with pytest.raises(ValidationError):
        await registry.call("read", {"script": "unexpected"}, context())
    with pytest.raises(ValueError, match="审批"):
        await registry.call("send", {}, context())
    assert calls == []
    assert [item["name"] for item in registry.schemas()] == ["read"]

    async def slow(ctx, args):
        await asyncio.sleep(1)
        calls.append("should not finish")
        return {}

    registry.register(Tool("slow", "超时", EmptyArguments, slow, timeout=0.01))
    with pytest.raises(TimeoutError):
        await registry.call("slow", {}, context())
    assert calls == []


@pytest.mark.asyncio
async def test_plan_execute_reflect_memory_and_hard_filter(tmp_path):
    ctx = context()
    memory = SQLiteMemory(tmp_path / "memory.db")
    agent = JobAgent(memory)
    decision = await agent.evaluate(ctx.job, ctx.config)
    assert decision.decision == "apply"
    record = memory.recall(ctx.scope)[0]
    assert [x["tool"] for x in record["trace"]] == [
        "filter_job",
        "recall_memory",
        "analyze_job",
        "reflect_decision",
    ]
    assert record["reflection"]["feedback"]
    ctx.config.preferences.blacklist = [ctx.job.company]
    ctx.config.analysis_mode = "llm"  # 硬规则排除时不能触发缺少密钥的模型调用。
    assert (await agent.evaluate(ctx.job, ctx.config)).decision == "skip"
    assert len(memory.recall(ctx.scope)[0]["trace"]) == 1


def test_reflection_corrects_unsupported_evidence_and_missing_context():
    ctx = context()
    ctx.job.detail_complete = False
    candidate = JobDecision(
        decision="apply",
        match_score=90,
        strengths=[],
        concerns=[],
        reason="候选",
        evidence_ids=[0, 0, 1, 99],
        matched_skills=["不存在的技能"],
    )
    reflection = DecisionReflector().reflect(ctx, candidate)
    assert reflection.decision.decision == "review"
    assert reflection.decision.evidence_ids == [0]
    assert "不存在的技能" not in reflection.decision.matched_skills
    assert any("详情" in item for item in reflection.decision.concerns)
    assert candidate.decision == "apply"  # 反思返回新结果，不修改原始候选。


@pytest.mark.asyncio
async def test_replanning_has_execution_bound():
    step = PlanStep(tool="loop", purpose="验证循环上限")

    class LoopPlanner:
        async def plan(self, ctx, tools):
            return Plan(steps=[step])

        async def replan(self, ctx, remaining):
            return Plan(steps=[step])

    async def handler(ctx, args):
        return {}

    registry = ToolRegistry()
    registry.register(Tool("loop", "循环", EmptyArguments, handler))
    ctx = context()
    with pytest.raises(ValueError, match="步数上限"):
        await PlanExecutor(LoopPlanner(), registry, max_steps=2).run(ctx)
    assert len(ctx.trace) == 2


@pytest.mark.asyncio
async def test_model_receives_bounded_memory_and_result_is_reflected(
    tmp_path, monkeypatch
):
    """替代网络模型，验证上下文确实传入分析工具且结果经过反思。"""
    ctx = context()
    ctx.config.analysis_mode = "llm"
    memory = SQLiteMemory(tmp_path / "memory.db")
    memory.remember(ctx.scope, "prior", {"note": "历史参考标记"})
    prompts = []

    class FakeModel:
        def __init__(self, **kwargs):
            pass

        def with_structured_output(self, schema):
            assert schema is JobDecision
            return self

        async def ainvoke(self, messages):
            prompts.extend(messages)
            return JobDecision(
                decision="apply",
                match_score=80,
                strengths=[],
                concerns=[],
                reason="模拟模型",
                evidence_ids=[0, 1],
            )

    monkeypatch.setenv("OPENAI_API_KEY", "test-only")
    monkeypatch.setenv("JOB_AGENT_MODEL", "test-model")
    monkeypatch.setattr("app.agents.analysis.ChatOpenAI", FakeModel)
    decision = await JobAgent(memory).evaluate(ctx.job, ctx.config)
    assert "历史参考标记" in prompts[1].content
    assert "Go 服务使用 Redis 缓存" in prompts[1].content
    assert decision.source == "llm"
    assert decision.evidence_ids == [0]
    assert memory.recall(ctx.scope)[0]["reflection"]["feedback"]
