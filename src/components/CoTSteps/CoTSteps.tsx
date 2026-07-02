import { useMemo, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useLocale } from '../../i18n/LocaleContext';
import { formatCotStepGroup, formatCotSubSkill, formatSubSkillDescription } from '../../i18n/translations';
import { formatQuestion } from '../../utils/formatting';
import { frameworkStepSectionStyle, resolveFrameworkStepId } from '../../utils/frameworkStepColors';
import { logUserEvent } from '../../services/eventLogger';
import { saveResult } from '../../hooks/useStorage';
import { useMathJax } from '../../hooks/useMathJax';
import type { CoTData, CoTStep } from '../../types';
import styles from './CoTSteps.module.css';

function chunkSteps<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

export const CoTSteps = () => {
  const { userId, currentCotData, setCurrentCotData, setCurrentStep, currentProblemId, currentSubQuestionData, setPendingSubqAutoStart, setFinalizedSubQuestionForRubric } = useApp();
  const { t, locale } = useLocale();
  const containerRef = useMathJax([currentCotData?.steps]);

  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<string>('');

  const stepRows = useMemo(
    () => chunkSteps((currentCotData?.steps ?? []) as CoTStep[], 2),
    [currentCotData?.steps],
  );

  if (!currentCotData || !currentCotData.steps) {
    return null;
  }

  const handleGoToSubQuestion = () => {
    const cot = currentCotData as CoTData | null;
    if (cot) {
      logUserEvent("cot_finalized", {
        problem: cot.problem,
        answer: cot.answer,
        grade: cot.grade,
        main_solution: cot.main_solution ?? null,
        steps: (cot.steps || []).map((s: CoTStep) => ({
          sub_skill_id: s.sub_skill_id,
          step_name: s.step_name ?? s.step_title,
          sub_skill_name: s.sub_skill_name,
          step_content: s.step_content,
        })),
      });
    }
    const existingCount =
      ((currentSubQuestionData as { guide_sub_questions?: unknown[] } | null)?.guide_sub_questions ?? [])
        .length;
    if (existingCount === 0) {
      setFinalizedSubQuestionForRubric(null);
      setPendingSubqAutoStart(true);
    }
    setCurrentStep(3);
  };

  const startEdit = (step: CoTStep) => {
    setEditingStepId(step.sub_skill_id ?? null);
    setEditingContent(step.step_content ?? '');
  };

  const cancelEdit = () => {
    setEditingStepId(null);
    setEditingContent('');
  };

  const saveEdit = () => {
    if (!editingStepId || !currentCotData?.steps) return;
    const step = currentCotData.steps.find((s: CoTStep) => s.sub_skill_id === editingStepId) as CoTStep | undefined;
    const originalContent = step?.step_content ?? '';
    const newSteps = currentCotData.steps.map((s: CoTStep) =>
      s.sub_skill_id === editingStepId ? { ...s, step_content: editingContent } : s
    );
    const updated = { ...currentCotData, steps: newSteps };
    setCurrentCotData(updated);
    if (currentProblemId) saveResult(currentProblemId, updated, undefined, undefined, undefined, undefined, userId);
    logUserEvent('cot_edit', {
      stepId: editingStepId,
      step_name: step?.step_name ?? step?.step_title,
      sub_skill_name: step?.sub_skill_name,
      originalContent,
      newContent: editingContent,
    });
    setEditingStepId(null);
    setEditingContent('');
  };

  const renderStepCard = (step: CoTStep, stepIndex: number) => {
    const stepKey = step.sub_skill_id ?? `step-${stepIndex}`;
    const isEditing = editingStepId === step.sub_skill_id;
    const skillLabel = formatCotSubSkill(step, locale);
    const skillDefinition = formatSubSkillDescription(step.sub_skill_id, locale);

    return (
      <article
        key={stepKey}
        className={styles.stepCard}
        id={`cot-step-${stepKey}`}
        aria-labelledby={`cot-step-title-${stepKey}`}
      >
        <header className={styles.stepHeader}>
          <div className={styles.stepMeta}>
            <span className={styles.stepIdBadge}>{step.sub_skill_id ?? stepIndex + 1}</span>
            <div className={styles.stepTitleBlock}>
              <h3 className={styles.stepSkillTitle} id={`cot-step-title-${stepKey}`}>
                {skillLabel}
              </h3>
              {skillDefinition && (
                <p className={styles.stepSkillDefinition}>{skillDefinition}</p>
              )}
            </div>
          </div>
          {!isEditing && (
            <button type="button" className={styles.editBtn} onClick={() => startEdit(step)}>
              {t('common.edit')}
            </button>
          )}
        </header>
        {isEditing ? (
          <div className={styles.stepContentEdit}>
            <textarea
              className={styles.editTextarea}
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              rows={5}
              aria-label={skillLabel}
            />
            <div className={styles.editActions}>
              <button type="button" className={styles.cancelBtn} onClick={cancelEdit}>
                {t('common.cancel')}
              </button>
              <button type="button" className={styles.saveBtn} onClick={saveEdit}>
                {t('common.save')}
              </button>
            </div>
          </div>
        ) : (
          <div
            className={styles.stepContent}
            dangerouslySetInnerHTML={{ __html: formatQuestion(step.step_content ?? '') }}
          />
        )}
      </article>
    );
  };

  return (
    <div className={styles.cotPage}>
      <div className={styles.cotSteps} ref={containerRef}>
        {stepRows.map((rowSteps, rowIndex) => {
          const sectionLabel = formatCotStepGroup(rowSteps[0], locale);
          const frameworkStepId = resolveFrameworkStepId(rowSteps[0]?.sub_skill_id, rowIndex + 1);
          return (
            <section
              key={`cot-row-${rowIndex}`}
              className={styles.stepSection}
              style={frameworkStepSectionStyle(frameworkStepId)}
              aria-label={sectionLabel}
            >
              <div className={styles.stepSectionHead}>
                <span className={styles.stepSectionIndex} aria-hidden>
                  {frameworkStepId}
                </span>
                <h2 className={styles.stepSectionTitle}>{sectionLabel}</h2>
              </div>
              <div className={styles.stepRow}>
                {rowSteps.map((step, colIndex) => {
                  const stepIndex = rowIndex * 2 + colIndex;
                  return (
                    <div key={step.sub_skill_id ?? stepIndex} className={styles.stepRowItem}>
                      {colIndex > 0 && (
                        <span className={styles.stepRowConnector} aria-hidden>
                          →
                        </span>
                      )}
                      {renderStepCard(step, stepIndex)}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <footer className={styles.cotFooter}>
        <button type="button" className={styles.generateButton} onClick={handleGoToSubQuestion}>
          {t('cot.generateSubq')}
        </button>
      </footer>
    </div>
  );
};
