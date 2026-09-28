// 平台适配器依赖这个接口，不直接持有 Electron 的 WebContents。
export interface BrowserController {
  getUrl(): Promise<string>;
  getPageTitle(): Promise<string>;
  navigate(url: string): Promise<void>;
  back(): Promise<void>;
  forward(): Promise<void>;
  reload(): Promise<void>;
  getText(selector: string): Promise<string>;
  getTexts(selector: string): Promise<string[]>;
  click(selector: string): Promise<void>;
  fill(selector: string, text: string): Promise<void>;
  waitFor(selector: string, timeout?: number): Promise<boolean>;
  // 仅供应用内受信任的适配器使用，禁止将此方法直接暴露给 RPC 或网页。
  evaluate<T>(script: string): Promise<T>;
  screenshot(): Promise<string>;
  getRevision(): number;
  isLoading(): boolean;
}

export class BrowserError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
