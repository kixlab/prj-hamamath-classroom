import { createContext, useContext, useState, useCallback } from 'react';

const AppContext = createContext();

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const [currentProblemId, setCurrentProblemId] = useState(null);
  const [currentCotData, setCurrentCotData] = useState(null);
  const [currentSubQData, setCurrentSubQData] = useState(null);
  const [currentGuidelineData, setCurrentGuidelineData] = useState(null);
  const [lastGuidelineDataBeforeVerifyFix, setLastGuidelineDataBeforeVerifyFix] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const reset = useCallback(() => {
    setCurrentProblemId(null);
    setCurrentCotData(null);
    setCurrentSubQData(null);
    setCurrentGuidelineData(null);
    setLastGuidelineDataBeforeVerifyFix(null);
    setCurrentStep(1);
    setError(null);
  }, []);

  const value = {
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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
