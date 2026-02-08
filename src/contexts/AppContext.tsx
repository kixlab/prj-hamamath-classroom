import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { AppContextType, CoTData, GuidelineData } from '../types';

// ── Dummy data for testing rubric generation ──
const DUMMY_SUB_QUESTIONS = [
  { sub_question_id: "1-1", step_id: 1, sub_skill_id: "1-1", step_name: "문제 이해", sub_skill_name: "핵심 정보 파악하기", guide_sub_question: "어떤 수를 5로 나누었을 때 몫이 15이고 나머지가 4라는 정보가 주어졌습니다. 이 문제를 해결하는 데 필요한 핵심 정보를 선택하세요.", guide_sub_answer: "어떤 수를 5로 나누었을 때 몫이 15이고 나머지가 4이다." },
  { sub_question_id: "1-2", step_id: 1, sub_skill_id: "1-2", step_name: "문제 이해", sub_skill_name: "문제 요지 확인하기", guide_sub_question: "어떤 수를 찾기 위해 구해야 하는 최종 결과는 무엇인가요?", guide_sub_answer: "어떤 수" },
  { sub_question_id: "2-1", step_id: 2, sub_skill_id: "2-1", step_name: "정보 구조화", sub_skill_name: "조건 정리하기", guide_sub_question: "주어진 조건을 표로 정리하세요. 어떤 수를 5로 나누었을 때의 몫과 나머지를 각각 표에 나타내세요.", guide_sub_answer: "몫: 15\n나머지: 4" },
  { sub_question_id: "2-2", step_id: 2, sub_skill_id: "2-2", step_name: "정보 구조화", sub_skill_name: "조건 연결하기", guide_sub_question: "어떤 수를 5로 나누었을 때의 몫과 나머지를 이용하여, 어떤 수를 표현할 수 있는 방법을 설명하세요.", guide_sub_answer: "어떤 수는 $5 \\times 15 + 4$로 표현할 수 있습니다." },
  { sub_question_id: "3-1", step_id: 3, sub_skill_id: "3-1", step_name: "수학적 표현", sub_skill_name: "지식 활용하기", guide_sub_question: "어떤 수를 5로 나누었을 때의 몫과 나머지를 이용하여, 원래 수를 구할 수 있는 수학적 원리를 설명하세요.", guide_sub_answer: "원래 수는 $(몫 \\times 나누는 수) + 나머지$로 계산할 수 있습니다." },
  { sub_question_id: "3-2", step_id: 3, sub_skill_id: "3-2", step_name: "수학적 표현", sub_skill_name: "식, 모델 세우기", guide_sub_question: "어떤 수를 구하기 위한 수학적 식을 세우세요.", guide_sub_answer: "$$\\square = 5 \\times 15 + 4$$" },
  { sub_question_id: "4-1", step_id: 4, sub_skill_id: "4-1", step_name: "수학적 계산", sub_skill_name: "계산 실행하기", guide_sub_question: "어떤 수를 구하기 위해 $5 \\times 15 + 4$의 계산 과정을 단계별로 나타내세요.", guide_sub_answer: "$5 \\times 15 = 75$, \\quad $75 + 4 = 79$" },
  { sub_question_id: "4-2", step_id: 4, sub_skill_id: "4-2", step_name: "수학적 계산", sub_skill_name: "결과 정리하기", guide_sub_question: "계산한 결과를 바탕으로 문제에서 찾고자 하는 어떤 수를 확인하세요.", guide_sub_answer: "어떤 수는 $79$입니다." },
];

const DUMMY_COT_DATA = {
  problem: "어떤 수를 5로 나누었더니 몫이 15이고, 나머지가 4였습니다. 어떤 수는 얼마일까요?",
  answer: "79",
  main_solution: "",
  grade: "3",
  steps: DUMMY_SUB_QUESTIONS.map((sq) => ({
    step_id: sq.step_id,
    sub_skill_id: sq.sub_skill_id,
    step_name: sq.step_name,
    sub_skill_name: sq.sub_skill_name,
    step_content: sq.guide_sub_question,
  })),
} as any;

const DUMMY_GUIDELINE_DATA = {
  main_problem: "어떤 수를 5로 나누었더니 몫이 15이고, 나머지가 4였습니다. 어떤 수는 얼마일까요?",
  main_answer: "79",
  main_solution: "",
  grade: "3",
  subject_area: "수와 연산",
  guide_sub_questions: DUMMY_SUB_QUESTIONS,
} as any;
// ── End dummy data ──

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider = ({ children }: AppProviderProps) => {
  const [currentProblemId, setCurrentProblemId] = useState<string | null>('dummy-test-001');
  const [currentCotData, setCurrentCotData] = useState<CoTData | null>(DUMMY_COT_DATA);
  const [currentSubQData, setCurrentSubQData] = useState<any | null>(null);
  const [currentGuidelineData, setCurrentGuidelineData] = useState<GuidelineData | null>(DUMMY_GUIDELINE_DATA);
  const [lastGuidelineDataBeforeVerifyFix, setLastGuidelineDataBeforeVerifyFix] = useState<GuidelineData | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(3);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [preferredVersion, setPreferredVersion] = useState<Record<string, 'original' | 'regenerated'>>({});

  const reset = useCallback(() => {
    setCurrentProblemId(null);
    setCurrentCotData(null);
    setCurrentSubQData(null);
    setCurrentGuidelineData(null);
    setLastGuidelineDataBeforeVerifyFix(null);
    setCurrentStep(1);
    setLoading(false);
    setError(null);
    setPreferredVersion({});
  }, []);

  const value: AppContextType = {
    currentProblemId,
    setCurrentProblemId,
    currentCotData,
    setCurrentCotData,
    currentSubQData,
    setCurrentSubQData,
    currentGuidelineData,
    setCurrentGuidelineData,
    lastGuidelineDataBeforeVerifyFix,
    setLastGuidelineDataBeforeVerifyFix,
    currentStep,
    setCurrentStep,
    loading,
    setLoading,
    error,
    setError,
    sidebarOpen,
    setSidebarOpen,
    reset,
    preferredVersion,
    setPreferredVersion,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
