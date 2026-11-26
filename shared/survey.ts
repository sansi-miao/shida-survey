export type QuestionKind = "single" | "multiple" | "text";
export type Answers = Record<string, string | string[]>;

export interface Question {
  id: string;
  title: string;
  type: QuestionKind;
  required: boolean;
  options: string[];
}

export interface SurveyContent {
  title: string;
  description: string;
  questions: Question[];
}

export interface PublishedSurvey extends SurveyContent {
  id: string;
  version: number;
}

export interface Submission {
  id: string;
  version: number;
  answers: Answers;
}

export interface SavedSurvey {
  id: string;
  draft: SurveyContent;
  revision: number;
  published_version: number;
  published_revision: number;
  updated_at: string;
}

export interface ListedSurvey {
  id: string;
  title: string;
  published_version: number;
  response_count: number;
}

export interface SurveyResults {
  title: string;
  version: number;
  latest_version: number;
  response_count: number;
  questions: (Question & {
    answered: number;
    counts?: Record<string, number>;
    samples?: string[];
  })[];
}
