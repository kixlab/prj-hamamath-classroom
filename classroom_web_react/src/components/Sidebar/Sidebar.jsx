import { useEffect, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { loadResult, deleteResult, clearAllResults, getSavedResults, saveResult } from '../../hooks/useStorage';
import styles from './Sidebar.module.css';

export const Sidebar = () => {
  const { sidebarOpen, setSidebarOpen, currentProblemId, currentCotData, currentGuidelineData, setCurrentStep, setCurrentCotData, setCurrentSubQData, setCurrentGuidelineData, setCurrentProblemId } = useApp();
  const [savedResults, setSavedResults] = useState([]);

  useEffect(() => {
    updateSavedResultsList();
  }, []);

  const updateSavedResultsList = async () => {
    const saved = getSavedResults();
    const localProblemIds = Object.keys(saved).sort((a, b) => {
      return new Date(saved[b].timestamp || 0) - new Date(saved[a].timestamp || 0);
    });

    // 서버 목록도 가져오기
    let serverResults = [];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3초 타임아웃
      
      const resp = await fetch('/api/v1/history/list', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (resp.ok) {
        const serverData = await resp.json();
        if (Array.isArray(serverData)) {
          serverResults = serverData;
        }
      }
    } catch (err) {
      // 네트워크 에러나 타임아웃은 조용히 무시 (백엔드 서버가 없을 수 있음)
      if (err.name !== 'AbortError') {
        // AbortError가 아닌 경우에만 로그 (타임아웃은 정상)
      }
    }

    // localStorage와 서버 결과 병합
    const allResults = [];
    const seenIds = new Set();

    // localStorage 결과 먼저 추가
    for (const problemId of localProblemIds) {
      if (!seenIds.has(problemId)) {
        const result = saved[problemId];
        const date = new Date(result.timestamp || 0);
        const dateStr = date.toLocaleString('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        const hasCot = !!result.cotData;
        const hasSubQ = !!result.subQData;
        const hasGuideline = !!result.guidelineData;
        const status = [];
        if (hasCot) status.push('CoT');
        if (hasSubQ) status.push('하위문항');
        if (hasGuideline) status.push('Guideline');

        allResults.push({
          problemId: problemId,
          timestamp: result.timestamp || date.toISOString(),
          dateStr: dateStr,
          status: status,
          source: 'local',
        });
        seenIds.add(problemId);
      }
    }

    // 서버 결과 추가
    for (const item of serverResults) {
      if (!seenIds.has(item.problem_id)) {
        const date = new Date(item.timestamp);
        const dateStr = date.toLocaleString('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        const status = [];
        if (item.has_cot) status.push('CoT');
        if (item.has_subq) status.push('하위문항');
        if (item.has_guideline) status.push('Guideline');

        allResults.push({
          problemId: item.problem_id,
          timestamp: item.timestamp,
          dateStr: dateStr,
          status: status,
          source: 'server',
        });
        seenIds.add(item.problem_id);
      }
    }

    // 타임스탬프 기준 정렬
    allResults.sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

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
    setCurrentStep(1);
  };

  const handleSaveCurrentResult = () => {
    if (!currentCotData) {
      alert('저장할 결과가 없습니다. 먼저 문제를 풀어주세요.');
      return;
    }

    const problemId = currentProblemId || `manual_${Date.now()}`;
    saveResult(problemId, currentCotData, null, currentGuidelineData);
    setCurrentProblemId(problemId);
    alert('현재 결과를 저장했습니다.');
    updateSavedResultsList();
  };

  const handleExportWord = async () => {
    if (!currentCotData || !currentGuidelineData) {
      alert('다운로드할 Guideline 데이터가 없습니다. 먼저 3단계 Guideline 하위 문항을 생성해주세요.');
      return;
    }

    try {
      const finalSubQuestions = currentGuidelineData.guide_sub_questions.map((subQ) => {
        const hasRegenerated = subQ.re_sub_question && subQ.re_sub_question.trim().length > 0;
        return {
          sub_question_id: subQ.sub_question_id,
          step_id: subQ.step_id,
          sub_skill_id: subQ.sub_skill_id,
          step_name: subQ.step_name,
          sub_skill_name: subQ.sub_skill_name,
          guide_sub_question: hasRegenerated ? subQ.re_sub_question : subQ.guide_sub_question,
          guide_sub_answer: hasRegenerated ? (subQ.re_sub_answer || subQ.guide_sub_answer) : subQ.guide_sub_answer,
        };
      });

      const requestData = {
        main_problem: currentCotData.problem,
        main_answer: currentCotData.answer,
        main_solution: currentCotData.main_solution || null,
        grade: currentCotData.grade || '',
        subject_area: currentGuidelineData.subject_area || null,
        guide_sub_questions: finalSubQuestions,
      };

      const response = await fetch('/api/v1/guideline/export-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || '워드 파일 생성 중 오류가 발생했습니다.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const problemId = currentProblemId || 'individual';
      link.download = `학습지_${problemId}_${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || '워드 파일 생성 중 오류가 발생했습니다.');
    }
  };

  const handleLoadResult = async (problemId) => {
    try {
      const result = await loadResult(problemId);
      if (result) {
        setCurrentProblemId(result.problemId || problemId);
        setCurrentCotData(result.cotData);
        setCurrentSubQData(result.subQData);
        setCurrentGuidelineData(result.guidelineData);
        
        if (result.guidelineData && result.cotData) {
          setCurrentStep(3);
        } else if (result.subQData && result.cotData) {
          setCurrentStep(2);
        } else if (result.cotData) {
          setCurrentStep(2);
        }
        
        setSidebarOpen(false);
      } else {
        alert('저장된 결과를 불러올 수 없습니다.');
      }
    } catch (err) {
      console.error('결과 불러오기 오류:', err);
      alert('결과를 불러오는 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteResult = async (problemId, e) => {
    e.stopPropagation();
    if (window.confirm(`"${problemId}" 결과를 삭제하시겠습니까?`)) {
      await deleteResult(problemId);
      updateSavedResultsList();
    }
  };

  const handleClearAllResults = () => {
    if (window.confirm('모든 저장된 결과를 삭제하시겠습니까?')) {
      clearAllResults();
      updateSavedResultsList();
      alert('모든 결과가 삭제되었습니다.');
    }
  };

  return (
    <>
      {/* 사이드바 오버레이 */}
      <div
        className={`${styles.sidebarOverlay} ${sidebarOpen ? styles.show : ''}`}
        onClick={handleOverlayClick}
      />

      {/* 사이드바 */}
      <div className={`${styles.sidebar} ${sidebarOpen ? styles.open : ''}`}>
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
            <button className={styles.btn} onClick={handleSaveCurrentResult} style={{ marginTop: '10px' }}>
              현재 결과 저장하기
            </button>
            {currentGuidelineData && (
              <button className={styles.btn} onClick={handleExportWord} style={{ marginTop: '10px' }}>
                학습지 다운로드
              </button>
            )}
          </div>
          <div className={styles.sidebarSection}>
            <h3>저장된 결과</h3>
            <div className={styles.savedResultsList}>
              {savedResults.length === 0 ? (
                <div className={styles.emptyMessage}>저장된 결과가 없습니다.</div>
              ) : (
                savedResults.map((item) => (
                  <div
                    key={item.problemId}
                    className={styles.savedResultItem}
                    onClick={() => handleLoadResult(item.problemId)}
                  >
                    <div className={styles.savedResultItemInfo}>
                      <div className={styles.savedResultItemTitle}>{item.problemId}</div>
                      <div className={styles.savedResultItemMeta}>
                        {item.dateStr} | {item.status.join(', ')}
                      </div>
                    </div>
                    <div className={styles.savedResultItemActions}>
                      <button
                        onClick={(e) => handleDeleteResult(item.problemId, e)}
                        className={styles.deleteBtn}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className={styles.sidebarActions}>
              <button className={styles.btn} onClick={() => {}}>
                CSV 다운로드
              </button>
              <button className={styles.btn} onClick={handleClearAllResults} style={{ background: 'var(--color-error)' }}>
                모든 결과 초기화
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
