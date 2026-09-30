// 招聘数据 Hook：统一处理状态加载、业务请求、忙碌标记和错误展示。

import { useCallback, useEffect, useState } from 'react';
import type { RecruitmentAction, RecruitmentState } from '../../shared/recruitment';

export function useRecruitment(connected: boolean) {
  const [state, setState] = useState<RecruitmentState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setState((await window.desktop.recruitment('state')) as RecruitmentState);
  }, []);
  useEffect(() => {
    if (connected) void refresh().catch((error) => setError(String(error)));
  }, [connected, refresh]);
  // 操作结束后读取后端快照，让岗位和审批卡显示已持久化的实际状态。
  const act = async (action: RecruitmentAction, payload?: unknown) => {
    setBusy(true);
    setError('');
    try {
      await window.desktop.recruitment(action, payload);
      await refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
          : '操作失败',
      );
    } finally {
      setBusy(false);
    }
  };
  return { state, busy, error, act };
}
