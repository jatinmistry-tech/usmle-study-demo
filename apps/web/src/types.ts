import type { AnswerResult, Progress, Question } from '@usmle/shared';
export type { AnswerResult, Progress };
export interface StudyQuestion extends Question { topicId?: string; questionText?: string; difficulty?: 'EASY' | 'MEDIUM' | 'HARD'; createdDate?: string }
export interface Subject { id: string; name: string }
export interface Topic { id: string; subjectId: string; name: string }
export interface Page<T> { data: T[]; pagination: { page: number; limit: number; total: number; pages: number } }
export interface Attempt { id: string; userId: string; questionId: string; selectedAnswer: string; isCorrect: boolean; timeTaken: number; attemptedAt: string }
export interface Bookmark { id: string; questionId: string; createdAt: string; question?: StudyQuestion }
export interface Metrics { totalAttempts: number; correctAttempts: number; questionsAnswered: number; accuracy: number; averageTimeTaken: number }
export interface Breakdown extends Metrics { id: string; name: string }
export interface Performance extends Metrics { bySubject: Breakdown[]; byTopic: Breakdown[] }
export interface Dashboard { progress: Progress; performance: Performance; recentAttempts: Attempt[]; bookmarks: Bookmark[]; bookmarkCount: number }
export interface SubmittedAnswer extends AnswerResult { attemptId?: string }
