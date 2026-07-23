import { useEffect, useState, useRef, MouseEvent, ChangeEvent } from "react";
import { useApp } from "../../contexts/AppContext";
import { loadResult, deleteResult, saveResultAsync, fetchHistoryListForUser, getPendingSyncCount, syncPendingResults } from "../../hooks/useStorage";
import { getDemoSourceUserId } from "../../demo/demoAccount";
import { getProblemDisplayLabel, PROBLEM_DROPDOWN_OPTIONS } from "../../utils/problemIdAlias";
import { loadDemoSavedWorkflow } from "../../demo/demoWorkspace";
import { api, type AuxiliaryMaterialItem } from "../../services/api";
import { parseAuxMaterialGradeKey, sortAuxGradeKeys, AUX_GRADE_COMMON } from "../../utils/auxiliaryMaterial";
import { isAdmin } from "../../utils/admin";
import { useLocale } from "../../i18n/LocaleContext";
import { AdminModeModal } from "../AdminMode/AdminModeModal";
import styles from "./Sidebar.module.css";

interface SavedResultItem {
  problemId: string;
  timestamp: string;
  dateStr: string;
  grade?: string | null;
}

interface SidebarProps {
  userId?: string | null;
  onOpenAdminDb?: () => void;
  onHistoryChanged?: () => void;
}

const PlusIcon = () => (
  <svg className={styles.navActionIcon} viewBox="0 0 24 24" aria-hidden>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const RenameIcon = () => (
  <svg className={styles.itemActionIcon} viewBox="0 0 24 24" aria-hidden>
    <path
      d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

const DeleteIcon = () => (
  <svg className={styles.itemActionIcon} viewBox="0 0 24 24" aria-hidden>
    <path
      d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** 학년 그룹 키 (미지정은 별도 키) */
const UNCATEGORIZED_GRADE = "__uncat__";
function gradeGroupKey(grade?: string | null): string {
  return (grade || "").trim() || UNCATEGORIZED_GRADE;
}
function gradeGroupLabel(key: string, locale: string): string {
  if (key === UNCATEGORIZED_GRADE) return locale === "en" ? "Uncategorized" : "미분류";
  return key; // 예: "6학년"
}
/** 학년 키 정렬: 숫자 오름차순, 미분류는 맨 뒤 */
function sortGradeKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    if (a === UNCATEGORIZED_GRADE) return 1;
    if (b === UNCATEGORIZED_GRADE) return -1;
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.localeCompare(b);
  });
}
function groupByGrade<T extends { grade?: string | null }>(items: T[]): Array<{ key: string; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = gradeGroupKey(item.grade);
    (map.get(key) ?? map.set(key, []).get(key)!).push(item);
  }
  return sortGradeKeys([...map.keys()]).map((key) => ({ key, items: map.get(key)! }));
}

/** 학습 자료(참고자료) 학년 라벨 */
function auxGradeLabel(key: string, locale: string): string {
  if (key === AUX_GRADE_COMMON) return locale === "en" ? "Common" : "공통";
  return locale === "en" ? `Grade ${key}` : `${key}학년`;
}
/** 학습 자료를 학년 키별로 그룹핑 (parseAuxMaterialGradeKey로 정규화) */
function groupAuxByGrade(items: AuxiliaryMaterialItem[]): Array<{ key: string; items: AuxiliaryMaterialItem[] }> {
  const map = new Map<string, AuxiliaryMaterialItem[]>();
  for (const m of items) {
    const key = parseAuxMaterialGradeKey(m.grade);
    (map.get(key) ?? map.set(key, []).get(key)!).push(m);
  }
  return sortAuxGradeKeys([...map.keys()]).map((key) => ({ key, items: map.get(key)! }));
}

/** 사이드바 학습 자료 업로드용 학년 선택지 (값: 서버 저장 grade. ""=공통) */
const AUX_UPLOAD_GRADE_OPTIONS = ["", "3", "4", "5", "6"];

