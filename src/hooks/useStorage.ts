import { useState, useEffect, useCallback } from 'react';
import type { CoTData, GuidelineData } from '../types';
import { USER_ID_STORAGE_KEY } from '../components/UserIdPage/UserIdPage';
import { getApiUrl } from '../services/api';

const STORAGE_KEY_PREFIX = 'hamamath_saved_results';
const LAST_PROBLEM_KEY_PREFIX = 'hamamath_last_problem_id';
const MAX_SAVED_RESULTS = 50;

/** 현재 로그인한 사용자 ID (세션 기준 — 사이트 처음 접속 시 로그인 화면 표시) */
function getStoredUserId(): string | null {
  return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(USER_ID_STORAGE_KEY) : null;
}

/** 현재 로그인한 사용자 ID 기준 저장 키 (아이디별로 저장 결과 분리) */
function getStorageKey(): string {
  const uid = getStoredUserId();
  return uid ? `${STORAGE_KEY_PREFIX}_${uid}` : STORAGE_KEY_PREFIX;
}

/** HTTP 헤더 값은 ISO-8859-1만 허용. 한글 등이 있으면 Base64로 인코딩해 반환 (다른 커스텀 헤더용 export) */
export function encodeForHeader(value: string): { value: string; encoding?: 'base64' } {
  if (!value || !value.trim()) return { value: '' };
  const trimmed = value.trim();
  const isLatin1 = [...trimmed].every((c) => c.charCodeAt(0) < 256);
  if (isLatin1) return { value: trimmed };
  try {
    return { value: btoa(unescape(encodeURIComponent(trimmed))), encoding: 'base64' };
  } catch {
    const fallback = trimmed.replace(/[^\x00-\xFF]/g, '?');
    return { value: fallback };
  }
}

/** X-User-Id 헤더용 객체 반환 (한글 등 비-Latin1이면 Base64 + X-User-Id-Encoding: base64). 백엔드에서 디코딩 필요 */
export function encodeUserIdForHeader(uid: string): Record<string, string> {
  if (!uid?.trim()) return {};
  const { value, encoding } = encodeForHeader(uid);
  const h: Record<string, string> = { 'X-User-Id': value };
  if (encoding) h['X-User-Id-Encoding'] = encoding;
  return h;
}

/** history API 호출 시 서버에 유저별 저장을 위해 X-User-Id 헤더 반환 */
export function getHistoryHeaders(): Record<string, string> {
  return encodeUserIdForHeader(getStoredUserId() ?? '');
}

/** 저장 API용: sessionStorage에 userId가 없어도 호출부에서 넘긴 userId로 헤더 생성 (Firebase 등 서버 저장 누락 방지) */
export function getHistoryHeadersWithFallback(userIdFromCaller?: string | null): Record<string, string> {
  const fromStorage = getHistoryHeaders();
  if (fromStorage['X-User-Id']) return fromStorage;
  return encodeUserIdForHeader(userIdFromCaller ?? '');
}

function getLastProblemKey(): string {
  const uid = getStoredUserId();
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

/** 서버 응답을 SavedResult 형태로 정규화 (snake_case → camelCase 등) */
function normalizeServerResult(serverItem: Record<string, unknown>): SavedResult {
  return {
    problemId: (serverItem.problem_id as string) ?? (serverItem.problemId as string),
    timestamp: (serverItem.timestamp as string) ?? '',
    cotData: (serverItem.cot_data ?? serverItem.cotData) as SavedResult['cotData'],
    subQData: (serverItem.subq_data ?? serverItem.subQData) as SavedResult['subQData'],
    guidelineData: (serverItem.guideline_data ?? serverItem.guidelineData) as SavedResult['guidelineData'],
    preferredVersion: (serverItem.preferred_version ?? serverItem.preferredVersion) as SavedResult['preferredVersion'],
    rubrics: (serverItem.rubrics as SavedResult['rubrics']) ?? null,
  };
}

export async function loadResult(problemId: string): Promise<SavedResult | null> {
  const uid = getStoredUserId();
  const savedResults = getSavedResults();

  // 동일 ID로 다른 기기/브라우저에서도 같은 내용이 보이도록 서버를 먼저 조회
  if (uid) {
    try {
      const response = await fetch(getApiUrl(`/api/v1/history/${encodeURIComponent(problemId)}`), {
        headers: getHistoryHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        const result = normalizeServerResult(data);
        savedResults[problemId] = result;
        try {
          localStorage.setItem(getStorageKey(), JSON.stringify(savedResults));
          localStorage.setItem(getLastProblemKey(), problemId);
        } catch {
          // 로컬 캐시 실패해도 서버 결과는 반환
        }
        return result;
      }
      if (response.status === 404) {
        // 서버에 없으면 아래에서 로컬 fallback
      } else {
        console.error(`서버에서 결과를 불러오는 중 오류 발생: ${response.status}`);
      }
    } catch (err) {
      console.warn('서버에서 결과를 불러오는 중 오류:', err);
      // 네트워크 오류 시 로컬 fallback
    }
  }

  const local = savedResults[problemId];
  if (local) {
    localStorage.setItem(getLastProblemKey(), problemId);
    return local;
  }
  return null;
}

export async function deleteResult(problemId: string, userId?: string | null): Promise<void> {
  const id = (problemId ?? '').trim();
  if (!id) return;

  // localStorage에서 삭제
  const savedResults = getSavedResults();
  delete savedResults[id];
  localStorage.setItem(getStorageKey(), JSON.stringify(savedResults));

  // 서버에서도 삭제 (Firestore/파일). userId 있으면 헤더 폴백 사용
  try {
    const url = getApiUrl(`/api/v1/history/${encodeURIComponent(id)}`);
    const response = await fetch(url, {
      method: 'DELETE',
      headers: getHistoryHeadersWithFallback(userId),
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
  rubrics?: any[] | null,
  userId?: string | null
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
    
    // 서버에도 비동기로 저장 (X-User-Id로 유저별 분리). userId 있으면 헤더 폴백으로 사용
    fetch(getApiUrl('/api/v1/history/save'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getHistoryHeadersWithFallback(userId) },
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

/** 서버 저장까지 완료할 때까지 기다리는 저장. 문제 ID 변경 시 새 ID로 저장 후 구 ID 삭제할 때 사용 */
export async function saveResultAsync(
  problemId: string,
  cotData?: CoTData | null,
  subQData?: any | null,
  guidelineData?: GuidelineData | null,
  preferredVersion?: Record<string, 'original' | 'regenerated'> | null,
  rubrics?: any[] | null,
  userId?: string | null
): Promise<void> {
  saveResult(problemId, cotData, subQData, guidelineData, preferredVersion, rubrics, userId);
  const savedResults = getSavedResults();
  const resultData = savedResults[problemId];
  if (!resultData) return;
  const url = getApiUrl('/api/v1/history/save');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getHistoryHeadersWithFallback(userId) },
    body: JSON.stringify(resultData),
  });
  if (!res.ok) throw new Error(`저장 실패: ${res.status}`);
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
