import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { AppContextType, CoTData, StudentAnswerSeed, SubQuestionData } from '../types';
import { isDemoUserId } from '../demo/demoAccount';

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
  userId?: string | null;
}

export const AppProvider = ({ children, userId }: AppProviderProps) => {
  const isDemoMode = isDemoUserId(userId);
  const [currentProblemId, setCurrentProblemId] = useState<string | null>(null);
  const [currentCotData, setCurrentCotData] = useState<CoTData | null>(null);
  const [currentSubQData, setCurrentSubQData] = useState<any | null>(null);
  const [currentSubQuestionData, setCurrentSubQuestionData] = useState<SubQuestionData | null>(null);
  const [lastSubQuestionDataBeforeVerifyFix, setLastSubQuestionDataBeforeVerifyFix] = useState<SubQuestionData | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [preferredVersion, setPreferredVersion] = useState<Record<string, 'original' | 'regenerated'>>({});
  const [currentRubrics, setCurrentRubrics] = useState<any[] | null>(null);
  const [finalizedSubQuestionForRubric, setFinalizedSubQuestionForRubric] = useState<any | null>(null);
  const [pendingSubqAutoStart, setPendingSubqAutoStart] = useState(false);
  const [studentAnswerSeed, setStudentAnswerSeed] = useState<StudentAnswerSeed | null>(null);
  const [requestedExampleFile, setRequestedExampleFile] = useState<string | null>(null);
  const [selectedAuxiliaryMaterialIds, setSelectedAuxiliaryMaterialIds] = useState<string[]>([]);

  const reset = useCallback(() => {
    setCurrentProblemId(null);
    setCurrentCotData(null);
    setCurrentSubQData(null);
    setCurrentSubQuestionData(null);
    setLastSubQuestionDataBeforeVerifyFix(null);
    setCurrentStep(1);
    setLoading(false);
    setError(null);
    setPreferredVersion({});
    setCurrentRubrics(null);
    setFinalizedSubQuestionForRubric(null);
    setPendingSubqAutoStart(false);
    setStudentAnswerSeed(null);
    // 참고 자료 선택은 목록 로드 시 초기화되고, 업로드·직접 선택으로만 활성화됨
  }, []);

  const value: AppContextType = {
    userId,
    isDemoMode,
    currentProblemId,
    setCurrentProblemId,
    currentCotData,
    setCurrentCotData,
    currentSubQData,
    setCurrentSubQData,
    currentSubQuestionData,
    setCurrentSubQuestionData,
    lastSubQuestionDataBeforeVerifyFix,
    setLastSubQuestionDataBeforeVerifyFix,
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
    currentRubrics,
    setCurrentRubrics,
    finalizedSubQuestionForRubric,
    setFinalizedSubQuestionForRubric,
    pendingSubqAutoStart,
    setPendingSubqAutoStart,
    studentAnswerSeed,
    setStudentAnswerSeed,
    requestedExampleFile,
    setRequestedExampleFile,
    selectedAuxiliaryMaterialIds,
    setSelectedAuxiliaryMaterialIds,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
