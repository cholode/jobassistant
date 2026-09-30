import { useState } from 'react';
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
          : String(error),
      );
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
