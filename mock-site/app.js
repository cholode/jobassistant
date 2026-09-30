// 本地演示数据，仅用于验证浏览与交互，不对应真实招聘信息。
const jobs = [
  {
    id: "1",
    title: "Python 后端开发工程师",
    salary: "20–35K · 14薪",
    city: "深圳",
    exp: "1–3年",
    company: "远山科技",
    icon: "山",
    stage: "B轮 · 100–499人",
    tags: ["Python", "FastAPI", "AI 应用"],
    intro:
      "我们正在打造面向下一代开发者的 AI 工具，寻找喜欢解决真实问题的伙伴。",
    tasks: [
      "参与 AI 应用后端设计，开发稳定可靠的服务。",
      "使用 Python 与 FastAPI 构建接口，优化数据库和异步任务。",
      "与产品、前端工程师协作，持续改善用户体验。",
    ],
  },
  {
    id: "2",
    title: "AI 应用开发工程师",
    salary: "25–40K · 14薪",
    city: "上海",
    exp: "1–3年",
    company: "光年智能",
    icon: "光",
    stage: "A轮 · 50–99人",
    tags: ["LangChain", "LLM", "Agent"],
    intro: "一起把大模型能力变成让用户每天都愿意使用的产品。",
    tasks: [
      "设计和实现 LLM 工作流。",
      "构建可观测、可测试的 Agent 系统。",
      "持续评估模型输出质量，优化用户体验。",
    ],
  },
  {
    id: "3",
    title: "前端开发工程师 · React",
    salary: "18–30K · 13薪",
    city: "深圳",
    exp: "1–3年",
    company: "知序软件",
    icon: "序",
    stage: "不需要融资 · 100–499人",
    tags: ["React", "TypeScript", "Electron"],
    intro: "用细腻的交互与可靠的工程，为知识工作者构建桌面工具。",
    tasks: [
      "开发 React 与 TypeScript 客户端。",
      "优化跨平台桌面应用的交互与性能。",
      "参与设计系统和组件库建设。",
    ],
  },
  {
    id: "4",
    title: "Go 后端开发实习生",
    salary: "180–280元/天",
    city: "广州",
    exp: "经验不限",
    company: "青禾软件",
    icon: "青",
    stage: "100–499人",
    tags: ["Go", "MySQL", "Redis", "Docker"],
    intro: "参与企业招聘与 AI 应用后端开发，每周5天，至少6个月。",
    tasks: [
      "使用 Go 开发 API，处理并发任务、MySQL 查询与 Redis 缓存。",
      "编写单元测试与开发文档，参与 Docker 部署。",
      "了解 SSE 和模型调用计费者优先。",
    ],
  },
];
let city = "全部";
let query = "";
// 模拟消息只保存在内存中，刷新页面即清空，不向外部发送。
// 各岗位拥有独立会话；仅使用本地浏览器存储，便于验证刷新和重复操作。
const sessions = JSON.parse(localStorage.getItem("mock-sessions") || "{}");
const saveSessions = () =>
  localStorage.setItem("mock-sessions", JSON.stringify(sessions));
