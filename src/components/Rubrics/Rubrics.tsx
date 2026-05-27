import { useState, useEffect } from "react";
import { useApp } from "../../contexts/AppContext";
import { api } from "../../services/api";
import { saveResult } from "../../hooks/useStorage";
import { useMathJax } from "../../hooks/useMathJax";
import { logUserEvent } from "../../services/eventLogger";
import { useLocale } from "../../i18n/LocaleContext";
import { formatCotStepGroup, formatCotSubSkill } from "../../i18n/translations";
import { formatAnswer, formatQuestion } from "../../utils/formatting";
import styles from "./Rubrics.module.css";

interface RubricLevel {
  level: "상" | "중" | "하";
  score: number;
  /** API `description` — 등급 요약(만점/부분/0점 답변 설명) */
  description: string;
  bullets: string[];
  examples: string[];
}

interface RubricItem {
  sub_question_id: string;
  step_name: string;
  sub_skill_name: string;
  question: string;
  answer?: string;
  levels: RubricLevel[];
  level_analysis?: any;
  raw_response?: any;
}

type SubqVersion = "original" | "regenerated";

function getSubqDisplayQA(
  subQ: {
    guide_sub_question?: string;
    guide_sub_answer?: string;
    sub_answer?: string;
    re_sub_question?: string;
    re_sub_answer?: string;
  },
  preferred?: SubqVersion,
) {
  const originalQ = (subQ.guide_sub_question || "").trim();
  const originalA = (subQ.guide_sub_answer || subQ.sub_answer || "").trim();
  const reQ = (subQ.re_sub_question || "").trim();
  const reA = (subQ.re_sub_answer || "").trim();

  if (preferred === "original") {
    return { question: originalQ, answer: originalA };
  }
  if (preferred === "regenerated") {
    return {
      question: reQ || originalQ,
      answer: reQ ? reA || originalA : originalA,
    };
  }
  return {
    question: reQ || originalQ,
    answer: reQ ? reA || originalA : originalA,
  };
}

/**
 * Wrap Korean characters inside $...$ or $$...$$ math delimiters with \text{}
 * so MathJax can render them without errors.
 */
function preprocessLatex(text: string): string {
  const koreanRegex = /([\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]+)/g;
  const result: string[] = [];
  let i = 0;

  while (i < text.length) {
    // Check for display math $$
    if (text[i] === "$" && i + 1 < text.length && text[i + 1] === "$") {
      const start = i + 2;
      const end = text.indexOf("$$", start);
      if (end !== -1) {
        const content = text.substring(start, end);
        result.push("$$", content.replace(koreanRegex, "\\text{$1}"), "$$");
        i = end + 2;
        continue;
      }
    }

    // Check for inline math $
    if (text[i] === "$") {
      const start = i + 1;
      const end = text.indexOf("$", start);
      if (end !== -1 && end > start) {
        const content = text.substring(start, end);
        result.push("$", content.replace(koreanRegex, "\\text{$1}"), "$");
        i = end + 1;
        continue;
      }
    }

    result.push(text[i]);
    i++;
  }

  return result.join("");
}

function mapApiResponseToRubrics(apiResponse: any, guidelineData: any): RubricItem[] {
  const simulationRubrics = apiResponse?.simulation_rubrics || [];
  const subQuestions = guidelineData?.guide_sub_questions || [];

  return simulationRubrics.map((sr: any, idx: number) => {
    const sq = subQuestions[idx] || {};
    const rubric = sr.rubric || {};
    const levelKeys: Array<"상" | "중" | "하"> = ["상", "중", "하"];
    const scoreMap: Record<string, number> = { 상: 2, 중: 1, 하: 0 };

    const levels: RubricLevel[] = levelKeys
      .filter((key) => rubric[key])
      .map((key) => {
        const data = rubric[key];
        return {
          level: key,
          score: data.score ?? scoreMap[key],
          description: (data.description || "").trim(),
          bullets: Array.isArray(data.criteria) ? data.criteria : [],
          examples: Array.isArray(data.examples) ? data.examples : [],
        };
      });

    const { question, answer } = getSubqDisplayQA(sq);
    return {
      sub_question_id: sr.sub_question_id || sq.sub_question_id || `sq-${idx + 1}`,
      step_name: sq.step_name || "",
      sub_skill_name: sq.sub_skill_name || "",
      question,
      answer,
      levels,
      level_analysis: sr.level_analysis,
      raw_response: sr,
    };
  });
}

