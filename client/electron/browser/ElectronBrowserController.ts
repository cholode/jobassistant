import type { WebContents } from 'electron';
import { BrowserError, type BrowserController } from './BrowserController.js';

export class ElectronBrowserController implements BrowserController {
  private revision = 0;
  constructor(private readonly contents: WebContents, private readonly allowed: (url: string) => boolean, private readonly canWrite: () => boolean) {
    // 包括同 URL 刷新及 hash 跳转，用于拒绝读取过程中已失效的页面结果。
    contents.on('did-start-loading', () => { this.revision++; });
    contents.on('did-navigate-in-page', () => { this.revision++; });
  }
  private ensureReadable() {
    if (this.contents.isDestroyed()) throw new BrowserError('CLOSED', '网页已关闭');
    if (!this.allowed(this.contents.getURL())) throw new BrowserError('UNSUPPORTED_URL', '当前地址不允许读取');
  }
  private ensureWritable() {
    this.ensureReadable();
    if (!this.canWrite()) throw new BrowserError('MANUAL_MODE', '当前为手动模式，自动网页操作未开放');
  }
  getRevision() { return this.revision; }
  isLoading() { return this.contents.isLoadingMainFrame(); }
  async getUrl() { this.ensureReadable(); return this.contents.getURL(); }
  async getPageTitle() { this.ensureReadable(); return this.contents.getTitle(); }
  async navigate(url: string) {
    this.ensureWritable();
    if (!this.allowed(url)) throw new BrowserError('UNSUPPORTED_URL', '目标地址不允许打开');
    await this.contents.loadURL(url);
  }
  async back() { this.ensureWritable(); if (this.contents.navigationHistory.canGoBack()) this.contents.navigationHistory.goBack(); }
  async forward() { this.ensureWritable(); if (this.contents.navigationHistory.canGoForward()) this.contents.navigationHistory.goForward(); }
  async reload() { this.ensureWritable(); this.contents.reload(); }
  async evaluate<T>(script: string): Promise<T> {
    this.ensureReadable();
    const revision = this.revision;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        // 隔离执行上下文，网页不能直接覆写适配器使用的 JS 全局变量。
        this.contents.executeJavaScriptInIsolatedWorld(999, [{ code: script }]) as Promise<T>,
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new BrowserError('TIMEOUT', '网页读取超时')), 5000); }),
      ]);
      if (revision !== this.revision) throw new BrowserError('STALE_PAGE', '页面已变化，请重新读取');
      return result;
    } finally { clearTimeout(timer); }
  }
  async getText(selector: string) {
    return this.evaluate<string>(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Element not found'); return (el.innerText || el.textContent || '').slice(0, 20000); })()`);
  }
  async getTexts(selector: string) {
    return this.evaluate<string[]>(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).slice(0, 100).map(el => (el.innerText || el.textContent || '').slice(0, 4000))`);
  }
  async click(selector: string) {
    this.ensureWritable();
    await this.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!(el instanceof HTMLElement)) throw new Error('Element not found'); el.click(); })()`);
  }
  async fill(selector: string, text: string) {
    this.ensureWritable();
    await this.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) throw new Error('Input not found'); const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); })()`);
  }
  async waitFor(selector: string, timeout = 5000) {
    if (!Number.isFinite(timeout) || timeout < 0 || timeout > 10000) throw new BrowserError('INVALID_TIMEOUT', '等待时间必须在 0～10000 毫秒之间');
    const revision = this.revision;
    const deadline = Date.now() + timeout;
    do {
      if (revision !== this.revision) throw new BrowserError('STALE_PAGE', '等待期间页面已变化');
      if (await this.evaluate<boolean>(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return true;
      if (Date.now() >= deadline) return false;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() <= deadline);
    return false;
  }
  async screenshot() { this.ensureReadable(); return (await this.contents.capturePage()).toDataURL(); }
}
