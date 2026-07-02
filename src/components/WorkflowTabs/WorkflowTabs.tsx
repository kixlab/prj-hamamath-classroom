import styles from './WorkflowTabs.module.css';
import { useApp } from '../../contexts/AppContext';
import { useLocale } from '../../i18n/LocaleContext';

export const WorkflowTabs = () => {
  const { currentStep, setCurrentStep, currentCotData, currentSubQuestionData, finalizedSubQuestionForRubric, currentRubrics } = useApp();
  const { t } = useLocale();

  const tabs = [
    { step: 1, label: t('workflow.tab.problem') },
    { step: 2, label: t('workflow.tab.cot') },
    { step: 3, label: t('workflow.tab.subq') },
    { step: 4, label: t('workflow.tab.rubric') },
  ];

  // 탭 활성화 조건: 2·3번은 CoT 있으면 가능. 4번은 루브릭 최초 생성 전에는 3번 탭에서 "하위문항 확정하기"를 눌러야만 진입 가능.
  const canAccessStep = (step: number): boolean => {
    if (step === 1) return true;
    if (step === 2) return currentCotData !== null;
    if (step === 3) return currentCotData !== null;
    if (step === 4) {
      if (!currentSubQuestionData) return false;
      const hasRubrics = currentRubrics != null && currentRubrics.length > 0;
      const hasFinalizedFromStep3 = finalizedSubQuestionForRubric != null;
      return hasFinalizedFromStep3 || hasRubrics;
    }
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