export const Rubrics = () => {
  const { t, locale, formatLevel } = useLocale();
  const {
    userId,
    currentCotData,
    currentGuidelineData,
    currentRubrics,
    setCurrentRubrics,
    currentProblemId,
    finalizedGuidelineForRubric,
    preferredVersion = {},
  } = useApp();
  /** 3단계에서 넘긴 확정 JSON이 있으면 사용, 없으면 기존 guideline */
  const guidelineForStep4 = finalizedGuidelineForRubric ?? currentGuidelineData;
  const guidelineGd = guidelineForStep4 as { main_problem?: string; main_answer?: string } | null;
  const mainProblem = (guidelineGd?.main_problem ?? (currentCotData as { problem?: string } | null)?.problem ?? "").trim();
  const mainAnswer = (guidelineGd?.main_answer ?? (currentCotData as { answer?: string } | null)?.answer ?? "").trim();
  const rubrics = (currentRubrics ?? []) as RubricItem[];
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!currentProblemId || !currentRubrics?.length) return;
    saveResult(currentProblemId, undefined, undefined, undefined, undefined, currentRubrics, userId);
  }, [currentProblemId, currentRubrics, userId]);
  const [generatingMessage, setGeneratingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedbackStates, setFeedbackStates] = useState<Record<string, boolean>>({});
  // Per-level editing: { [sub_question_id]: { [level]: boolean } }
  const [editingLevels, setEditingLevels] = useState<Record<string, Record<string, boolean>>>({});
  // Controlled edit drafts: { [sub_question_id]: { [level]: { title, description, bullets, examples } } }
  const [editDrafts, setEditDrafts] = useState<Record<string, Record<string, { description: string; bullets: string; examples: string }>>>({});
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());
  // Per-level examples toggle: key = "sub_question_id::level"
  const [examplesOpen, setExamplesOpen] = useState<Record<string, boolean>>({});
  const containerRef = useMathJax([rubrics, editingLevels, examplesOpen, mainProblem, mainAnswer, guidelineForStep4, preferredVersion]);

  const renderMainProblemSection = () => {
    if (!mainProblem && !mainAnswer) return null;
    return (
      <section className={styles.mainProblemCard} aria-label={t("rubric.mainProblem")}>
        {mainProblem ? (
          <div className={styles.mainProblemText} dangerouslySetInnerHTML={{ __html: formatQuestion(mainProblem) }} />
        ) : null}
        {mainAnswer ? (
          <div className={styles.mainProblemAnswer}>
            <strong>{t("common.answerColon")}</strong>{" "}
            <span dangerouslySetInnerHTML={{ __html: formatAnswer(mainAnswer) }} />
          </div>
        ) : null}
      </section>
    );
  };

  // 3단계에서 문항이 수정된 뒤, 전체 루브릭을 다시 생성하고 싶을 때 사용하는 헬퍼
  const handleRegenerateAllRubrics = () => {
    const confirmed = window.confirm(t('rubric.confirmRegenerateAll'));
    if (!confirmed) return;
    runGenerateRubrics();
  };

  const handleFinalizeRubrics = () => {
    const confirmed = window.confirm(t('rubric.confirmFinalize'));
    if (!confirmed) return;
    try {
      // 확정 시 서버·사이드바에 저장 (다른 기기/새로고침 시에도 목록에 표시)
      if (currentProblemId && currentRubrics?.length) {
        saveResult(currentProblemId, undefined, undefined, undefined, undefined, currentRubrics, userId);
      }
      logUserEvent("rubric_finalized", {
        count: rubrics.length,
      });
    } catch {
      // 로깅 실패는 무시
    }
    window.alert(t('rubric.finalized'));
  };

  const runGenerateRubrics = async () => {
    const gd = guidelineForStep4 as any;
    if (!gd?.guide_sub_questions?.length) return;
    setGenerating(true);
    setGeneratingMessage(t('rubric.generatingLong'));
    setError(null);
    try {
      const response = await api.generateRubricPipeline({
        main_problem: gd.main_problem,
        main_answer: gd.main_answer,
        grade: gd.grade,
        subject_area: gd.subject_area,
        sub_questions: gd.guide_sub_questions,
        variant: "with_error_types",
      });
      const mapped = mapApiResponseToRubrics(response, gd);
      setCurrentRubrics(mapped);
      try {
        logUserEvent("rubric_generated", {
          sub_question_count: mapped.length,
          problem_id: (gd as any).problem_id ?? null,
          output: mapped.map((r) => ({
            sub_question_id: r.sub_question_id,
            question: (r.question || "").slice(0, 500),
            levels: (r.levels || []).map((lv) => ({
              level: lv.level,
              description: (lv.description || "").slice(0, 300),
              bullets_count: (lv.bullets || []).length,
              examples_count: (lv.examples || []).length,
            })),
          })),
        });
      } catch {
        // 로깅 실패는 무시
      }
    } catch (err: any) {
      console.error("루브릭 생성 오류:", err);
      setError(err.message || t('rubric.generateError'));
    } finally {
      setGenerating(false);
      setGeneratingMessage("");
    }
  };

  const toggleFeedback = (id: string) => {
    setFeedbackStates((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleLevelEdit = (id: string, level: string) => {
    const wasEditing = editingLevels[id]?.[level];
    if (!wasEditing) {
      // Entering edit mode for this level — initialize draft
      const rubric = rubrics.find((r) => r.sub_question_id === id);
      const lv = rubric?.levels.find((l) => l.level === level);
      if (lv) {
        setEditDrafts((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            [level]: { description: lv.description, bullets: lv.bullets.join("\n"), examples: lv.examples.join("\n") },
          },
        }));
      }
    }
    setEditingLevels((prev) => ({
      ...prev,
      [id]: { ...prev[id], [level]: !wasEditing },
    }));
  };

  const updateDraft = (id: string, level: string, field: "description" | "bullets" | "examples", value: string) => {
    setEditDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [level]: { ...prev[id]?.[level], [field]: value },
      },
    }));
  };

  const handleSaveLevelEdit = (id: string, level: string) => {
    const draft = editDrafts[id]?.[level];
    if (!draft) return;

    const before = rubrics.find((r) => r.sub_question_id === id)?.levels.find((lv) => lv.level === level);

    setCurrentRubrics(
      rubrics.map((r) => {
        if (r.sub_question_id !== id) return r;
        return {
          ...r,
          levels: r.levels.map((lv) => {
            if (lv.level !== level) return lv;
            return {
              ...lv,
              description: draft.description.trim() || lv.description,
              bullets: draft.bullets.split("\n").filter((b) => b.trim()),
              examples: draft.examples.split("\n").filter((e) => e.trim()),
            };
          }),
        };
      }),
    );
    setEditingLevels((prev) => ({
      ...prev,
      [id]: { ...prev[id], [level]: false },
    }));
    try {
      logUserEvent("rubric_level_edited", {
        sub_question_id: id,
        level,
        before: before
          ? {
              description: before.description,
              bullets: before.bullets,
              examples: before.examples,
            }
          : null,
        after: {
          description: draft.description.trim() || before?.description || "",
          bullets: draft.bullets.split("\n").filter((b) => b.trim()),
          examples: draft.examples.split("\n").filter((e) => e.trim()),
        },
      });
    } catch {
      // 로깅 실패는 무시
    }
  };

  const buildCurrentRubric = (rubricItem: RubricItem) => {
    const result: Record<string, { score: number; description: string; criteria: string[] }> = {};
    for (const lv of rubricItem.levels) {
      result[lv.level] = { score: lv.score, description: lv.description, criteria: lv.bullets };
    }
    return result;
  };

  const findSubQuestion = (id: string) => {
    const gd = guidelineForStep4 as any;
    return (gd?.guide_sub_questions || []).find((sq: any) => sq.sub_question_id === id);
  };

  const handleRegenerateSingle = async (id: string, feedback?: string | null) => {
    const gd = guidelineForStep4 as any;
    const rubricItem = rubrics.find((r) => r.sub_question_id === id);
    const subQuestion = findSubQuestion(id);
    if (!rubricItem || !subQuestion || !gd) return;

    setRegeneratingIds((prev) => new Set(prev).add(id));
    setFeedbackStates((prev) => ({ ...prev, [id]: false }));

    try {
      const response = await api.regenerateRubricSingle({
        main_problem: gd.main_problem,
        main_answer: gd.main_answer,
        grade: gd.grade,
        subject_area: gd.subject_area,
        sub_question: subQuestion,
        current_rubric: buildCurrentRubric(rubricItem),
        feedback: feedback || null,
        variant: "with_error_types",
      });

      const rubricData = response.rubric || {};
      const levelKeys: Array<"상" | "중" | "하"> = ["상", "중", "하"];
      const scoreMap: Record<string, number> = { 상: 2, 중: 1, 하: 0 };

      const newLevels: RubricLevel[] = levelKeys
        .filter((key) => rubricData[key])
        .map((key) => {
          const data = rubricData[key];
          return {
            level: key,
            score: data.score ?? scoreMap[key],
            description: (data.description || "").trim(),
            bullets: Array.isArray(data.criteria) ? data.criteria : [],
            examples: Array.isArray(data.examples) ? data.examples : [],
          };
        });

      setCurrentRubrics(rubrics.map((r) => (r.sub_question_id === id ? { ...r, levels: newLevels } : r)));
      try {
        logUserEvent("rubric_regenerated", {
          sub_question_id: id,
          has_feedback: !!feedback,
          feedback_text: feedback ? feedback.slice(0, 2000) : null,
          output: newLevels.map((lv) => ({
            level: lv.level,
            description: (lv.description || "").slice(0, 300),
            bullets_count: (lv.bullets || []).length,
            examples_count: (lv.examples || []).length,
          })),
        });
      } catch {
        // 로깅 실패는 무시
      }
    } catch (err: any) {
      console.error("루브릭 재생성 오류:", err);
      alert(err.message || t('rubric.regenerateError'));
    } finally {
      setRegeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleFeedbackRegenerate = (id: string) => {
    const feedbackEl = document.querySelector(`.feedback-rubric-${id}`) as HTMLTextAreaElement;
    const feedbackText = feedbackEl?.value?.trim();
    try {
      logUserEvent("rubric_feedback_submitted", {
        sub_question_id: id,
        has_text: !!feedbackText,
        feedback_text: feedbackText ? feedbackText.slice(0, 2000) : null,
      });
    } catch {
      // 로깅 실패는 무시
    }
    handleRegenerateSingle(id, feedbackText || null);
  };

  if (generating && !rubrics.length) {
    return (
      <div className={styles.rubricContainer}>
        <div className={styles.loadingPlaceholderCard}>
          <div className={styles.spinner} aria-hidden />
          <div>{generatingMessage || t("common.loading")}</div>
        </div>
      </div>
    );
  }

  if (error && !rubrics.length) {
    return (
      <div className={styles.rubricContainer}>
        <div className={styles.errorState}>
          <div className={styles.errorMessage}>{error}</div>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => {
              setError(null);
              runGenerateRubrics();
            }}
          >
            {t("common.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!rubrics.length) {
    return (
      <div className={styles.rubricContainer} ref={containerRef}>
        <div className={styles.emptyState}>
          {!guidelineForStep4 || !(guidelineForStep4 as any).guide_sub_questions?.length ? (
            <p>{t("rubric.noGuideline")}</p>
          ) : (
            <>
              {renderMainProblemSection()}
              <p>{t("rubric.clickGenerate")}</p>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`}
                disabled={generating}
                onClick={runGenerateRubrics}
              >
                {generating ? generatingMessage || t("common.generating") : t("rubric.generate")}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const showRegenerateAllBanner = !!(guidelineForStep4 as any)?.guide_sub_questions?.length;

  return (
    <div className={styles.rubricContainer} ref={containerRef}>
      {renderMainProblemSection()}
      {showRegenerateAllBanner && (
        <div className={styles.noticeBanner}>
          <p className={styles.noticeBannerText}>{t("rubric.regenerateAllHint")}</p>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost} ${styles.btnCompact}`}
            onClick={handleRegenerateAllRubrics}
            disabled={generating}
          >
            {t("rubric.regenerateAll")}
          </button>
        </div>
      )}

      <div className={styles.rubricList}>
        {rubrics.map((rubric) => {
          const isFeedbackOpen = feedbackStates[rubric.sub_question_id];
          const isRegenerating = regeneratingIds.has(rubric.sub_question_id);
          const subQ = findSubQuestion(rubric.sub_question_id);
          const { question: subqQuestion, answer: subqAnswer } = subQ
            ? getSubqDisplayQA(subQ, preferredVersion[rubric.sub_question_id])
            : { question: rubric.question, answer: rubric.answer ?? "" };

          return (
            <article key={rubric.sub_question_id} className={styles.rubricCard}>
              <header className={styles.cardTop}>
                <div className={styles.cardMeta}>
                  <span className={styles.cardIdBadge}>{rubric.sub_question_id}</span>
                  <div className={styles.cardTitles}>
                    <span className={styles.cardSkillTitle}>{formatCotSubSkill(rubric, locale)}</span>
                    <span className={styles.cardGroupTitle}>{formatCotStepGroup(rubric, locale)}</span>
                  </div>
                </div>
              </header>

              <div className={styles.questionPanel}>
                {subqQuestion ? (
                  <div
                    className={styles.subqQuestion}
                    dangerouslySetInnerHTML={{ __html: formatQuestion(subqQuestion) }}
                  />
                ) : null}
                {subqAnswer ? (
                  <div className={styles.subqAnswer}>
                    <strong>{t("common.answerColon")}</strong>{" "}
                    <span dangerouslySetInnerHTML={{ __html: formatAnswer(subqAnswer) }} />
                  </div>
                ) : null}
              </div>

              {isRegenerating ? (
                <div className={styles.cardBodyLoading} aria-busy="true">
                  <div className={styles.spinner} aria-hidden />
                  <div>{t("common.generating")}</div>
                </div>
              ) : (
              <div className={styles.levelCards}>
                {rubric.levels.map((lv) => {
                  const isLevelEditing = editingLevels[rubric.sub_question_id]?.[lv.level];
                  const draft = editDrafts[rubric.sub_question_id]?.[lv.level];
                  const levelStyle = lv.level === "상" ? styles.levelHigh : lv.level === "중" ? styles.levelMid : styles.levelLow;
                  const badgeStyle = lv.level === "상" ? styles.badgeHigh : lv.level === "중" ? styles.badgeMid : styles.badgeLow;

                  return (
                    <div key={lv.level} className={`${styles.levelCard} ${levelStyle}`}>
                      <div className={styles.levelHeader}>
                        <span className={`${styles.levelBadge} ${badgeStyle}`}>{formatLevel(lv.level)}</span>
                        {!isLevelEditing && lv.description ? (
                          <span className={styles.levelLabel}>{preprocessLatex(lv.description)}</span>
                        ) : null}
                        {!isLevelEditing && (
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnSecondary} ${styles.btnCompact}`}
                            onClick={() => toggleLevelEdit(rubric.sub_question_id, lv.level)}
                          >
                            {t("common.edit")}
                          </button>
                        )}
                      </div>

                      {isLevelEditing ? (
                        <>
                          <div className={styles.levelEditGroup}>
                            <label>{t("rubric.labelDescription")}</label>
                            <textarea
                              className={styles.editTextarea}
                              value={draft?.description ?? lv.description}
                              onChange={(e) => updateDraft(rubric.sub_question_id, lv.level, "description", e.target.value)}
                              rows={2}
                            />
                          </div>
                          <div className={styles.levelEditGroup}>
                            <label>{t('rubric.labelBullets')}</label>
                            <textarea
                              className={styles.editTextarea}
                              value={draft?.bullets ?? lv.bullets.join("\n")}
                              onChange={(e) => updateDraft(rubric.sub_question_id, lv.level, "bullets", e.target.value)}
                              rows={3}
                            />
                          </div>
                          <div className={styles.levelEditGroup}>
                            <label>{t('rubric.labelExamples')}</label>
                            <textarea
                              className={styles.editTextarea}
                              value={draft?.examples ?? lv.examples.join("\n")}
                              onChange={(e) => updateDraft(rubric.sub_question_id, lv.level, "examples", e.target.value)}
                              rows={3}
                            />
                          </div>
                          <div className={styles.levelEditActions}>
                            <button
                              type="button"
                              className={`${styles.btn} ${styles.btnSecondary} ${styles.btnCompact}`}
                              onClick={() => toggleLevelEdit(rubric.sub_question_id, lv.level)}
                            >
                              {t("common.cancel")}
                            </button>
                            <button
                              type="button"
                              className={`${styles.btn} ${styles.btnPrimary} ${styles.btnCompact}`}
                              onClick={() => handleSaveLevelEdit(rubric.sub_question_id, lv.level)}
                            >
                              {t("common.save")}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          {lv.bullets.length > 0 && (
                            <ul className={styles.levelBullets}>
                              {lv.bullets.map((bullet, i) => (
                                <li key={i}>{preprocessLatex(bullet)}</li>
                              ))}
                            </ul>
                          )}
                          {(() => {
                            const exKey = `${rubric.sub_question_id}::${lv.level}`;
                            const isOpen = !!examplesOpen[exKey];
                            return (
                              <div className={styles.examplesToggleWrap}>
                                <button
                                  type="button"
                                  className={styles.toolLink}
                                  onClick={() => setExamplesOpen((prev) => ({ ...prev, [exKey]: !prev[exKey] }))}
                                >
                                  {isOpen ? t("rubric.hideExamples") : t("rubric.showExamples")}
                                </button>
                                {isOpen && (
                                  <div className={styles.examplesList}>
                                    {lv.examples.length > 0 ? (
                                      lv.examples.map((ex, i) => (
                                        <div key={i} className={styles.exampleItem}>
                                          {preprocessLatex(ex)}
                                        </div>
                                      ))
                                    ) : (
                                      <p className={styles.examplesEmpty}>{t('rubric.noExamples')}</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              )}

              {isFeedbackOpen && (
                <div className={styles.feedbackPanelInline}>
                  <textarea
                    className={`${styles.editTextarea} feedback-rubric-${rubric.sub_question_id}`}
                    rows={3}
                    placeholder={t("rubric.feedbackPlaceholder")}
                    disabled={isRegenerating}
                  />
                  <div className={styles.feedbackActions}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnSecondary} ${styles.btnCompact}`}
                      onClick={() => toggleFeedback(rubric.sub_question_id)}
                      disabled={isRegenerating}
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPrimary} ${styles.btnCompact}`}
                      onClick={() => handleFeedbackRegenerate(rubric.sub_question_id)}
                      disabled={isRegenerating}
                    >
                      {isRegenerating ? (
                        <>
                          <span className={styles.spinnerInline} aria-hidden />
                          {t("common.processing")}
                        </>
                      ) : (
                        t("common.regenerate")
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className={styles.cardFooter}>
                <button
                  type="button"
                  className={`${styles.toolLink} ${isFeedbackOpen ? styles.toolLinkActive : ""}`}
                  onClick={() => toggleFeedback(rubric.sub_question_id)}
                  disabled={isRegenerating}
                >
                  {t("common.feedback")}
                </button>
                {!isFeedbackOpen && (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSecondary} ${styles.btnCompact}`}
                    disabled={isRegenerating}
                    onClick={() => handleRegenerateSingle(rubric.sub_question_id)}
                  >
                    {t("common.regenerate")}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <footer className={styles.pageFooter}>
        <div className={styles.pageFooterInner}>
          <div className={styles.pageFooterSpacer} aria-hidden />
          <div className={styles.pageFooterActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary} ${styles.btnStacked}`}
              onClick={handleFinalizeRubrics}
            >
              <span className={styles.btnStackedLabel}>{t("rubric.finalize")}</span>
              <span className={styles.btnStackedHint}>{t("rubric.finalizeHint")}</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
