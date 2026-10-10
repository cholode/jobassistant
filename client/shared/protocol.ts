import type { PageReading } from './browser.js';
import type { RecruitmentAction } from './recruitment.js';
// 主进程与工作台共用的通信类型；修改字段时需要同步两端的读写逻辑。
// home 是模拟站入口，发布版端口动态分配，因此不能由界面硬编码。
export interface PageState {
  home?: string;
  zoom: number;
  url: string;
  title: string;
  loading: boolean;
  canBack: boolean;
  canForward: boolean;
}
// running 只表示允许执行；实际正在做什么由 activity 描述。
// revision 是状态修订号，page 是后端最近接收的页面地址与标题。
export interface AgentState {
  status: 'paused' | 'running';
  mode: 'manual' | 'copilot' | 'auto';
  revision: number;
  page: { url: string; title: string };
  activity?: AgentActivity;
}
// 操作摘要通过现有 WebSocket 推送，避免前端用定时动画猜测执行阶段。
export interface AgentActivity {
  stage: string;
  label: string;
  status: 'working' | 'waiting' | 'done' | 'error';
  detail: string;
  company: string;
  title: string;
  updated_at: string;
  current_index?: number;
  total?: number;
  sent_count?: number;
  target_count?: number;
}
export interface LogEntry {
  id: string;
  time: string;
  text: string;
  kind: 'info' | 'success' | 'warning';
}
// 工作台每次接收完整快照；latency 为请求往返毫秒数，尚未测量或离线时为 null。
export interface Snapshot {
  connected: boolean;
  agent: AgentState;
  browser: PageState;
  logs: LogEntry[];
  latency: number | null;
}
export interface DesktopAPI {
  recruitment(action: RecruitmentAction, payload?: unknown): Promise<unknown>;
  readPage(): Promise<PageReading>;
  // 获取初始快照；订阅函数返回取消订阅方法。
  snapshot(): Promise<Snapshot>;
  subscribe(callback: (state: Snapshot) => void): () => void;
  navigate(url: string): Promise<void>;
  browserZoom(action: 'in' | 'out' | 'reset'): Promise<void>;
  browserAction(action: 'back' | 'forward' | 'reload' | 'home'): Promise<void>;
  // 使用工作台视口中的 CSS 像素坐标定位原生网页视图。
  bounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
  agentAction(
    action: 'pause' | 'resume' | 'ping' | 'copilot' | 'manual' | 'auto',
  ): Promise<void>;
}
