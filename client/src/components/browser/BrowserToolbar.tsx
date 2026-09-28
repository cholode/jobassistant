import { ArrowLeft, ArrowRight, RefreshCw, LockKeyhole, Minus, Plus } from 'lucide-react';
import type { Snapshot } from '../../../shared/protocol';
interface Props { data: Snapshot | null; url: string; setUrl: (url: string) => void; run: (action: () => Promise<void>) => Promise<void> }
// 工具栏只发出用户操作，不管理网页解析或后端 RPC。
export function BrowserToolbar({ data, url, setUrl, run }: Props) {
  return <form className="addressbar" onSubmit={(event) => { event.preventDefault(); void run(() => window.desktop.navigate(url.startsWith('http') ? url : `https://${url}`)); }}>
          <button type="button" className="icon-button" aria-label="后退" disabled={!data?.browser.canBack} onClick={() => void run(() => window.desktop.browserAction('back'))}><ArrowLeft size={17}/></button><button type="button" className="icon-button" aria-label="前进" disabled={!data?.browser.canForward} onClick={() => void run(() => window.desktop.browserAction('forward'))}><ArrowRight size={17}/></button><button type="button" className="icon-button" aria-label="刷新" onClick={() => void run(() => window.desktop.browserAction('reload'))}><RefreshCw size={15} className={data?.browser.loading ? 'spin' : ''}/></button><div className="url-input"><LockKeyhole size={13}/><input aria-label="网页地址" value={url} onChange={(event) => setUrl(event.target.value)}/><button type="submit" aria-label="打开地址"><ArrowRight size={14}/></button></div>
          <div className="zoom-controls" role="group" aria-label="网页缩放">
            <button type="button" className="icon-button" aria-label="缩小网页" title="缩小网页" disabled={!data || data.browser.zoom <= 0.5} onClick={() => void run(() => window.desktop.browserZoom('out'))}><Minus size={15}/></button>
            <button type="button" className="zoom-reset" aria-label="重置网页缩放" title="恢复 100%" disabled={!data} onClick={() => void run(() => window.desktop.browserZoom('reset'))}>{Math.round((data?.browser.zoom ?? 1) * 100)}%</button>
            <button type="button" className="icon-button" aria-label="放大网页" title="放大网页" disabled={!data || data.browser.zoom >= 2} onClick={() => void run(() => window.desktop.browserZoom('in'))}><Plus size={15}/></button>
          </div>
        </form>;
}
