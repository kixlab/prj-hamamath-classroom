// API 응답 타입 정의 (createCoT 응답·UI 공용)
export interface CoTStep {
  step_number: number;
  step_title: string;
  step_content: string;
  sub_skill_id?: string;
  step_name?: string;
  sub_skill_name?: string;
  prompt_used?: string | null;
}

export interface CoTData {
  problem_id?: string;
  problem_text?: string;
  problem?: string;
  answer?: string;
  final_answer?: string;
  grade?: string;
  semester?: string;
  main_solution?: string | null;
  image_data?: string | null;
  steps: CoTStep[];
}

export interface SubQuestion {
  question: string;
  answer: string;
  step_number: number;
  sub_question_number: number;
}

export interface SubQuestionData {
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
  isDemoMode: boolean;
  currentProblemId: string | null;
  setCurrentProblemId: (id: string | null) => void;
  currentCotData: CoTData | null;
  setCurrentCotData: (data: CoTData | null) => void;
  currentSubQData: any | null;
  setCurrentSubQData: (data: any | null) => void;
  currentSubQuestionData: SubQuestionData | null;
  setCurrentSubQuestionData: (data: SubQuestionData | null) => void;
  lastSubQuestionDataBeforeVerifyFix: SubQuestionData | null;
  setLastSubQuestionDataBeforeVerifyFix: (data: SubQuestionData | null) => void;
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
  finalizedSubQuestionForRubric: any | null;
  setFinalizedSubQuestionForRubric: (data: any | null) => void;
  /** 2단계「하위문항 생성하기」→ 3단계 진입 시 자동 생성 */
  pendingSubqAutoStart: boolean;
  setPendingSubqAutoStart: (pending: boolean) => void;
  /** 4단계 루브릭 확정 시 학생 진단에 채울 랜덤 답안 시드 */
  studentAnswerSeed: StudentAnswerSeed | null;
  setStudentAnswerSeed: (seed: StudentAnswerSeed | null) => void;
  /** 사이드바 예제 클릭 → 문제 입력 화면(ProblemInput)에서 로드할 예제 파일명 */
  requestedExampleFile: string | null;
  setRequestedExampleFile: (file: string | null) => void;
}

/** 루브릭 확정 후 학생 진단 화면에 주입할 답안 시드 */
export interface StudentAnswerSeed {
  problemId: string;
  byStudentId: Record<string, Record<string, string>>;
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
