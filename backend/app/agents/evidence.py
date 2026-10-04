"""真实经历与岗位要求的关联：兼顾技术项目和算法竞赛等非技术栈证据。"""

import re

from ..jobs.rules import contains


def algorithm_evidence(job, fact: str) -> bool:
    """只关联现有奖项原文，不从奖项推导熟练度、名次或工作经验。"""
    requirements = f"{job.title} {job.description} {' '.join(job.tags)}"
    return bool(
        re.search(r"算法|数据结构|ICPC|CCPC|ACM", requirements, re.IGNORECASE)
        and re.search(r"ICPC|CCPC|ACM|算法竞赛", fact, re.IGNORECASE)
    )


def evidence_score(job, fact: str) -> int:
    """标题与标签优先，算法要求命中奖项时避免始终重复两段同类项目。"""
    keywords = set(re.findall(r"[A-Za-z][A-Za-z0-9+#.-]*", job.title))
    keywords.update(job.tags)
    return sum(contains(fact, word) for word in keywords) + (
        2 if algorithm_evidence(job, fact) else 0
    )
