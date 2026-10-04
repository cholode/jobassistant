"""招呼语生成：只引用用户原始事实，不执行任何网页写入。"""

import re

from ..jobs.models import Job, JobDecision, RecruitmentConfig
from .evidence import evidence_score


def education_intro(facts: list[str]) -> str:
    """提取材料中的学历与毕业时间，不把转专业等额外说明塞进首次招呼。"""
    for fact in facts:
        main = re.split(r"[；;。]", fact, maxsplit=1)[0]
        school = re.split(r"[，,]", main, maxsplit=1)[0]
        graduation = re.search(r"20\d{2}届|(?:预计)?20\d{2}年(?:\d{1,2}月)?毕业", main)
        if re.search(r"本科|硕士|博士|大专", school) and graduation:
            if graduation.group() in school:
                return school + "。"
            return f"{school}，{graduation.group()}。"
    return ""


def greeting(job: Job, decision: JobDecision, config: RecruitmentConfig) -> str:
    # 对外只引用优势与真实经历；concerns/反思缺口仅供用户查看，绝不拼入招呼语。
    # 招呼语使用用户提供的原始事实，模型评分不能变成虚构经历。
    profile = config.profile
    intro = f"您好，我是{profile.name}。" if profile.name else "您好！"
    # 校招或实习显式提供已确认的学校与届别，避免 HR 再追问基础资格。
    if job.employment == "internship" or re.search(
        r"应届|在校|毕业时间|校招", f"{job.location} {job.description}"
    ):
        intro += education_intro(profile.facts)
    skills = "、".join(decision.matched_skills[:5])
    # 模型的引用顺序未必代表相关度；优先展示覆盖岗位标题和技术标签的经历。
    # 仅重排已核实的原始事实，不把模型的优势描述直接变成对外承诺。
    evidence_ids = list(
        dict.fromkeys(i for i in decision.evidence_ids if 0 <= i < len(profile.facts))
    )
    evidence_ids.sort(
        key=lambda i: evidence_score(job, profile.facts[i]),
        reverse=True,
    )
    evidence = [profile.facts[i].rstrip("。；; \n") for i in evidence_ids[:2]]
    body = f"我对贵公司的{job.title}岗位感兴趣。"
    if skills:
        body += f"我具备{skills}相关技能。"
    if evidence:
        body += "与岗位相关的经历：" + "；".join(evidence) + "。"
    if job.employment == "internship" and profile.days_per_week and profile.months:
        body += f"可每周实习{profile.days_per_week}天，至少{profile.months}个月。"
    if profile.arrival_date:
        body += f"到岗安排：{profile.arrival_date}。"
    return (intro + body + "期待进一步沟通。")[:1500]
