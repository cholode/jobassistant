# 桌面状态 Store 接口

desktop.ts 导出 `useDesktopStore`（Zustand）。

| 字段 | 类型 | 契约 |
| --- | --- | --- |
| snapshot | Snapshot 或 null | 默认 null，保存最近收到的完整桌面快照 |
| set | `(snapshot: Snapshot) => void` | 整体替换，不做部分合并 |

```typescript
const snapshot = useDesktopStore((state) => state.snapshot);
```

Store 仅保存在 Renderer 内存，不持久化、不发 IPC、不执行认证。生产状态来源是 [useDesktop](../hooks/README.md) 接收的主进程快照；组件读取此 Store 不等于修改后端 Agent。Snapshot 字段见 [shared](../../shared/README.md)。
