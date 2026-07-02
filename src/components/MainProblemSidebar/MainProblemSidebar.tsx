import { useCallback, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useLocale } from '../../i18n/LocaleContext';
import { getAppLanguage } from '../../i18n/translations';
import { api, type SubQuestionPromptPreviewResult, type TextbookRagPreviewResult } from '../../services/api';
import type { CoTStep } from '../../types';
import { formatAnswer, formatQuestionHtml, formatSolution } from '../../utils/formatting';
import { MathHtml } from '../MathHtml';
import styles from './MainProblemSidebar.module.css';

export interface GuideSubQuestionPromptInfo {
  sub_question_id: string;
  step_id?: string | number;
  sub_skill_id?: string;
  step_name?: string;
  sub_skill_name?: string;
  guide_sub_question?: string;
  guide_sub_answer?: string;
  re_sub_question?: string;
  re_sub_answer?: string;
  system_prompt?: string | null;
  user_prompt?: string | null;
  prompt_used?: string | null;
}

export interface MainProblemSidebarProps {
  problem?: string;
  answer?: string;
  imageData?: string | null;
  solution?: string | null;
  grade?: string;
  semester?: string;
  subjectArea?: string;
  cotSteps?: CoTStep[];
  guideSubQuestions?: GuideSubQuestionPromptInfo[];
  considerations?: string[];
}

type PromptSource = 'generated' | 'preview';

interface PromptViewState {
  source: PromptSource;
  system_prompt: string;
  user_prompt: string;
}

function buildPreviousSubQuestions(
  cotSteps: CoTStep[],
  guideSubQuestions: GuideSubQuestionPromptInfo[],
  selectedStepId: string,
) {
  const stepIndex = cotSteps.findIndex((s) => s.sub_skill_id === selectedStepId);
  if (stepIndex <= 0) return [];
  const previousIds = new Set(
    cotSteps.slice(0, stepIndex).map((s) => s.sub_skill_id).filter(Boolean) as string[],
  );
  return guideSubQuestions
    .filter((q) => previousIds.has(q.sub_question_id))
    .map((q) => {
      const hasReQ = !!(q.re_sub_question && q.re_sub_question.trim().length > 0);
      const hasReA = !!(q.re_sub_answer && q.re_sub_answer.trim().length > 0);
      return {
        sub_question_id: q.sub_question_id,
        step_id: q.step_id,
        sub_skill_id: q.sub_skill_id,
        step_name: q.step_name,
        sub_skill_name: q.sub_skill_name,
        guide_sub_question: hasReQ ? q.re_sub_question : q.guide_sub_question,
        guide_sub_answer: hasReA ? q.re_sub_answer : q.guide_sub_answer,
      };
    });
}

