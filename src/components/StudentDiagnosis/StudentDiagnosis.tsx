import { useState, useEffect } from "react";
import styles from "./StudentDiagnosis.module.css";
import { useApp } from "../../contexts/AppContext";
import { useMathJax } from "../../hooks/useMathJax";
import { formatQuestion, formatAnswer } from "../../utils/formatting";
import { api } from "../../services/api";

interface StudentDiagnosisProps {
  userId: string;
  onClose: () => void;
}

interface DiagnosisItem {
  id: string;
  stepName: string;
  subSkillName: string;
  question: string;
  answer: string;
  rubric: any | null;
  displayCode: string;
}

interface StudentInfo {
  id: string;
  name: string;
}

export const StudentDiagnosis = ({ userId, onClose }: StudentDiagnosisProps) => {
  const { currentProblemId, currentCotData, currentGuidelineData, finalizedGuidelineForRubric, currentRubrics } = useApp();

  const mainProblem = (finalizedGuidelineForRubric as any)?.main_problem ?? (currentCotData as any)?.problem ?? "";
  const mainAnswer = (finalizedGuidelineForRubric as any)?.main_answer ?? (currentCotData as any)?.answer ?? "";
  const grade = (finalizedGuidelineForRubric as any)?.grade ?? (currentCotData as any)?.grade ?? "";
  const subjectArea =
    (finalizedGuidelineForRubric as any)?.subject_area ??
    (currentCotData as any)?.subject_area ??
    "";

  const [rubricLoading, setRubricLoading] = useState(false);
  const [rubricError, setRubricError] = useState<string | null>(null);
  const [apiRubrics, setApiRubrics] = useState<any[] | null>(null);
  const [apiGuideSubQuestions, setApiGuideSubQuestions] = useState<any[] | null>(null);

  useEffect(() => {
    const fetchRubrics = async () => {
      if (!currentProblemId || !userId) return;
      setRubricLoading(true);
      setRubricError(null);
      try {
        const result = await api.getResultForUser(currentProblemId, userId);
        if (result) {
          if (Array.isArray(result.rubrics)) {
            setApiRubrics(result.rubrics);
          } else {
            setApiRubrics(null);
          }
          if (result.guidelineData?.guide_sub_questions && Array.isArray(result.guidelineData.guide_sub_questions)) {
            setApiGuideSubQuestions(result.guidelineData.guide_sub_questions);
          } else {
            setApiGuideSubQuestions(null);
          }
        } else {
          setApiRubrics(null);
          setApiGuideSubQuestions(null);
        }
      } catch (err: any) {
        console.error("루브릭 불러오기 오류:", err);
        setRubricError(err.message || "확정된 루브릭을 불러오지 못했습니다.");
        setApiRubrics(null);
        setApiGuideSubQuestions(null);
      } finally {
        setRubricLoading(false);
      }
    };
    fetchRubrics();
  }, [currentProblemId, userId]);

  const rubrics = (apiRubrics ?? currentRubrics ?? []) as any[];

  // 하위문항 소스 우선순위: API 저장값 → 3단계 확정 JSON → 현재 가이드라인
  const guideSubQuestions: any[] =
    apiGuideSubQuestions ??
    (finalizedGuidelineForRubric as any)?.guide_sub_questions ??
    ((currentGuidelineData as any)?.guide_sub_questions as any[] | undefined) ??
    [];

  // sub_question_id 기준으로 루브릭을 빠르게 찾을 수 있도록 매핑
  const rubricBySubQuestionId: Record<string, any> = {};
  rubrics.forEach((r: any) => {
    if (r && typeof r.sub_question_id === "string") {
      rubricBySubQuestionId[r.sub_question_id] = r;
    }
  });

  // 단계별(1-1, 1-2, 2-1...) 코드 생성
  const stepIndexByName: Record<string, number> = {};
  const withinStepCount: Record<string, number> = {};
  let stepCounter = 0;

  const diagnosisItems: DiagnosisItem[] = guideSubQuestions.map((sq: any, idx: number) => {
    // 우선 API 가이드라인/루브릭에서 넘어온 sub_question_id 사용
    const rawSubQuestionId: string | undefined = sq.sub_question_id || rubrics[idx]?.sub_question_id;
    const id = rawSubQuestionId ?? `SQ-${idx + 1}`;
    const stepName = sq.step_name ?? "";

    let stepIndex = stepIndexByName[stepName];
    if (!stepIndex) {
      stepIndex = ++stepCounter;
      stepIndexByName[stepName] = stepIndex;
    }
    const withinKey = String(stepIndex);
    const withinIndex = (withinStepCount[withinKey] ?? 0) + 1;
    withinStepCount[withinKey] = withinIndex;

    const displayCode = `${stepIndex}-${withinIndex}`;

    // 1순위: 동일 sub_question_id 매칭, 2순위: 인덱스 기반 매칭
    const matchedRubric =
      (rawSubQuestionId && rubricBySubQuestionId[rawSubQuestionId]) ||
      rubrics[idx] ||
      null;

    return {
      id,
      stepName,
      subSkillName: sq.sub_skill_name ?? "",
      question: sq.guide_sub_question ?? "",
      answer: sq.guide_sub_answer ?? "",
      rubric: matchedRubric,
      displayCode,
    };
  });

  const [activeId, setActiveId] = useState<string | null>(diagnosisItems[0]?.id ?? null);
  const activeItem = diagnosisItems.find((it) => it.id === activeId) ?? diagnosisItems[0] ?? null;

  const [students, setStudents] = useState<StudentInfo[]>([
    { id: "student-1", name: "학생 1" },
  ]);
  const [currentStudentId, setCurrentStudentId] = useState<string>("student-1");
  // studentAnswers[studentId][subQuestionId] = answer
  const [studentAnswers, setStudentAnswers] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  // 학생별로 최소 한 번 이상 저장이 완료되었는지 여부
  const [canDiagnose, setCanDiagnose] = useState<Record<string, boolean>>({});
  const [diagnosing, setDiagnosing] = useState(false);
  // diagnosisResults[studentId][subQuestionId] = { level, reason }
  const [diagnosisResults, setDiagnosisResults] = useState<
    Record<string, Record<string, { level: string; reason: string }>>
  >({});

  const handleChangeStudent = (id: string) => {
    setCurrentStudentId(id);
  };

  const handleAddStudent = () => {
    const name = window.prompt("추가할 학생의 이름을 입력해 주세요.", `학생 ${students.length + 1}`);
    if (!name || !name.trim()) return;
    const id = `student-${Date.now()}`;
    const newStudent = { id, name: name.trim() };
    setStudents((prev) => [...prev, newStudent]);
    setCurrentStudentId(id);
  };

  const handleStudentAnswerChange = (id: string, value: string) => {
    setStudentAnswers((prev) => ({
      ...prev,
      [currentStudentId]: {
        ...(prev[currentStudentId] ?? {}),
        [id]: value,
      },
    }));
    setSaveMessage(null);
  };

  const handleRunDiagnosis = async () => {
    if (!currentProblemId || !currentStudentId || !activeItem) {
      alert("문제 ID, 학생 또는 하위문항 정보가 없습니다.");
      return;
    }
    if (!activeItem.rubric || !activeItem.rubric.levels?.length) {
      alert("루브릭 정보가 없습니다. 먼저 루브릭을 생성해 주세요.");
      return;
    }
    const answerText = studentAnswers[currentStudentId]?.[activeItem.id] ?? "";
    if (!answerText.trim()) {
      alert("학생 답안을 먼저 입력해 주세요.");
      return;
    }

    // 루브릭을 백엔드 진단 스키마에 맞게 변환
    const rubricLevels: Record<string, any> = {};
    for (const lv of activeItem.rubric.levels) {
      rubricLevels[lv.level] = {
        level: lv.level,
        description: lv.description || "",
        criteria: Array.isArray(lv.bullets) ? lv.bullets : [],
        examples: Array.isArray(lv.examples) ? lv.examples : [],
      };
    }

    setDiagnosing(true);
    try {
      const result = await api.diagnoseStudentAnswer({
        problem_id: currentProblemId,
        sub_question_id: activeItem.id,
        question: activeItem.question,
        correct_answer: activeItem.answer,
        rubric: { levels: rubricLevels },
        student_answer: answerText,
      });
      setDiagnosisResults((prev) => ({
        ...prev,
        [currentStudentId]: {
          ...(prev[currentStudentId] ?? {}),
          [activeItem.id]: {
            level: result.level,
            reason: result.reason,
          },
        },
      }));
    } catch (err: any) {
      console.error("학생 진단 오류:", err);
      alert(err.message || "학생 진단 중 오류가 발생했습니다.");
    } finally {
      setDiagnosing(false);
    }
  };

  const handleSaveCurrentStudentAnswers = async () => {
    if (!currentProblemId || !currentStudentId) {
      alert("문제 ID 또는 학생 정보가 없습니다.");
      return;
    }
    const answersForStudent = studentAnswers[currentStudentId] || {};
    if (!Object.keys(answersForStudent).length) {
      alert("저장할 학생 답안이 없습니다.");
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    try {
      await api.saveStudentAnswers({
        problem_id: currentProblemId,
        user_id: userId,
        student_id: currentStudentId,
        answers: answersForStudent,
      });
      setSaveMessage("학생 답안을 저장했습니다.");
      setCanDiagnose((prev) => ({ ...prev, [currentStudentId]: true }));
    } catch (err: any) {
      console.error("학생 답안 저장 오류:", err);
      alert(err.message || "학생 답안을 저장하는 중 오류가 발생했습니다.");
      setSaveMessage(null);
    } finally {
      setSaving(false);
    }
  };

  const containerRef = useMathJax([
    activeId,
    activeItem,
    finalizedGuidelineForRubric,
    currentRubrics,
    currentStudentId,
    studentAnswers,
  ]);

  return (
    <div className={styles.page} ref={containerRef}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>학생 진단하기</h1>
          <span className={styles.headerSubtitle}>확정된 하위문항 · 정답 · 루브릭을 한 화면에서 확인합니다.</span>
          {currentProblemId && (
            <span className={styles.problemId}>
              문제 ID: <strong>{currentProblemId}</strong>
            </span>
          )}
        </div>
        <div className={styles.headerRight}>
          <button className={styles.backBtn} onClick={onClose}>
            워크플로우로 돌아가기
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.mainProblemSection}>
          <h3 className={styles.mainProblemTitle}>메인 문제</h3>
            {mainProblem ? (
              <>
                <div
                  className={styles.mainProblemContent}
                  dangerouslySetInnerHTML={{ __html: formatQuestion(mainProblem) }}
                />
                {mainAnswer && (
                  <div className={styles.mainProblemAnswer}>
                    <span className={styles.mainProblemAnswerLabel}>정답:</span>{" "}
                    <span
                      className={styles.mainProblemAnswerText}
                      dangerouslySetInnerHTML={{ __html: formatAnswer(mainAnswer) }}
                    />
                  </div>
                )}
                {(grade || subjectArea) && (
                  <div className={styles.mainProblemMeta}>
                    {grade && (
                      <span className={styles.metaItem}>
                        <span className={styles.metaLabel}>학년</span>
                        <span className={styles.metaValue}>{grade}</span>
                      </span>
                    )}
                    {subjectArea && (
                      <span className={styles.metaItem}>
                        <span className={styles.metaLabel}>수학 영역</span>
                        <span className={styles.metaValue}>{subjectArea}</span>
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className={styles.mainProblemEmpty}>메인 문제 데이터가 없습니다.</p>
            )}
        </section>

        <div className={styles.contentSplit}>
          <section className={styles.leftColumn}>
            <nav className={styles.tabs}>
              {diagnosisItems.length === 0 ? (
                <span className={styles.tabsEmpty}>확정된 하위문항이 없습니다.</span>
              ) : (
                diagnosisItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.tab} ${activeItem?.id === item.id ? styles.tabActive : ""}`}
                    onClick={() => setActiveId(item.id)}
                    aria-label={`${item.displayCode}단계 (${item.stepName} - ${item.subSkillName})`}
                  >
                    <span className={styles.tabIndex}>{item.displayCode}</span>
                  </button>
                ))
              )}
            </nav>

            <section className={styles.tabPanel}>
              {activeItem ? (
                <article className={styles.card}>
                  <header className={styles.cardHeader}>
                    <span className={styles.badge}>{activeItem.id}</span>
                    <div className={styles.cardHeaderText}>
                      <span className={styles.cardTitle}>
                        {activeItem.stepName} - {activeItem.subSkillName}
                      </span>
                    </div>
                  </header>

                  <section className={styles.qaSection}>
                    <div className={styles.qaBlock}>
                      <div className={styles.qaLabel}>문항</div>
                      <div
                        className={styles.qaContent}
                        dangerouslySetInnerHTML={{ __html: formatQuestion(activeItem.question) }}
                      />
                    </div>
                    <div className={styles.qaBlock}>
                      <div className={styles.qaLabel}>정답</div>
                      <div
                        className={styles.qaContent}
                        dangerouslySetInnerHTML={{ __html: formatAnswer(activeItem.answer) }}
                      />
                    </div>
                  </section>

                  <div className={styles.rubricSection}>
                    <h4 className={styles.rubricSectionTitle}>루브릭</h4>
                    {rubricLoading && <p className={styles.empty}>루브릭을 불러오는 중입니다...</p>}
                    {rubricError && !rubricLoading && (
                      <p className={styles.empty}>{rubricError}</p>
                    )}
                    {!rubricLoading && !rubricError && (!activeItem.rubric || !activeItem.rubric.levels?.length) && (
                      <p className={styles.empty}>해당 하위문항에 대한 루브릭이 없습니다. 4단계에서 루브릭을 생성해 주세요.</p>
                    )}
                    {!rubricLoading && !rubricError && activeItem.rubric && activeItem.rubric.levels?.length > 0 && (
                      <div className={styles.rubricLevels}>
                        {activeItem.rubric.levels.map((lv: any) => {
                          const showTitle =
                            typeof lv.title === "string" &&
                            lv.title.trim().length > 0 &&
                            lv.title.trim() !== (lv.description ?? "").trim();

                          return (
                            <div key={lv.level} className={styles.rubricLevel}>
                              <div className={styles.rubricLevelHeader}>
                                <span className={styles.rubricLevelBadge}>{lv.level}</span>
                                {showTitle && (
                                  <span className={styles.rubricLevelTitle}>{lv.title}</span>
                                )}
                              </div>
                            <p className={styles.rubricLevelDesc}>{lv.description}</p>

                            {Array.isArray(lv.bullets) && lv.bullets.length > 0 && (
                              <div className={styles.rubricBulletsSection}>
                                <div className={styles.rubricSubLabel}>세부 기준</div>
                                <ul className={styles.rubricBullets}>
                                  {lv.bullets.map((b: string, i: number) => (
                                    <li key={i}>{b}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {Array.isArray(lv.examples) && lv.examples.length > 0 && (
                              <div className={styles.rubricExamplesSection}>
                                <div className={styles.rubricSubLabel}>학생 답안 예시</div>
                                <ul className={styles.rubricExamples}>
                                  {lv.examples.map((ex: string, i: number) => (
                                    <li key={i}>{ex}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </article>
              ) : (
                <p className={styles.empty}>표시할 하위문항이 없습니다.</p>
              )}
            </section>
          </section>

          <section className={styles.rightColumn}>
            <div className={styles.studentPanel}>
              <header className={styles.studentHeader}>
                <div className={styles.studentHeaderTop}>
                  <h3 className={styles.studentTitle}>학생 답안 입력</h3>
                  <div className={styles.studentControls}>
                    <select
                      className={styles.studentSelect}
                      value={currentStudentId}
                      onChange={(e) => handleChangeStudent(e.target.value)}
                    >
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={styles.addStudentBtn}
                      onClick={handleAddStudent}
                    >
                      + 학생 추가
                    </button>
                  </div>
                </div>
                {activeItem && (
                  <span className={styles.studentMeta}>
                    {activeItem.id} · {activeItem.stepName} - {activeItem.subSkillName}
                  </span>
                )}
              </header>
              {activeItem ? (
                <>
                  <label className={styles.studentLabel} htmlFor="student-answer">
                    학생 답안을 입력해 주세요.
                  </label>
                  <textarea
                    id="student-answer"
                    className={styles.studentTextarea}
                    rows={10}
                    placeholder="학생이 작성한 답안을 이곳에 입력하거나 붙여넣으세요."
                    value={studentAnswers[currentStudentId]?.[activeItem.id] ?? ""}
                    onChange={(e) => handleStudentAnswerChange(activeItem.id, e.target.value)}
                  />
                  <div className={styles.studentActions}>
                    <button
                      type="button"
                      className={styles.studentSaveBtn}
                      onClick={handleSaveCurrentStudentAnswers}
                      disabled={saving}
                    >
                      {saving ? "저장 중..." : "학생 답안 저장"}
                    </button>
                    {canDiagnose[currentStudentId] && (
                      <button
                        type="button"
                        className={styles.studentDiagnoseBtn}
                        onClick={handleRunDiagnosis}
                        disabled={diagnosing}
                      >
                        {diagnosing ? "진단 중..." : "학생 진단하기"}
                      </button>
                    )}
                    {saveMessage && <span className={styles.studentSaveMessage}>{saveMessage}</span>}
                  </div>
                  {diagnosisResults[currentStudentId]?.[activeItem.id] && (
                    <div className={styles.diagnosisResult}>
                      <span className={styles.diagnosisBadge}>
                        진단 결과: {diagnosisResults[currentStudentId][activeItem.id].level}
                      </span>
                      <span className={styles.diagnosisReason}>
                        {diagnosisResults[currentStudentId][activeItem.id].reason}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <p className={styles.empty}>먼저 좌측에서 하위문항을 선택해 주세요.</p>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};


