import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { useMockData } from '../api';
import { LayoutDashboard, Library, Layers3, ListChecks, Bookmark, History, ChartNoAxesCombined, Menu, X, ArrowUpRight, Sparkles, GraduationCap } from 'lucide-react';
const navigation = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard }, { to: '/subjects', label: 'Subjects', Icon: Library },
  { to: '/topics', label: 'Topics', Icon: Layers3 }, { to: '/practice', label: 'Practice', Icon: ListChecks },
  { to: '/bookmarks', label: 'Bookmarks', Icon: Bookmark }, { to: '/attempts', label: 'Attempt history', Icon: History },
  { to: '/performance', label: 'Performance', Icon: ChartNoAxesCombined },
];
export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }); }, [location.pathname, location.search]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, []);
  const active = navigation.find(item => item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to))?.label ?? 'Answer review';
  return <div className="min-h-screen bg-[#f7f9fa] text-slate-800"><a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-4" href="#main">Skip to content</a>
    {open && <button aria-label="Close navigation overlay" className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" onClick={() => setOpen(false)} />}
    <aside id="navigation" className={`fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${open ? 'flex translate-x-0' : 'hidden -translate-x-full lg:flex'}`}>
      <div className="flex items-center justify-between p-7"><Link to="/" className="flex items-center gap-3 text-xl font-bold tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-700 text-white"><GraduationCap size={21} /></span>stepwise<span className="text-teal-600">.</span></Link><button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20} /></button></div>
      <div className="mx-5 mb-5 rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><span className="h-2 w-2 rounded-full bg-teal-500" />USMLE Step 1</div><p className="mt-1.5 text-xs text-slate-400">Your foundation starts here</p></div>
      <p className="px-7 pb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Study workspace</p>
      <nav aria-label="Main navigation" className="space-y-1 px-4">{navigation.map(({ to, label, Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition ${isActive ? 'bg-teal-50 text-teal-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Icon size={18} />{label}</NavLink>)}</nav>
      <div className="mt-auto p-5"><div className="rounded-xl bg-slate-900 p-5 text-white"><Sparkles size={18} className="text-teal-300" /><p className="mt-3 text-sm font-medium">Consistency beats cramming.</p><p className="mt-2 text-xs leading-5 text-slate-400">Make space for a little learning every day.</p><Link to="/practice" className="mt-4 flex items-center gap-1 text-xs font-semibold text-teal-300">Practice a concept<ArrowUpRight size={14} /></Link></div><div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-5"><span className="grid h-9 w-9 place-items-center rounded-full bg-teal-50 text-sm font-semibold text-teal-800">You</span><div><p className="text-xs font-semibold">Your study space</p><p className="mt-1 text-[11px] text-slate-400">Saved in this browser</p></div></div></div>
    </aside>
    <div className="lg:pl-64"><header className="flex h-18 items-center justify-between border-b border-slate-200/70 bg-white/90 px-5 sm:px-8"><div className="flex items-center gap-4"><button onClick={() => setOpen(value => !value)} aria-label="Open navigation" aria-expanded={open} aria-controls="navigation" className="lg:hidden"><Menu size={21} /></button><div className="text-xs text-slate-400">Workspace <span className="mx-2 text-slate-300">/</span><span className="font-medium text-slate-700">{active}</span></div></div><span className="badge border border-teal-100 bg-teal-50 text-teal-800">Step 1 · Tutor mode</span></header>
      {useMockData && <div role="note" className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-800 sm:px-8">Local demo · Fictional sample data. Changes are saved in this browser.</div>}
      <main id="main" className="mx-auto max-w-7xl px-5 py-8 sm:px-8 md:py-10" tabIndex={-1}><Outlet /></main>
      <footer className="mx-auto max-w-7xl px-5 pb-6 text-[11px] leading-5 text-slate-400 sm:px-8">Original demo content · Not affiliated with USMLE or NBME. Content requires editorial review before educational use.</footer>
    </div>
  </div>;
}
