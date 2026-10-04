"""招聘者活跃度硬规则：只读取头像旁的状态，不从职位正文猜测。"""

import re


def activity_within_week(label: str) -> bool:
    """时间范围按上界判定；模糊的“近期/月内”不能证明七天内活跃。"""
    value = re.sub(r"\s+", "", label)
    if value in {
        "在线",
        "当前在线",
        "刚刚活跃",
        "刚刚在线",
        "今日活跃",
        "今天活跃",
        "昨日活跃",
        "昨天活跃",
        "本周活跃",
        "一周内活跃",
        "1周内活跃",
    }:
        return True
    match = re.fullmatch(r"(\d+)(分钟|小时|日|天)(?:内|前)活跃", value)
    if not match:
        return False
    number = int(match[1])
    unit = match[2]
    return number <= {"分钟": 7 * 24 * 60, "小时": 7 * 24, "日": 7, "天": 7}[unit]


def activity_block_reason(label: str) -> str | None:
    """返回可展示的跳过原因；缺失状态也不得自动放行。"""
    if activity_within_week(label):
        return None
    if not label.strip():
        return "未读取到招聘者头像旁的活跃时间，跳过自动沟通"
    return f"招聘者活跃状态为“{label}”，不符合七天内活跃要求，跳过沟通"
