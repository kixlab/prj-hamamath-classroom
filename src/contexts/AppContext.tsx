import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { AppContextType, CoTData, GuidelineData } from '../types';

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
  const [currentProblemId, setCurrentProblemId] = useState<string | null>(null);
  const [currentCotData, setCurrentCotData] = useState<CoTData | null>(null);
  const [currentSubQData, setCurrentSubQData] = useState<any | null>(null);
  const [currentGuidelineData, setCurrentGuidelineData] = useState<GuidelineData | null>(null);
  const [lastGuidelineDataBeforeVerifyFix, setLastGuidelineDataBeforeVerifyFix] = useState<GuidelineData | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(1);
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
