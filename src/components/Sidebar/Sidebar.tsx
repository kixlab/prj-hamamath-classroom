import { useEffect, useState, MouseEvent } from "react";
import { useApp } from "../../contexts/AppContext";
import { loadResult, deleteResult, clearAllResults, saveResultAsync } from "../../hooks/useStorage";
import { api } from "../../services/api";
import { isAdmin } from "../../utils/admin";
import { useLocale } from "../../i18n/LocaleContext";
import { AdminModeModal } from "../AdminMode/AdminModeModal";
import styles from "./Sidebar.module.css";

interface SavedResultItem {
  problemId: string;
  timestamp: string;
  dateStr: string;
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

export const Sidebar = ({ userId, onOpenAdminDb, onHistoryChanged }: SidebarProps) => {
  const { t } = useLocale();
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
    let serverResults: Array<{ problem_id?: string; problemId?: string; timestamp?: string }> = [];
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
      return { problemId: pid, timestamp: ts, dateStr };
    });

    allResults.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setSavedResults(allResults);
  };

  const handleClose = () => setSidebarOpen(false);

  const handleNewProblem = () => {
    setSidebarOpen(false);
    reset();
  };

  const handleLoadResult = async (problemId: string) => {
    try {
      const result = await loadResult(problemId);
      if (result) {
        setCurrentProblemId(result.problemId || problemId);
        setCurrentCotData(result.cotData);
        setCurrentSubQData(result.subQData);
        setCurrentSubQuestionData(result.subQuestionData ?? (result as { guidelineData?: unknown }).guidelineData ?? null);
        if (setPreferredVersion) setPreferredVersion(result.preferredVersion || {});
        if (setCurrentRubrics) setCurrentRubrics(result.rubrics ?? null);

        if ((result.subQuestionData || (result as { guidelineData?: unknown }).guidelineData) && result.cotData) {
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
      await saveResultAsync(trimmed, result.cotData, result.subQData, result.subQuestionData ?? (result as { guidelineData?: unknown }).guidelineData ?? null, result.preferredVersion ?? undefined, result.rubrics ?? undefined, userId);
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

  const handleClearAllResults = async () => {
    if (!window.confirm(t("sidebar.deleteAllConfirm"))) return;
    for (const item of savedResults) {
      const pid = item.problemId?.trim();
      if (pid) await deleteResult(pid, userId);
    }
    clearAllResults();
    await updateSavedResultsList();
    onHistoryChanged?.();
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

            <ul className={styles.historyList}>
              {savedResults.length === 0 && !listLoadError ? (
                <li className={styles.emptyMessage}>{t("sidebar.emptyResults")}</li>
              ) : (
                savedResults.map((item) => {
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
                        <div className={styles.historyItemTitle}>{item.problemId}</div>
                        {item.dateStr && <div className={styles.historyItemDate}>{item.dateStr}</div>}
                      </button>
                      <div className={styles.historyItemActions}>
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
                      </div>
                    </li>
                  );
                })
              )}
            </ul>

            {savedResults.length > 0 && (
              <button type="button" className={styles.clearAllBtn} onClick={handleClearAllResults}>
                {t("sidebar.clearAll")}
              </button>
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
