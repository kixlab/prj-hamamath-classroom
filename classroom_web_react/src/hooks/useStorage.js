import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'hamamath_saved_results';
const MAX_SAVED_RESULTS = 50;
const LAST_PROBLEM_KEY = 'hamamath_last_problem_id';

export const useStorage = () => {
  const [savedResults, setSavedResults] = useState({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSavedResults(JSON.parse(stored));
      }
    } catch (err) {
      console.error('저장된 결과 로드 중 오류:', err);
    }
  }, []);

  const saveResult = useCallback((problemId, cotData, subQData, guidelineData) => {
    const resultData = {
      problemId,
      timestamp: new Date().toISOString(),
      cotData,
      subQData,
      guidelineData,
    };

    setSavedResults((prev) => {
      const newResults = { ...prev, [problemId]: resultData };
      const resultKeys = Object.keys(newResults);
      
      if (resultKeys.length > MAX_SAVED_RESULTS) {
        const sortedKeys = resultKeys.sort((a, b) => {
          const timeA = new Date(newResults[a].timestamp || 0).getTime();
          const timeB = new Date(newResults[b].timestamp || 0).getTime();
          return timeA - timeB;
        });
        const keysToKeep = sortedKeys.slice(-MAX_SAVED_RESULTS);
        const filteredResults = {};
        keysToKeep.forEach((key) => {
          filteredResults[key] = newResults[key];
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredResults));
        localStorage.setItem(LAST_PROBLEM_KEY, problemId);
        return filteredResults;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newResults));
      localStorage.setItem(LAST_PROBLEM_KEY, problemId);
      return newResults;
    });
  }, []);

  const loadResult = useCallback((problemId) => {
    const result = savedResults[problemId];
    if (result) {
      localStorage.setItem(LAST_PROBLEM_KEY, problemId);
      return result;
    }
    return null;
  }, [savedResults]);

  const deleteResult = useCallback((problemId) => {
    setSavedResults((prev) => {
      const newResults = { ...prev };
      delete newResults[problemId];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newResults));
      return newResults;
    });
  }, []);

  const clearAllResults = useCallback(() => {
    setSavedResults({});
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LAST_PROBLEM_KEY);
  }, []);

  return {
    savedResults,
    saveResult,
    loadResult,
    deleteResult,
    clearAllResults,
  };
};
