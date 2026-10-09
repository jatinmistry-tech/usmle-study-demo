import { useEffect, useState } from 'react';
import { Bookmark as BookmarkIcon, LoaderCircle } from 'lucide-react';
import { api } from '../api';
import type { Bookmark } from '../types';
export function BookmarkButton({ questionId, initial, onChange }: { questionId: string; initial?: Bookmark; onChange?: () => void }) {
  const [saved, setSaved] = useState<Bookmark | null>(initial ?? null);
  const [busy, setBusy] = useState(!initial);
  const [error, setError] = useState('');
  useEffect(() => {
    if (initial) return;
    const controller = new AbortController();
    void api.findBookmark(questionId, controller.signal).then(bookmark => { if (!controller.signal.aborted) setSaved(bookmark); }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [questionId, initial]);
  async function toggle() {
    setBusy(true); setError('');
    try {
      if (saved) { await api.removeBookmark(saved.id); setSaved(null); }
      else setSaved(await api.saveBookmark(questionId));
      onChange?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update bookmark'); }
    finally { setBusy(false); }
  }
  return <div><button className={`secondary ${saved ? 'text-teal-700!' : ''}`} aria-pressed={!!saved} onClick={() => void toggle()} disabled={busy}>{busy ? <LoaderCircle size={15} className="animate-spin" /> : <BookmarkIcon size={15} fill={saved ? 'currentColor' : 'none'} />}{saved ? 'Saved' : 'Save question'}</button>{error && <p className="mt-2 max-w-xs text-xs text-rose-700" role="alert">{error}</p>}</div>;
}
