import styles from './WorkflowTabs.module.css';
import { useApp } from '../../contexts/AppContext';

export const WorkflowTabs = () => {
  const { currentStep, setCurrentStep } = useApp();

  const tabs = [
    { step: 1, label: '문제 입력' },
    { step: 2, label: '8단계 풀이과정' },
    { step: 3, label: '하위문항 생성' },
    { step: 4, label: '루브릭 생성' },
  ];

  return (
    <div className={styles.workflowTabs}>
      {tabs.map((tab) => (
        <button
          key={tab.step}
          className={`${styles.workflowTab} ${
            currentStep === tab.step ? styles.active : ''
          } ${currentStep < tab.step ? styles.disabled : ''}`}
          onClick={() => currentStep >= tab.step && setCurrentStep(tab.step)}
          data-step={tab.step}
        >
          <span className={styles.tabNumber}>{tab.step}</span>
          <span className={styles.tabLabel}>{tab.label}</span>
          <span className={styles.tabCheck} style={{ display: 'none' }}>
            ✓
          </span>
        </button>
      ))}
    </div>
  );
};
