// 与 Python browser/protocol.py 对应；RPC 只接受语义命令，不接受网页脚本。
export type BrowserCommandName = 'GET_PAGE_DATA' | 'GET_JOB_DETAIL' | 'GET_CHAT_MESSAGES';
export interface JobSummary {
  id: string;
  title: string;
  company: string;
  salary: string;
  location: string;
  url: string;
  tags: string[];
  description: string;
}
export interface ChatMessage {
  sender: 'hr' | 'me' | 'unknown';
  text: string;
}
export interface PageReading {
  operation?: { operation_id: string; action: string };
  url: string;
  title: string;
  platform: 'mock' | 'generic';
  kind: 'job_list' | 'job_detail' | 'chat' | 'unknown' | 'verification';
  text: string;
  truncated: boolean;
  read_at: string;
  jobs: JobSummary[];
  messages: ChatMessage[];
  notice: string;
}
export interface BrowserCommand {
  type: 'browser_command';
  request_id: string;
  command: BrowserCommandName;
  payload: { expected_url: string | null };
}
export type BrowserResult = {
  type: 'browser_result';
  request_id: string;
} & (
  | { success: true; data: PageReading }
  | { success: false; error: { code: string; message: string } }
);
