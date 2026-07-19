import { useState, useEffect, useCallback } from 'react';
import type { CoTData, SubQuestionData } from '../types';
import { USER_ID_STORAGE_KEY } from '../components/UserIdPage/UserIdPage';
import { getApiUrl, api } from '../services/api';
import { isDemoUserId } from '../demo/demoAccount';

const STORAGE_KEY_PREFIX = 'hamamath_saved_results';
const LAST_PROBLEM_KEY_PREFIX = 'hamamath_last_problem_id';
const MAX_SAVED_RESULTS = 50;

/** 현재 로그인한 사용자 ID (세션 기준 — 사이트 처음 접속 시 로그인 화면 표시) */
function getStoredUserId(): string | null {
  return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(USER_ID_STORAGE_KEY) : null;
}

/** 특정 사용자 ID 기준 localStorage 저장 키 */
export function getStorageKeyForUser(userId: string): string {
  const uid = userId?.trim();
  return uid ? `${STORAGE_KEY_PREFIX}_${uid}` : STORAGE_KEY_PREFIX;
}

/** 현재 로그인한 사용자 ID 기준 저장 키 (아이디별로 저장 결과 분리) */
function getStorageKey(): string {
  const uid = getStoredUserId();
  return getStorageKeyForUser(uid ?? '');
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
  subQuestionData: SubQuestionData | null;
  preferredVersion?: Record<string, 'original' | 'regenerated'>;
  rubrics?: any[] | null;
}

interface SavedResults {
  [problemId: string]: SavedResult;
}

function normalizeSavedResults(parsed: SavedResults): SavedResults {
  for (const key of Object.keys(parsed)) {
    const item = parsed[key];
    if (item && !item.subQuestionData && item.guidelineData) {
      item.subQuestionData = item.guidelineData;
    }
  }
  return parsed;
}

/** 지정한 사용자 ID의 localStorage 저장 결과 */
export function getSavedResultsForUser(userId: string): SavedResults {
  try {
    const stored = localStorage.getItem(getStorageKeyForUser(userId));
    const parsed = stored ? JSON.parse(stored) : {};
    return normalizeSavedResults(parsed);
  } catch (e) {
    console.error('저장된 결과 불러오기 실패:', e);
    return {};
  }
}

// 전역 함수로 export (현재 로그인한 사용자 ID 기준)
export function getSavedResults(): SavedResults {
  try {
    const stored = localStorage.getItem(getStorageKey());
    const parsed = stored ? JSON.parse(stored) : {};
    return normalizeSavedResults(parsed);
  } catch (e) {
    console.error('저장된 결과 불러오기 실패:', e);
    return {};
  }
}

export interface HistoryListItem {
  problemId: string;
  timestamp: string;
}

// ───────────────────────── 서버 동기화 대기 큐 ─────────────────────────
// 서버(Firestore)를 진실 소스로 사용하므로, 서버 저장 실패분은 유실되지 않도록
// 계정별 로컬 큐에 쌓아두고 재시도(로그인 시 / 온라인 복귀 시 / 다음 저장 시)한다.
const PENDING_SYNC_KEY_PREFIX = 'hamamath_pending_sync';

function getPendingKeyForUser(userId: string): string {
  const uid = userId?.trim();
  return uid ? `${PENDING_SYNC_KEY_PREFIX}_${uid}` : PENDING_SYNC_KEY_PREFIX;
}

