import { useState, useEffect } from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import { UserIdPage, USER_ID_STORAGE_KEY } from './components/UserIdPage/UserIdPage';
import { initEventLogger, stopEventLogger } from './services/eventLogger';
import { Header } from './components/Header/Header';
import { Sidebar } from './components/Sidebar/Sidebar';
import { WorkflowTabs } from './components/WorkflowTabs/WorkflowTabs';
import { ProblemInput } from './components/ProblemInput/ProblemInput';
import { CoTSteps } from './components/CoTSteps/CoTSteps';
import { SubQs } from './components/SubQs/SubQs';
import { useMathJax } from './hooks/useMathJax';
import { formatQuestion, formatAnswer } from './utils/formatting';
import styles from './App.module.css';

interface AppContentProps {
  onShowUserIdPage?: () => void;
}

const AppContent = ({ onShowUserIdPage }: AppContentProps) => {
  const { currentStep, setCurrentStep, currentCotData, currentGuidelineData, loading, error, reset } = useApp();
  const mainProblemRef = useMathJax([(currentCotData as any)?.problem]);

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

  return (
    <div className={styles.app}>
      <Header onNewProblem={handleNewProblem} onShowUserIdPage={onShowUserIdPage} />
      <Sidebar />
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
        </div>
      </div>
    </div>
  );
};

function App() {
  const [userId, setUserId] = useState<string | null>(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem(USER_ID_STORAGE_KEY) : null
  );

  if (!userId) {
    return (
      <UserIdPage
        onSuccess={(id) => {
          localStorage.setItem(USER_ID_STORAGE_KEY, id);
          setUserId(id);
        }}
      />
    );
  }

  const showUserIdPage = () => {
    localStorage.removeItem(USER_ID_STORAGE_KEY);
    setUserId(null);
  };

  return (
    <AppWithClickLogger userId={userId}>
      <AppProvider>
        <AppContent onShowUserIdPage={showUserIdPage} />
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
