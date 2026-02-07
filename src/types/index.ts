// API 응답 타입 정의
export interface CoTData {
  problem_id: string;
  problem_text: string;
  steps: Array<{
    step_number: number;
    step_title: string;
    step_content: string;
  }>;
  final_answer: string;
}

export interface SubQuestion {
  question: string;
  answer: string;
  step_number: number;
  sub_question_number: number;
}

export interface GuidelineData {
  problem_id: string;
  grade: string;
  subject_area: string;
  sub_questions: SubQuestion[];
}

export interface VerifyResult {
  is_valid: boolean;
  feedback: string;
  regenerated_question?: string;
  regenerated_answer?: string;
}

export interface AppContextType {
  currentProblemId: string | null;
  setCurrentProblemId: (id: string | null) => void;
  currentCotData: CoTData | null;
  setCurrentCotData: (data: CoTData | null) => void;
  currentSubQData: any | null;
  setCurrentSubQData: (data: any | null) => void;
  currentGuidelineData: GuidelineData | null;
  setCurrentGuidelineData: (data: GuidelineData | null) => void;
  lastGuidelineDataBeforeVerifyFix: GuidelineData | null;
  setLastGuidelineDataBeforeVerifyFix: (data: GuidelineData | null) => void;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  reset: () => void;
  preferredVersion?: Record<string, 'original' | 'regenerated'>;
  setPreferredVersion?: (version: Record<string, 'original' | 'regenerated'>) => void;
}

// MathJax 타입 확장
declare global {
  interface Window {
    MathJax?: {
      tex: {
        inlineMath: string[][];
        displayMath: string[][];
        processEscapes: boolean;
        processEnvironments: boolean;
      };
      typesetPromise?: (elements?: HTMLElement[]) => Promise<void>;
      typesetClear?: (elements?: HTMLElement[]) => void;
    };
  }
}
