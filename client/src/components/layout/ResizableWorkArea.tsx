import { useEffect, useRef, useState, type ReactNode } from 'react';

const MIN_BROWSER = 360;
const MIN_PANEL = 310;
const HANDLE_WIDTH = 14;

export function ResizableWorkArea({
  browser,
  panel,
}: {
  browser: ReactNode;
  panel: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [available, setAvailable] = useState(0);
  const [preferred, setPreferred] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(node);
      setAvailable(
        node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      );
    });
    observer.observe(node);
    const cancel = () => {
      drag.current = null;
      setDragging(false);
    };
    window.addEventListener('blur', cancel);
    return () => {
      observer.disconnect();
      window.removeEventListener('blur', cancel);
    };
  }, []);
  const maximum = Math.max(MIN_PANEL, available - MIN_BROWSER - HANDLE_WIDTH);
  const clamp = (value: number) => Math.min(maximum, Math.max(MIN_PANEL, value));
  const defaultWidth = Math.min(
    440,
    Math.max(MIN_PANEL, window.innerWidth <= 1250 ? MIN_PANEL : window.innerWidth * 0.29),
  );
  const width = clamp(preferred ?? defaultWidth);
  return (
    <div
      ref={container}
      className={`work-area resizable-work-area${dragging ? ' is-resizing' : ''}`}
    >
      {browser}
      <div
        className="browser-resizer"
        role="separator"
        aria-label="调整浏览器宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_PANEL}
        aria-valuemax={Math.round(maximum)}
        aria-valuenow={Math.round(width)}
        aria-valuetext={`Agent 面板宽度 ${Math.round(width)} 像素`}
        tabIndex={0}
        title="左右拖动调整宽度；双击恢复默认"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus();
          drag.current = { x: event.clientX, width };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (drag.current)
            setPreferred(clamp(drag.current.width + drag.current.x - event.clientX));
        }}
        onPointerUp={(event) => {
          drag.current = null;
          setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          setDragging(false);
        }}
        onDoubleClick={() => setPreferred(null)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 50 : 20;
          if (event.key === 'ArrowLeft') setPreferred(clamp(width + step));
          else if (event.key === 'ArrowRight') setPreferred(clamp(width - step));
          else if (event.key === 'Home') setPreferred(MIN_PANEL);
          else if (event.key === 'End') setPreferred(maximum);
          else if (event.key === 'Enter') setPreferred(null);
          else return;
          event.preventDefault();
        }}
      >
        <span />
      </div>
      <div
        className="resizable-agent"
        style={{ width }}
      >
        {panel}
      </div>
    </div>
  );
}
