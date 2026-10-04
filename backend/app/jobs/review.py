"""自动沟通前的语境复核：既往雇主与可能过期的招聘截止时间。"""

import re
from datetime import date, datetime, timedelta, timezone

from .models import Job, Profile


def recruitment_today() -> date:
    """国内招聘日期统一按北京时间计算，避免打包运行主机时区不同。"""
    return datetime.now(timezone(timedelta(hours=8))).date()


def context_review_reasons(
    job: Job, profile: Profile, today: date | None = None
) -> list[str]:
    """只转人工复核，不擅自推断用户离职原因或招聘是否已结束。"""
    today = today or recruitment_today()
    reasons = []
    # BOSS 的毕业时间字段是明确届别条件，不能被技术匹配分数覆盖。
    graduation = next(
        (
            re.search(r"(20\d{2})年(?:\d{1,2}月)?毕业|(20\d{2})届", fact)
            for fact in profile.facts
            if re.search(r"本科|硕士|博士|大专", fact)
            and re.search(r"(20\d{2})年(?:\d{1,2}月)?毕业|(20\d{2})届", fact)
        ),
        None,
    )
    required = re.search(
        r"毕业时间\s*[:：]\s*(20\d{2})年?(?:\s*[-~～至]\s*(20\d{2})年?)?",
        job.description,
    )
    if graduation and required:
        actual = int(graduation.group(1) or graduation.group(2))
        first, last = (
            int(required.group(1)),
            int(required.group(2) or required.group(1)),
        )
        if not first <= actual <= last:
            reasons.append(f"岗位毕业年份要求与材料中的 {actual} 年不符，需要复核届别")
    # 本科材料不能因技术得分高而越过明确的硕博门槛；正文接受本科时允许继续。
    undergraduate = any("本科" in fact for fact in profile.facts) and not any(
        re.search(r"硕士|博士", fact) for fact in profile.facts
    )
    accepts_undergraduate = re.search(
        r"本科(?:及以上|以上|[^。；\n]{0,20}(?:在读|在校))", job.description
    )
    if (
        undergraduate
        and re.search(r"硕士|博士", job.location)
        and not accepts_undergraduate
    ):
        reasons.append("岗位标注硕士或博士，当前材料仅体现本科，需核实学历门槛")
    company = job.company.strip()
    if len(company) >= 4 and any(
        re.search(
            rf"在[^。；\n]{{0,30}}{re.escape(company)}[^。；\n]{{0,20}}(?:实习|任职|从事|担任)",
            fact,
        )
        for fact in profile.facts
    ):
        reasons.append("招聘公司出现在既往任职经历中，需复核沟通意图及开场")

    for match in re.finditer(
        r"(?:招聘|投递|申请|报名)?截止(?:日期|时间)?\s*[：:]?\s*"
        r"(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日",
        job.description,
    ):
        year, month, day = match.groups()
        try:
            deadline = date(int(year or today.year), int(month), int(day))
        except ValueError:
            reasons.append("招聘截止日期格式异常，需要核实")
            continue
        if deadline < today:
            qualification = "" if year else "（正文未标年份，按本年比较）"
            reasons.append(
                f"招聘截止日期 {deadline.isoformat()} 早于当前日期"
                f" {today.isoformat()}{qualification}，需核实岗位仍有效"
            )
    return list(dict.fromkeys(reasons))
