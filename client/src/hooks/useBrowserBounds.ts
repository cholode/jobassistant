import { useEffect, useRef } from 'react';
// 原生网页视图不是 React DOM，需要将占位元素的位置和大小同步给主进程。
export function useBrowserBounds() {
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = slot.current;
    if (!node) return;
    const update = () => {
      const { x, y, width, height } = node.getBoundingClientRect();
      void window.desktop.bounds({ x, y, width, height });
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);
  return slot;
}
