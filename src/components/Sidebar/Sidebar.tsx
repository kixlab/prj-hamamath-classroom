import { useEffect, useState, MouseEvent } from "react";
import { useApp } from "../../contexts/AppContext";
import { loadResult, deleteResult, clearAllResults, saveResult, saveResultAsync } from "../../hooks/useStorage";
import { api } from "../../services/api";
import { isAdmin } from "../../utils/admin";
import { useLocale } from "../../i18n/LocaleContext";
import { AdminModeModal } from "../AdminMode/AdminModeModal";
import styles from "./Sidebar.module.css";

interface SavedResultItem {
  problemId: string;
  timestamp: string;
  dateStr: string;
  status: string[];
}

interface SidebarProps {
  userId?: string | null;
  onOpenAdminDb?: () => void;
  onOpenStudentDiagnosis?: () => void;
  onHistoryChanged?: () => void;
}

export const Sidebar = ({ userId, onOpenAdminDb, onOpenStudentDiagnosis, onHistoryChanged }: SidebarProps) => {
  const { t } = useLocale();
  const {
    sidebarOpen,
    setSidebarOpen,
    currentProblemId,
    currentCotData,
    currentGuidelineData,
    setCurrentStep,
    setCurrentCotData,
    setCurrentSubQData,
    setCurrentGuidelineData,
    setCurrentProblemId,
    setPreferredVersion,
    setCurrentRubrics,
    reset,
  } = useApp();
  const [savedResults, setSavedResults] = useState<SavedResultItem[]>([]);
  const [listLoadError, setListLoadError] = useState<string | null>(null);
  const [adminModalOpen, setAdminModalOpen] = useState(false);

  useEffect(() => {
    updateSavedResultsList();
  }, [userId]);

  useEffect(() => {
    if (sidebarOpen) updateSavedResultsList();
  }, [sidebarOpen, userId]);

  const updateSavedResultsList = async () => {
    setListLoadError(null);
    if (!userId?.trim()) {
      setSavedResults([]);
      return;
    }
    let serverResults: Array<{ problem_id?: string; problemId?: string; timestamp?: string; has_cot?: boolean; has_subq?: boolean; has_guideline?: boolean }> = [];
    try {
      const data = await api.getMyHistoryList(userId);
      serverResults = Array.isArray(data) ? data : [];
    } catch (err: any) {
      console.warn("저장 목록 조회 실패:", err);
      const msg = err?.message || String(err);
      setListLoadError(msg.includes("불러올 수 없습니다") || msg.includes("Unable to load") ? msg : t('sidebar.listLoadError', { msg }));
    }

    const allResults: SavedResultItem[] = serverResults.map((item) => {
      const pid = item.problem_id ?? item.problemId ?? "";
      const ts = item.timestamp ?? "";
      const date = new Date(ts);
      const dateStr = date.toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const status: string[] = [];
      if (item.has_cot) status.push("CoT");
      if (item.has_subq) status.push(t('sidebar.statusSubq'));
      if (item.has_guideline) status.push("Guideline");
      return { problemId: pid, timestamp: ts, dateStr, status };
    });

    allResults.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setSavedResults(allResults);
  };

  const handleClose = () => {
    setSidebarOpen(false);
  };

  const handleOverlayClick = () => {
    setSidebarOpen(false);
  };

  const handleNewProblem = () => {
    setSidebarOpen(false);
    reset();
  };

  const handleSaveCurrentResult = () => {
    if (!currentCotData) {
      alert(t('sidebar.noSaveData'));
      return;
    }

    const problemId = currentProblemId || `manual_${Date.now()}`;
    saveResult(problemId, currentCotData, null, currentGuidelineData, undefined, undefined, userId);
    setCurrentProblemId(problemId);
    alert(t('sidebar.saved'));
    updateSavedResultsList();
    if (onHistoryChanged) onHistoryChanged();
  };

  const handleLoadResult = async (problemId: string) => {
    try {
      const result = await loadResult(problemId);
      if (result) {
        setCurrentProblemId(result.problemId || problemId);
        setCurrentCotData(result.cotData);
        setCurrentSubQData(result.subQData);
        setCurrentGuidelineData(result.guidelineData);
        if (setPreferredVersion) setPreferredVersion(result.preferredVersion || {});
        if (setCurrentRubrics) setCurrentRubrics(result.rubrics ?? null);

        if (result.guidelineData && result.cotData) {
          setCurrentStep(3);
        } else if (result.subQData && result.cotData) {
          setCurrentStep(2);
        } else if (result.cotData) {
          setCurrentStep(2);
        }

        setSidebarOpen(false);
      } else {
        alert(t('sidebar.loadFail'));
      }
    } catch (err) {
      console.error("결과 불러오기 오류:", err);
      alert(t('sidebar.loadError'));
    }
  };

  const handleDeleteResult = async (problemId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!window.confirm(t('sidebar.deleteConfirm', { id: problemId }))) return;
    // 삭제 즉시 사이드바 목록에서 제거
    setSavedResults((prev) => prev.filter((item) => item.problemId !== problemId));
    await deleteResult(problemId, userId);
    // 서버와 동기화 (필요 시 목록 다시 조회)
    updateSavedResultsList();
    if (onHistoryChanged) onHistoryChanged();
  };

  const handleRenameResult = async (oldId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const newId = window.prompt(t('sidebar.renamePrompt'), oldId);
    if (newId == null) return;
    const trimmed = newId.trim();
    if (!trimmed) {
      alert(t('sidebar.renameEmpty'));
      return;
    }
    if (trimmed === oldId) return;
    if (savedResults.some((item) => item.problemId === trimmed) && !window.confirm(t('sidebar.overwriteConfirm', { id: trimmed }))) return;
    try {
      const result = await loadResult(oldId);
      if (!result) {
        alert(t('sidebar.renameLoadFail'));
        return;
      }
      await saveResultAsync(trimmed, result.cotData, result.subQData, result.guidelineData, result.preferredVersion ?? undefined, result.rubrics ?? undefined, userId);
      await api.renameProblemId(oldId, trimmed, userId);
      await deleteResult(oldId, userId);
      setSavedResults((prev) => prev.map((item) => (item.problemId === oldId ? { ...item, problemId: trimmed } : item)));
      if (currentProblemId === oldId) setCurrentProblemId(trimmed);
      await updateSavedResultsList();
      alert(t('sidebar.renamed', { name: trimmed }));
    } catch (err: any) {
      console.error("문제 이름 변경 실패:", err);
      alert(t('sidebar.renameError', { msg: err?.message ?? String(err) }));
    }
  };

  const handleClearAllResults = async () => {
    if (!window.confirm(t('sidebar.deleteAllConfirm'))) return;
    // 서버에 있는 항목도 하나씩 삭제 후 로컬 초기화
    for (const item of savedResults) {
      const pid = item.problemId?.trim();
      if (pid) await deleteResult(pid, userId);
    }
    clearAllResults();
    await updateSavedResultsList();
    alert(t('sidebar.deleteAllDone'));
  };

  const handleOpenDbViewer = () => {
    onOpenAdminDb?.();
  };

  const handleOpenStudentDiagnosis = () => {
    setSidebarOpen(false);
    onOpenStudentDiagnosis?.();
  };

  const handleOpenAdminMode = () => {
    setSidebarOpen(false);
    setAdminModalOpen(true);
  };

  return (
    <>
      {/* 사이드바 오버레이 */}
      <div className={`${styles.sidebarOverlay} ${sidebarOpen ? styles.show : ""}`} onClick={handleOverlayClick} />

      {/* 사이드바 */}
      <div className={`${styles.sidebar} ${sidebarOpen ? styles.open : ""}`}>
        <div className={styles.sidebarHeader}>
          <h2>{t('sidebar.menu')}</h2>
          <button className={styles.sidebarCloseBtn} onClick={handleClose}>
            ×
          </button>
        </div>
        <div className={styles.sidebarContent}>
          <div className={styles.sidebarSection}>
            <h3>{t('sidebar.tasks')}</h3>
            <button className={styles.btn} onClick={handleNewProblem}>
              {t('sidebar.newProblem')}
            </button>
            <button className={styles.btn} onClick={handleSaveCurrentResult} style={{ marginTop: "10px" }}>
              {t('sidebar.saveCurrent')}
            </button>
            <button className={styles.btn} onClick={handleOpenStudentDiagnosis} style={{ marginTop: "10px", background: "#111827" }}>
              {t('sidebar.studentDiagnosis')}
            </button>
            <button type="button" className={styles.btn} onClick={handleOpenAdminMode} style={{ marginTop: "10px" }}>
              {t('problemInput.adminMode')}
            </button>
          </div>
          <div className={styles.sidebarSection}>
            <h3>{t('sidebar.savedResults')}</h3>
            {listLoadError && (
              <div className={styles.emptyMessage} style={{ color: "var(--color-error, #c00)", fontSize: "13px", marginBottom: 8 }}>
                {listLoadError}
              </div>
            )}
            <div className={styles.savedResultsList}>
              {savedResults.length === 0 && !listLoadError ? (
                <div className={styles.emptyMessage}>{t('sidebar.emptyResults')}</div>
              ) : savedResults.length === 0 ? null : (
                savedResults.map((item) => (
                  <div key={item.problemId} className={styles.savedResultItem} onClick={() => handleLoadResult(item.problemId)}>
                    <div className={styles.savedResultItemInfo}>
                      <div className={styles.savedResultItemTitle}>{item.problemId}</div>
                      <div className={styles.savedResultItemMeta}>
                        {item.dateStr} | {item.status.join(", ")}
                      </div>
                    </div>
                    <div className={styles.savedResultItemActions}>
                      <button onClick={(e) => handleRenameResult(item.problemId, e)} className={styles.renameBtn} title={t('sidebar.renameProblem')}>
                        {t('sidebar.renameBtn')}
                      </button>
                      <button onClick={(e) => handleDeleteResult(item.problemId, e)} className={styles.deleteBtn}>
                        {t('sidebar.delete')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className={styles.sidebarActions}>
              <button className={styles.btn} onClick={handleClearAllResults} style={{ background: "var(--color-error)" }}>
                {t('sidebar.clearAll')}
              </button>
            </div>
          </div>
          {isAdmin(userId) && (
            <div className={styles.sidebarSection}>
              <h3>{t('sidebar.admin')}</h3>
              <button type="button" className={styles.btn} onClick={handleOpenDbViewer} style={{ background: "var(--color-primary)" }}>
                {t('sidebar.dbView')}
              </button>
              <p className={styles.adminHint}>{t('sidebar.adminHint')}</p>
            </div>
          )}
        </div>
      </div>
      {adminModalOpen && <AdminModeModal onClose={() => setAdminModalOpen(false)} />}
    </>
  );
};
