import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RefreshCw, Inbox, ChevronLeft, ChevronRight, Target, CheckCircle2, Clock3, Layers3 } from 'lucide-react';
import type { Metrics, Attempt } from '../types';
export function PageHeader({ eyebrow = 'Your learning workspace', title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">{description}</p></div>{action}</div>;
}
export function LoadState({ loading, error, retry }: { loading: boolean; error?: string; retry: () => void }) {
  if (loading) return <div className="card flex min-h-52 items-center justify-center gap-3 text-sm text-slate-500" role="status"><RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />Loading your study space…</div>;
  if (error) return <div className="card p-8" role="alert"><h2 className="font-semibold">We couldn’t load this page.</h2><p className="mt-2 text-sm text-slate-500">{error}</p><button className="secondary mt-5" onClick={retry}><RefreshCw size={15} />Try again</button></div>;
  return null;
}
export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="card grid min-h-64 place-items-center p-10 text-center"><div><span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Inbox size={23} /></span><h2 className="text-lg font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{text}</p>{action && <div className="mt-5">{action}</div>}</div></div>;
}
export function StudyLink({ to = '/practice', children = 'Start practicing' }: { to?: string; children?: ReactNode }) { return <Link className="primary" to={to}>{children}<ArrowRight size={16} /></Link>; }
export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-between gap-4"><p className="text-xs text-slate-500">{total} results · Page {page} of {pages}</p><div className="flex gap-2"><button className="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={15} />Previous</button><button className="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next<ChevronRight size={15} /></button></div></nav>;
}
export function formatTime(seconds: number) { return seconds < 60 ? `${Math.round(seconds)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`; }
export function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
export function MetricCards({ metrics }: { metrics: Metrics }) {
  const cards = [
    { label: 'Accuracy', value: `${metrics.accuracy}%`, note: 'Across all attempts', Icon: Target, color: 'text-teal-700 bg-teal-50' },
    { label: 'Questions explored', value: metrics.questionsAnswered, note: 'Unique questions answered', Icon: Layers3, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Correct answers', value: metrics.correctAttempts, note: `${metrics.totalAttempts} total attempts`, Icon: CheckCircle2, color: 'text-emerald-700 bg-emerald-50' },
    { label: 'Average response', value: formatTime(metrics.averageTimeTaken), note: 'Time spent per attempt', Icon: Clock3, color: 'text-amber-700 bg-amber-50' },
  ];
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, note, Icon, color }) => <section className="card p-5" key={label}><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">{label}</p><span className={`rounded-lg p-2 ${color}`}><Icon size={17} /></span></div><p className="mt-4 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-2 text-xs text-slate-400">{note}</p></section>)}</div>;
}
export function AttemptRow({ attempt, title }: { attempt: Attempt; title?: string }) {
  return <Link to={`/explanations/${attempt.id}`} className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-slate-50"><span className={`rounded-full p-2 ${attempt.isCorrect ? 'bg-teal-50 text-teal-700' : 'bg-rose-50 text-rose-700'}`}><CheckCircle2 size={16} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{title ?? 'Practice attempt'}</p><p className="mt-1 text-xs text-slate-400">{formatDate(attempt.attemptedAt)} · {formatTime(attempt.timeTaken)}</p></div><span className={`badge ${attempt.isCorrect ? 'bg-teal-50 text-teal-700' : 'bg-rose-50 text-rose-700'}`}>{attempt.isCorrect ? 'Correct' : 'Review'}</span><ChevronRight size={16} className="text-slate-400" /></Link>;
}
