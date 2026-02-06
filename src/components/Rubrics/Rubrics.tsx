import { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useMathJax } from '../../hooks/useMathJax';
import styles from './Rubrics.module.css';

interface RubricLevel {
  level: '상' | '중' | '하';
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
}

// Generate dummy rubric data from guideline sub-questions
function buildDummyRubrics(guidelineData: any): RubricItem[] {
  const subQuestions = guidelineData?.guide_sub_questions || [];
  return subQuestions.map((sq: any) => ({
    sub_question_id: sq.sub_question_id,
    step_name: sq.step_name,
    sub_skill_name: sq.sub_skill_name,
    question: sq.guide_sub_question,
    levels: [
      {
        level: '상' as const,
        title: '모든 조건을 정확히 파악하고 적용한 답변',
        description: '문제에 주어진 조건을 모두 올바르게 이해하고 적용하였으며, 정확한 계산을 통해 올바른 답을 제시함.',
        bullets: [
          `문제의 핵심 조건을 정확히 파악하고 풀이에 반영함`,
          `논리적으로 완결된 풀이 과정을 제시함`,
        ],
      },
      {
        level: '중' as const,
        title: '일부 조건을 이해했으나, 완전하게 연결하지 못한 답변',
        description: '문제의 일부 조건을 인식하고 계산을 시도하였으나, 조건을 완전하게 연결하지 못함.',
        bullets: [
          `일부 조건은 이해했으나 풀이 과정에서 누락이 있음`,
          `계산 과정에서 부분적인 오류가 있음`,
        ],
      },
      {
        level: '하' as const,
        title: '기초적인 이해의 부족으로 인한 주요 오해가 있는 답변',
        description: '문제를 잘못 인식하거나 핵심 조건을 무시하여 풀이에 주요 오류가 있음.',
        bullets: [
          `문제의 핵심 조건을 인지하지 못함`,
          `풀이 방향이 문제의 요구와 맞지 않음`,
        ],
      },
    ],
  }));
}

export const Rubrics = () => {
  const { currentGuidelineData } = useApp();
  const [rubrics, setRubrics] = useState<RubricItem[]>(() =>
    buildDummyRubrics(currentGuidelineData),
  );
  const [feedbackStates, setFeedbackStates] = useState<Record<string, boolean>>({});
  const [editingStates, setEditingStates] = useState<Record<string, boolean>>({});
  const containerRef = useMathJax([rubrics]);

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

  const handleFeedbackRegenerate = (id: string) => {
    const feedbackEl = document.querySelector(`.feedback-rubric-${id}`) as HTMLTextAreaElement;
    const feedbackText = feedbackEl?.value?.trim();
    if (feedbackText) {
      // TODO: call API to regenerate rubric with feedback
      console.log('Rubric feedback for', id, ':', feedbackText);
    }
    setFeedbackStates((prev) => ({ ...prev, [id]: false }));
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

  if (!rubrics.length) {
    return (
      <div className={styles.rubricContainer}>
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
          루브릭 데이터가 없습니다.
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

          return (
            <div key={rubric.sub_question_id} className={styles.rubricCard}>
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
                  onClick={() => {
                    if (isFeedbackOpen) {
                      handleFeedbackRegenerate(rubric.sub_question_id);
                    }
                    // TODO: regenerate without feedback
                  }}
                >
                  <span>재생성</span>
                </button>
              </div>

              {isFeedbackOpen && (
                <div className={styles.feedbackInput}>
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
              )}
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
