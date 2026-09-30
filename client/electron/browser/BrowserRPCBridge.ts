import type { BrowserCommand, PageReading } from '../../shared/browser.js';
import type { BrowserController } from './BrowserController.js';
import { BrowserError } from './BrowserController.js';
import { executeBrowserCommand } from './rpc.js';
import { executeApplicationCommand } from './application-rpc.js';
import type { ApplicationPayload } from '../platforms/mock/MockApplicationAdapter.js';

export class BrowserRPCBridge {
  constructor(
    private readonly browser: BrowserController,
    private readonly backend: string,
    private readonly token: string,
    private readonly canWrite: () => boolean = () => false,
  ) {}

  // 主进程 WebSocket 接收器只负责分流，不在入口文件内编写页面解析逻辑。
  async handleCommand(socket: WebSocket, message: BrowserCommand) {
    if (typeof message.request_id !== 'string' || message.request_id.length > 100) return;

    const result = ['CONTACT_HR', 'SEND_GREETING'].includes(message.command)
      ? await executeApplicationCommand(
          this.browser,
          this.backend,
          message as unknown as {
            request_id: string;
            command: string;
            payload: ApplicationPayload;
          },
          this.canWrite,
        )
      : await executeBrowserCommand(this.browser, this.backend, message);

    // 结果只能回到发起请求的连接，不能误发给重连后的新会话。
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(result));
  }

  async readPage(): Promise<PageReading> {
    const revision = this.browser.getRevision();
    const expected_url = await this.browser.getUrl();

    // 特意经过 Python HTTP → WebSocket RPC 链路，而非让 React 直接读取 DOM。
    const response = await fetch(`${this.backend}/browser/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Job-Agent-Token': this.token,
      },
      body: JSON.stringify({ command: 'GET_PAGE_DATA', expected_url }),
      signal: AbortSignal.timeout(10000),
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(
        typeof body.detail === 'object' ? body.detail.message : body.detail || '读取失败',
      );
    }
    if (
      revision !== this.browser.getRevision() ||
      body.url !== (await this.browser.getUrl())
    ) {
      throw new BrowserError('STALE_PAGE', '页面已变化，请重新读取');
    }

    return body as PageReading;
  }
}
