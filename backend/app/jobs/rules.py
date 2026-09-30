"""先执行硬规则；未知字段进入人工复核，不能当作已经满足。"""

import re

from .models import Job, Preferences


def contains(text: str, keyword: str) -> bool:
    """Go 使用词边界匹配，减少普通单词中包含 go 造成的误命中。"""
    if keyword.lower() == "go":
        return bool(re.search(r"\bgo\b|golang|go语言", text, re.IGNORECASE))
    return keyword.casefold() in text.casefold()


def hard_filter(job: Job, preference: Preferences) -> list[str]:
    """返回已知的不符合项；空列表不代表所有未知要求都已满足。"""
    reasons = []
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
