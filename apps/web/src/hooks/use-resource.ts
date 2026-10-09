import { useEffect, useState } from 'react';
export function useResource<T>(loader: (signal: AbortSignal) => Promise<T>, key: string) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    void loader(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ data, loading: false });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ error: error instanceof Error ? error.message : 'Unable to load this page', loading: false });
    });
    return () => controller.abort();
    // Each caller's key includes the inputs used by its loader.
  }, [key, revision]);
  return { ...state, reload: () => setRevision(value => value + 1) };
}
