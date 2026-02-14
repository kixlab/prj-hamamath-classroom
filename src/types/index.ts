// API 응답 타입 정의 (createCoT 응답·UI 공용)
export interface CoTStep {
  step_number: number;
  step_title: string;
  step_content: string;
  sub_skill_id?: string;
  step_name?: string;
  sub_skill_name?: string;
}

export interface CoTData {
  problem_id?: string;
  problem_text?: string;
  problem?: string;
  answer?: string;
  final_answer?: string;
  grade?: string;
  main_solution?: string | null;
  steps: CoTStep[];
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
  userId?: string | null;
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
  currentRubrics: any[] | null;
  setCurrentRubrics: (rubrics: any[] | null) => void;
  /** 3단계에서 확정 시 4단계로 넘기는 JSON (원본/재생성 선택 반영된 guide_sub_questions) */
  finalizedGuidelineForRubric: any | null;
  setFinalizedGuidelineForRubric: (data: any | null) => void;
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
