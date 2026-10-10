import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, Layers3, Search } from 'lucide-react';
import { api } from '../api';
import { useResource } from '../hooks/use-resource';
import { PageHeader, LoadState, Empty, Pager, StudyLink } from '../components/ui';
const accents = ['bg-teal-50 text-teal-700', 'bg-indigo-50 text-indigo-600', 'bg-amber-50 text-amber-700', 'bg-rose-50 text-rose-600'];
export function SubjectsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const resource = useResource(signal => api.subjects(page, signal), `subjects:${page}`);
  const data = resource.data;
  const visible = data?.data.filter(subject => subject.name.toLowerCase().includes(search.toLowerCase()));
  return <><PageHeader title="Explore your foundations." eyebrow="Subject library" description="Choose a subject, find a focused topic, and turn concepts into understanding." /><div className="mb-6 flex items-center justify-between gap-4"><p className="text-sm text-slate-500">{data ? `${data.pagination.total} subjects available` : 'Browse by subject'}</p><label className="search-input"><Search size={16} /><input aria-label="Search subjects on this page" placeholder="Search this page…" value={search} onChange={event => setSearch(event.target.value)} /></label></div><LoadState {...resource} retry={resource.reload} />{data && <>{visible?.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map((subject, index) => <section key={subject.id} className="card group p-6 transition hover:-translate-y-0.5 hover:shadow-md"><div className={`mb-6 inline-flex rounded-xl p-3 ${accents[index % accents.length]}`}><BookOpen size={24} strokeWidth={1.7} /></div><h2 className="text-lg font-semibold">{subject.name}</h2><p className="mt-2 text-sm leading-6 text-slate-500">Build a stronger foundation with focused practice and explanations.</p><div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5"><Link className="text-sm font-semibold text-teal-700" to={`/topics?subjectId=${subject.id}`}>Browse topics<ArrowRight size={15} className="ml-1 inline" /></Link><Link to={`/practice?subjectId=${subject.id}`} className="text-xs font-medium text-slate-500 hover:text-teal-700">Practice</Link></div></section>)}</div> : <Empty title="No subjects found" text={search ? 'Try another search on this page.' : 'Subjects will appear here when the question bank is ready.'} />}<Pager {...data.pagination} onPage={value => { setSearch(''); setPage(value); }} /></>}</>;
}
export function TopicsPage() {
  const [params, setParams] = useSearchParams();
  const subjectId = params.get('subjectId') ?? undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const resource = useResource(async signal => ({ topics: await api.topics(subjectId, page, signal), subject: subjectId ? await api.subject(subjectId, signal) : undefined }), `topics:${subjectId}:${page}`);
  const data = resource.data;
  return <><PageHeader title={data?.subject ? `Focus on ${data.subject.name}.` : 'Find your next concept.'} eyebrow="Topic library" description="Smaller topics make room for deeper understanding. Choose where you want to focus." action={<Link className="secondary" to="/subjects">All subjects</Link>} /><LoadState {...resource} retry={resource.reload} />{data && <>{data.topics.data.length ? <div className="space-y-3">{data.topics.data.map((topic, index) => <div className="card flex flex-wrap items-center gap-5 p-5 sm:p-6" key={topic.id}><span className={`rounded-xl p-3 ${accents[index % accents.length]}`}><Layers3 size={22} /></span><div className="min-w-0 flex-1"><p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-slate-400">Focused practice</p><h2 className="font-semibold">{topic.name}</h2></div><StudyLink to={`/practice?topicId=${topic.id}`}>Practice topic</StudyLink></div>)}</div> : <Empty title="No topics yet" text="Topics will appear here when they are added to this subject." />}<Pager {...data.topics.pagination} onPage={value => setParams({ ...(subjectId ? { subjectId } : {}), page: String(value) })} /></>}</>;
}
