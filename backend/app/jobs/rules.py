"""先执行硬规则；未知字段进入人工复核，不能当作已经满足。"""

import re
from datetime import date, datetime, timedelta, timezone

from .activity import activity_block_reason
from .models import Job, Preferences


def contains(text: str, keyword: str) -> bool:
    """Go 排除英文单词内部命中，但允许“Go开发”等中英文相邻写法。"""
    if keyword.lower() == "go":
        return bool(
            re.search(
                r"(?<![A-Za-z0-9_])go(?![A-Za-z0-9_])|golang", text, re.IGNORECASE
            )
        )
    return keyword.casefold() in text.casefold()


def hard_filter(job: Job, preference: Preferences) -> list[str]:
    """返回已知的不符合项；空列表不代表所有未知要求都已满足。"""
    reasons = []
    # 当前工作类型只支持实习与正式工作，兼职不能自动混入。
    if re.search(r"兼职|part[ -]?time", job.title, re.IGNORECASE):
        reasons.append("岗位标题明确为兼职，不属于已选择的实习或正式工作")
    # BOSS 只沟通七天内活跃的招聘者；这项检查先于模型且在发送前再次执行。
    if job.platform == "boss":
        activity_reason = activity_block_reason(job.recruiter_activity)
        if activity_reason:
            reasons.append(activity_reason)
    # 页面“招聘中”可能未及时更新；明确写出的截止日期也必须核验。
    deadlines = re.findall(
        r"(?:招聘截止日期|报名截止日期|投递截止日期|截止时间)\s*[:：]?\s*"
        r"(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})日?",
        job.description,
    )
    for year, month, day in deadlines:
        try:
            deadline = date(int(year), int(month), int(day))
        except ValueError:
            reasons.append("岗位截止日期格式异常，需要人工核实")
            continue
        if deadline < datetime.now(timezone(timedelta(hours=8))).date():
            reasons.append(f"岗位截止日期 {deadline.isoformat()} 已过，不自动沟通")
    if preference.keywords and not any(
        contains(job.title, word) for word in preference.keywords
    ):
        reasons.append("岗位方向不符合目标关键词")
    if preference.cities and not any(
        city in job.location for city in preference.cities
    ):
        reasons.append("工作地点不在期望城市内")
    if any(
        name.casefold() in job.company.casefold()
        for name in preference.blacklist
        if name.strip()
    ):
        reasons.append("公司在排除名单中")
    if (
        job.experience_months is not None
        and job.experience_months > preference.max_experience_months
    ):
        reasons.append(f"经验要求至少 {job.experience_months // 12} 年，超过设置范围")
    if job.employment != "unknown" and job.employment not in preference.employment:
        reasons.append("工作类型不符合偏好")
    if (
        job.salary_min_monthly is not None
        and job.salary_min_monthly < preference.minimum_monthly_salary
    ):
        reasons.append("月薪下限低于期望")
    return reasons
