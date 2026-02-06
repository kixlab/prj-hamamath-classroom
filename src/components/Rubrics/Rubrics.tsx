import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../contexts/AppContext';
import { api } from '../../services/api';
import { useMathJax } from '../../hooks/useMathJax';
import styles from './Rubrics.module.css';

interface RubricLevel {
  level: '상' | '중' | '하';
  score: number;
  title: string;
  description: string;
  bullets: string[];
}

interface RubricItem {
  sub_question_id: string;
  step_name: string;
  sub_skill_name: string;
  question: string;
  levels: RubricLevel[];
  level_analysis?: any;
  raw_response?: any;
}

function mapApiResponseToRubrics(apiResponse: any, guidelineData: any): RubricItem[] {
  const simulationRubrics = apiResponse?.simulation_rubrics || [];
  const subQuestions = guidelineData?.guide_sub_questions || [];

  return simulationRubrics.map((sr: any, idx: number) => {
    const sq = subQuestions[idx] || {};
    const rubric = sr.rubric || {};
    const levelKeys: Array<'상' | '중' | '하'> = ['상', '중', '하'];
    const scoreMap: Record<string, number> = { '상': 2, '중': 1, '하': 0 };

    const levels: RubricLevel[] = levelKeys
      .filter((key) => rubric[key])
      .map((key) => {
        const data = rubric[key];
        return {
          level: key,
          score: data.score ?? scoreMap[key],
          title: data.description || '',
          description: data.description || '',
          bullets: Array.isArray(data.criteria) ? data.criteria : [],
        };
      });

    return {
      sub_question_id: sr.sub_question_id || sq.sub_question_id || `sq-${idx + 1}`,
      step_name: sq.step_name || '',
      sub_skill_name: sq.sub_skill_name || '',
      question: sq.guide_sub_question || '',
      levels,
      level_analysis: sr.level_analysis,
      raw_response: sr,
    };
  });
}

