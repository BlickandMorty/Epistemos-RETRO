// Stub — will be implemented in Phase 7 (SOAR learning loop)

export interface LearningSession {
  id: string;
  pageId: string;
  topic: string;
  steps: LearningStep[];
  currentStep: number;
  isComplete: boolean;
  status: 'active' | 'paused' | 'complete' | 'completed';
  totalInsights?: number;
  totalPagesCreated?: number;
  totalBlocksCreated?: number;
  createdAt: number;
}

export interface LearningStep {
  id: string;
  title: string;
  type: 'clarify' | 'frameworks' | 'empirical';
  status: 'pending' | 'active' | 'complete' | 'completed' | 'skipped' | 'running';
  prompt: string;
  response?: string;
  score?: number;
  insights: string[];
}
