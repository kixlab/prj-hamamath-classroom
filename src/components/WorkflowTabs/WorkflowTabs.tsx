import styles from './WorkflowTabs.module.css';
import { useApp } from '../../contexts/AppContext';

export const WorkflowTabs = () => {
  const { currentStep, setCurrentStep, currentCotData } = useApp();

  const tabs = [
    { step: 1, label: '문제 입력' },
    { step: 2, label: '8단계 풀이과정' },
    { step: 3, label: '하위문항 생성' },
    { step: 4, label: '루브릭 생성' },
  ];

  // 탭 활성화 조건: CoT 데이터가 있으면 2, 3번 탭 활성화 가능
  const canAccessStep = (step: number): boolean => {
    if (step === 1) return true;
    if (step === 2) return currentCotData !== null;
    if (step === 3) return currentCotData !== null;
    return false;
  };

  return (
    <div className={styles.workflowTabs}>
      {tabs.map((tab) => {
        const isDisabled = !canAccessStep(tab.step);
        return (
          <button
            key={tab.step}
            className={`${styles.workflowTab} ${
              currentStep === tab.step ? styles.active : ''
            } ${isDisabled ? styles.disabled : ''}`}
            onClick={() => !isDisabled && setCurrentStep(tab.step)}
            data-step={tab.step}
          >
            <span className={styles.tabNumber}>{tab.step}</span>
            <span className={styles.tabLabel}>{tab.label}</span>
            <span className={styles.tabCheck} style={{ display: 'none' }}>
              ✓
            </span>
          </button>
        );
      })}
    </div>
  );
};