let messages = [];
const content = document.querySelector("#content");
// 将输入作为文本展示，避免搜索词或聊天内容被当作 HTML 执行。
const escapeHTML = (value) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
function render() {
  // 根据 URL 的 hash 展示列表、职位详情或模拟聊天，无需服务器路由。
  const hash = location.hash;
  if (hash.startsWith("#job/")) {
    const job = jobs.find((job) => job.id === hash.split("/")[1]);
    if (!job) {
      location.hash = "";
      return;
    }
    document.title = `${job.title} · 职遇`;
    content.innerHTML = `<a class="back" href="#">← 返回职位列表</a><article class="detail" data-job-id="${job.id}"><div class="job-top"><h2>${job.title}</h2><span class="salary">${job.salary}</span></div><div class="meta">${job.city} · ${job.exp} · 本科</div><div class="tags">${job.tags.map((tag) => `<span>${tag}</span>`).join("")}</div><div class="company"><span class="company-logo">${job.icon}</span><div class="company-name">${job.company}<small>${job.stage}</small></div></div><h3>关于我们</h3><p>${job.intro}</p><h3>你将负责</h3><ul>${job.tasks.map((task) => `<li>${task}</li>`).join("")}</ul><h3>我们期待</h3><p>热爱技术，有扎实的编程基础。愿意主动沟通，持续学习，和团队一起解决问题。</p><a href="#chat/${job.id}" data-contact-id="${job.id}" class="primary">${sessions[job.id] ? "继续沟通" : "模拟沟通 →"}</a><p class="notice">仅用于浏览与交互演示，不会向任何真实公司投递。</p></article>`;
    content.querySelector("[data-contact-id]").onclick = () => {
      if (!sessions[job.id]) {
        sessions[job.id] = {
          messages: [
            { sender: "me", text: "您好，我对该岗位感兴趣，希望进一步沟通。" },
          ],
          contacts: 1,
        };
        saveSessions();
      }
    };
  } else if (hash === "#chat" || hash.startsWith("#chat/")) {
    const job =
      jobs.find((item) => item.id === hash.split("/")[1]) ||
      jobs.find((item) => item.id === "1");
    if (!sessions[job.id]) sessions[job.id] = { messages: [], contacts: 0 };
    messages = sessions[job.id].messages;
    document.title = `与林女士的模拟沟通 · ${job.company}`;
    content.innerHTML = `<a class="back" href="#">← 返回职位列表</a><div class="detail" data-chat-job-id="${job.id}"><h2>林女士 <small style="font-size:10px;color:#9aac8d">· ${job.company} HR</small></h2><p>${job.title} · ${job.city}</p><div class="bubble">你好！看到你对 Python 开发感兴趣，方便聊聊你的项目经历吗？</div>${messages.map((message) => `<div class="bubble ${message.sender === "me" ? "mine" : ""}">${escapeHTML(message.text)}</div>`).join("")}<form class="chat-form"><input aria-label="模拟消息" placeholder="输入消息，体验手动操作…" maxlength="2000" required><button class="primary">模拟发送</button></form><p class="notice">这是本地模拟会话，消息不会发给真实 HR。Agent 暂停时仍可手动操作。</p></div>`;
    content.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      const input = content.querySelector("input");
      if (input.value.trim()) {
        messages.push({ sender: "me", text: input.value.trim() });
        saveSessions();
        render();
      }
    };
  } else {
    document.title = "职遇 · 模拟招聘站";
    const result = jobs.filter(
      (job) =>
        (city === "全部" || city === job.city) &&
        JSON.stringify(job).toLowerCase().includes(query.toLowerCase()),
    );
    content.innerHTML = `<section class="hero"><span>A LITTLE CLOSER TO YOUR NEXT JOB</span><h1>好工作，<em>从这里遇见。</em></h1><p>每一次探索，都离理想的下一站更近一点。</p><form class="search"><span>⌕</span><input aria-label="搜索职位" value="${escapeHTML(query)}" placeholder="搜索职位、公司或技术关键词"><button>搜索</button></form><div class="filters"><span>城市</span>${["全部", "深圳", "上海", "北京", "杭州"].map((name) => `<button class="${city === name ? "selected" : ""}" data-city="${name}">${name}</button>`).join("")}</div></section><div class="section-head"><h2>为你发现<span>${result.length} 个演示职位</span></h2><span>最新发布 ↓</span></div><div class="jobs">${result.map((job) => `<a href="#job/${job.id}" class="job"><div class="job-top"><span class="job-title">${job.title}</span><span class="salary">${job.salary}</span></div><div class="meta">${job.city} &nbsp; · &nbsp; ${job.exp} &nbsp; · &nbsp; 本科</div><div class="tags">${job.tags.map((tag) => `<span>${tag}</span>`).join("")}</div><div class="company"><span class="company-logo">${job.icon}</span><div class="company-name">${job.company}<small>${job.stage}</small></div><small>今日活跃</small></div></a>`).join("") || '<div class="empty">没有匹配的演示职位，试试其他关键词。</div>'}</div>`;
    content.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      query = content.querySelector("input").value;
      render();
    };
    content.querySelectorAll("[data-city]").forEach((button) => {
      button.onclick = () => {
        city = button.dataset.city;
        render();
      };
    });
  }
}
// 监听前进、后退和链接跳转，保持内容与当前地址一致。
window.addEventListener("hashchange", render);
render();
