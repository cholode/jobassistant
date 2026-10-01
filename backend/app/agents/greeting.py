"""招呼语生成：只引用用户原始事实，不执行任何网页写入。"""

from ..jobs.models import Job, JobDecision, RecruitmentConfig


def greeting(job: Job, decision: JobDecision, config: RecruitmentConfig) -> str:
    # 招呼语使用用户提供的原始事实，模型评分不能变成虚构经历。
    profile = config.profile
    intro = f"您好，我是{profile.name}。" if profile.name else "您好！"
    skills = "、".join(decision.matched_skills[:5])
    evidence = [
        profile.facts[i]
        for i in decision.evidence_ids[:2]
        if 0 <= i < len(profile.facts)
    ]
    body = f"我对贵公司的{job.title}岗位感兴趣。"
    if skills:
        body += f"我具备{skills}相关技能。"
    if evidence:
        body += "与岗位相关的经历：" + "；".join(evidence) + "。"
    if job.employment == "internship" and profile.days_per_week and profile.months:
        body += f"可每周实习{profile.days_per_week}天，至少{profile.months}个月。"
    return (intro + body + "期待进一步沟通。")[:1500]
