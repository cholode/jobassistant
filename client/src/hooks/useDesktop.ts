import { useEffect } from 'react';
import { useDesktopStore } from '../stores/desktop';
// 主进程是状态来源，组件只消费快照，卸载时撤销订阅。
export function useDesktop() {
  const { snapshot, set } = useDesktopStore();
  useEffect(() => {
    let live = true;
    const unsubscribe = window.desktop.subscribe((state) => {
      if (live) set(state);
    });
    void window.desktop.snapshot().then((state) => {
      if (live) set(state);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [set]);
  return snapshot;
}
