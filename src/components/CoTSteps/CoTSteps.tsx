import { useMemo, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useLocale } from '../../i18n/LocaleContext';
import { formatCotStepGroup, formatCotSubSkill, formatSubSkillDescription } from '../../i18n/translations';
import { formatQuestion } from '../../utils/formatting';
import { frameworkStepSectionStyle, resolveFrameworkStepId } from '../../utils/frameworkStepColors';
import { logUserEvent } from '../../services/eventLogger';
import { saveResult } from '../../hooks/useStorage';
import { useMathJax } from '../../hooks/useMathJax';
import { api } from '../../services/api';
import { isCotStale, markCotFresh } from '../../utils/problemSync';
import { getAppLanguage } from '../../i18n/translations';
import { demoDelay, DEMO_COT_LOADING_MS } from '../../demo/demoDelay';
import { buildDemoCotFromProblemInput } from '../../demo/demoWorkspace';
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
  const {
    userId,
    currentCotData,
    setCurrentCotData,
    cotBeforeRegenerate,
    setCotBeforeRegenerate,
    setCurrentStep,
    currentProblemId,
    currentSubQuestionData,
    setPendingSubqAutoStart,
    setFinalizedSubQuestionForRubric,
    isDemoMode,
    selectedAuxiliaryMaterialIds,
  } = useApp();
  const { t, locale } = useLocale();
  const containerRef = useMathJax([currentCotData?.steps]);
  /** 1단계에서 문제를 고친 뒤라 지금 풀이과정이 '수정 전 문제' 기준인가 */
  const cotStale = isCotStale(currentCotData);
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [regenerateAllError, setRegenerateAllError] = useState<string | null>(null);

  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<string>('');
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [regeneratingStepId, setRegeneratingStepId] = useState<string | null>(null);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  // 재생성 직전 내용. 단계별로 1회 되돌리기를 지원한다.
  const [undoContent, setUndoContent] = useState<Record<string, string>>({});

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
    setFeedbackText('');
    setRegenerateError(null);
  };

  const cancelEdit = () => {
    setEditingStepId(null);
    setEditingContent('');
    setFeedbackText('');
    setRegenerateError(null);
  };

  /** 단계 내용을 교체하고 저장·로깅까지 한 번에 처리 */
  const applyStepContent = (subSkillId: string, content: string) => {
    if (!currentCotData?.steps) return;
    const newSteps = currentCotData.steps.map((s: CoTStep) =>
      s.sub_skill_id === subSkillId ? { ...s, step_content: content } : s,
    );
    const updated = { ...currentCotData, steps: newSteps };
    setCurrentCotData(updated);
    if (currentProblemId) {
      saveResult(currentProblemId, updated, undefined, undefined, undefined, undefined, userId);
    }
  };

  const handleRegenerateStep = async (step: CoTStep) => {
    const subSkillId = step.sub_skill_id;
    const feedback = feedbackText.trim();
    if (!subSkillId || !feedback || !currentCotData?.steps) return;

    const cot = currentCotData as CoTData;
    const steps = (cot.steps ?? []) as CoTStep[];
    const index = steps.findIndex((s) => s.sub_skill_id === subSkillId);
    if (index < 0) return;

    // 편집창에 이미 손댄 내용이 있으면 그것을 기준으로 재생성한다
    const baseContent = editingContent || step.step_content || '';
    const toPayload = (s: CoTStep) => ({
      step_id: Number(s.step_id ?? 0),
      sub_skill_id: s.sub_skill_id ?? '',
      step_name: s.step_name ?? s.step_title ?? '',
      step_name_en: s.step_name_en ?? '',
      sub_skill_name: s.sub_skill_name ?? '',
      step_content: s.step_content ?? '',
      prompt_used: s.prompt_used ?? null,
    });

    setRegeneratingStepId(subSkillId);
    setRegenerateError(null);
    try {
      const res = await api.regenerateCotStep({
        main_problem: cot.problem ?? '',
        main_answer: cot.answer ?? null,
        main_solution: cot.main_solution ?? null,
        grade: String(cot.grade ?? ''),
        target_step: { ...toPayload(step), step_content: baseContent },
        previous_steps: steps.slice(0, index).map(toPayload),
        user_feedback: feedback,
        subject_area: cot.subject_area ?? null,
      });

      const newContent = res.step?.step_content ?? '';
      if (!newContent.trim()) throw new Error(t('cot.regenerateStepFailed'));

      setUndoContent((prev) => ({ ...prev, [subSkillId]: baseContent }));
      applyStepContent(subSkillId, newContent);
      logUserEvent('cot_step_regenerated', {
        stepId: subSkillId,
        step_name: step.step_name ?? step.step_title,
        sub_skill_name: step.sub_skill_name,
        feedback,
        previousContent: baseContent,
        newContent,
      });

      setEditingStepId(null);
      setEditingContent('');
      setFeedbackText('');
    } catch (e) {
      setRegenerateError(e instanceof Error ? e.message : t('cot.regenerateStepFailed'));
    } finally {
      setRegeneratingStepId(null);
    }
  };

  /**
   * 1단계에서 문제를 고친 뒤, 새 문제 기준으로 8단계 풀이과정을 통째로 다시 만든다.
   * 되돌릴 수 있도록 직전 CoT를 cotBeforeRegenerate에 보관한다.
   */
  const handleRegenerateAllSteps = async () => {
    const cot = currentCotData as CoTData | null;
    if (!cot || !currentProblemId || regeneratingAll) return;
    if (!window.confirm(t('sync.confirmRegenerateCot'))) return;

    setRegeneratingAll(true);
    setRegenerateAllError(null);
    try {
      let next: CoTData;
      if (isDemoMode) {
        await demoDelay(DEMO_COT_LOADING_MS);
        next = buildDemoCotFromProblemInput({
          problem: cot.problem ?? '',
          answer: cot.answer ?? '',
          solution: cot.main_solution ?? '',
          grade: cot.grade ?? '',
          semester: cot.semester,
          imageData: cot.image_data ?? null,
          problemId: currentProblemId,
        });
      } else {
        const result = (await api.createCoT(
          {
            main_problem: cot.problem ?? '',
            main_answer: cot.answer ?? '',
            main_solution: cot.main_solution ?? null,
            grade: cot.grade ?? '',
            ...(cot.semester ? { semester: cot.semester } : {}),
            use_textbook_rag: true,
            ...(selectedAuxiliaryMaterialIds.length
              ? { auxiliary_material_ids: selectedAuxiliaryMaterialIds }
              : {}),
            image_data: cot.image_data ?? null,
            language: getAppLanguage(locale),
          },
          userId,
        )) as CoTData;
        // 문제·이미지 등 폼에서 온 값은 응답에 없을 수 있으므로 기존 값을 유지한 채 steps만 갈아끼운다
        next = { ...cot, ...result, image_data: cot.image_data ?? null, main_solution: cot.main_solution ?? null };
      }

      const fresh = markCotFresh(next);
      setCotBeforeRegenerate(cot);
      setCurrentCotData(fresh);
      saveResult(currentProblemId, fresh, undefined, undefined, undefined, undefined, userId);
      setUndoContent({}); // 단계별 되돌리기 기준이 사라졌으므로 초기화
      logUserEvent('cot_regenerated_after_problem_edit', {
        problem_id: currentProblemId,
        problem: fresh.problem,
        stepsCount: fresh.steps?.length ?? 0,
      });
    } catch (e) {
      setRegenerateAllError(e instanceof Error ? e.message : t('common.errorGeneric'));
    } finally {
      setRegeneratingAll(false);
    }
  };

  /** 재생성 직전의 풀이과정으로 1회 되돌리기 */
  const handleRevertRegenerateAll = () => {
    const previous = cotBeforeRegenerate;
    if (!previous || !currentProblemId) return;
    if (!window.confirm(t('sync.confirmRevertCot'))) return;
    setCurrentCotData(previous);
    saveResult(currentProblemId, previous, undefined, undefined, undefined, undefined, userId);
    setCotBeforeRegenerate(null);
    setUndoContent({});
    logUserEvent('cot_regenerate_after_problem_edit_undone', { problem_id: currentProblemId });
  };

  const handleUndoRegenerate = (subSkillId: string) => {
    const previous = undoContent[subSkillId];
    if (previous === undefined) return;
    applyStepContent(subSkillId, previous);
    setUndoContent((prev) => {
      const next = { ...prev };
      delete next[subSkillId];
      return next;
    });
    logUserEvent('cot_step_regenerate_undone', { stepId: subSkillId });
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
    const isRegenerating = regeneratingStepId === step.sub_skill_id;
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
            <div className={styles.stepHeaderActions}>
              {undoContent[step.sub_skill_id ?? ''] !== undefined && (
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => handleUndoRegenerate(step.sub_skill_id ?? '')}
                >
                  {t('cot.undoRegenerate')}
                </button>
              )}
              <button type="button" className={styles.editBtn} onClick={() => startEdit(step)}>
                {t('common.editAndRegenerate')}
              </button>
            </div>
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
              disabled={isRegenerating}
            />
            <div className={styles.editActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={cancelEdit}
                disabled={isRegenerating}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={saveEdit}
                disabled={isRegenerating}
              >
                {t('common.save')}
              </button>
            </div>

            <div className={styles.feedbackDivider}>
              <span className={styles.feedbackDividerLabel}>{t('cot.stepFeedbackDivider')}</span>
            </div>
            <textarea
              className={styles.editTextarea}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={3}
              placeholder={t('cot.stepFeedbackPlaceholder')}
              aria-label={t('cot.stepFeedbackDivider')}
              disabled={isRegenerating}
            />
            {regenerateError && (
              <p className={styles.regenerateError} role="alert">
                {regenerateError}
              </p>
            )}
            <div className={styles.editActions}>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={() => handleRegenerateStep(step)}
                disabled={isRegenerating || !feedbackText.trim()}
              >
                {isRegenerating ? t('cot.regeneratingStep') : t('cot.regenerateStep')}
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
      {cotStale && (
        <div className={styles.staleBanner}>
          <p className={styles.staleBannerText}>{t('sync.cotStale')}</p>
          <button
            type="button"
            className={styles.staleBannerBtn}
            onClick={handleRegenerateAllSteps}
            disabled={regeneratingAll}
          >
            {regeneratingAll ? t('common.generating') : t('sync.regenerateCot')}
          </button>
        </div>
      )}
      {cotBeforeRegenerate && !cotStale && (
        <div className={styles.staleBanner}>
          <p className={styles.staleBannerText}>{t('sync.cotRegenerated')}</p>
          <button type="button" className={styles.staleBannerBtnGhost} onClick={handleRevertRegenerateAll}>
            {t('sync.revertCot')}
          </button>
        </div>
      )}
      {regenerateAllError && <div className={styles.staleBannerError}>{regenerateAllError}</div>}
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
