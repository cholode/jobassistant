import type { BrowserController } from '../browser/BrowserController.js';
import type { PageReading } from '../../shared/browser.js';

export interface PlatformAdapter {
  matches(url: URL): boolean;
  read(browser: BrowserController): Promise<PageReading>;
}