function getPendingResults(userId: string): SavedResults {
  try {
    const raw = localStorage.getItem(getPendingKeyForUser(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setPendingResults(userId: string, pending: SavedResults): void {
  try {
    const key = getPendingKeyForUser(userId);
    if (Object.keys(pending).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(pending));
  } catch (e) {
    console.warn('동기화 대기 큐 저장 실패:', e);
  }
}

function enqueuePending(userId: string, result: SavedResult): void {
  if (!userId) return;
  const pending = getPendingResults(userId);
  pending[result.problemId] = result;
  setPendingResults(userId, pending);
}

function dequeuePending(userId: string, problemId: string): void {
  if (!userId) return;
  const pending = getPendingResults(userId);
  if (pending[problemId]) {
    delete pending[problemId];
    setPendingResults(userId, pending);
  }
}

/** 저장 결과 1건을 서버에 POST. 성공 여부 반환(예외 없이 boolean). */
async function pushResultToServer(result: SavedResult, userId?: string | null): Promise<boolean> {
  try {
    const res = await fetch(getApiUrl('/api/v1/history/save'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getHistoryHeadersWithFallback(userId) },
      body: JSON.stringify(result),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 서버 저장을 시도하고, 결과에 따라 대기 큐를 갱신한다(성공 시 제거, 실패 시 추가). */
async function pushAndTrack(result: SavedResult, effectiveUserId: string, userId?: string | null): Promise<boolean> {
  const ok = await pushResultToServer(result, userId);
  if (ok) dequeuePending(effectiveUserId, result.problemId);
  else enqueuePending(effectiveUserId, result);
  return ok;
}

/** 현재(또는 지정) 계정의 서버 미전송 저장 건수. */
export function getPendingSyncCount(userId?: string | null): number {
  const uid = (userId ?? getStoredUserId()) ?? '';
  if (!uid || isDemoUserId(uid)) return 0;
  return Object.keys(getPendingResults(uid)).length;
}

/** 대기 큐를 서버로 재전송. 성공한 건은 큐에서 제거. */
export async function syncPendingResults(userId?: string | null): Promise<{ synced: number; remaining: number }> {
  const uid = (userId ?? getStoredUserId()) ?? '';
  if (!uid || isDemoUserId(uid)) return { synced: 0, remaining: 0 };
  const pending = getPendingResults(uid);
  const ids = Object.keys(pending);
  let synced = 0;
  for (const pid of ids) {
    const ok = await pushResultToServer(pending[pid], uid);
    if (ok) {
      dequeuePending(uid, pid);
      synced++;
    }
  }
  return { synced, remaining: Object.keys(getPendingResults(uid)).length };
}

/** 서버 목록 + 로컬 캐시를 병합한 저장 이력 (데모가 test 계정과 동기화할 때 사용) */
export async function fetchHistoryListForUser(userId: string): Promise<HistoryListItem[]> {
  const uid = userId?.trim();
  if (!uid) return [];

  let serverResults: Array<{ problem_id?: string; problemId?: string; timestamp?: string }> = [];
  try {
    const data = await api.getMyHistoryList(uid);
    serverResults = Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('저장 목록 조회 실패:', err);
  }

  const local = getSavedResultsForUser(uid);
  const merged = new Map<string, string>();

  for (const item of serverResults) {
    const pid = (item.problem_id ?? item.problemId ?? '').trim();
    if (pid) merged.set(pid, item.timestamp ?? '');
  }
  for (const [pid, result] of Object.entries(local)) {
    if (!merged.has(pid)) merged.set(pid, result.timestamp ?? '');
  }

  return Array.from(merged.entries())
    .map(([problemId, timestamp]) => ({ problemId, timestamp }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/** 서버 응답을 SavedResult 형태로 정규화 (snake_case → camelCase 등) */
function normalizeServerResult(serverItem: Record<string, unknown>): SavedResult {
  return {
    problemId: (serverItem.problem_id as string) ?? (serverItem.problemId as string),
    timestamp: (serverItem.timestamp as string) ?? '',
    cotData: (serverItem.cot_data ?? serverItem.cotData) as SavedResult['cotData'],
    subQData: (serverItem.subq_data ?? serverItem.subQData) as SavedResult['subQData'],
    subQuestionData: (
      serverItem.sub_question_data ??
      serverItem.subQuestionData ??
      serverItem.guideline_data ??
      serverItem.guidelineData
    ) as SavedResult['subQuestionData'],
    preferredVersion: (serverItem.preferred_version ?? serverItem.preferredVersion) as SavedResult['preferredVersion'],
    rubrics: (serverItem.rubrics as SavedResult['rubrics']) ?? null,
  };
}

export function fetchLocalHistoryList(): HistoryListItem[] {
  const saved = getSavedResults();
  return Object.entries(saved)
    .map(([problemId, result]) => ({
      problemId,
      timestamp: result.timestamp ?? '',
    }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function loadResult(problemId: string): Promise<SavedResult | null> {
  const uid = getStoredUserId();
  const savedResults = getSavedResults();

  // 데모 계정: 서버 없이 localStorage만 사용
  if (isDemoUserId(uid)) {
    const local = savedResults[problemId];
    if (local) {
      localStorage.setItem(getLastProblemKey(), problemId);
    }
    return local ?? null;
  }

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

/** 지정한 소유자 계정의 저장 결과 로드 (데모가 test 데이터를 읽을 때 사용) */
export async function loadResultForUser(problemId: string, ownerUserId: string): Promise<SavedResult | null> {
  const uid = ownerUserId?.trim();
  if (!uid) return null;

  const storageKey = getStorageKeyForUser(uid);
  const savedResults = getSavedResultsForUser(uid);

  try {
    const response = await fetch(getApiUrl(`/api/v1/history/${encodeURIComponent(problemId)}`), {
      headers: encodeUserIdForHeader(uid),
    });
    if (response.ok) {
      const data = await response.json();
      const result = normalizeServerResult(data);
      savedResults[problemId] = result;
      try {
        localStorage.setItem(storageKey, JSON.stringify(savedResults));
      } catch {
        // 로컬 캐시 실패해도 서버 결과는 반환
      }
      return result;
    }
    if (response.status !== 404) {
      console.error(`서버에서 결과를 불러오는 중 오류 발생: ${response.status}`);
    }
  } catch (err) {
    console.warn('서버에서 결과를 불러오는 중 오류:', err);
  }

  return savedResults[problemId] ?? null;
}

export async function deleteResult(problemId: string, userId?: string | null): Promise<void> {
  const id = (problemId ?? '').trim();
  if (!id) return;

  // localStorage에서 삭제
  const savedResults = getSavedResults();
  delete savedResults[id];
  localStorage.setItem(getStorageKey(), JSON.stringify(savedResults));

  const effectiveUserId = userId ?? getStoredUserId();
  if (isDemoUserId(effectiveUserId)) return;

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
  subQuestionData?: SubQuestionData | null,
  preferredVersion?: Record<string, 'original' | 'regenerated'> | null,
  rubrics?: any[] | null,
  userId?: string | null,
  deferServer = false
): void {
  const effectiveUserId = userId ?? getStoredUserId();
  const isDemo = isDemoUserId(effectiveUserId);

  const savedResults = getSavedResults();
  const existing = savedResults[problemId];
  const resultData: SavedResult = {
    problemId,
    timestamp: new Date().toISOString(),
    cotData: cotData !== undefined ? cotData : (existing?.cotData ?? null),
    subQData: subQData !== undefined ? subQData : (existing?.subQData ?? null),
    subQuestionData: subQuestionData !== undefined ? subQuestionData : (existing?.subQuestionData ?? (existing as { guidelineData?: SubQuestionData | null } | undefined)?.guidelineData ?? null),
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

    if (isDemo || deferServer) return;

    // 서버(진실 소스)에 저장 시도 — 실패하면 대기 큐에 넣어 자동 재시도(유실 방지)
    void pushAndTrack(resultData, effectiveUserId ?? '', userId);
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
  subQuestionData?: SubQuestionData | null,
  preferredVersion?: Record<string, 'original' | 'regenerated'> | null,
  rubrics?: any[] | null,
  userId?: string | null
): Promise<void> {
  const effectiveUserId = userId ?? getStoredUserId();
  // 로컬 저장만 먼저 수행(deferServer=true) — 서버 POST는 아래에서 한 번만 await
  saveResult(problemId, cotData, subQData, subQuestionData, preferredVersion, rubrics, userId, true);
  if (isDemoUserId(effectiveUserId)) return;
  const savedResults = getSavedResults();
  const resultData = savedResults[problemId];
  if (!resultData) return;
  const ok = await pushAndTrack(resultData, effectiveUserId ?? '', userId);
  if (!ok) throw new Error('서버 저장에 실패했습니다. 동기화 대기 목록에 저장되어 자동 재시도됩니다.');
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
    subQuestionData: SubQuestionData | null
  ) => {
    saveResult(problemId, cotData, subQData, subQuestionData);
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