export const Sidebar = ({ userId, onOpenAdminDb, onHistoryChanged }: SidebarProps) => {
  const { t, locale } = useLocale();
  const {
    sidebarOpen,
    setSidebarOpen,
    currentProblemId,
    setCurrentStep,
    setCurrentCotData,
    setCurrentSubQData,
    setCurrentSubQuestionData,
    setCurrentProblemId,
    setPreferredVersion,
    setCurrentRubrics,
    setFinalizedSubQuestionForRubric,
    setLoading,
    setError,
    isDemoMode,
    reset,
    setRequestedExampleFile,
    auxMaterials,
    setAuxMaterials,
  } = useApp();
  const [savedResults, setSavedResults] = useState<SavedResultItem[]>([]);
  const [listLoadError, setListLoadError] = useState<string | null>(null);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  // 접힌 학년 그룹 키 집합 (기본 펼침)
  const [collapsedGrades, setCollapsedGrades] = useState<Set<string>>(new Set());
  const toggleGrade = (key: string) =>
    setCollapsedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // 학습 자료(참고자료) 라이브러리 — 목록(auxMaterials)은 AppContext에서 공유(문제화면과 동기화)
  const [auxError, setAuxError] = useState<string | null>(null);
  const [auxUploading, setAuxUploading] = useState(false);
  const [auxUploadGrade, setAuxUploadGrade] = useState<string>("");
  const [collapsedAuxGrades, setCollapsedAuxGrades] = useState<Set<string>>(new Set());
  const [examplesCollapsed, setExamplesCollapsed] = useState(false);
  const auxFileInputRef = useRef<HTMLInputElement>(null);
  const toggleAuxGrade = (key: string) =>
    setCollapsedAuxGrades((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleAuxUploadClick = () => auxFileInputRef.current?.click();

  const handleAuxUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || isDemoMode) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setAuxError(t("problemInput.auxPdfOnly"));
      return;
    }
    setAuxUploading(true);
    setAuxError(null);
    try {
      const result = await api.uploadAuxiliaryMaterial(
        { file, grade: auxUploadGrade, title: file.name.replace(/\.[^.]+$/, "") },
        userId,
      );
      setAuxMaterials((prev) => [result.item, ...prev.filter((m) => m.id !== result.item.id)]);
    } catch (err: unknown) {
      setAuxError(err instanceof Error ? err.message : t("problemInput.auxUploadFail"));
    } finally {
      setAuxUploading(false);
    }
  };

  const handleAuxDelete = async (materialId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isDemoMode || !window.confirm(t("problemInput.auxDeleteConfirm"))) return;
    try {
      await api.deleteAuxiliaryMaterial(materialId, userId);
      setAuxMaterials((prev) => prev.filter((m) => m.id !== materialId));
    } catch (err: unknown) {
      setAuxError(err instanceof Error ? err.message : t("problemInput.auxUploadFail"));
    }
  };

  useEffect(() => {
    updateSavedResultsList();
  }, [userId]);

  // 서버 미전송(동기화 대기) 건수 갱신 — 목록/계정 변경 시
  useEffect(() => {
    setPendingCount(getPendingSyncCount(userId));
  }, [userId, savedResults]);

  const handleRetrySync = async () => {
    setSyncing(true);
    try {
      const { remaining } = await syncPendingResults(userId);
      setPendingCount(remaining);
      await updateSavedResultsList();
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (sidebarOpen) updateSavedResultsList();
  }, [sidebarOpen, userId]);

  const updateSavedResultsList = async () => {
    setListLoadError(null);
    if (!userId?.trim()) {
      setSavedResults([]);
      return;
    }
    if (isDemoMode) {
      const sourceUserId = getDemoSourceUserId();
      if (!sourceUserId) {
        setSavedResults([]);
        return;
      }
      try {
        const list = await fetchHistoryListForUser(sourceUserId);
        const allResults: SavedResultItem[] = list.map((item) => {
          const date = new Date(item.timestamp);
          const dateStr = Number.isNaN(date.getTime())
            ? ""
            : date.toLocaleString(undefined, {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });
          return { problemId: item.problemId, timestamp: item.timestamp, dateStr, grade: item.grade ?? null };
        });
        setSavedResults(allResults);
      } catch (err: unknown) {
        console.warn("데모 저장 목록 조회 실패:", err);
        setSavedResults([]);
      }
      return;
    }
    // 서버(Firestore)를 유일한 진실 소스로 사용 — 어느 브라우저·기기에서든 동일하게 보이도록.
    let serverResults: Array<{ problem_id?: string; problemId?: string; timestamp?: string; grade?: string | null }> = [];
    try {
      const data = await api.getMyHistoryList(userId);
      serverResults = Array.isArray(data) ? data : [];
    } catch (err: unknown) {
      console.warn("저장 목록 조회 실패:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setListLoadError(msg.includes("불러올 수 없습니다") || msg.includes("Unable to load") ? msg : t("sidebar.listLoadError", { msg }));
    }

    const allResults: SavedResultItem[] = serverResults.map((item) => {
      const pid = item.problem_id ?? item.problemId ?? "";
      const ts = item.timestamp ?? "";
      const date = new Date(ts);
      const dateStr = Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleString(undefined, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
      return { problemId: pid, timestamp: ts, dateStr, grade: item.grade ?? null };
    });

    allResults.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setSavedResults(allResults);
  };

  const handleClose = () => setSidebarOpen(false);

  const handleNewProblem = () => {
    setSidebarOpen(false);
    reset();
  };

  // 예제 클릭 → 문제 입력 화면으로 이동해 해당 예제를 로드(공유 시그널로 ProblemInput이 처리)
  const handleSelectExample = (file: string) => {
    setRequestedExampleFile(file);
    setCurrentStep(1);
    setSidebarOpen(false);
  };

  const handleLoadResult = async (problemId: string) => {
    try {
      if (isDemoMode) {
        const loaded = await loadDemoSavedWorkflow(problemId, {
          setCurrentProblemId,
          setCurrentCotData,
          setCurrentSubQData,
          setCurrentSubQuestionData,
          setFinalizedSubQuestionForRubric,
          setCurrentRubrics,
          setPreferredVersion: setPreferredVersion ?? (() => {}),
          setCurrentStep,
          setLoading,
          setError,
        });
        if (loaded) {
          setSidebarOpen(false);
        } else {
          alert(t("sidebar.loadFail"));
        }
        return;
      }
      const result = await loadResult(problemId);
      if (result) {
        setCurrentProblemId(result.problemId || problemId);
        setCurrentCotData(result.cotData);
        setCurrentSubQData(result.subQData ?? null);
        setCurrentSubQuestionData(result.subQuestionData ?? null);
        // 확정본도 함께 교체함. 안 그러면 이전 문제 것이 남아 루브릭·진단이 엉뚱한 문항으로 그려짐
        setFinalizedSubQuestionForRubric(result.subQuestionData ?? null);
        if (setPreferredVersion) setPreferredVersion(result.preferredVersion || {});
        if (setCurrentRubrics) setCurrentRubrics(result.rubrics ?? null);

        if (result.subQuestionData && result.cotData) {
          setCurrentStep(3);
        } else if (result.cotData) {
          setCurrentStep(2);
        }

        setSidebarOpen(false);
      } else {
        alert(t("sidebar.loadFail"));
      }
    } catch (err) {
      console.error("결과 불러오기 오류:", err);
      alert(t("sidebar.loadError"));
    }
  };

  const handleDeleteResult = async (problemId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!window.confirm(t("sidebar.deleteConfirm", { id: problemId }))) return;
    setSavedResults((prev) => prev.filter((item) => item.problemId !== problemId));
    await deleteResult(problemId, userId);
    updateSavedResultsList();
    onHistoryChanged?.();
  };

  const handleRenameResult = async (oldId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const newId = window.prompt(t("sidebar.renamePrompt"), oldId);
    if (newId == null) return;
    const trimmed = newId.trim();
    if (!trimmed) {
      alert(t("sidebar.renameEmpty"));
      return;
    }
    if (trimmed === oldId) return;
    if (savedResults.some((item) => item.problemId === trimmed) && !window.confirm(t("sidebar.overwriteConfirm", { id: trimmed }))) return;
    try {
      const result = await loadResult(oldId);
      if (!result) {
        alert(t("sidebar.renameLoadFail"));
        return;
      }
      await saveResultAsync(trimmed, result.cotData, result.subQData, result.subQuestionData ?? null, result.preferredVersion ?? undefined, result.rubrics ?? undefined, userId);
      await api.renameProblemId(oldId, trimmed, userId);
      await deleteResult(oldId, userId);
      setSavedResults((prev) => prev.map((item) => (item.problemId === oldId ? { ...item, problemId: trimmed } : item)));
      if (currentProblemId === oldId) setCurrentProblemId(trimmed);
      await updateSavedResultsList();
      alert(t("sidebar.renamed", { name: trimmed }));
    } catch (err: unknown) {
      console.error("문제 이름 변경 실패:", err);
      alert(t("sidebar.renameError", { msg: err instanceof Error ? err.message : String(err) }));
    }
  };

  return (
    <>
      <div
        className={`${styles.sidebarOverlay} ${sidebarOpen ? styles.show : ""}`}
        onClick={handleClose}
        aria-hidden={!sidebarOpen}
      />

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.open : ""}`} aria-label={t("sidebar.menu")}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>{t("sidebar.savedResults")}</h2>
          <button type="button" className={styles.sidebarCloseBtn} onClick={handleClose} aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        <div className={styles.sidebarBody}>
          <button type="button" className={`${styles.navAction} ${styles.navActionPrimary}`} onClick={handleNewProblem}>
            <PlusIcon />
            {t("sidebar.newProblem")}
          </button>

          <section className={styles.historySection} aria-labelledby="sidebar-history-heading">
            <div className={styles.sectionHead}>
              <h3 id="sidebar-history-heading" className={styles.sectionTitle}>
                {t("sidebar.history")}
              </h3>
              {savedResults.length > 0 && <span className={styles.historyCount}>{savedResults.length}</span>}
            </div>

            {listLoadError && <p className={styles.listError}>{listLoadError}</p>}

            {pendingCount > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  fontSize: 12,
                  color: "#b45309",
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: 6,
                  padding: "6px 8px",
                  margin: "4px 0 8px",
                }}
              >
                <span>⚠ 서버 미저장 {pendingCount}건</span>
                <button
                  type="button"
                  onClick={handleRetrySync}
                  disabled={syncing}
                  style={{ fontSize: 12, cursor: syncing ? "default" : "pointer", whiteSpace: "nowrap" }}
                >
                  {syncing ? "동기화 중…" : "다시 시도"}
                </button>
              </div>
            )}

            {savedResults.length === 0 && !listLoadError ? (
              <ul className={styles.historyList}>
                <li className={styles.emptyMessage}>{t("sidebar.emptyResults")}</li>
              </ul>
            ) : (
              groupByGrade(savedResults).map((group) => {
                const collapsed = collapsedGrades.has(group.key);
                return (
                  <div key={group.key} className={styles.gradeGroup}>
                    <button
                      type="button"
                      className={styles.gradeGroupHeader}
                      onClick={() => toggleGrade(group.key)}
                      aria-expanded={!collapsed}
                    >
                      <span
                        className={styles.gradeGroupCaret}
                        style={{ transform: collapsed ? "rotate(-90deg)" : "none" }}
                        aria-hidden
                      >
                        ▾
                      </span>
                      <span className={styles.gradeGroupLabel}>{gradeGroupLabel(group.key, locale)}</span>
                      <span className={styles.gradeGroupCount}>{group.items.length}</span>
                    </button>
                    {!collapsed && (
                      <ul className={styles.historyList}>
                        {group.items.map((item) => {
                          const isActive = currentProblemId === item.problemId;
                          return (
                            <li
                              key={item.problemId}
                              className={`${styles.historyItem} ${isActive ? styles.historyItemActive : ""}`}
                            >
                              <button
                                type="button"
                                className={styles.historyItemMain}
                                onClick={() => handleLoadResult(item.problemId)}
                              >
                                <div className={styles.historyItemTitle}>{getProblemDisplayLabel(item.problemId)}</div>
                                {item.dateStr && <div className={styles.historyItemDate}>{item.dateStr}</div>}
                              </button>
                              <div className={styles.historyItemActions}>
                                {!isDemoMode && (
                                  <>
                                    <button
                                      type="button"
                                      className={styles.itemActionBtn}
                                      onClick={(e) => handleRenameResult(item.problemId, e)}
                                      aria-label={t("sidebar.renameProblem")}
                                      title={t("sidebar.renameProblem")}
                                    >
                                      <RenameIcon />
                                    </button>
                                    <button
                                      type="button"
                                      className={`${styles.itemActionBtn} ${styles.itemActionBtnDanger}`}
                                      onClick={(e) => handleDeleteResult(item.problemId, e)}
                                      aria-label={t("sidebar.delete")}
                                      title={t("sidebar.delete")}
                                    >
                                      <DeleteIcon />
                                    </button>
                                  </>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })
            )}

          </section>

          {!isDemoMode && (
            <section className={styles.historySection} aria-labelledby="sidebar-aux-heading">
              <div className={styles.sectionHead}>
                <h3 id="sidebar-aux-heading" className={styles.sectionTitle}>
                  {locale === "en" ? "Learning materials" : "학습 자료"}
                </h3>
                {auxMaterials.length > 0 && <span className={styles.historyCount}>{auxMaterials.length}</span>}
              </div>

              <div className={styles.auxUploadRow}>
                <select
                  value={auxUploadGrade}
                  onChange={(e) => setAuxUploadGrade(e.target.value)}
                  className={styles.auxGradeSelect}
                  disabled={auxUploading}
                  aria-label={locale === "en" ? "Grade for upload" : "업로드할 학년"}
                >
                  {AUX_UPLOAD_GRADE_OPTIONS.map((g) => (
                    <option key={g || "common"} value={g}>
                      {auxGradeLabel(g || AUX_GRADE_COMMON, locale)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.auxUploadBtn}
                  onClick={handleAuxUploadClick}
                  disabled={auxUploading}
                >
                  {auxUploading ? t("common.loading") : locale === "en" ? "Upload PDF" : "PDF 업로드"}
                </button>
                <input
                  ref={auxFileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  style={{ display: "none" }}
                  onChange={handleAuxUpload}
                />
              </div>

              {auxError && <p className={styles.listError}>{auxError}</p>}

              {auxMaterials.length === 0 ? (
                <ul className={styles.historyList}>
                  <li className={styles.emptyMessage}>
                    {locale === "en" ? "No materials uploaded yet." : "업로드된 학습 자료가 없습니다."}
                  </li>
                </ul>
              ) : (
                groupAuxByGrade(auxMaterials).map((group) => {
                  const collapsed = collapsedAuxGrades.has(group.key);
                  return (
                    <div key={group.key} className={styles.gradeGroup}>
                      <button
                        type="button"
                        className={styles.gradeGroupHeader}
                        onClick={() => toggleAuxGrade(group.key)}
                        aria-expanded={!collapsed}
                      >
                        <span
                          className={styles.gradeGroupCaret}
                          style={{ transform: collapsed ? "rotate(-90deg)" : "none" }}
                          aria-hidden
                        >
                          ▾
                        </span>
                        <span className={styles.gradeGroupLabel}>{auxGradeLabel(group.key, locale)}</span>
                        <span className={styles.gradeGroupCount}>{group.items.length}</span>
                      </button>
                      {!collapsed && (
                        <ul className={styles.historyList}>
                          {group.items.map((m) => (
                            <li key={m.id} className={styles.historyItem}>
                              <div className={styles.historyItemMain} style={{ cursor: "default" }}>
                                <div className={styles.historyItemTitle}>{m.title || m.filename}</div>
                                <div className={styles.historyItemDate}>
                                  {m.filename}
                                  {m.chunk_count ? ` · ${m.chunk_count}${locale === "en" ? " chunks" : "청크"}` : ""}
                                </div>
                              </div>
                              <div className={styles.historyItemActions}>
                                <button
                                  type="button"
                                  className={`${styles.itemActionBtn} ${styles.itemActionBtnDanger}`}
                                  onClick={(e) => handleAuxDelete(m.id, e)}
                                  aria-label={t("sidebar.delete")}
                                  title={t("sidebar.delete")}
                                >
                                  <DeleteIcon />
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })
              )}
            </section>
          )}

          <section className={styles.historySection} aria-labelledby="sidebar-examples-heading">
            <button
              type="button"
              className={styles.sectionToggle}
              onClick={() => setExamplesCollapsed((v) => !v)}
              aria-expanded={!examplesCollapsed}
            >
              <span
                className={styles.gradeGroupCaret}
                style={{ transform: examplesCollapsed ? "rotate(-90deg)" : "none" }}
                aria-hidden
              >
                ▾
              </span>
              <span id="sidebar-examples-heading" className={styles.sectionTitle}>
                {locale === "en" ? "Examples" : "예제"}
              </span>
            </button>
            {!examplesCollapsed && (
              <ul className={styles.historyList}>
                {PROBLEM_DROPDOWN_OPTIONS.map(({ file, label }) => (
                  <li
                    key={file}
                    className={`${styles.historyItem} ${currentProblemId === file ? styles.historyItemActive : ""}`}
                  >
                    <button
                      type="button"
                      className={styles.historyItemMain}
                      onClick={() => handleSelectExample(file)}
                    >
                      <div className={styles.historyItemTitle}>{label}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isAdmin(userId) && (
            <section className={styles.adminSection} aria-labelledby="sidebar-admin-heading">
              <h3 id="sidebar-admin-heading" className={styles.sectionTitle}>
                {t("sidebar.admin")}
              </h3>
              <button type="button" className={`${styles.navAction} ${styles.navActionMuted}`} onClick={() => onOpenAdminDb?.()}>
                {t("sidebar.dbView")}
              </button>
              <button
                type="button"
                className={`${styles.navAction} ${styles.navActionMuted}`}
                onClick={() => {
                  setSidebarOpen(false);
                  setAdminModalOpen(true);
                }}
              >
                {t("problemInput.adminMode")}
              </button>
              <p className={styles.adminHint}>{t("sidebar.adminHint")}</p>
            </section>
          )}
        </div>
      </aside>

      {adminModalOpen && <AdminModeModal onClose={() => setAdminModalOpen(false)} />}
    </>
  );
};
