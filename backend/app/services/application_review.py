"""投递后复盘：保存真实回执与匹配依据，只供本人查看，不生成对外消息。"""

from ..database.repository import now


def build_review(record, analysis):
    """回执是否成功来自投递状态机；匹配分不是录用概率。"""
    return {
        "application_id": record["id"],
        "company": record["company"],
        "title": record["title"],
        "url": record["job"]["url"],
        "message": record["message"],
        "receipt_verified": record["status"] == "WAITING_REPLY",
        "match_score": analysis["match_score"],
        "strengths": analysis["strengths"],
        "private_gaps": analysis["concerns"],
        "created_at": now(),
        "reviewed": False,
    }
