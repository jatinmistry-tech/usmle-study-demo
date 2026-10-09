import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, Lightbulb, RotateCcw } from 'lucide-react';
import { api } from '../api';
import { useResource } from '../hooks/use-resource';
import type { StudyQuestion, SubmittedAnswer } from '../types';
import { PageHeader, LoadState, Empty, StudyLink } from '../components/ui';
import { BookmarkButton } from '../components/bookmark-button';
export function Feedback({ result }: { result: SubmittedAnswer }) {
  return <section className={`mt-6 rounded-xl border p-5 ${result.correct ? 'border-teal-100 bg-teal-50' : 'border-amber-100 bg-amber-50'}`} role="status"><div className="flex items-center gap-2"><Lightbulb size={18} className={result.correct ? 'text-teal-700' : 'text-amber-700'} /><h3 className="font-semibold">{result.correct ? 'Well done. You’ve got it.' : 'Let’s connect the dots.'}</h3></div><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{result.explanation}</p></section>;
}
export function Choices({ question, selected, onSelect, result, disabled }: { question: StudyQuestion; selected: string; onSelect?: (id: string) => void; result?: SubmittedAnswer; disabled?: boolean }) {
  return <fieldset className="mt-7 space-y-3" disabled={disabled || !!result}><legend className="sr-only">Choose one answer</legend>{question.options.map((option, index) => {
    const correct = result?.correctOptionId === option.id;
    const wrong = !!result && selected === option.id && !correct;
    return <label key={option.id} className={`flex items-start gap-3 rounded-xl border p-4 transition ${correct ? 'border-teal-400 bg-teal-50' : wrong ? 'border-rose-300 bg-rose-50' : selected === option.id ? 'border-teal-600 bg-teal-50/60' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'} ${result || disabled ? '' : 'cursor-pointer'}`}><input className="mt-1 accent-teal-700" type="radio" name="answer" checked={selected === option.id} onChange={() => onSelect?.(option.id)} value={option.id} /><span className="mt-0.5 text-xs font-semibold text-slate-400">{String.fromCharCode(65 + index)}</span><span className="flex-1 text-sm leading-6">{option.text}</span>{correct && <span className="badge bg-teal-100 text-teal-800">Correct</span>}{wrong && <span className="badge bg-rose-100 text-rose-800">Your answer</span>}</label>;
  })}</fieldset>;
}
export function PracticePage() {
  const { questionId } = useParams();
  const [params, setParams] = useSearchParams();
  const subjectId = params.get('subjectId') ?? undefined;
  const topicId = params.get('topicId') ?? undefined;
  const difficulty = params.get('difficulty') ?? undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const key = JSON.stringify({ questionId, subjectId, topicId, difficulty, page });
  const resource = useResource(async signal => questionId ? { data: [await api.question(questionId, signal)], total: 1 } : api.questions({ subjectId, topicId, difficulty, page }, signal), key);
  function nextBlock() { const next = new URLSearchParams(params); next.set('page', String(page + 1)); setParams(next); }
  return <><PageHeader title="Make a concept click." eyebrow="Practice workspace" description="Take your time. Choose an answer, then explore the reasoning behind it." action={<Link to="/topics" className="secondary">Browse topics</Link>} />{!questionId && <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{resource.data ? `${resource.data.total} questions in this selection` : 'Loading your selection'}</p><label className="flex items-center gap-3 text-xs text-slate-500">Difficulty<select className="input w-auto!" aria-label="Question difficulty" value={difficulty ?? ''} onChange={event => { const next = new URLSearchParams(params); if (event.target.value) next.set('difficulty', event.target.value); else next.delete('difficulty'); next.delete('page'); setParams(next); }}><option value="">All levels</option><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label></div>}<LoadState {...resource} retry={resource.reload} />{resource.data && (resource.data.data.length ? <QuestionSession key={key} questions={resource.data.data} more={!questionId && page * 10 < resource.data.total} nextBlock={nextBlock} /> : <Empty title="No questions in this selection" text="Try another topic or difficulty to find your next practice question." action={<StudyLink to="/subjects">Browse subjects</StudyLink>} />)}</>;
}
function QuestionSession({ questions, more, nextBlock }: { questions: StudyQuestion[]; more: boolean; nextBlock: () => void }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState('');
  const [results, setResults] = useState<SubmittedAnswer[]>([]);
  const [result, setResult] = useState<SubmittedAnswer>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const question = questions[index]!;
  const started = useRef(Date.now());
  useEffect(() => { started.current = Date.now(); }, [question.id]);
  async function submit() {
    if (!selected || busy || result) return;
    setBusy(true); setError('');
    try {
      const answer = await api.answer({ questionId: question.id, optionId: selected, timeTaken: Math.min(2147483647, Math.max(0, Math.floor((Date.now() - started.current) / 1000))) });
      setResult(answer); setResults(previous => [...previous, answer]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to submit your answer'); }
    finally { setBusy(false); }
  }
  function next() {
    if (index === questions.length - 1) setComplete(true);
    else { setIndex(value => value + 1); setSelected(''); setResult(undefined); setError(''); }
  }
  if (complete) return <div className="card py-14 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-teal-50 text-teal-700"><CheckCircle2 size={32} /></span><h2 className="mt-5 text-2xl font-semibold">Another step forward.</h2><p className="mt-3 text-sm text-slate-500">{results.filter(answer => answer.correct).length} of {results.length} correct in this block. Your attempts are saved.</p><div className="mt-7 flex flex-wrap justify-center gap-3">{more && <button className="primary" onClick={nextBlock}>Next block<ArrowRight size={16} /></button>}<Link className="secondary" to="/performance">View performance</Link><Link className="secondary" to="/attempts">Review attempts</Link></div></div>;
  return <div className="grid items-start gap-6 xl:grid-cols-[1fr_260px]"><section className="card p-6 md:p-8" aria-busy={busy}><div className="flex flex-wrap items-center justify-between gap-4"><span className="badge bg-teal-50 text-teal-800">{question.subject}</span><BookmarkButton key={question.id} questionId={question.id} /></div><div className="mt-6 flex items-center justify-between text-xs text-slate-400"><span>Question {index + 1} of {questions.length}</span><span>{question.difficulty?.toLowerCase() ?? 'Foundational'} · Single best answer</span></div><div className="my-5 h-1 rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${(index + 1) / questions.length * 100}%` }} /></div><h2 className="whitespace-pre-wrap text-lg font-medium leading-8 text-slate-900">{question.prompt}</h2><Choices question={question} selected={selected} onSelect={setSelected} result={result} disabled={busy} />{result && <><Feedback result={result} /><Link to={`/explanations/${result.attemptId ?? 'current'}`} state={{ result, question }} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-700">Open answer review<ArrowRight size={14} /></Link></>}{error && <p className="mt-5 text-sm text-rose-700" role="alert">{error}</p>}<div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-6"><p className="flex items-center gap-2 text-xs text-slate-400"><Clock3 size={14} />Untimed practice</p>{result ? <button className="primary" onClick={next}>{index === questions.length - 1 ? 'Finish block' : 'Next question'}<ArrowRight size={16} /></button> : <button className="primary" disabled={!selected || busy} onClick={() => void submit()}>{busy ? 'Checking answer…' : 'Check answer'}<ArrowRight size={16} /></button>}</div></section><aside className="space-y-5"><div className="card p-5"><p className="eyebrow">In this block</p><div className="mt-4 space-y-3 text-sm"><p className="flex justify-between text-slate-500">Answered<strong className="text-slate-800">{results.length}</strong></p><p className="flex justify-between text-slate-500">Correct<strong className="text-slate-800">{results.filter(answer => answer.correct).length}</strong></p></div></div><div className="rounded-xl bg-teal-800 p-5 text-white"><Lightbulb size={20} className="text-teal-200" /><h2 className="mt-3 font-medium">Read the why.</h2><p className="mt-2 text-xs leading-6 text-teal-100">Even when you’re right, the explanation can reveal a connection you haven’t made yet.</p></div></aside></div>;
}
export function ExplanationPage() {
  const { attemptId = '' } = useParams();
  const location = useLocation();
  const state = location.state as { result?: SubmittedAnswer; question?: StudyQuestion } | null;
  const resource = useResource(async signal => {
    if (attemptId === 'current' && state?.result && state.question) return { result: state.result, question: state.question };
    if (attemptId === 'current') throw new Error('This local review has expired. Submit another practice answer to view its explanation.');
    const result = await api.explanation(attemptId, signal);
    return { result, question: await api.question(result.questionId, signal) };
  }, `explanation:${attemptId}`);
  const data = resource.data;
  return <><PageHeader title="Understand the reasoning." eyebrow="Answer explanations" description="Connect the answer to the concept. Every attempt is another opportunity to learn." action={<Link className="secondary" to="/attempts">Attempt history</Link>} /><LoadState {...resource} retry={resource.reload} />{data && <section className="card mx-auto max-w-4xl p-6 md:p-9"><div className="flex items-center justify-between gap-4"><span className="badge bg-teal-50 text-teal-800">{data.question.subject}</span><span className={`badge ${data.result.correct ? 'bg-teal-50 text-teal-700' : 'bg-rose-50 text-rose-700'}`}>{data.result.correct ? 'Correct answer' : 'Review opportunity'}</span></div><h2 className="mt-6 whitespace-pre-wrap text-lg font-medium leading-8">{data.question.prompt}</h2><Choices question={data.question} selected={data.result.selectedOptionId} result={data.result} /><Feedback result={data.result} /><div className="mt-7 flex flex-wrap justify-between gap-4"><BookmarkButton key={data.question.id} questionId={data.question.id} /><Link className="secondary" to={`/practice/${data.question.id}`}><RotateCcw size={15} />Practice again</Link></div></section>}</>;
}
