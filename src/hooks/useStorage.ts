import { useState, useEffect, useCallback } from 'react';
import type { CoTData, SubQuestionData } from '../types';
import { USER_ID_STORAGE_KEY } from '../components/UserIdPage/UserIdPage';
import { getApiUrl, api } from '../services/api';
import { isDemoUserId } from '../demo/demoAccount';

const STORAGE_KEY_PREFIX = 'hamamath_saved_results';
const DEMO_LAST_PROBLEM_KEY_PREFIX = 'hamamath_last_problem_id';
const MAX_SAVED_RESULTS = 50;

/** 세션 로그인 ID */
function getStoredUserId(): string | null {
  return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(USER_ID_STORAGE_KEY) : null;
}

function resolveUserId(userId?: string | null): string {
  return (userId ?? getStoredUserId() ?? '').trim();
}

/** 데모 계정만 localStorage 사용 */
function getDemoStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}_${userId}`;
}

function getDemoLastProblemKey(userId: string): string {
  return `${DEMO_LAST_PROBLEM_KEY_PREFIX}_${userId}`;
}

/** HTTP 헤더 값은 ISO-8859-1만 허용. 한글 등이 있으면 Base64로 인코딩 */
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

export function encodeUserIdForHeader(uid: string): Record<string, string> {
  if (!uid?.trim()) return {};
  const { value, encoding } = encodeForHeader(uid);
  const h: Record<string, string> = { 'X-User-Id': value };
  if (encoding) h['X-User-Id-Encoding'] = encoding;
  return h;
}

export function getHistoryHeaders(): Record<string, string> {
  return encodeUserIdForHeader(getStoredUserId() ?? '');
}

export function getHistoryHeadersWithFallback(userIdFromCaller?: string | null): Record<string, string> {
  const fromStorage = getHistoryHeaders();
  if (fromStorage['X-User-Id']) return fromStorage;
  return encodeUserIdForHeader(userIdFromCaller ?? '');
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

/** 비데모: 메모리 캐시 (서버/Firestore가 진실 소스) */
const memoryCache = new Map<string, SavedResults>();
const pendingSyncMemory = new Map<string, SavedResults>();

function normalizeSavedResults(parsed: SavedResults): SavedResults {
  for (const key of Object.keys(parsed)) {
    const item = parsed[key];
    if (item && !item.subQuestionData && (item as { guidelineData?: SubQuestionData }).guidelineData) {
      item.subQuestionData = (item as { guidelineData?: SubQuestionData }).guidelineData ?? null;
    }
  }
  return parsed;
}

function readDemoStore(userId: string): SavedResults {
  try {
    const stored = localStorage.getItem(getDemoStorageKey(userId));
    return normalizeSavedResults(stored ? JSON.parse(stored) : {});
  } catch {
    return {};
  }
}

function writeDemoStore(userId: string, data: SavedResults): void {
  localStorage.setItem(getDemoStorageKey(userId), JSON.stringify(data));
}

function getMemoryStore(userId: string): SavedResults {
  const key = userId || '_anonymous';
  if (!memoryCache.has(key)) memoryCache.set(key, {});
  return memoryCache.get(key)!;
}

function getPendingStore(userId: string): SavedResults {
  const key = userId || '_anonymous';
  if (!pendingSyncMemory.has(key)) pendingSyncMemory.set(key, {});
  return pendingSyncMemory.get(key)!;
}

export function getStorageKeyForUser(userId: string): string {
  return getDemoStorageKey(userId);
}

export function getSavedResultsForUser(userId: string): SavedResults {
  if (isDemoUserId(userId)) return readDemoStore(userId);
  return getMemoryStore(userId);
}

export function getSavedResults(): SavedResults {
  return getSavedResultsForUser(resolveUserId());
}

export interface HistoryListItem {
  problemId: string;
  timestamp: string;
  grade?: string | null;
}

function enqueuePending(userId: string, result: SavedResult): void {
  if (!userId) return;
  const pending = getPendingStore(userId);
  pending[result.problemId] = result;
}

function dequeuePending(userId: string, problemId: string): void {
  if (!userId) return;
  const pending = getPendingStore(userId);
  delete pending[problemId];
}

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

async function pushAndTrack(result: SavedResult, effectiveUserId: string, userId?: string | null): Promise<boolean> {
  const ok = await pushResultToServer(result, userId);
  if (ok) dequeuePending(effectiveUserId, result.problemId);
  else enqueuePending(effectiveUserId, result);
  return ok;
}

export function getPendingSyncCount(userId?: string | null): number {
  const uid = resolveUserId(userId);
  if (!uid || isDemoUserId(uid)) return 0;
  return Object.keys(getPendingStore(uid)).length;
}

export async function syncPendingResults(userId?: string | null): Promise<{ synced: number; remaining: number }> {
  const uid = resolveUserId(userId);
  if (!uid || isDemoUserId(uid)) return { synced: 0, remaining: 0 };
  const pending = getPendingStore(uid);
  const ids = Object.keys(pending);
  let synced = 0;
  for (const pid of ids) {
    const ok = await pushResultToServer(pending[pid], uid);
    if (ok) {
      dequeuePending(uid, pid);
      synced++;
    }
  }
  return { synced, remaining: Object.keys(getPendingStore(uid)).length };
}

export async function fetchHistoryListForUser(userId: string): Promise<HistoryListItem[]> {
  const uid = userId?.trim();
  if (!uid) return [];

  if (isDemoUserId(uid)) {
    return Object.entries(readDemoStore(uid))
      .map(([problemId, result]) => ({ problemId, timestamp: result.timestamp ?? '', grade: (result.cotData as { grade?: string } | null)?.grade ?? null }))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  try {
    const data = await api.getMyHistoryList(uid);
    const serverResults = Array.isArray(data) ? data : [];
    return serverResults
      .map((item) => ({
        problemId: ((item as { problem_id?: string; problemId?: string }).problem_id
          ?? (item as { problemId?: string }).problemId
          ?? '').trim(),
        timestamp: (item as { timestamp?: string }).timestamp ?? '',
        grade: (item as { grade?: string | null }).grade ?? null,
      }))
      .filter((item) => item.problemId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (err) {
    console.warn('저장 목록 조회 실패:', err);
    return [];
  }
}

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
  return Object.entries(getSavedResults())
    .map(([problemId, result]) => ({ problemId, timestamp: result.timestamp ?? '' }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function buildMergedResult(
  problemId: string,
  store: SavedResults,
  cotData?: CoTData | null,
  subQData?: any | null,
  subQuestionData?: SubQuestionData | null,
  preferredVersion?: Record<string, 'original' | 'regenerated'> | null,
  rubrics?: any[] | null,
): SavedResult {
  const existing = store[problemId];
  return {
    problemId,
    timestamp: new Date().toISOString(),
    cotData: cotData !== undefined ? cotData : (existing?.cotData ?? null),
    subQData: subQData !== undefined ? subQData : (existing?.subQData ?? null),
    subQuestionData:
      subQuestionData !== undefined
        ? subQuestionData
        : (existing?.subQuestionData
          ?? (existing as { guidelineData?: SubQuestionData | null } | undefined)?.guidelineData
          ?? null),
    preferredVersion:
      preferredVersion !== undefined ? (preferredVersion ?? undefined) : existing?.preferredVersion,
    rubrics: rubrics !== undefined ? (rubrics ?? null) : (existing?.rubrics ?? null),
  };
}

export async function loadResult(problemId: string): Promise<SavedResult | null> {
  const uid = resolveUserId();
  const store = getSavedResultsForUser(uid);

  if (isDemoUserId(uid)) {
    return store[problemId] ?? null;
  }

  if (uid) {
    try {
      const response = await fetch(getApiUrl(`/api/v1/history/${encodeURIComponent(problemId)}`), {
        headers: getHistoryHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        const result = normalizeServerResult(data);
        store[problemId] = result;
        void api.updateUserPrefs(problemId, uid).catch(() => {});
        return result;
      }
      if (response.status !== 404) {
        console.error(`서버에서 결과를 불러오는 중 오류 발생: ${response.status}`);
      }
    } catch (err) {
      console.warn('서버에서 결과를 불러오는 중 오류:', err);
    }
  }

  return store[problemId] ?? null;
}

export async function loadResultForUser(problemId: string, ownerUserId: string): Promise<SavedResult | null> {
  const uid = ownerUserId?.trim();
  if (!uid) return null;

  const store = getSavedResultsForUser(uid);

  if (isDemoUserId(uid)) {
    return store[problemId] ?? null;
  }

  try {
    const response = await fetch(getApiUrl(`/api/v1/history/${encodeURIComponent(problemId)}`), {
      headers: encodeUserIdForHeader(uid),
    });
    if (response.ok) {
      const data = await response.json();
      const result = normalizeServerResult(data);
      store[problemId] = result;
      return result;
    }
    if (response.status !== 404) {
      console.error(`서버에서 결과를 불러오는 중 오류 발생: ${response.status}`);
    }
  } catch (err) {
    console.warn('서버에서 결과를 불러오는 중 오류:', err);
  }

  return store[problemId] ?? null;
}

export async function deleteResult(problemId: string, userId?: string | null): Promise<void> {
  const id = (problemId ?? '').trim();
  if (!id) return;

  const effectiveUserId = resolveUserId(userId);
  const store = getSavedResultsForUser(effectiveUserId);
  delete store[id];
  dequeuePending(effectiveUserId, id);

  if (isDemoUserId(effectiveUserId)) {
    writeDemoStore(effectiveUserId, store);
    return;
  }

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
  const uid = resolveUserId();
  if (isDemoUserId(uid)) {
    localStorage.removeItem(getDemoStorageKey(uid));
    localStorage.removeItem(getDemoLastProblemKey(uid));
  }
  memoryCache.delete(uid || '_anonymous');
  pendingSyncMemory.delete(uid || '_anonymous');
}

export function saveResult(
  problemId: string,
  cotData?: CoTData | null,
  subQData?: any | null,
  subQuestionData?: SubQuestionData | null,
  preferredVersion?: Record<string, 'original' | 'regenerated'> | null,
  rubrics?: any[] | null,
  userId?: string | null,
  deferServer = false,
): void {
  const effectiveUserId = resolveUserId(userId);
  const store = getSavedResultsForUser(effectiveUserId);
  const resultData = buildMergedResult(
    problemId,
    store,
    cotData,
    subQData,
    subQuestionData,
    preferredVersion,
    rubrics,
  );
  store[problemId] = resultData;

  if (isDemoUserId(effectiveUserId)) {
    const keys = Object.keys(store);
    if (keys.length > MAX_SAVED_RESULTS) {
      const sorted = keys.sort(
        (a, b) => new Date(store[a].timestamp || 0).getTime() - new Date(store[b].timestamp || 0).getTime(),
      );
      sorted.slice(0, keys.length - MAX_SAVED_RESULTS).forEach((k) => delete store[k]);
    }
    writeDemoStore(effectiveUserId, store);
    localStorage.setItem(getDemoLastProblemKey(effectiveUserId), problemId);
    return;
  }

  if (deferServer) return;

  void pushAndTrack(resultData, effectiveUserId, userId);
  void api.updateUserPrefs(problemId, effectiveUserId).catch(() => {});
}

export async function saveResultAsync(
  problemId: string,
  cotData?: CoTData | null,
  subQData?: any | null,
  subQuestionData?: SubQuestionData | null,
  preferredVersion?: Record<string, 'original' | 'regenerated'> | null,
  rubrics?: any[] | null,
  userId?: string | null,
): Promise<void> {
  const effectiveUserId = resolveUserId(userId);
  const store = getSavedResultsForUser(effectiveUserId);
  const resultData = buildMergedResult(
    problemId,
    store,
    cotData,
    subQData,
    subQuestionData,
    preferredVersion,
    rubrics,
  );
  store[problemId] = resultData;

  if (isDemoUserId(effectiveUserId)) {
    writeDemoStore(effectiveUserId, store);
    return;
  }

  const ok = await pushAndTrack(resultData, effectiveUserId, userId);
  if (!ok) throw new Error('서버 저장에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.');
  await api.updateUserPrefs(problemId, effectiveUserId).catch(() => {});
}

export const useStorage = () => {
  const [savedResults, setSavedResults] = useState<SavedResults>({});

  useEffect(() => {
    setSavedResults(getSavedResults());
  }, []);

  const saveResultHook = useCallback((
    problemId: string,
    cotData: CoTData | null,
    subQData: any | null,
    subQuestionData: SubQuestionData | null,
  ) => {
    saveResult(problemId, cotData, subQData, subQuestionData);
    setSavedResults(getSavedResults());
  }, []);

  const loadResultHook = useCallback((problemId: string): SavedResult | null => {
    return savedResults[problemId] ?? null;
  }, [savedResults]);

  const deleteResultHook = useCallback((problemId: string) => {
    void deleteResult(problemId);
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