export const Rubrics = () => {
  const { currentGuidelineData } = useApp();
  const [rubrics, setRubrics] = useState<RubricItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatingMessage, setGeneratingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [feedbackStates, setFeedbackStates] = useState<Record<string, boolean>>({});
  const [editingStates, setEditingStates] = useState<Record<string, boolean>>({});
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());
  const containerRef = useMathJax([rubrics]);
  const hasCalledRef = useRef(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!currentGuidelineData || !(currentGuidelineData as any).guide_sub_questions) return;
    if (hasCalledRef.current) return;
    hasCalledRef.current = true;

    const gd = currentGuidelineData as any;

    const generateRubrics = async () => {
      setGenerating(true);
      setGeneratingMessage('루브릭 생성 중... (시간이 다소 소요될 수 있습니다)');
      setError(null);

      try {
        const response = await api.generateRubricPipeline({
          main_problem: gd.main_problem,
          main_answer: gd.main_answer,
          grade: gd.grade,
          subject_area: gd.subject_area,
          sub_questions: gd.guide_sub_questions,
          variant: 'with_error_types',
        });

        const mapped = mapApiResponseToRubrics(response, gd);
        setRubrics(mapped);
      } catch (err: any) {
        console.error('루브릭 생성 오류:', err);
        setError(err.message || '루브릭 생성 중 오류가 발생했습니다.');
      } finally {
        setGenerating(false);
        setGeneratingMessage('');
      }
    };

    generateRubrics();
  }, [currentGuidelineData, retryCount]);

  const toggleFeedback = (id: string) => {
    setFeedbackStates((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleEdit = (id: string) => {
    setEditingStates((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSaveEdit = (id: string) => {
    setRubrics((prev) =>
      prev.map((r) => {
        if (r.sub_question_id !== id) return r;
        const updated = { ...r, levels: r.levels.map((lv) => {
          const prefix = `${id}-${lv.level}`;
          const titleEl = document.querySelector(`textarea[data-rubric-id="${prefix}-title"]`) as HTMLTextAreaElement;
          const descEl = document.querySelector(`textarea[data-rubric-id="${prefix}-desc"]`) as HTMLTextAreaElement;
          const bulletsEl = document.querySelector(`textarea[data-rubric-id="${prefix}-bullets"]`) as HTMLTextAreaElement;
          return {
            ...lv,
            title: titleEl?.value?.trim() || lv.title,
            description: descEl?.value?.trim() || lv.description,
            bullets: bulletsEl?.value?.split('\n').filter((b: string) => b.trim()) || lv.bullets,
          };
        })};
        return updated;
      }),
    );
    setEditingStates((prev) => ({ ...prev, [id]: false }));
  };

  const buildCurrentRubric = (rubricItem: RubricItem) => {
    const result: Record<string, { score: number; description: string; criteria: string[] }> = {};
    for (const lv of rubricItem.levels) {
      result[lv.level] = { score: lv.score, description: lv.description, criteria: lv.bullets };
    }
    return result;
  };

  const findSubQuestion = (id: string) => {
    const gd = currentGuidelineData as any;
    return (gd?.guide_sub_questions || []).find((sq: any) => sq.sub_question_id === id);
  };

  const handleRegenerateSingle = async (id: string, feedback?: string | null) => {
    const gd = currentGuidelineData as any;
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
        variant: 'with_error_types',
      });

      const rubricData = response.rubric || {};
      const levelKeys: Array<'상' | '중' | '하'> = ['상', '중', '하'];
      const scoreMap: Record<string, number> = { '상': 2, '중': 1, '하': 0 };

      const newLevels: RubricLevel[] = levelKeys
        .filter((key) => rubricData[key])
        .map((key) => {
          const data = rubricData[key];
          return {
            level: key,
            score: data.score ?? scoreMap[key],
            title: data.description || '',
            description: data.description || '',
            bullets: Array.isArray(data.criteria) ? data.criteria : [],
          };
        });

      setRubrics((prev) =>
        prev.map((r) => r.sub_question_id === id ? { ...r, levels: newLevels } : r),
      );
    } catch (err: any) {
      console.error('루브릭 재생성 오류:', err);
      alert(err.message || '루브릭 재생성 중 오류가 발생했습니다.');
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
    handleRegenerateSingle(id, feedbackText || null);
  };

  const handleDownloadJson = () => {
    const data = {
      rubrics: rubrics.map((r) => ({
        sub_question_id: r.sub_question_id,
        step_name: r.step_name,
        sub_skill_name: r.sub_skill_name,
        question: r.question,
        levels: r.levels,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rubrics.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (generating) {
    return (
      <div className={styles.rubricContainer}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <div className={styles.loadingMessage}>{generatingMessage}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.rubricContainer}>
        <div className={styles.errorState}>
          <div className={styles.errorMessage}>{error}</div>
          <button
            className={styles.retryBtn}
            onClick={() => {
              hasCalledRef.current = false;
              setError(null);
              setRetryCount((c) => c + 1);
            }}
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!rubrics.length) {
    return (
      <div className={styles.rubricContainer}>
        <div className={styles.emptyState}>
          <p>하위문항 데이터가 없습니다. 먼저 하위문항을 생성해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.rubricContainer} ref={containerRef}>
      <div className={styles.rubricCards}>
        {rubrics.map((rubric) => {
          const isFeedbackOpen = feedbackStates[rubric.sub_question_id];
          const isEditing = editingStates[rubric.sub_question_id];
          const isRegenerating = regeneratingIds.has(rubric.sub_question_id);

          return (
            <div key={rubric.sub_question_id} className={`${styles.rubricCard} ${isRegenerating ? styles.rubricCardRegenerating : ''}`}>
              <div className={styles.rubricHeader}>
                <span className={styles.rubricId}>{rubric.sub_question_id}</span>
                <span className={styles.rubricTitle}>
                  {rubric.step_name} - {rubric.sub_skill_name}
                </span>
                <span className={styles.rubricQuestionInline}>{rubric.question}</span>
              </div>

              {isEditing ? (
                <div className={styles.editMode}>
                  {rubric.levels.map((lv) => {
                    const prefix = `${rubric.sub_question_id}-${lv.level}`;
                    const levelStyle =
                      lv.level === '상' ? styles.levelHigh :
                      lv.level === '중' ? styles.levelMid : styles.levelLow;
                    const badgeStyle =
                      lv.level === '상' ? styles.badgeHigh :
                      lv.level === '중' ? styles.badgeMid : styles.badgeLow;

                    return (
                      <div key={lv.level} className={`${styles.levelCard} ${levelStyle}`}>
                        <div className={styles.levelHeader}>
                          <span className={`${styles.levelBadge} ${badgeStyle}`}>{lv.level}</span>
                        </div>
                        <div className={styles.levelEditGroup}>
                          <label>제목</label>
                          <textarea
                            className={styles.editTextarea}
                            defaultValue={lv.title}
                            rows={1}
                            data-rubric-id={`${prefix}-title`}
                          />
                        </div>
                        <div className={styles.levelEditGroup}>
                          <label>설명</label>
                          <textarea
                            className={styles.editTextarea}
                            defaultValue={lv.description}
                            rows={2}
                            data-rubric-id={`${prefix}-desc`}
                          />
                        </div>
                        <div className={styles.levelEditGroup}>
                          <label>세부 기준 (줄바꿈으로 구분)</label>
                          <textarea
                            className={styles.editTextarea}
                            defaultValue={lv.bullets.join('\n')}
                            rows={3}
                            data-rubric-id={`${prefix}-bullets`}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className={styles.editActions}>
                    <button className={styles.cancelBtn} onClick={() => toggleEdit(rubric.sub_question_id)}>
                      취소
                    </button>
                    <button className={styles.saveBtn} onClick={() => handleSaveEdit(rubric.sub_question_id)}>
                      저장
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.levelCards}>
                  {rubric.levels.map((lv) => {
                    const levelStyle =
                      lv.level === '상' ? styles.levelHigh :
                      lv.level === '중' ? styles.levelMid : styles.levelLow;
                    const badgeStyle =
                      lv.level === '상' ? styles.badgeHigh :
                      lv.level === '중' ? styles.badgeMid : styles.badgeLow;

                    return (
                      <div key={lv.level} className={`${styles.levelCard} ${levelStyle}`}>
                        <div className={styles.levelHeader}>
                          <span className={`${styles.levelBadge} ${badgeStyle}`}>{lv.level}</span>
                          <span className={styles.levelLabel}>{lv.title}</span>
                        </div>
                        <div className={styles.levelDescription}>{lv.description}</div>
                        {lv.bullets.length > 0 && (
                          <ul className={styles.levelBullets}>
                            {lv.bullets.map((bullet, i) => (
                              <li key={i}>{bullet}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className={styles.actionButtons}>
                <button className={styles.actionBtn} onClick={() => toggleEdit(rubric.sub_question_id)}>
                  <span>{isEditing ? '취소' : '편집'}</span>
                </button>
                <button className={styles.actionBtn} onClick={() => toggleFeedback(rubric.sub_question_id)}>
                  <span>피드백</span>
                </button>
                <button
                  className={styles.regenerateBtn}
                  disabled={regeneratingIds.has(rubric.sub_question_id)}
                  onClick={() => {
                    if (isFeedbackOpen) {
                      handleFeedbackRegenerate(rubric.sub_question_id);
                    } else {
                      handleRegenerateSingle(rubric.sub_question_id);
                    }
                  }}
                >
                  <span>{regeneratingIds.has(rubric.sub_question_id) ? '생성 중...' : '재생성'}</span>
                </button>
              </div>

              <div className={styles.feedbackInput} style={{ display: isFeedbackOpen ? 'block' : 'none' }}>
                <textarea
                  className={`${styles.feedbackTextarea} feedback-rubric-${rubric.sub_question_id}`}
                  rows={3}
                  placeholder="루브릭 수정 요청사항을 입력하세요."
                />
                <div className={styles.feedbackActions}>
                  <button className={styles.cancelBtn} onClick={() => toggleFeedback(rubric.sub_question_id)}>
                    취소
                  </button>
                  <button
                    className={styles.submitBtn}
                    onClick={() => handleFeedbackRegenerate(rubric.sub_question_id)}
                  >
                    입력
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.finalizeRow}>
        <button className={styles.downloadBtn} onClick={handleDownloadJson}>
          JSON 다운로드
        </button>
        <button className={styles.finalizeBtn} onClick={() => {/* TODO: finalize */}}>
          루브릭 확정하기
        </button>
      </div>
    </div>
  );
};
