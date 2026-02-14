import { useState, useEffect, useRef } from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import { UserIdPage, USER_ID_STORAGE_KEY } from './components/UserIdPage/UserIdPage';
import { initEventLogger, stopEventLogger } from './services/eventLogger';
import { loadResult } from './hooks/useStorage';
import { api } from './services/api';
import { Header } from './components/Header/Header';
import { Sidebar } from './components/Sidebar/Sidebar';
import { WorkflowTabs } from './components/WorkflowTabs/WorkflowTabs';
import { ProblemInput } from './components/ProblemInput/ProblemInput';
import { CoTSteps } from './components/CoTSteps/CoTSteps';
import { SubQs } from './components/SubQs/SubQs';
import { useMathJax } from './hooks/useMathJax';
import { formatQuestion, formatAnswer } from './utils/formatting';
import { Rubrics } from './components/Rubrics/Rubrics';
import { AdminDbView } from './components/AdminDbView/AdminDbView';
import { StudentDiagnosis } from './components/StudentDiagnosis/StudentDiagnosis';
import styles from './App.module.css';

interface AppContentProps {
  userId: string;
  onShowUserIdPage?: () => void;
}

const AppContent = ({ userId, onShowUserIdPage }: AppContentProps) => {
  const [showAdminDbView, setShowAdminDbView] = useState(false);
  const [showStudentDiagnosis, setShowStudentDiagnosis] = useState(false);
  const restoredOnce = useRef(false);
  const {
    currentProblemId,
    currentStep,
    setCurrentStep,
    currentCotData,
    currentGuidelineData,
    loading,
    error,
    reset,
    setCurrentProblemId,
    setCurrentCotData,
    setCurrentSubQData,
    setCurrentGuidelineData,
    setPreferredVersion,
    setCurrentRubrics,
  } = useApp();
  const mainProblemRef = useMathJax([(currentCotData as any)?.problem]);

  // 다른 기기/브라우저에서 동일 ID로 로그인 시 서버에 저장된 최근 결과 자동 복원
  useEffect(() => {
    if (showAdminDbView || showStudentDiagnosis) return;
    if (currentCotData !== null || currentProblemId !== null) return;
    if (restoredOnce.current) return;
    restoredOnce.current = true;
    let cancelled = false;
    (async () => {
      try {
        if (!userId?.trim()) return;
        const list = await api.getMyHistoryList(userId);
        if (cancelled) return;
        if (!Array.isArray(list) || list.length === 0) return;
        const mostRecent = list[0];
        const problemId = mostRecent.problem_id ?? mostRecent.problemId;
        if (!problemId) return;
        const result = await loadResult(problemId);
        if (cancelled || !result) return;
        setCurrentProblemId(result.problemId ?? problemId);
        setCurrentCotData(result.cotData ?? null);
        setCurrentSubQData(result.subQData ?? null);
        setCurrentGuidelineData(result.guidelineData ?? null);
        if (setPreferredVersion) setPreferredVersion(result.preferredVersion ?? {});
        if (setCurrentRubrics) setCurrentRubrics(result.rubrics ?? null);
        if (result.guidelineData && result.cotData) setCurrentStep(3);
        else if (result.subQData && result.cotData) setCurrentStep(2);
        else if (result.cotData) setCurrentStep(2);
      } catch (e) {
        if (!cancelled) console.warn('최근 저장 결과 복원 실패:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, showAdminDbView, showStudentDiagnosis, currentCotData, currentProblemId]);

  const handleNewProblem = () => {
    reset();
  };

  const handleCoTSubmit = () => {
    setCurrentStep(2);
  };

  const mainProblem = (currentCotData as any)?.problem;
  const mainAnswer = (currentCotData as any)?.answer;
  const mainImage = (currentCotData as any)?.image_data;
  const mainSolution = (currentCotData as any)?.main_solution;
  const grade = (currentCotData as any)?.grade;
  const subjectArea = (currentGuidelineData as any)?.subject_area || (currentCotData as any)?.subject_area;

  if (showStudentDiagnosis) {
    return (
      <div className={styles.app}>
        <Header
          onNewProblem={handleNewProblem}
          onShowUserIdPage={onShowUserIdPage}
          userId={userId}
          mode="diagnosis"
          onSelectWorkflow={() => setShowStudentDiagnosis(false)}
          onSelectDiagnosis={() => setShowStudentDiagnosis(true)}
        />
        <Sidebar
          userId={userId}
          onOpenAdminDb={() => setShowAdminDbView(true)}
          onOpenStudentDiagnosis={() => setShowStudentDiagnosis(true)}
        />
        <div className={styles.container}>
          <StudentDiagnosis userId={userId} onClose={() => setShowStudentDiagnosis(false)} />
        </div>
      </div>
    );
  }

  if (showAdminDbView) {
    return <AdminDbView onClose={() => setShowAdminDbView(false)} />;
  }

  return (
    <div className={styles.app}>
      <Header
        onNewProblem={handleNewProblem}
        onShowUserIdPage={onShowUserIdPage}
        userId={userId}
        mode="workflow"
        onSelectWorkflow={() => setShowStudentDiagnosis(false)}
        onSelectDiagnosis={() => setShowStudentDiagnosis(true)}
      />
      <Sidebar
        userId={userId}
        onOpenAdminDb={() => setShowAdminDbView(true)}
        onOpenStudentDiagnosis={() => setShowStudentDiagnosis(true)}
      />
      <div className={styles.container}>
        <WorkflowTabs />
        <div className={styles.workflowContent}>
          {currentStep === 1 && (
            <div className={styles.workflowPanel}>
              <ProblemInput onSubmit={handleCoTSubmit} />
            </div>
          )}
          {currentStep === 2 && (
            <div className={styles.workflowPanel}>
              {loading && (
                <div className={styles.loading}>
                  <div className={styles.spinner}></div>
                  <div>로딩 중...</div>
                </div>
              )}
              {error && <div className={styles.error}>{error}</div>}
              {!loading && !error && currentCotData && <CoTSteps />}
              {!loading && !error && !currentCotData && (
                <div className={styles.error}>데이터를 불러올 수 없습니다.</div>
              )}
            </div>
          )}
          {currentStep === 3 && (
            <div className={styles.workflowPanel}>
              <div className={styles.subQsSplitLayout}>
                <aside className={styles.mainProblemColumn} ref={mainProblemRef}>
                  <div className={styles.mainProblemPanel}>
                    <h3 className={styles.mainProblemTitle}>입력한 문제</h3>
                    {mainImage && (
                      <div className={styles.mainProblemImageWrap}>
                        <img
                          src={mainImage}
                          alt="문제 이미지"
                          className={styles.mainProblemImage}
                        />
                      </div>
                    )}
                    {mainProblem ? (
                      <>
                        <div className={styles.mainProblemContent}>{formatQuestion(mainProblem)}</div>
                        {mainAnswer && (
                          <div className={styles.mainProblemAnswer}>
                            <span className={styles.mainProblemAnswerLabel}>정답:</span>{' '}
                            <span dangerouslySetInnerHTML={{ __html: formatAnswer(mainAnswer) }} />
                          </div>
                        )}
                        {mainSolution && (
                          <div className={styles.mainProblemSolution}>
                            <span className={styles.mainProblemSolutionLabel}>모범답안</span>
                            <div className={styles.mainProblemSolutionContent}>{mainSolution}</div>
                          </div>
                        )}
                      </>
                    ) : (
                      !mainImage && <p className={styles.mainProblemEmpty}>문제 데이터가 없습니다.</p>
                    )}
                    {(grade || subjectArea) && (
                      <div className={styles.mainProblemMeta}>
                        {grade && (
                          <div>
                            <span className={styles.mainProblemMetaLabel}>학년:</span> {grade}
                          </div>
                        )}
                        {subjectArea && (
                          <div>
                            <span className={styles.mainProblemMetaLabel}>수학 영역:</span> {subjectArea}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </aside>
                <main className={styles.subQsColumn}>
                  <SubQs />
                </main>
              </div>
            </div>
          )}
          {currentStep === 4 && (
            <div className={styles.workflowPanel}>
              <Rubrics />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function App() {
  // sessionStorage 사용 → 탭/브라우저 처음 열 때마다 로그인 화면 표시
  const [userId, setUserId] = useState<string | null>(() =>
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(USER_ID_STORAGE_KEY) : null
  );

  if (!userId) {
    return (
      <UserIdPage
        onSuccess={(id) => {
          if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(USER_ID_STORAGE_KEY, id);
          setUserId(id);
        }}
      />
    );
  }

  const showUserIdPage = () => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(USER_ID_STORAGE_KEY);
    setUserId(null);
  };

  return (
    <AppWithClickLogger userId={userId}>
      <AppProvider>
        <AppContent userId={userId} onShowUserIdPage={showUserIdPage} />
      </AppProvider>
    </AppWithClickLogger>
  );
}

/** 유저 스터디용: 모든 클릭을 Firestore에 기록 */
function AppWithClickLogger({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    initEventLogger(userId);
    return () => stopEventLogger();
  }, [userId]);
  return <>{children}</>;
}

export default App;
