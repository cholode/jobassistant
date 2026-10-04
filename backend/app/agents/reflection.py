"""反思层：对候选结论做确定性复核，返回修正结果及可解释反馈。"""

import re
from dataclasses import dataclass

from ..jobs.models import JobDecision
from ..jobs.review import context_review_reasons
from ..jobs.rules import contains, hard_filter
from .context import AgentContext
from .evidence import algorithm_evidence


@dataclass
class ReflectionResult:
    decision: JobDecision
    feedback: list[str]


class DecisionReflector:
    def reflect(
        self, context: AgentContext, candidate: JobDecision
    ) -> ReflectionResult:
        result = candidate.model_copy(deep=True)
        feedback = []
        blocked = hard_filter(context.job, context.config.preferences)
        if blocked:
            return ReflectionResult(
                JobDecision(
                    decision="skip",
                    match_score=0,
                    strengths=[],
                    concerns=blocked,
                    reason="反思检查：硬规则排除",
                ),
                ["候选结果被硬规则覆盖"],
            )

        profile, job = context.config.profile, context.job
        # 即使模型忽略了截止日期或既往雇主，反思层仍阻止直接自动沟通。
        review_reasons = context_review_reasons(job, profile)
        if review_reasons and result.decision == "apply":
            result.decision = "review"
            result.reason = "沟通语境需要人工复核"
            result.concerns.extend(review_reasons)
            feedback.extend(review_reasons)
        # 实习到岗条件也是硬约束，不能只凭技术关键词就自动发送。
        if job.employment == "internship":
            availability = f"{job.location} {job.description}"
            # 实习标签不能覆盖正文的经验门槛；发生矛盾时先核实，而非推断零经验。
            experience = re.search(
                r"([1-9]\d*)\s*(?:[-~～–至]\s*\d+)?\s*年(?:以上)?"
                r"[^。\n；;]{0,20}经验",
                job.description,
            )
            if experience and result.decision == "apply":
                result.decision = "review"
                result.reason = "实习岗位正文同时要求开发或工作经验，需要核实门槛"
                result.concerns.append(result.reason)
                feedback.append("实习标签与正文经验条件存在冲突，不直接自动沟通")
            days = re.search(
                r"(?:每周|一周)\s*(?:至少)?\s*(\d)\s*天|(\d)\s*天\s*/\s*周",
                availability,
            )
            months = re.search(
                r"(?:至少|不少于|实习周期[：:]?)\s*(\d+)\s*个?月", availability
            )
            required_days = int(days.group(1) or days.group(2)) if days else None
            required_months = int(months.group(1)) if months else None
            if (
                required_days
                and profile.days_per_week is not None
                and required_days > profile.days_per_week
            ) or (
                required_months
                and profile.months is not None
                and required_months > profile.months
            ):
                result.decision = "skip"
                result.reason = "岗位实习出勤或时长超出已确认条件"
                result.concerns.append(result.reason)
                return ReflectionResult(result, ["实习可用时间不匹配，不自动沟通"])
        text = f"{job.title} {job.description} {' '.join(job.tags)}"
        matched = [skill for skill in profile.skills if contains(text, skill)]
        if result.matched_skills != matched:
            feedback.append("匹配技能已按当前资料和岗位重新核对")
        result.matched_skills = matched
        # 项目事实也能证明岗位相关经历，不能仅因技能列表没有 Electron 等词就删除。
        evidence_keywords = list(
            dict.fromkeys(
                matched
                + job.tags
                + re.findall(r"[A-Za-z][A-Za-z0-9+#.-]{1,}", job.title)
            )
        )
        valid = list(
            dict.fromkeys(
                i
                for i in result.evidence_ids
                if 0 <= i < len(profile.facts)
                and (
                    any(
                        contains(profile.facts[i], skill) for skill in evidence_keywords
                    )
                    or algorithm_evidence(job, profile.facts[i])
                )
            )
        )
        if valid != result.evidence_ids:
            feedback.append("已移除越界、重复或无法关联匹配技能的证据索引")
        result.evidence_ids = valid

        # “Go+Vue3”等标题明确要求组合技术栈，不能因只匹配 Go 就给自动投递放行。
        if re.search(r"[+＋&]", job.title):
            missing_core = [
                skill
                for skill in ["Vue3", "React", "Electron"]
                if contains(job.title, skill)
                and not any(
                    contains(fact, skill) for fact in profile.skills + profile.facts
                )
            ]
            if missing_core and result.decision == "apply":
                result.decision = "review"
                result.reason = "组合岗位核心技能缺少材料依据：" + "、".join(
                    missing_core
                )
                result.concerns.append(result.reason)
                feedback.append("组合技术栈未全部获得资料支持，先人工复核")

        # 页面明确显示长期不活跃时，保留岗位供手动评估，避免消耗自动沟通名额。
        if re.search(r"半年前活跃|[6-9]月内活跃|\d+年前活跃", job.description):
            result.concerns.append("招聘者长期不活跃，建议先核实岗位有效性")
            if result.decision == "apply":
                result.decision = "review"
                result.reason = "招聘者长期不活跃，需要核实后再沟通"
                feedback.append("活跃度检查将自动沟通改为待复核")

        if (
            not job.detail_complete
            or not profile.facts
            or not matched
            or job.experience_months is None
        ) and result.decision == "apply":
            result.decision = "review"
            result.reason = "反思检查：当前材料不足，需要人工复核"
            feedback.append("材料不足，已将直接沟通建议改为待复核")
        required = []
        if not job.detail_complete:
            required.append("尚未读取完整职位详情，需打开该职位后重新分析")
        if job.experience_months is None:
            required.append("经验要求未明确，需要核实")
        if profile.arrival_date is None:
            required.append("到岗日期尚未确认，不在招呼语中承诺")
        if not profile.facts:
            required.append("尚未填写简历经历，不能据此确认实际项目匹配")
        if any(item not in result.concerns for item in required):
            feedback.append("已补充遗漏的待核实事项")
        result.concerns = list(dict.fromkeys(result.concerns + required))
        return ReflectionResult(result, feedback or ["规则与证据检查通过"])
