import { useEffect, useState, MouseEvent } from "react";
import { useApp } from "../../contexts/AppContext";
import { loadResult, deleteResult, clearAllResults, saveResult, saveResultAsync } from "../../hooks/useStorage";
import { api } from "../../services/api";
import { isAdmin } from "../../utils/admin";
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
      setListLoadError(msg.includes("불러올 수 없습니다") ? msg : `저장 목록을 불러올 수 없습니다. ${msg} (API 주소·CORS 확인)`);
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
      if (item.has_subq) status.push("하위문항");
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
      alert("저장할 결과가 없습니다. 먼저 문제를 풀어주세요.");
      return;
    }

    const problemId = currentProblemId || `manual_${Date.now()}`;
    saveResult(problemId, currentCotData, null, currentGuidelineData, undefined, undefined, userId);
    setCurrentProblemId(problemId);
    alert("현재 결과를 저장했습니다.");
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
        alert("저장된 결과를 불러올 수 없습니다.");
      }
    } catch (err) {
      console.error("결과 불러오기 오류:", err);
      alert("결과를 불러오는 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteResult = async (problemId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!window.confirm(`"${problemId}" 결과를 삭제하시겠습니까?`)) return;
    // 삭제 즉시 사이드바 목록에서 제거
    setSavedResults((prev) => prev.filter((item) => item.problemId !== problemId));
    await deleteResult(problemId, userId);
    // 서버와 동기화 (필요 시 목록 다시 조회)
    updateSavedResultsList();
    if (onHistoryChanged) onHistoryChanged();
  };

  const handleRenameResult = async (oldId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const newId = window.prompt("새 문제 ID를 입력하세요.", oldId);
    if (newId == null) return;
    const trimmed = newId.trim();
    if (!trimmed) {
      alert("문제 ID를 입력해 주세요.");
      return;
    }
    if (trimmed === oldId) return;
    if (savedResults.some((item) => item.problemId === trimmed) && !window.confirm(`"${trimmed}" ID가 이미 있습니다. 덮어쓸까요?`)) return;
    try {
      const result = await loadResult(oldId);
      if (!result) {
        alert("해당 결과를 불러올 수 없습니다.");
        return;
      }
      await saveResultAsync(trimmed, result.cotData, result.subQData, result.guidelineData, result.preferredVersion ?? undefined, result.rubrics ?? undefined, userId);
      await api.renameProblemId(oldId, trimmed, userId);
      await deleteResult(oldId, userId);
      setSavedResults((prev) => prev.map((item) => (item.problemId === oldId ? { ...item, problemId: trimmed } : item)));
      if (currentProblemId === oldId) setCurrentProblemId(trimmed);
      await updateSavedResultsList();
      alert(`문제 이름이 "${trimmed}"(으)로 변경되었습니다.`);
    } catch (err: any) {
      console.error("문제 이름 변경 실패:", err);
      alert("변경 중 오류가 발생했습니다. " + (err?.message ?? String(err)));
    }
  };

  const handleClearAllResults = async () => {
    if (!window.confirm("모든 저장된 결과를 삭제하시겠습니까?")) return;
    // 서버에 있는 항목도 하나씩 삭제 후 로컬 초기화
    for (const item of savedResults) {
      const pid = item.problemId?.trim();
      if (pid) await deleteResult(pid, userId);
    }
    clearAllResults();
    await updateSavedResultsList();
    alert("모든 결과가 삭제되었습니다.");
  };

  const handleOpenDbViewer = () => {
    onOpenAdminDb?.();
  };

  const handleOpenStudentDiagnosis = () => {
    setSidebarOpen(false);
    onOpenStudentDiagnosis?.();
  };

  return (
    <>
      {/* 사이드바 오버레이 */}
      <div className={`${styles.sidebarOverlay} ${sidebarOpen ? styles.show : ""}`} onClick={handleOverlayClick} />

      {/* 사이드바 */}
      <div className={`${styles.sidebar} ${sidebarOpen ? styles.open : ""}`}>
        <div className={styles.sidebarHeader}>
          <h2>메뉴</h2>
          <button className={styles.sidebarCloseBtn} onClick={handleClose}>
            ×
          </button>
        </div>
        <div className={styles.sidebarContent}>
          <div className={styles.sidebarSection}>
            <h3>작업</h3>
            <button className={styles.btn} onClick={handleNewProblem}>
              문제 입력하기
            </button>
            <button className={styles.btn} onClick={handleSaveCurrentResult} style={{ marginTop: "10px" }}>
              현재 결과 저장하기
            </button>
            <button className={styles.btn} onClick={handleOpenStudentDiagnosis} style={{ marginTop: "10px", background: "#111827" }}>
              학생 진단하기
            </button>
          </div>
          <div className={styles.sidebarSection}>
            <h3>저장된 결과</h3>
            {listLoadError && (
              <div className={styles.emptyMessage} style={{ color: "var(--color-error, #c00)", fontSize: "13px", marginBottom: 8 }}>
                {listLoadError}
              </div>
            )}
            <div className={styles.savedResultsList}>
              {savedResults.length === 0 && !listLoadError ? (
                <div className={styles.emptyMessage}>저장된 결과가 없습니다.</div>
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
                      <button onClick={(e) => handleRenameResult(item.problemId, e)} className={styles.renameBtn} title="문제 ID 변경">
                        문제 이름 변경
                      </button>
                      <button onClick={(e) => handleDeleteResult(item.problemId, e)} className={styles.deleteBtn}>
                        삭제
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className={styles.sidebarActions}>
              <button className={styles.btn} onClick={handleClearAllResults} style={{ background: "var(--color-error)" }}>
                모든 결과 초기화
              </button>
            </div>
          </div>
          {isAdmin(userId) && (
            <div className={styles.sidebarSection}>
              <h3>관리자</h3>
              <button type="button" className={styles.btn} onClick={handleOpenDbViewer} style={{ background: "var(--color-primary)" }}>
                DB 보기 (저장 결과)
              </button>
              <p className={styles.adminHint}>사용자별 완성된 하위문항·루브릭 데이터를 조회할 수 있습니다.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
