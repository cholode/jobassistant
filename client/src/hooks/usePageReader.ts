import { useEffect, useRef, useState } from 'react';
import type { PageReading } from '../../shared/browser';
import type { PageState } from '../../shared/protocol';

export function usePageReader(page: PageState | undefined, connected: boolean) {
  const [reading, setReading] = useState<PageReading | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  useEffect(() => {
    // 页面跳转、刷新或后端断线时清空结果，迟到的请求不得覆盖新页面。
    sequence.current++;
    setReading(null); setError(''); setBusy(false);
    return () => { sequence.current++; };
  }, [page?.url, page?.loading, connected]);
  const read = async () => {
    const current = ++sequence.current;
    setBusy(true); setError(''); setReading(null);
    try {
      const result = await window.desktop.readPage();
      if (current === sequence.current) setReading(result);
    } catch (error) {
      if (current === sequence.current) setError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '读取失败，请重试');
    } finally { if (current === sequence.current) setBusy(false); }
  };
  return { reading, busy, error, read };
}
