"""从适配器数据解析职位，不猜测缺失的经验、薪资或公司信息。"""

import hashlib
import json
import re
from urllib.parse import urlsplit

from ..browser.protocol import JobSummary
from .models import Job


def fingerprint(value: object) -> str:
    """使用固定键顺序计算摘要，避免字典插入顺序导致误判变化。"""
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()


def parse_job(summary: JobSummary, platform: str, detail: bool) -> Job:
    """将平台摘要转为领域模型；无法解析的数值用 None 表示。"""
    text = f"{summary.title} {summary.location} {summary.description}"
    experience = None
    if re.search(r"经验不限|无经验|在校|应届|实习", text):
        experience = 0
    match = re.search(
        r"(\d+)\s*(?:[-–~至]\s*\d+)?\s*年(?:以上)?(?:工作)?经验|(\d+)\s*[-–~至]\s*\d+\s*年",
        text,
    )
    if match:
        experience = int(match.group(1) or match.group(2)) * 12
    if "1年以内" in text or "一年以内" in text:
        experience = 0
    salary = re.search(
        r"(\d+(?:\.\d+)?)\s*[-–~至]\s*\d+(?:\.\d+)?\s*[kK]", summary.salary
    )
    monthly = (
        int(float(salary.group(1)) * 1000)
        if salary and "天" not in summary.salary
        else None
    )
    # 模拟站端口会变化，稳定 ID 不使用本地端口；真实平台保留完整职位地址。
    parsed = urlsplit(summary.url)
    identity = (
        f"mock:{summary.id}"
        if platform == "mock"
        else f"{parsed.hostname}{parsed.path}#{parsed.fragment}"
    )
    return Job(
        id=fingerprint(identity)[:24],
        source_id=summary.id,
        platform=platform,
        url=summary.url,
        title=summary.title,
        company=summary.company,
        location=summary.location,
        salary=summary.salary,
        description=summary.description,
        tags=summary.tags,
        experience_months=experience,
        salary_min_monthly=monthly,
        employment="internship"
        if "实习" in text
        else "full_time"
        if experience is not None
        else "unknown",
        detail_complete=detail and bool(summary.description.strip()),
        fingerprint=fingerprint(summary.model_dump(exclude={"url"})),
    )
