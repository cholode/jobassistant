import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleHelp, Command, Compass, Globe2, History, Link2, Loader2, LockKeyhole, MessageSquare, Pause, Play, Radio, RefreshCw, Settings2, ShieldCheck, Sparkles, SquareCheckBig, BriefcaseBusiness, Zap } from 'lucide-react';
import type { DesktopAPI, Snapshot } from '../shared/protocol';

declare global { interface Window { desktop: DesktopAPI } }
const useDesktop = create<{ snapshot: Snapshot | null; set: (snapshot: Snapshot) => void }>((set) => ({ snapshot: null, set: (snapshot) => set({ snapshot }) }));
const links = [{ name: '模拟招聘站', url: 'http://127.0.0.1:8765/mock/' }, { name: 'BOSS 直聘', url: 'https://www.zhipin.com/' }, { name: '猎聘', url: 'https://www.liepin.com/' }, { name: '智联招聘', url: 'https://www.zhaopin.com/' }];

export default function App() {
  const { snapshot: data, set } = useDesktop();
  const slot = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState('http://127.0.0.1:8765/mock/');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'overview' | 'activity'>('overview');
  const [tip, setTip] = useState('');
  useEffect(() => {
    let live = true;
    const unsubscribe = window.desktop.subscribe((state) => { if (live) set(state); });
    void window.desktop.snapshot().then((state) => { if (live) set(state); });
    return () => { live = false; unsubscribe(); };
  }, [set]);
  useEffect(() => { if (data?.browser.url) setUrl(data.browser.url); }, [data?.browser.url]);
  useEffect(() => {
    const node = slot.current;
    if (!node) return;
    const update = () => {
      const { x, y, width, height } = node.getBoundingClientRect();
      void window.desktop.bounds({ x, y, width, height });
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    update();
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  useEffect(() => { if (!tip) return; const id = setTimeout(() => setTip(''), 5000); return () => clearTimeout(id); }, [tip]);
  const run = async (action: () => Promise<void>) => {
    setError(''); setBusy(true);
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(error)); }
    finally { setBusy(false); }
  };
  const running = data?.agent.status === 'running';
  const connected = Boolean(data?.connected);
  const logs = data?.logs ?? [];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Command size={23}/></span><span>Job Agent<small>你的求职副驾驶</small></span></div>
      <div className="workspace"><span className="avatar">W</span><div>个人工作空间<small>Local workspace</small></div><ChevronDown size={14}/></div>
      <div className="nav-label">工作台</div>
      <nav>
        <button className="nav-item active" onClick={() => setTab('overview')}><Compass size={18}/>招聘浏览器<span className="nav-dot"/></button>
        {[{ icon: BriefcaseBusiness, text: '职位收藏', phase: 'Phase 3' }, { icon: MessageSquare, text: '沟通消息', phase: 'Phase 5' }, { icon: SquareCheckBig, text: '待确认事项', phase: 'Phase 5' }].map(({ icon: Icon, text, phase }) => <button key={text} className="nav-item upcoming" onClick={() => setTip(`${text}将在 ${phase} 实现，当前可体验网页浏览与连接控制。`)}><Icon size={18}/>{text}<span className="soon">待开发</span></button>)}
        <button className={`nav-item ${tab === 'activity' ? 'selected' : ''}`} onClick={() => setTab('activity')}><History size={18}/>运行记录<span className="count">{logs.length}</span></button>
      </nav>
      <div className="sidebar-bottom"><div className="phase-card"><div><span className="tiny-dot"/> PHASE 01 <span>已就绪</span></div><strong>先把工作台搭起来。</strong><p>浏览网页，连接后端，<br/>随时暂停并接管。</p><div className="phase-progress"><i/></div><small>基础连接与桌面浏览器</small></div>
      <button className="nav-item" onClick={() => setTip('Phase 1 使用 Manual 模式，无需配置模型 API Key。完整设置将在后续阶段开放。')}><Settings2 size={17}/>设置与偏好</button><div className="profile"><span className="profile-avatar">我</span><div>我的求职空间<small>数据保留在本机</small></div><ShieldCheck size={16}/></div></div>
    </aside>
    <main className="main-shell">
      <header className="topbar"><div className="breadcrumb">工作台 <span>/</span><strong>招聘浏览器</strong></div><div className="top-actions"><span className={`connection ${connected ? 'online' : ''}`}><i/>{connected ? '本地服务已连接' : '正在连接本地服务'}</span><span className="divider"/><button className="icon-button" aria-label="使用提示" onClick={() => setTip('可在模拟站内浏览职位和聊天。Pause 仅暂停协调流程，你仍可自由操作网页。')}><CircleHelp size={18}/></button><span className="user-circle">W</span></div></header>
      <div className="page-heading"><div><div className="eyebrow">YOUR NEXT CHAPTER</div><h1>发现下一份可能<span>.</span></h1><p>把浏览留给你，把繁琐的事逐步交给 Agent。</p></div><div className="heading-actions"><span className="version-tag">Phase 1 预览</span><button className={`control-button ${running ? 'pause' : 'resume'}`} disabled={!connected || busy} onClick={() => void run(() => window.desktop.agentAction(running ? 'pause' : 'resume'))}>{busy ? <Loader2 size={16} className="spin"/> : running ? <Pause size={16}/> : <Play size={16}/>} {running ? '暂停 Agent' : '恢复 Agent'}</button></div></div>
      <div className="work-area"><section className="browser-card"><div className="browser-tabbar"><span className="browser-tab"><Globe2 size={15}/><span>{data?.browser.title || '招聘浏览器'}</span></span><span className="webview-tag">独立浏览会话 <LockKeyhole size={12}/></span></div>
        <form className="addressbar" onSubmit={(event) => { event.preventDefault(); void run(() => window.desktop.navigate(url.startsWith('http') ? url : `https://${url}`)); }}>
          <button type="button" className="icon-button" aria-label="后退" disabled={!data?.browser.canBack} onClick={() => void run(() => window.desktop.browserAction('back'))}><ArrowLeft size={17}/></button><button type="button" className="icon-button" aria-label="前进" disabled={!data?.browser.canForward} onClick={() => void run(() => window.desktop.browserAction('forward'))}><ArrowRight size={17}/></button><button type="button" className="icon-button" aria-label="刷新" onClick={() => void run(() => window.desktop.browserAction('reload'))}><RefreshCw size={15} className={data?.browser.loading ? 'spin' : ''}/></button><div className="url-input"><LockKeyhole size={13}/><input aria-label="网页地址" value={url} onChange={(event) => setUrl(event.target.value)}/><button type="submit" aria-label="打开地址"><ArrowRight size={14}/></button></div>
        </form>
        <div className="bookmarks">{links.map((link, index) => <button key={link.name} className={url.startsWith(link.url) ? 'current' : ''} onClick={() => void run(() => window.desktop.navigate(link.url))}><span className={`bookmark-dot dot-${index}`}/>{link.name}</button>)}<span className="bookmark-caption">平台快捷入口</span></div>
        <div className="browser-slot" ref={slot}/>
        <div className="browser-footer"><span><ShieldCheck size={13}/> 安全隔离的浏览环境</span><span>网页操作始终由你掌控</span></div>
      </section>
      <aside className="copilot"><div className="copilot-title"><span className="sparkle-box"><Sparkles size={18}/></span><div><strong>Agent Copilot</strong><small>与你一起，找到更合适的工作</small></div><span className="live-dot"/></div><div className="panel-tabs"><button className={tab === 'overview' ? 'chosen' : ''} onClick={() => setTab('overview')}>工作状态</button><button className={tab === 'activity' ? 'chosen' : ''} onClick={() => setTab('activity')}>运行记录 <span>{logs.length}</span></button></div>
        <div className="panel-body">{tab === 'overview' ? <>
          <div className={`agent-state-card ${running ? 'running' : ''}`}><div className="state-icon">{running ? <Radio size={23}/> : <Pause size={22}/>}</div><span className="state-label">{!connected ? '等待后端连接' : running ? '工作流已恢复' : 'Agent 已暂停'}</span><p>{running ? '连接与页面状态同步中。' : '放心浏览，网页现在由你接管。'}<br/>当前阶段不会自动投递或发消息。</p><span className="manual-pill"><span/> MANUAL MODE</span></div>
          <div className="section-caption">当前页面 <Globe2 size={14}/></div><div className="page-info"><span className="page-icon"><BriefcaseBusiness size={18}/></span><div><strong>{data?.browser.title || '等待页面加载'}</strong><small>{url.includes('/mock/') ? '本地模拟招聘平台' : '外部招聘网站'}</small></div><ArrowUpRight size={15}/></div>
          <div className="section-caption">连接检查 <Link2 size={14}/></div><div className="connection-list"><div><span><i className="check-icon"><Check size={12}/></i>Electron 浏览器</span><b>已就绪</b></div><div><span><i className={connected ? 'check-icon' : 'muted-icon'}><Check size={12}/></i>Python 后端</span><b>{connected ? '已连接' : '重连中'}</b></div><div><span><i className={connected ? 'check-icon' : 'muted-icon'}><Check size={12}/></i>WebSocket 通道</span><b>{connected ? `${data?.latency ?? '—'} ms` : '离线'}</b></div></div><button className="test-button" disabled={!connected || busy} onClick={() => void run(() => window.desktop.agentAction('ping'))}><Zap size={14}/>测试双向通信<ArrowRight size={14}/></button>
          <div className="next-card"><span><Sparkles size={14}/> 接下来 · Phase 2</span><strong>让 Agent 读懂当前网页</strong><p>接入 Browser RPC 与平台适配器，让页面内容成为可分析的数据。</p></div>
          <div className="mini-activity"><div className="section-caption">最近活动<button onClick={() => setTab('activity')}>查看全部 <ArrowRight size={12}/></button></div>{logs.slice(0, 2).map((entry) => <div className="mini-event" key={entry.id}><i className={entry.kind}/><p>{entry.text}<small>{new Date(entry.time).toLocaleTimeString('zh-CN', { hour12: false })}</small></p></div>)}</div>
        </> : <div className="activity-list"><div className="section-caption">本次会话 · {logs.length} 条事件<History size={14}/></div>{logs.map((entry) => <div className="event" key={entry.id}><i className={entry.kind}/><div><span>{entry.text}</span><small>{new Date(entry.time).toLocaleTimeString('zh-CN', { hour12: false })}</small></div></div>)}<p className="session-note">Phase 1 记录保存在内存中，最多展示 80 条。</p></div>}</div>
        <div className="copilot-footer"><ShieldCheck size={13}/>重要决定，始终由你确认。</div>
      </aside></div>
      <footer className="statusbar"><span><i className={connected ? 'status-green' : 'status-gray'}/>{connected ? '系统就绪' : '服务离线'}<span className="status-separator">/</span>{running ? '工作流运行中' : '手动接管中'}</span><span><span className="keyboard">MANUAL</span> 网页可自由操作<span className="status-separator">·</span>v0.1.0</span></footer>
    </main>{(error || tip) && <div role="status" className={`toast ${error ? 'error' : ''}`} onClick={() => { setError(''); setTip(''); }}>{error || tip}<button aria-label="关闭提示">×</button></div>}
  </div>;
}

