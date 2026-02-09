import { useState, useEffect, useCallback } from 'react';
import type { CoTData, GuidelineData } from '../types';
import { USER_ID_STORAGE_KEY } from '../components/UserIdPage/UserIdPage';

const STORAGE_KEY_PREFIX = 'hamamath_saved_results';
const LAST_PROBLEM_KEY_PREFIX = 'hamamath_last_problem_id';
const MAX_SAVED_RESULTS = 50;

/** 현재 로그인한 사용자 ID 기준 저장 키 (아이디별로 저장 결과 분리) */
function getStorageKey(): string {
  const uid = typeof localStorage !== 'undefined' ? localStorage.getItem(USER_ID_STORAGE_KEY) : null;
  return uid ? `${STORAGE_KEY_PREFIX}_${uid}` : STORAGE_KEY_PREFIX;
}

/** history API 호출 시 서버에 유저별 저장을 위해 X-User-Id 헤더 반환 */
export function getHistoryHeaders(): Record<string, string> {
  const uid = typeof localStorage !== 'undefined' ? localStorage.getItem(USER_ID_STORAGE_KEY) : null;
  return uid ? { 'X-User-Id': uid } : {};
}

function getLastProblemKey(): string {
  const uid = typeof localStorage !== 'undefined' ? localStorage.getItem(USER_ID_STORAGE_KEY) : null;
  return uid ? `${LAST_PROBLEM_KEY_PREFIX}_${uid}` : LAST_PROBLEM_KEY_PREFIX;
}

export interface SavedResult {
  problemId: string;
  timestamp: string;
  cotData: CoTData | null;
  subQData: any | null;
  guidelineData: GuidelineData | null;
  preferredVersion?: Record<string, 'original' | 'regenerated'>;
  rubrics?: any[] | null;
}

interface SavedResults {
  [problemId: string]: SavedResult;
}

// 전역 함수로 export (현재 로그인한 사용자 ID 기준)
export function getSavedResults(): SavedResults {
  try {
    const stored = localStorage.getItem(getStorageKey());
    return stored ? JSON.parse(stored) : {};
  } catch (e) {
    console.error('저장된 결과 불러오기 실패:', e);
    return {};
  }
}

export async function loadResult(problemId: string): Promise<SavedResult | null> {
  // 먼저 localStorage에서 확인
  const savedResults = getSavedResults();
  let result = savedResults[problemId];
  
  // localStorage에 없으면 서버에서 불러오기
  if (!result) {
    try {
      const response = await fetch(`/api/v1/history/${encodeURIComponent(problemId)}`, {
        headers: getHistoryHeaders(),
      });
      if (response.ok) {
        result = await response.json();
        // 서버에서 불러온 결과를 localStorage에도 저장
        savedResults[problemId] = result;
        localStorage.setItem(getStorageKey(), JSON.stringify(savedResults));
        localStorage.setItem(getLastProblemKey(), problemId);
      } else if (response.status === 404) {
        console.warn(`문제 ID '${problemId}'에 대한 저장된 결과를 찾을 수 없습니다.`);
        return null;
      } else {
        console.error(`서버에서 결과를 불러오는 중 오류 발생: ${response.status}`);
        return null;
      }
    } catch (err) {
      console.error('서버에서 결과를 불러오는 중 오류:', err);
      return null;
    }
  }

  if (!result) return null;
  
  localStorage.setItem(getLastProblemKey(), problemId);
  return result;
}

export async function deleteResult(problemId: string): Promise<void> {
  // localStorage에서 삭제
  const savedResults = getSavedResults();
  delete savedResults[problemId];
  localStorage.setItem(getStorageKey(), JSON.stringify(savedResults));

  // 서버에서도 삭제
  try {
    const response = await fetch(`/api/v1/history/${encodeURIComponent(problemId)}`, {
      method: 'DELETE',
      headers: getHistoryHeaders(),
    });
    if (!response.ok && response.status !== 404) {
      console.error(`서버에서 결과를 삭제하는 중 오류 발생: ${response.status}`);
    }
  } catch (err) {
    console.error('서버에서 결과를 삭제하는 중 오류:', err);
  }
}

export function clearAllResults(): void {
  localStorage.removeItem(getStorageKey());
  localStorage.removeItem(getLastProblemKey());
}

/**
 * 결과 저장. 전달한 필드만 갱신하고, undefined인 필드는 기존 값 유지(병합).
 * (null을 넘기면 해당 필드를 비움)
 */