export const MainProblemSidebar = ({
  problem,
  answer,
  imageData,
  solution,
  grade,
  semester,
  subjectArea,
  cotSteps = [],
  guideSubQuestions = [],
  considerations = [],
}: MainProblemSidebarProps) => {
  const { currentStep } = useApp();
  const { t, locale } = useLocale();
  const mainProblem = problem?.trim() || '';
  const mainAnswer = answer?.trim() || '';
  const mainSolution = solution?.trim() || '';
  const gradeText = grade?.trim() || '';
  const semesterText = semester?.trim() || '';

  const [ragOpen, setRagOpen] = useState(false);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragError, setRagError] = useState<string | null>(null);
  const [ragResult, setRagResult] = useState<TextbookRagPreviewResult | null>(null);

  const [promptOpen, setPromptOpen] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState('');
  const [promptView, setPromptView] = useState<PromptViewState | null>(null);

  const cotPrompt = cotSteps.find((s) => s.prompt_used?.trim())?.prompt_used?.trim() || '';
  const canPreviewPrompts = cotSteps.length > 0;
  const showCotPromptSection = currentStep === 2;
  const showSubqPromptSection = currentStep === 3;

  const handleRagPreview = async () => {
    if (!mainProblem) return;
    if (!gradeText) {
      setRagError(t('app.ragPreviewNoGrade'));
      setRagResult(null);
      setRagOpen(true);
      return;
    }

    setRagOpen(true);
    setRagLoading(true);
    setRagError(null);
    setRagResult(null);

    try {
      const result = await api.previewTextbookRag({
        main_problem: mainProblem,
        grade: gradeText,
        subject_area: subjectArea?.trim() || null,
        semester: semesterText || null,
      });
      setRagResult(result);
    } catch (err: unknown) {
      setRagError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setRagLoading(false);
    }
  };

  const loadPromptForStep = useCallback(
    async (stepId: string) => {
      if (!stepId || !mainProblem || !mainAnswer || !gradeText) return;

      const cotStep = cotSteps.find((s) => s.sub_skill_id === stepId);
      if (!cotStep?.sub_skill_id) return;
      const numericStepId =
        typeof cotStep.step_id === "number"
          ? cotStep.step_id
          : Number.parseInt(String(cotStep.step_id ?? cotStep.sub_skill_id).split("-")[0], 10) || 1;

      const generated = guideSubQuestions.find((q) => q.sub_question_id === stepId);
      if (generated?.system_prompt && generated?.user_prompt) {
        setPromptView({
          source: 'generated',
          system_prompt: generated.system_prompt,
          user_prompt: generated.user_prompt,
        });
        setPromptError(null);
        return;
      }

      setPromptLoading(true);
      setPromptError(null);
      setPromptView(null);

      try {
        const result: SubQuestionPromptPreviewResult = await api.previewSubQuestionPrompt({
          main_problem: mainProblem,
          main_answer: mainAnswer,
          main_solution: mainSolution || null,
          grade: gradeText,
          cot_step: {
            step_id: numericStepId,
            sub_skill_id: cotStep.sub_skill_id,
            step_name: cotStep.step_name || cotStep.step_title || '',
            step_name_en: '',
            sub_skill_name: cotStep.sub_skill_name || cotStep.step_title || '',
            step_content: cotStep.step_content || '',
            prompt_used: cotStep.prompt_used || null,
          },
          subject_area: subjectArea?.trim() || null,
          considerations,
          previous_sub_questions: buildPreviousSubQuestions(cotSteps, guideSubQuestions, stepId),
          semester: semesterText || null,
          use_textbook_rag: true,
          language: getAppLanguage(locale),
          image_data: imageData || null,
        });
        setPromptView({
          source: 'preview',
          system_prompt: result.system_prompt,
          user_prompt: result.user_prompt,
        });
      } catch (err: unknown) {
        setPromptError(err instanceof Error ? err.message : t('common.errorGeneric'));
      } finally {
        setPromptLoading(false);
      }
    },
    [
      considerations,
      cotSteps,
      gradeText,
      guideSubQuestions,
      imageData,
      locale,
      mainAnswer,
      mainProblem,
      mainSolution,
      semesterText,
      subjectArea,
      t,
    ],
  );

  const handlePromptPreview = async () => {
    if (!canPreviewPrompts) {
      setPromptError(t('app.promptNeedCot'));
      setPromptOpen(true);
      return;
    }

    setPromptOpen(true);
    setPromptView(null);
    setPromptError(null);
    if (!showSubqPromptSection) {
      setPromptLoading(false);
      return;
    }

    const firstStepId = cotSteps[0]?.sub_skill_id || '';
    setSelectedStepId(firstStepId);
    if (firstStepId) {
      await loadPromptForStep(firstStepId);
    }
  };

  const handleStepChange = async (stepId: string) => {
    setSelectedStepId(stepId);
    await loadPromptForStep(stepId);
  };

  return (
    <>
      <aside className={styles.column}>
        <div className={styles.panel}>
          <h3 className={styles.title}>{t('app.mainProblem')}</h3>
          {imageData && (
            <div className={styles.imageWrap}>
              <img src={imageData} alt={t('app.problemImage')} className={styles.image} />
            </div>
          )}
          {mainProblem ? (
            <>
              <MathHtml className={styles.content} html={formatQuestionHtml(mainProblem)} />
              {mainAnswer && (
                <div className={styles.answer}>
                  <span className={styles.answerLabel}>{t('common.answerColon')}</span>{' '}
                  <MathHtml className={styles.answerValue} html={formatAnswer(mainAnswer)} />
                </div>
              )}
              {mainSolution && (
                <div className={styles.solution}>
                  <span className={styles.solutionLabel}>{t('app.modelAnswer')}</span>
                  <MathHtml className={styles.solutionContent} html={formatSolution(mainSolution)} />
                </div>
              )}
            </>
          ) : (
            !imageData && <p className={styles.empty}>{t('app.noProblemData')}</p>
          )}
          {(gradeText || semesterText || subjectArea) && (
            <div className={styles.meta}>
              {gradeText && (
                <div>
                  <span className={styles.metaLabel}>{t('app.gradeLabel')}</span> {gradeText}
                </div>
              )}
              {semesterText && (
                <div>
                  <span className={styles.metaLabel}>{t('app.semesterLabel')}</span> {semesterText}
                </div>
              )}
              {subjectArea && (
                <div>
                  <span className={styles.metaLabel}>{t('app.subjectArea')}</span> {subjectArea}
                </div>
              )}
            </div>
          )}
          {mainProblem && (
            <div className={styles.ragActions}>
              <button
                type="button"
                className={styles.ragBtn}
                onClick={handleRagPreview}
                disabled={ragLoading}
              >
                {ragLoading ? t('app.ragPreviewLoading') : t('app.ragPreview')}
              </button>
              {canPreviewPrompts && (
                <button
                  type="button"
                  className={styles.ragBtn}
                  onClick={handlePromptPreview}
                  disabled={promptLoading}
                >
                  {promptLoading ? t('app.promptLoading') : t('app.promptPreview')}
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {ragOpen && (
        <div
          className={styles.ragOverlay}
          onClick={() => setRagOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t('app.ragPreviewTitle')}
        >
          <div className={styles.ragModal} onClick={(e) => e.stopPropagation()}>
            <header className={styles.ragHeader}>
              <h4 className={styles.ragTitle}>{t('app.ragPreviewTitle')}</h4>
              <button type="button" className={styles.ragCloseBtn} onClick={() => setRagOpen(false)}>
                {t('common.close')}
              </button>
            </header>
            <div className={styles.ragBody}>
              {ragLoading && <p className={styles.ragStatus}>{t('app.ragPreviewLoading')}</p>}
              {ragError && <p className={styles.ragError}>{ragError}</p>}
              {!ragLoading && !ragError && ragResult && (
                <>
                  <section className={styles.ragSection}>
                    <div className={styles.ragSectionLabel}>{t('app.ragPreviewQuery')}</div>
                    <p className={styles.ragQuery}>{ragResult.query}</p>
                  </section>
                  {(ragResult.textbook_title || ragResult.textbook_id) && (
                    <section className={styles.ragSection}>
                      <div className={styles.ragSectionLabel}>{t('app.ragPreviewTextbook')}</div>
                      <p className={styles.ragTextbook}>
                        {ragResult.textbook_title || ragResult.textbook_id}
                        {ragResult.semester_auto_selected && (
                          <span className={styles.ragBadge}> {t('app.ragPreviewAutoSelected')}</span>
                        )}
                      </p>
                    </section>
                  )}
                  {ragResult.concepts.length > 0 ? (
                    <section className={styles.ragSection}>
                      <div className={styles.ragSectionLabel}>
                        {t('app.ragPreviewContext')} ({ragResult.concepts.length})
                      </div>
                      <ul className={styles.ragConceptList}>
                        {ragResult.concepts.map((concept, index) => (
                          <li key={concept.id || index} className={styles.ragConceptItem}>
                            <div className={styles.ragConceptTitle}>
                              {index + 1}. {concept.concept_name}
                              {concept.unit ? ` (${concept.unit})` : ''} [p.{concept.page}]
                              {concept.score != null && (
                                <span className={styles.ragScore}>
                                  {' '}
                                  · {t('app.ragPreviewScore')} {concept.score.toFixed(4)}
                                </span>
                              )}
                            </div>
                            <p className={styles.ragConceptDef}>{concept.definition}</p>
                            {concept.keywords && concept.keywords.length > 0 && (
                              <p className={styles.ragConceptKeywords}>
                                {concept.keywords.join(', ')}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : (
                    <p className={styles.ragStatus}>{t('app.ragPreviewNoResults')}</p>
                  )}
                  {ragResult.context_text && (
                    <section className={styles.ragSection}>
                      <div className={styles.ragSectionLabel}>{t('app.ragPreviewContext')}</div>
                      <pre className={styles.ragContextPre}>{ragResult.context_text}</pre>
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {promptOpen && (
        <div
          className={styles.ragOverlay}
          onClick={() => setPromptOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t('app.promptPreviewTitle')}
        >
          <div className={styles.ragModal} onClick={(e) => e.stopPropagation()}>
            <header className={styles.ragHeader}>
              <h4 className={styles.ragTitle}>{t('app.promptPreviewTitle')}</h4>
              <button type="button" className={styles.ragCloseBtn} onClick={() => setPromptOpen(false)}>
                {t('common.close')}
              </button>
            </header>
            <div className={styles.ragBody}>
              {showCotPromptSection &&
                (cotPrompt ? (
                  <section className={styles.ragSection}>
                    <div className={styles.ragSectionLabel}>{t('app.promptCotSection')}</div>
                    <pre className={styles.ragContextPre}>{cotPrompt}</pre>
                  </section>
                ) : (
                  <p className={styles.ragStatus}>{t('app.promptNoCot')}</p>
                ))}

              {showSubqPromptSection && (
                <section className={styles.ragSection}>
                  <div className={styles.ragSectionLabel}>{t('app.promptSubqSection')}</div>
                  <label className={styles.promptSelectLabel}>
                    {t('app.promptSelectStep')}
                    <select
                      className={styles.promptSelect}
                      value={selectedStepId}
                      onChange={(e) => handleStepChange(e.target.value)}
                    >
                      {cotSteps.map((step) => {
                        const id = step.sub_skill_id || '';
                        if (!id) return null;
                        const label = `${id} · ${step.sub_skill_name || step.step_title || ''}`;
                        return (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </section>
              )}

              {promptLoading && <p className={styles.ragStatus}>{t('app.promptLoading')}</p>}
              {promptError && <p className={styles.ragError}>{promptError}</p>}
              {showSubqPromptSection && !promptLoading && !promptError && promptView && (
                <>
                  <p className={styles.ragHint}>
                    {promptView.source === 'generated'
                      ? t('app.promptFromGenerated')
                      : t('app.promptFromPreview')}
                  </p>
                  <section className={styles.ragSection}>
                    <div className={styles.ragSectionLabel}>{t('app.promptSystem')}</div>
                    <pre className={styles.ragContextPre}>{promptView.system_prompt}</pre>
                  </section>
                  <section className={styles.ragSection}>
                    <div className={styles.ragSectionLabel}>{t('app.promptUser')}</div>
                    <pre className={styles.ragContextPre}>{promptView.user_prompt}</pre>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
