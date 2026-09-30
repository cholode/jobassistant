import { useEffect, useState } from 'react';
import { Globe2, LockKeyhole, ShieldCheck } from 'lucide-react';
import type { Snapshot } from '../../../shared/protocol';
import { useBrowserBounds } from '../../hooks/useBrowserBounds';
import { BrowserToolbar } from './BrowserToolbar';
const links = [
  { name: '模拟招聘站', url: 'http://127.0.0.1:8765/mock/' },
  { name: 'BOSS 直聘', url: 'https://www.zhipin.com/' },
  { name: '猎聘', url: 'https://www.liepin.com/' },
  { name: '智联招聘', url: 'https://www.zhaopin.com/' },
];
interface Props {
  data: Snapshot | null;
  run: (action: () => Promise<void>) => Promise<void>;
}
export function BrowserPane({ data, run }: Props) {
  const [url, setUrl] = useState('http://127.0.0.1:8765/mock/');
  const slot = useBrowserBounds();
  useEffect(() => {
    if (data?.browser.url) setUrl(data.browser.url);
  }, [data?.browser.url]);
  // 发布版使用随机端口，模拟站地址来自主进程。
  const platformLinks = links.map((link, index) =>
    index === 0 && data?.browser.home ? { ...link, url: data.browser.home } : link,
  );
  return (
    <section className="browser-card">
      <div className="browser-tabbar">
        <span className="browser-tab">
          <Globe2 size={15} />
          <span>{data?.browser.title || '招聘浏览器'}</span>
        </span>
        <span className="webview-tag">
          独立浏览会话 <LockKeyhole size={12} />
        </span>
      </div>
      <BrowserToolbar
        data={data}
        url={url}
        setUrl={setUrl}
        run={run}
      />
      <div className="bookmarks">
        {platformLinks.map((link, index) => (
          <button
            key={link.name}
            className={url.startsWith(link.url) ? 'current' : ''}
            onClick={() => void run(() => window.desktop.navigate(link.url))}
          >
            <span className={`bookmark-dot dot-${index}`} />
            {link.name}
          </button>
        ))}
        <span className="bookmark-caption">平台快捷入口</span>
      </div>
      <div
        className="browser-slot"
        ref={slot}
      />
      <div className="browser-footer">
        <span>
          <ShieldCheck size={13} /> 安全隔离的浏览环境
        </span>
        <span>网页操作始终由你掌控</span>
      </div>
    </section>
  );
}