export function saveResult(
  problemId: string,
  cotData?: CoTData | null,
  subQData?: any | null,
  guidelineData?: GuidelineData | null,
  preferredVersion?: Record<string, 'original' | 'regenerated'> | null,
  rubrics?: any[] | null
): void {
  const savedResults = getSavedResults();
  const existing = savedResults[problemId];
  const resultData: SavedResult = {
    problemId,
    timestamp: new Date().toISOString(),
    cotData: cotData !== undefined ? cotData : (existing?.cotData ?? null),
    subQData: subQData !== undefined ? subQData : (existing?.subQData ?? null),
    guidelineData: guidelineData !== undefined ? guidelineData : (existing?.guidelineData ?? null),
    preferredVersion: preferredVersion !== undefined ? (preferredVersion ?? undefined) : (existing?.preferredVersion),
    rubrics: rubrics !== undefined ? (rubrics ?? null) : (existing?.rubrics ?? null),
  };
  savedResults[problemId] = resultData;

  // 저장 개수 제한: 오래된 결과부터 삭제
  const resultKeys = Object.keys(savedResults);
  if (resultKeys.length > MAX_SAVED_RESULTS) {
    const sortedKeys = resultKeys.sort((a, b) => {
      const timeA = new Date(savedResults[a].timestamp || 0).getTime();
      const timeB = new Date(savedResults[b].timestamp || 0).getTime();
      return timeA - timeB;
    });

    const keysToKeep = sortedKeys.slice(-MAX_SAVED_RESULTS);
    const newSavedResults: SavedResults = {};
    keysToKeep.forEach((key) => {
      newSavedResults[key] = savedResults[key];
    });
    Object.assign(savedResults, newSavedResults);
  }

  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(savedResults));
    localStorage.setItem(getLastProblemKey(), problemId);
    
    // 서버에도 비동기로 저장 (X-User-Id로 유저별 분리)
    fetch('/api/v1/history/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getHistoryHeaders() },
      body: JSON.stringify(resultData),
    }).catch((err) => {
      console.error('서버 저장 실패:', err);
    });
  } catch (e: unknown) {
    const error = e as Error & { name?: string; code?: number };
    if (error.name === 'QuotaExceededError' || error.code === 22) {
      console.warn('localStorage 용량 초과. 오래된 결과를 삭제합니다.');
      const resultKeys = Object.keys(savedResults);
      const sortedKeys = resultKeys.sort((a, b) => {
        const timeA = new Date(savedResults[a].timestamp || 0).getTime();
        const timeB = new Date(savedResults[b].timestamp || 0).getTime();
        return timeA - timeB;
      });

      const keysToKeep = sortedKeys.slice(-Math.floor(MAX_SAVED_RESULTS / 2));
      const newSavedResults: SavedResults = {};
      keysToKeep.forEach((key) => {
        newSavedResults[key] = savedResults[key];
      });
      newSavedResults[problemId] = resultData;

      try {
        localStorage.setItem(getStorageKey(), JSON.stringify(newSavedResults));
        localStorage.setItem(getLastProblemKey(), problemId);
        alert(`저장 공간이 부족하여 오래된 결과 ${resultKeys.length - keysToKeep.length}개가 삭제되었습니다.`);
      } catch (e2) {
        console.error('localStorage 저장 실패:', e2);
        alert('저장 공간이 부족하여 결과를 저장할 수 없습니다. 오래된 결과를 삭제해주세요.');
      }
    } else {
      console.error('localStorage 저장 실패:', e);
      alert('결과 저장 중 오류가 발생했습니다.');
    }
  }
}

// React Hook 버전 (기존 호환성 유지)
export const useStorage = () => {
  const [savedResults, setSavedResults] = useState<SavedResults>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(getStorageKey());
      if (stored) {
        setSavedResults(JSON.parse(stored));
      }
    } catch (err) {
      console.error('저장된 결과 로드 중 오류:', err);
    }
  }, []);

  const saveResultHook = useCallback((
    problemId: string,
    cotData: CoTData | null,
    subQData: any | null,
    guidelineData: GuidelineData | null
  ) => {
    saveResult(problemId, cotData, subQData, guidelineData);
    setSavedResults(getSavedResults());
  }, []);

  const loadResultHook = useCallback((problemId: string): SavedResult | null => {
    const result = savedResults[problemId];
    if (result) {
      localStorage.setItem(getLastProblemKey(), problemId);
      return result;
    }
    return null;
  }, [savedResults]);

  const deleteResultHook = useCallback((problemId: string) => {
    deleteResult(problemId);
    setSavedResults(getSavedResults());
  }, []);

  const clearAllResultsHook = useCallback(() => {
    clearAllResults();
    setSavedResults({});
  }, []);

  return {
    savedResults,
    saveResult: saveResultHook,
    loadResult: loadResultHook,
    deleteResult: deleteResultHook,
    clearAllResults: clearAllResultsHook,
  };
};
