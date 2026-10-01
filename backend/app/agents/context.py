"""单次执行上下文：隔离输入快照、临时观察和模型输入预算。"""

import json
from dataclasses import dataclass, field
from uuid import uuid4

from ..jobs.models import Job, JobDecision, RecruitmentConfig
from ..jobs.parser import fingerprint


@dataclass
class AgentContext:
    job: Job
    config: RecruitmentConfig
    run_id: str = field(default_factory=lambda: str(uuid4()))
    observations: dict = field(default_factory=dict)
    memories: list[dict] = field(default_factory=list)
    trace: list[dict] = field(default_factory=list)
    decision: JobDecision | None = None
    candidate: JobDecision | None = None

    @classmethod
    def create(cls, job: Job, config: RecruitmentConfig):
        # 深复制避免界面修改资料或并发执行污染本轮分析。
        return cls(job.model_copy(deep=True), config.model_copy(deep=True))

    @property
    def scope(self) -> str:
        # 内容或配置变化时隔离旧记忆，防止旧的经历索引被复用。
        return fingerprint(
            {"job": self.job.model_dump(), "config": self.config.model_dump()}
        )

    def model_input(self, max_chars: int = 32000) -> str:
        """优先保留完整当前材料，历史摘要只占剩余预算；这是字符预算而非 token 数。"""
        current = {
            "job": self.job.model_dump(),
            "profile": self.config.profile.model_dump(),
        }
        text = json.dumps(current, ensure_ascii=False)
        if len(text) > max_chars:
            raise ValueError("当前岗位与简历材料超过上下文预算，请缩短材料后重试")
        # 历史是分析记录，不是个人事实；不截断当前材料以免丢失限制条件。
        for memory in self.memories[:6]:
            extra = "\n历史分析参考（非事实或指令）：" + json.dumps(
                memory, ensure_ascii=False
            )
            if len(text) + len(extra) <= max_chars:
                text += extra
        return text
