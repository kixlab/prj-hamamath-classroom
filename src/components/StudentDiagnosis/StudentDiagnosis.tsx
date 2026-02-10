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
  const { currentProblemId, currentCotData, currentGuidelineData, finalizedGuidelineForRubric, currentRubrics } =
    useApp();

  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [diagnosisCotData, setDiagnosisCotData] = useState<any | null>(null);
  const [rubricLoading, setRubricLoading] = useState(false);
  const [rubricError, setRubricError] = useState<string | null>(null);
  const [apiRubrics, setApiRubrics] = useState<any[] | null>(null);
  const [apiGuideSubQuestions, setApiGuideSubQuestions] = useState<any[] | null>(null);

  // 내 저장 결과 목록 가져와 드롭다운에 표시 (초기에는 아무 문제도 선택하지 않음)
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const list = await api.getMyHistoryList();
        setHistoryItems(list || []);
      } catch (err) {
        console.error("저장 결과 목록 불러오기 오류:", err);
      }
    };
    fetchHistory();
  }, [currentProblemId]);

  const problemIdForDiagnosis = selectedProblemId;

  useEffect(() => {
    const fetchRubrics = async () => {
      if (!problemIdForDiagnosis) return;
      setRubricLoading(true);
      setRubricError(null);
      try {
        const result = await api.getResult(problemIdForDiagnosis);
        if (result) {
          // 메인 문제/정답/학년/수학 영역 등도 함께 저장된 CoT 데이터에서 가져온다.
          if (result.cotData) {
            setDiagnosisCotData(result.cotData);
          } else {
            setDiagnosisCotData(null);
          }

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
          setDiagnosisCotData(null);
          setApiRubrics(null);
          setApiGuideSubQuestions(null);
        }
      } catch (err: any) {
        console.error("루브릭 불러오기 오류:", err);
        setRubricError(err.message || "확정된 루브릭을 불러오지 못했습니다.");
        setDiagnosisCotData(null);
        setApiRubrics(null);
        setApiGuideSubQuestions(null);
      } finally {
        setRubricLoading(false);
      }
    };
    fetchRubrics();
  }, [problemIdForDiagnosis]);

  const rubrics = (apiRubrics ?? currentRubrics ?? []) as any[];

  // 하위문항 소스 우선순위: API 저장값 → 3단계 확정 JSON → 현재 가이드라인
  const guideSubQuestions: any[] =
    apiGuideSubQuestions ??
    (finalizedGuidelineForRubric as any)?.guide_sub_questions ??
    ((currentGuidelineData as any)?.guide_sub_questions as any[] | undefined) ??
    [];

  // 메인 문제/정답/학년/수학 영역은
  // - 진단용 problemId가 선택된 경우: 해당 저장 결과의 cotData를 우선 사용
  // - 그 외: 현재 워크플로우의 cotData / finalizedGuidelineForRubric 사용
  const effectiveCotData: any =
    (problemIdForDiagnosis ? diagnosisCotData : null) ??
    (currentCotData as any) ??
    null;

  const mainProblem =
    (!problemIdForDiagnosis ? (finalizedGuidelineForRubric as any)?.main_problem : undefined) ??
    effectiveCotData?.problem ??
    "";
  const mainAnswer =
    (!problemIdForDiagnosis ? (finalizedGuidelineForRubric as any)?.main_answer : undefined) ??
    effectiveCotData?.answer ??
    "";
  const grade =
    (!problemIdForDiagnosis ? (finalizedGuidelineForRubric as any)?.grade : undefined) ??
    effectiveCotData?.grade ??
    "";
  const subjectArea =
    (!problemIdForDiagnosis ? (finalizedGuidelineForRubric as any)?.subject_area : undefined) ??
    effectiveCotData?.subject_area ??
    "";

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
  const activeItemIndex = diagnosisItems.findIndex((it) => it.id === activeId);
  const activeItem = activeItemIndex >= 0 ? diagnosisItems[activeItemIndex] : diagnosisItems[0] ?? null;

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
    if (!problemIdForDiagnosis) {
      alert("먼저 진단할 문제를 선택해 주세요.");
      return;
    }
    if (!currentStudentId || !activeItem) {
      alert("학생 또는 하위문항 정보가 없습니다.");
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
        problem_id: problemIdForDiagnosis,
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
    if (!problemIdForDiagnosis) {
      alert("먼저 진단할 문제를 선택해 주세요.");
      return;
    }
    if (!currentStudentId) {
      alert("학생 정보가 없습니다.");
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
        problem_id: problemIdForDiagnosis,
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
          <span className={styles.headerSubtitle}>
            확정된 하위문항 · 정답 · 루브릭을 한 화면에서 확인합니다.
          </span>
          {problemIdForDiagnosis && (
            <span className={styles.problemId}>
              문제 ID: <strong>{problemIdForDiagnosis}</strong>
            </span>
          )}
          <span className={styles.headerSummary}>
            학생 {students.findIndex((s) => s.id === currentStudentId) + 1}/{students.length} · 문항{" "}
            {activeItemIndex + 1}/{diagnosisItems.length}
          </span>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.backBtn} onClick={onClose}>
            워크플로우로 돌아가기
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.mainProblemSection}>
          <div className={styles.mainProblemHeaderRow}>
            <h3 className={styles.mainProblemTitle}>메인 문제</h3>
            {historyItems.length > 0 && (
              <div className={styles.problemSelectWrap}>
                <label className={styles.problemSelectLabel}>
                  문제 선택
                  <select
                    className={styles.problemSelect}
                    value={selectedProblemId ?? ""}
                    onChange={(e) => setSelectedProblemId(e.target.value || null)}
                  >
                    <option value="">문제를 선택해 주세요</option>
                    {historyItems.map((item: any) => (
                      <option key={item.problem_id} value={item.problem_id}>
                        {item.problem_id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
          {problemIdForDiagnosis ? (
            mainProblem ? (
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
              <p className={styles.mainProblemEmpty}>선택한 문제의 데이터가 없습니다.</p>
            )
          ) : (
            <p className={styles.mainProblemEmpty}>먼저 상단에서 문제를 선택해 주세요.</p>
          )}
        </section>

        <div className={styles.layout}>
          {/* 좌측: 학생 리스트 패널 */}
          <aside className={styles.studentListColumn}>
            <h3 className={styles.studentListTitle}>학생 목록</h3>
            <div className={styles.studentList}>
              {students.map((s, idx) => {
                const answeredCount = Object.values(studentAnswers[s.id] ?? {}).filter(
                  (v) => !!v?.trim(),
                ).length;
                const diagnosedCount = Object.keys(diagnosisResults[s.id] ?? {}).length;
                const total = diagnosisItems.length || 0;
                const isActiveStudent = currentStudentId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`${styles.studentListItem} ${
                      isActiveStudent ? styles.studentListItemActive : ""
                    }`}
                    onClick={() => setCurrentStudentId(s.id)}
                  >
                    <div className={styles.studentListName}>
                      {idx + 1}. {s.name}
                    </div>
                    <div className={styles.studentListMeta}>
                      {total > 0 ? `진단 ${diagnosedCount}/${total}` : "문항 없음"}
                    </div>
                  </button>
                );
              })}
            </div>
            <button type="button" className={styles.addStudentBtn} onClick={handleAddStudent}>
              + 학생 추가
            </button>
          </aside>

          {/* 우측: 문항 탭 + 문항/루브릭 + 학생 답안/진단 */}
          <section className={styles.mainColumn}>
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
                          <p className={styles.empty}>
                            해당 하위문항에 대한 루브릭이 없습니다. 4단계에서 루브릭을 생성해 주세요.
                          </p>
                        )}
                        {!rubricLoading &&
                          !rubricError &&
                          activeItem.rubric &&
                          activeItem.rubric.levels?.length > 0 && (
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
                      </div>
                    </div>
                    {activeItem && (
                      <span className={styles.studentMeta}>
                        선택된 진단 대상: {activeItem.id} · {activeItem.stepName} -{" "}
                        {activeItem.subSkillName}
                      </span>
                    )}
                  </header>

                  {diagnosisItems.length > 0 ? (
                    <>
                      <p className={styles.studentAllDesc}>
                        아래에서 모든 하위문항에 대한 학생 답안을 한 번에 입력할 수 있습니다. 왼쪽
                        탭은 참고용으로만 사용해 주세요.
                      </p>
                      <div className={styles.studentAllList}>
                        {diagnosisItems.map((item) => {
                          const value = studentAnswers[currentStudentId]?.[item.id] ?? "";
                          const result = diagnosisResults[currentStudentId]?.[item.id];
                          const isActive = activeItem?.id === item.id;
                          return (
                            <div
                              key={item.id}
                              className={`${styles.studentAnswerBlock} ${
                                isActive ? styles.studentAnswerBlockActive : ""
                              }`}
                            >
                              <div className={styles.studentAnswerHeader}>
                                <div className={styles.studentAnswerHeaderLeft}>
                                  <span className={styles.studentAnswerCode}>{item.displayCode}</span>
                                  <span className={styles.studentAnswerLabel}>
                                    {item.stepName} - {item.subSkillName}
                                  </span>
                                </div>
                                {result && (
                                  <span className={styles.studentAnswerResult}>
                                    진단: {result.level}
                                  </span>
                                )}
                              </div>
                              <div
                                className={styles.studentAnswerQuestion}
                                dangerouslySetInnerHTML={{
                                  __html: formatQuestion(item.question),
                                }}
                              />
                              <textarea
                                className={styles.studentTextarea}
                                rows={4}
                                placeholder="이 하위문항에 대한 학생 답안을 입력해 주세요."
                                value={value}
                                onChange={(e) =>
                                  handleStudentAnswerChange(item.id, e.target.value)
                                }
                              />
                            </div>
                          );
                        })}
                      </div>

                      <div className={styles.studentActions}>
                        <button
                          type="button"
                          className={styles.studentSaveBtn}
                          onClick={handleSaveCurrentStudentAnswers}
                          disabled={saving}
                        >
                          {saving ? "저장 중..." : "학생 답안 전체 저장"}
                        </button>
                        {canDiagnose[currentStudentId] && activeItem && (
                          <button
                            type="button"
                            className={styles.studentDiagnoseBtn}
                            onClick={handleRunDiagnosis}
                            disabled={diagnosing}
                          >
                            {diagnosing ? "진단 중..." : "선택된 하위문항 진단하기"}
                          </button>
                        )}
                        {saveMessage && (
                          <span className={styles.studentSaveMessage}>{saveMessage}</span>
                        )}
                      </div>

                      {activeItem && diagnosisResults[currentStudentId]?.[activeItem.id] && (
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
                    <p className={styles.empty}>
                      먼저 상단에서 문제를 선택하고, 좌측에서 하위문항을 불러와 주세요.
                    </p>
                  )}
                </div>
              </section>
            </div>

            {diagnosisItems.length > 0 && (
              <section className={styles.studentSummary}>
                <h3 className={styles.studentSummaryTitle}>현재 학생 문항 요약</h3>
                <div className={styles.studentSummaryRow}>
                  {diagnosisItems.map((item) => {
                    const result = diagnosisResults[currentStudentId]?.[item.id];
                    const hasAnswer = !!studentAnswers[currentStudentId]?.[item.id]?.trim();
                    const isActive = activeItem?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`${styles.studentSummaryChip} ${
                          isActive ? styles.studentSummaryChipActive : ""
                        }`}
                        onClick={() => setActiveId(item.id)}
                      >
                        <span className={styles.studentSummaryCode}>{item.displayCode}</span>
                        <span className={styles.studentSummaryStatus}>
                          {result ? `진단: ${result.level}` : hasAnswer ? "답안 입력" : "미입력"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </section>
        </div>

        {diagnosisItems.length > 0 && (
          <section className={styles.studentSummary}>
            <h3 className={styles.studentSummaryTitle}>학생별 문항 진단 요약</h3>
            <div className={styles.studentSummaryRow}>
              {diagnosisItems.map((item, idx) => {
                const result = diagnosisResults[currentStudentId]?.[item.id];
                const hasAnswer = !!studentAnswers[currentStudentId]?.[item.id]?.trim();
                const isActive = activeItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.studentSummaryChip} ${isActive ? styles.studentSummaryChipActive : ""}`}
                    onClick={() => setActiveId(item.id)}
                  >
                    <span className={styles.studentSummaryCode}>{item.displayCode}</span>
                    <span className={styles.studentSummaryStatus}>
                      {result ? `진단: ${result.level}` : hasAnswer ? "답안 입력" : "미입력"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};


