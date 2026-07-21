import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { AppContextType, CoTData, StudentAnswerSeed, SubQuestionData } from '../types';
import { api, type AuxiliaryMaterialItem } from '../services/api';
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
  // 참고 자료 라이브러리 (사이드바·문제화면 공유). 어느 쪽에서 업로드/삭제해도 setAuxMaterials로 양쪽 동시 반영
  const [auxMaterials, setAuxMaterials] = useState<AuxiliaryMaterialItem[]>([]);

  const reloadAuxMaterials = useCallback(async () => {
    if (isDemoMode || !userId?.trim()) {
      setAuxMaterials([]);
      return;
    }
    try {
      const data = await api.listAuxiliaryMaterials(null, userId);
      setAuxMaterials(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      console.warn('참고 자료 목록 조회 실패:', err);
      setAuxMaterials([]);
    }
  }, [userId, isDemoMode]);

  // 로그인(계정) 변경 시 목록 로드 + 선택 초기화 (기존 자료는 미선택 상태로 시작)
  useEffect(() => {
    void reloadAuxMaterials();
    setSelectedAuxiliaryMaterialIds([]);
  }, [reloadAuxMaterials]);

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
    auxMaterials,
    setAuxMaterials,
    reloadAuxMaterials,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
