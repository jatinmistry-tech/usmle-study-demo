import { Routes, Route, Link } from 'react-router-dom';
import { Layout } from './components/layout';
import { Empty } from './components/ui';
import { DashboardPage } from './pages/dashboard';
import { SubjectsPage, TopicsPage } from './pages/catalog';
import { PracticePage, ExplanationPage } from './pages/practice';
import { BookmarksPage, AttemptsPage } from './pages/records';
import { PerformancePage } from './pages/performance';
export default function App() {
  return <Routes><Route element={<Layout />}><Route index element={<DashboardPage />} /><Route path="subjects" element={<SubjectsPage />} /><Route path="topics" element={<TopicsPage />} /><Route path="practice" element={<PracticePage />} /><Route path="practice/:questionId" element={<PracticePage />} /><Route path="explanations/:attemptId" element={<ExplanationPage />} /><Route path="bookmarks" element={<BookmarksPage />} /><Route path="attempts" element={<AttemptsPage />} /><Route path="performance" element={<PerformancePage />} /><Route path="*" element={<Empty title="This page took a different path" text="Return to your dashboard and keep exploring." action={<Link className="primary" to="/">Back to dashboard</Link>} />} /></Route></Routes>;
}
