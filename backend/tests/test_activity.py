"""活跃时间边界及发送前拦截回归；不访问真实招聘站。"""

import pytest
from test_recruitment import page, prepare, service_at

from app.jobs.activity import activity_within_week
from app.jobs.models import Preferences
from app.jobs.parser import parse_job
from app.jobs.rules import hard_filter


@pytest.mark.parametrize(
    "label",
    [
        "在线",
        "刚刚活跃",
        "今日活跃",
        "昨日活跃",
        "3日内活跃",
        "7天内活跃",
        "7天前活跃",
        "一周内活跃",
        "168小时前活跃",
    ],
)
def test_recent_recruiter(label):
    assert activity_within_week(label)


@pytest.mark.parametrize(
    "label",
    [
        "",
        "近期活跃",
        "8天前活跃",
        "14日内活跃",
        "2周内活跃",
        "1月内活跃",
        "半年前活跃",
        "169小时前活跃",
        "职位描述：今日活跃",
    ],
)
def test_stale_or_unknown_recruiter(label):
    assert not activity_within_week(label)
    summary = page().jobs[0].model_copy(update={"recruiter_activity": label})
    job = parse_job(summary, "boss", True)
    assert any("活跃" in reason for reason in hard_filter(job, Preferences()))


@pytest.mark.asyncio
async def test_activity_change_prevents_contact(tmp_path):
    service, agent, browser = await service_at(tmp_path)
    try:
        browser.page.platform = "boss"
        browser.page.jobs[0].recruiter_activity = "3日内活跃"
        record = await prepare(service)
        agent.state.update(status="running", mode="copilot")
        browser.page.jobs[0].recruiter_activity = "1月内活跃"
        with pytest.raises(ValueError, match="变化"):
            await service.verify_application(record["id"])
        assert browser.actions == []
    finally:
        await service.close()
