import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark as BookmarkIcon, ArrowRight } from 'lucide-react';
import { api } from '../api';
import { useResource } from '../hooks/use-resource';
import { PageHeader, LoadState, Empty, Pager, StudyLink, AttemptRow } from '../components/ui';
import { BookmarkButton } from '../components/bookmark-button';
export function BookmarksPage() {
  const [page, setPage] = useState(1);
  const resource = useResource(signal => api.bookmarks(page, signal), `bookmarks:${page}`);
  const data = resource.data;
  useEffect(() => { if (data && data.pagination.pages > 0 && page > data.pagination.pages) setPage(data.pagination.pages); }, [data, page]);
  return <><PageHeader title="Worth coming back to." eyebrow="Your bookmarks" description="Keep meaningful concepts close. Return to a saved question whenever you’re ready." action={<StudyLink />} /><LoadState {...resource} retry={resource.reload} />{data && <>{data.data.length ? <div className="grid gap-5 md:grid-cols-2">{data.data.map(bookmark => <section className="card flex flex-col p-6" key={bookmark.id}><div className="flex items-center justify-between"><span className="badge bg-teal-50 text-teal-800">{bookmark.question?.subject ?? 'Saved question'}</span><BookmarkIcon size={17} className="text-teal-600" /></div><h2 className="mt-5 line-clamp-3 text-sm font-medium leading-7">{bookmark.question?.prompt ?? 'Revisit this question to explore the concept.'}</h2><div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6"><Link to={`/practice/${bookmark.questionId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700">Practice question<ArrowRight size={15} /></Link><BookmarkButton questionId={bookmark.questionId} initial={bookmark} onChange={resource.reload} /></div></section>)}</div> : <Empty title="Your collection starts with one question" text="Save a question during practice to revisit its concept later." action={<StudyLink />} />}<Pager {...data.pagination} onPage={setPage} /></>}</>;
}
export function AttemptsPage() {
  const [page, setPage] = useState(1);
  const resource = useResource(async signal => {
    const result = await api.attempts(page, signal);
    const ids = [...new Set(result.data.map(attempt => attempt.questionId))];
    const rows = await Promise.all(ids.map(async id => ({ id, question: await api.question(id, signal) })));
    return { ...result, questions: new Map(rows.map(row => [row.id, row.question])) };
  }, `attempts:${page}`);
  const data = resource.data;
  return <><PageHeader title="Every attempt tells a story." eyebrow="Attempt history" description="Look back at what you’ve practiced. Open an attempt to review its answer and explanation." action={<StudyLink />} /><LoadState {...resource} retry={resource.reload} />{data && <>{data.data.length ? <section className="card p-3 sm:p-6"><div className="mb-3 flex items-center justify-between px-3"><h2 className="section-title">Your attempts</h2><p className="text-xs text-slate-400">{data.pagination.total} learning moments</p></div><div className="divide-y divide-slate-100">{data.data.map(attempt => <AttemptRow key={attempt.id} attempt={attempt} title={data.questions.get(attempt.questionId)?.prompt} />)}</div></section> : <Empty title="Your next question is the first entry" text="Once you submit an answer, you can return here to review what you’ve learned." action={<StudyLink />} />}<Pager {...data.pagination} onPage={setPage} /></>}</>;
}
