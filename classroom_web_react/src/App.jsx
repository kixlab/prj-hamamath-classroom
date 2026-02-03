import { AppProvider } from './contexts/AppContext';
import { Header } from './components/Header/Header';
import { WorkflowTabs } from './components/WorkflowTabs/WorkflowTabs';
import { ProblemInput } from './components/ProblemInput/ProblemInput';
import { CoTSteps } from './components/CoTSteps/CoTSteps';
import { useApp } from './contexts/AppContext';
import styles from './App.module.css';

const AppContent = () => {
  const { currentStep, setCurrentStep, currentCotData, loading, error } = useApp();

  const handleNewProblem = () => {
    setCurrentStep(1);
  };

  const handleCoTSubmit = () => {
    setCurrentStep(2);
  };

  return (
    <div className={styles.app}>
      <Header onNewProblem={handleNewProblem} />
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
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <p style={{ fontSize: '1.125rem', marginBottom: '8px' }}>하위문항 생성 기능은 준비 중입니다.</p>
                <p style={{ fontSize: '0.875rem' }}>곧 제공될 예정입니다.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
