"""反思层：对候选结论做确定性复核，返回修正结果及可解释反馈。"""

from dataclasses import dataclass

from ..jobs.models import JobDecision
from ..jobs.rules import contains, hard_filter
from .context import AgentContext


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
        text = f"{job.title} {job.description} {' '.join(job.tags)}"
        matched = [skill for skill in profile.skills if contains(text, skill)]
        if result.matched_skills != matched:
            feedback.append("匹配技能已按当前资料和岗位重新核对")
        result.matched_skills = matched
        valid = list(
            dict.fromkeys(
                i
                for i in result.evidence_ids
                if 0 <= i < len(profile.facts)
                and any(contains(profile.facts[i], skill) for skill in matched)
            )
        )
        if valid != result.evidence_ids:
            feedback.append("已移除越界、重复或无法关联匹配技能的证据索引")
        result.evidence_ids = valid

        if (
            not job.detail_complete or not profile.facts or not matched
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
