"""复现实投发现的过期招聘、既往雇主和上下文遗漏问题。"""

import json
from datetime import date

import pytest
from test_agent_runtime import context

from app.agents.analysis import JobAnalyzer
from app.agents.greeting import education_intro
from app.agents.reflection import DecisionReflector
from app.browser.protocol import JobSummary
from app.jobs.models import JobDecision
from app.jobs.parser import parse_job
from app.jobs.review import context_review_reasons, recruitment_today
from app.jobs.rules import hard_filter


@pytest.mark.parametrize("title", ["python或go兼职", "Go part-time developer"])
def test_part_time_title_is_never_treated_as_full_time(title):
    ctx = context()
    job = parse_job(
        JobSummary(
            id="parttime",
            url="https://example.com/job",
            title=title,
            company="测试公司",
            salary="",
            location="经验不限",
            description="Go开发",
        ),
        "mock",
        True,
    )
    assert job.employment == "unknown"
    assert any("兼职" in reason for reason in hard_filter(job, ctx.config.preferences))


def test_explicit_graduation_year_must_match():
    ctx = context()
    ctx.config.profile.facts = ["测试大学计算机本科，预计2027年6月毕业"]
    ctx.job.description = "毕业时间：2026年"
    assert any(
        "届别" in reason
        for reason in context_review_reasons(ctx.job, ctx.config.profile)
    )
    ctx.job.description = "毕业时间：2026年-2027年"
    assert context_review_reasons(ctx.job, ctx.config.profile) == []


@pytest.mark.parametrize(
    ("description", "blocked"),
    [
        ("招聘截止日期：10月1日", True),
        ("投递截止时间：2026年10月1日", True),
        ("截止日期：2026年10月4日", False),
        ("截止日期：2027年10月1日", False),
        ("项目在10月1日上线", False),
        ("截止日期：2月30日", True),
    ],
)
def test_deadline_needs_review_only_with_relevant_evidence(description, blocked):
    ctx = context()
    ctx.job.description = description
    assert (
        bool(context_review_reasons(ctx.job, ctx.config.profile, date(2026, 10, 4)))
        == blocked
    )


@pytest.mark.asyncio
async def test_previous_employer_cannot_automatically_receive_generic_outreach():
    ctx = context()
    ctx.job.company = "编为智能"
    ctx.config.profile.facts = ["2026年7月至9月在深圳编为智能科技公司从事 Go 后端开发"]
    ctx.config.analysis_mode = "llm"
    # 此时不应调用模型，更不能因为模型给高分就跳过既往任职关系。
    decision = await JobAnalyzer().evaluate(ctx.job, ctx.config)
    assert decision.decision == "review"
    candidate = JobDecision(
        decision="apply", match_score=99, strengths=[], concerns=[], reason="匹配"
    )
    result = DecisionReflector().reflect(ctx, candidate)
    assert result.decision.decision == "review"
    assert any("既往" in concern for concern in result.decision.concerns)
    ctx.config.profile.facts = ["研究过编为智能公司的产品"]
    assert context_review_reasons(ctx.job, ctx.config.profile) == []


def test_model_has_current_date_and_confirmed_preferences():
    ctx = context()
    ctx.config.profile.months = 6
    ctx.config.profile.days_per_week = 5
    ctx.config.preferences.cities = []
    payload = json.loads(ctx.model_input())
    assert payload["current_date"] == recruitment_today().isoformat()
    assert payload["preferences"]["cities"] == []
    assert payload["profile"]["months"] == 6
    assert payload["profile"]["days_per_week"] == 5


def test_master_requirement_is_not_overridden_by_technical_match():
    ctx = context()
    ctx.config.profile.facts.append("测试大学计算机本科，预计2027年6月毕业")
    ctx.job.location = "北京 4天/周 3个月 硕士"
    ctx.job.description = "Go后端开发，计算机相关专业"
    assert any(
        "学历" in reason
        for reason in context_review_reasons(ctx.job, ctx.config.profile)
    )
    ctx.job.description += "；本科大三/大四或研究生在读"
    assert context_review_reasons(ctx.job, ctx.config.profile) == []


def test_graduation_date_intro_uses_only_confirmed_education():
    facts = [
        "湘潭大学（双一流）计算机科学与技术本科，2022年9月入学、预计2027年6月毕业；2023年转专业说明。"
    ]
    assert (
        education_intro(facts)
        == "湘潭大学（双一流）计算机科学与技术本科，预计2027年6月毕业。"
    )
    assert (
        education_intro(["测试大学计算机本科，2027届。"])
        == "测试大学计算机本科，2027届。"
    )
