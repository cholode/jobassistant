export interface PageState { url: string; title: string; loading: boolean; canBack: boolean; canForward: boolean }
export interface AgentState { status: 'paused' | 'running'; mode: 'manual'; revision: number; page: { url: string; title: string } }
export interface LogEntry { id: string; time: string; text: string; kind: 'info' | 'success' | 'warning' }
export interface Snapshot { connected: boolean; agent: AgentState; browser: PageState; logs: LogEntry[]; latency: number | null }
export interface DesktopAPI {
  snapshot(): Promise<Snapshot>;
  subscribe(callback: (state: Snapshot) => void): () => void;
  navigate(url: string): Promise<void>;
  browserAction(action: 'back' | 'forward' | 'reload' | 'home'): Promise<void>;
  bounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
  agentAction(action: 'pause' | 'resume' | 'ping'): Promise<void>;
}
