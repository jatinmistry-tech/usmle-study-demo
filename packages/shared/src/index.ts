export interface QuestionOption { id: string; text: string }
export interface Question {
  id: string;
  subject: string;
  prompt: string;
  options: QuestionOption[];
}
export interface SubmitAnswerRequest {
  questionId: string;
  optionId: string;
  /** Elapsed time in whole seconds; defaults to zero for older clients. */
  timeTaken?: number;
}
export interface AnswerResult {
  questionId: string;
  selectedOptionId: string;
  correctOptionId: string;
  correct: boolean;
  explanation: string;
}
export interface Progress {
  answered: number;
  correct: number;
  accuracy: number;
}
export interface ApiError { error: string }
