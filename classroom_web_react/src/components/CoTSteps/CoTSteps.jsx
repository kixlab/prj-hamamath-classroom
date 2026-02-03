import { useApp } from '../../contexts/AppContext';
import { useMathJax } from '../../hooks/useMathJax';
import styles from './CoTSteps.module.css';

export const CoTSteps = () => {
  const { currentCotData } = useApp();
  const containerRef = useMathJax([currentCotData?.steps]);

  if (!currentCotData || !currentCotData.steps) {
    return null;
  }

  return (
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
  );
};
