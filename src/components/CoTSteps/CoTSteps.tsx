import { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { logUserEvent } from '../../services/eventLogger';
import { saveResult } from '../../hooks/useStorage';
import { useMathJax } from '../../hooks/useMathJax';
import styles from './CoTSteps.module.css';

export const CoTSteps = () => {
  const { currentCotData, setCurrentCotData, setCurrentStep, currentProblemId } = useApp();
  const containerRef = useMathJax([currentCotData?.steps]);

  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<string>('');

  if (!currentCotData || !currentCotData.steps) {
    return null;
  }

  const handleGenerateGuideline = () => {
    setCurrentStep(3);
  };

  const startEdit = (step: any) => {
    setEditingStepId(step.sub_skill_id);
    setEditingContent(step.step_content ?? '');
  };

  const cancelEdit = () => {
    setEditingStepId(null);
    setEditingContent('');
  };

  const saveEdit = () => {
    if (!editingStepId || !currentCotData?.steps) return;
    const step = currentCotData.steps.find((s: any) => s.sub_skill_id === editingStepId);
    const originalContent = step?.step_content ?? '';
    const newSteps = currentCotData.steps.map((step: any) =>
      step.sub_skill_id === editingStepId ? { ...step, step_content: editingContent } : step
    );
    const updated = { ...currentCotData, steps: newSteps };
    setCurrentCotData(updated);
    if (currentProblemId) saveResult(currentProblemId, updated, undefined, undefined, undefined, undefined);
    logUserEvent('cot_edit', {
      stepId: editingStepId,
      step_name: step?.step_name,
      sub_skill_name: step?.sub_skill_name,
      originalContent,
      newContent: editingContent,
    });
    setEditingStepId(null);
    setEditingContent('');
  };

  return (
    <>
      <div className={styles.cotSteps} ref={containerRef}>
        {currentCotData.steps.map((step: any, index: number) => {
          const isEditing = editingStepId === step.sub_skill_id;
          return (
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
              {isEditing ? (
                <div className={styles.stepContentEdit}>
                  <textarea
                    className={styles.editTextarea}
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    rows={6}
                  />
                  <div className={styles.editActions}>
                    <button type="button" className={styles.cancelBtn} onClick={cancelEdit}>
                      취소
                    </button>
                    <button type="button" className={styles.saveBtn} onClick={saveEdit}>
                      저장
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.stepContentRow}>
                  <div className={styles.stepContent}>{step.step_content}</div>
                  <button type="button" className={styles.editBtn} onClick={() => startEdit(step)}>
                    편집
                  </button>
                </div>
              )}
            </div>
          );
        })}
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
