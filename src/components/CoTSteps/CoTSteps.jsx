import { useApp } from '../../contexts/AppContext';
import { useMathJax } from '../../hooks/useMathJax';
import styles from './CoTSteps.module.css';

export const CoTSteps = () => {
  const { currentCotData, setCurrentStep } = useApp();
  const containerRef = useMathJax([currentCotData?.steps]);

  if (!currentCotData || !currentCotData.steps) {
    return null;
  }

  const handleGenerateGuideline = () => {
    setCurrentStep(3);
  };

  return (
    <>
      <div className={styles.cotSteps} ref={containerRef}>
        {currentCotData.steps.map((step, index) => (
          <div key={step.sub_skill_id} className={styles.stepCard} id={`cot-step-${step.sub_skill_id}`}>
            <div className={styles.stepHeader}>
              <div className={styles.stepNumber}>{index + 1}</div>
              <div className={styles.stepTitle}>
                <h3>{step.step_name}</h3>
                <div className={styles.subSkill}>
                  {step.sub_skill_name} ({step.sub_skill_id})
                </div>
              </div>
            </div>
            <div className={styles.stepContent}>{step.step_content}</div>
          </div>
        ))}
      </div>
      <div className={styles.buttonContainer}>
        <button 
          className={styles.generateButton}
          onClick={handleGenerateGuideline}
        >
          하위문항 생성하기
        </button>
      </div>
    </>
  );
};
