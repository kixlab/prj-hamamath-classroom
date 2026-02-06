import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { AppContextType, CoTData, GuidelineData } from '../types';
import dummyData from '../sub_question_dummy.json';

// Build initial dummy CoT data
const dummyCotData: CoTData = {
  problem_id: 'dummy-1',
  problem_text: dummyData.main_problem,
  steps: dummyData.finalized_sub_questions.map((sq) => ({
    step_number: sq.step_id,
    step_title: sq.step_name,
    step_content: sq.final_answer,
    step_id: `step_${sq.step_id}`,
    sub_skill_id: sq.sub_skill_id,
    step_name: sq.step_name,
    sub_skill_name: sq.sub_skill_name,
  })),
  final_answer: dummyData.main_answer,
};

// Build initial dummy guideline data
const dummyGuidelineData: any = {
  problem_id: 'dummy-1',
  main_problem: dummyData.main_problem,
  main_answer: dummyData.main_answer,
  main_solution: dummyData.main_solution,
  grade: dummyData.grade,
  subject_area: '수와 연산',
  guide_sub_questions: dummyData.finalized_sub_questions.map((sq) => ({
    sub_question_id: sq.sub_question_id,
    step_id: String(sq.step_id),
    sub_skill_id: sq.sub_skill_id,
    step_name: sq.step_name,
    sub_skill_name: sq.sub_skill_name,
    guide_sub_question: sq.final_question,
    guide_sub_answer: sq.final_answer,
  })),
};

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
  const [currentProblemId, setCurrentProblemId] = useState<string | null>('dummy-1');
  const [currentCotData, setCurrentCotData] = useState<CoTData | null>(dummyCotData);
  const [currentSubQData, setCurrentSubQData] = useState<any | null>(null);
  const [currentGuidelineData, setCurrentGuidelineData] = useState<GuidelineData | null>(dummyGuidelineData);
  const [lastGuidelineDataBeforeVerifyFix, setLastGuidelineDataBeforeVerifyFix] = useState<GuidelineData | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(4);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [preferredVersion, setPreferredVersion] = useState<Record<number, 'original' | 'regenerated'>>({});

  const reset = useCallback(() => {
    setCurrentProblemId(null);
    setCurrentCotData(null);
    setCurrentSubQData(null);
    setCurrentGuidelineData(null);
    setLastGuidelineDataBeforeVerifyFix(null);
    setCurrentStep(1);
    setError(null);
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
