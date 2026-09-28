// 主进程与工作台共用的通信类型；修改字段时需要同步两端的读写逻辑。
// home 是模拟站入口，发布版端口动态分配，因此不能由界面硬编码。
export interface PageState { home?: string; url: string; title: string; loading: boolean; canBack: boolean; canForward: boolean }
// running 只表示协调流程已恢复，当前阶段仍是手动模式，不会自动投递。
// revision 是状态修订号，page 是后端最近接收的页面地址与标题。
export interface AgentState { status: 'paused' | 'running'; mode: 'manual'; revision: number; page: { url: string; title: string } }
export interface LogEntry { id: string; time: string; text: string; kind: 'info' | 'success' | 'warning' }
// 工作台每次接收完整快照；latency 为请求往返毫秒数，尚未测量或离线时为 null。
export interface Snapshot { connected: boolean; agent: AgentState; browser: PageState; logs: LogEntry[]; latency: number | null }
export interface DesktopAPI {
  // 获取初始快照；订阅函数返回取消订阅方法。
  snapshot(): Promise<Snapshot>;
  subscribe(callback: (state: Snapshot) => void): () => void;
  navigate(url: string): Promise<void>;
  browserAction(action: 'back' | 'forward' | 'reload' | 'home'): Promise<void>;
  // 使用工作台视口中的 CSS 像素坐标定位原生网页视图。
  bounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
  agentAction(action: 'pause' | 'resume' | 'ping'): Promise<void>;
}
