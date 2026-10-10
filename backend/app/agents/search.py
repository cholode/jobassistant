"""自主寻岗：按保存的关键词逐页发现候选，去重后交给既有分析与投递流程。"""

import asyncio
import re
from urllib.parse import urlsplit


class JobSearchAgent:
    """只生成候选，不把搜索列表视作投递依据；详情校验由执行阶段完成。"""

    def __init__(self, rpc, keywords, max_pages, check, progress):
        self.rpc = rpc
        self.keywords = list(
            dict.fromkeys(word.strip() for word in keywords if word.strip())
        )
        self.max_pages = max_pages
        self.check, self.progress = check, progress
        self.discovered = 0
        self.summary = ""

    async def candidates(self):
        seen = set()
        endings = []
        for keyword in self.keywords:
            page_signatures = set()
            for number in range(1, self.max_pages + 1):
                self.check()
                await self.progress(keyword, number, self.discovered)
                page = await self.rpc.execute(
                    "SEARCH_JOBS", {"keyword": keyword, "page": number}
                )
                self.check()
                if page.platform != "boss" or page.kind != "job_list":
                    raise ValueError(
                        page.notice or "搜索页未能识别，请检查登录或验证状态"
                    )
                location = urlsplit(page.url)
                if (
                    location.netloc != "www.zhipin.com"
                    or location.scheme != "https"
                    or location.path != "/web/geek/job"
                ):
                    raise ValueError("搜索结果来源不符，已停止")
                urls = []
                for job in page.jobs:
                    url = urlsplit(job.url)
                    if (
                        url.scheme != "https"
                        or url.netloc != "www.zhipin.com"
                        or not re.fullmatch(
                            r"/job_detail/[A-Za-z0-9_-]+\.html", url.path
                        )
                    ):
                        raise ValueError("搜索结果包含无效职位地址，已停止")
                    urls.append(f"https://www.zhipin.com{url.path}")
                signature = tuple(sorted(set(urls)))
                if not signature:
                    endings.append(f"{keyword}：结果已结束")
                    break
                if signature in page_signatures:
                    endings.append(f"{keyword}：翻页结果重复，停止该关键词")
                    break
                page_signatures.add(signature)
                for url in dict.fromkeys(urls):
                    if url in seen:
                        continue
                    seen.add(url)
                    self.discovered += 1
                    self.check()
                    yield None, url
                if number == self.max_pages:
                    endings.append(f"{keyword}：达到搜索页数上限")
                else:
                    # 空候选/全部跳过时也保持搜索节奏，不紧密连续翻页。
                    await asyncio.sleep(1)
        self.summary = "；".join(endings)
