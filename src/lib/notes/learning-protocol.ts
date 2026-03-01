// Stub — will be implemented in Phase 7 (SOAR learning loop)

export interface LearningSession {
  id: string;
  pageId: string;
  topic: string;
  steps: LearningStep[];
  currentStep: number;
  isComplete: boolean;
  createdAt: number;
}

export interface LearningStep {
  type: 'clarify' | 'frameworks' | 'empirical';
  prompt: string;
  response?: string;
  score?: number;
}
