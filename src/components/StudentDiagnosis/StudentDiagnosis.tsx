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

interface ProblemStepSummary {
  problemId: string;
  levelsByDisplayCode: Record<string, "상" | "중" | "하">;
}

// 학생 답안을 브라우저에 임시로 보관하기 위한 로컬 스토리지 키
const getStudentAnswersStorageKey = (userId: string) =>
  `hamamath_student_answers_${userId}`;

export const StudentDiagnosis = ({ userId, onClose }: StudentDiagnosisProps) => {
  const { currentProblemId, currentCotData, currentGuidelineData, finalizedGuidelineForRubric, currentRubrics } = useApp();

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
  const isCurrentProblemSelected =
    !!problemIdForDiagnosis && problemIdForDiagnosis === currentProblemId;

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

  // 현재 워크플로우에서 작업 중인 문제를 선택한 경우에는,
  // 3·4단계에서 수정된 최신 문항/루브릭(컨텍스트 값)을 우선 사용하고,
  // 그 외(이전에 저장만 된 다른 문제)는 서버에 저장된 값(API 응답)을 사용한다.
  const rubrics = (
    isCurrentProblemSelected
      ? (currentRubrics ?? apiRubrics ?? [])
      : (apiRubrics ?? [])
  ) as any[];

  // 하위문항 소스 우선순위:
  // - 현재 문제를 진단하는 경우: 3단계 확정 JSON → API 저장값 → 현재 가이드라인
  // - 과거 문제를 진단하는 경우: API 저장값만 사용
  const guideSubQuestions: any[] = isCurrentProblemSelected
    ? (finalizedGuidelineForRubric as any)?.guide_sub_questions ??
      apiGuideSubQuestions ??
      ((currentGuidelineData as any)?.guide_sub_questions as any[] | undefined) ??
      []
    : apiGuideSubQuestions ??
      ((currentGuidelineData as any)?.guide_sub_questions as any[] | undefined) ??
      [];

  // 메인 문제/정답/학년/수학 영역은
  // - 진단용 problemId가 선택된 경우: 해당 저장 결과의 cotData를 우선 사용
  // - 그 외: 현재 워크플로우의 cotData / finalizedGuidelineForRubric 사용
  const effectiveCotData: any = (problemIdForDiagnosis ? diagnosisCotData : null) ?? (currentCotData as any) ?? null;

  const mainProblem = (!problemIdForDiagnosis ? (finalizedGuidelineForRubric as any)?.main_problem : undefined) ?? effectiveCotData?.problem ?? "";
  const mainAnswer = (!problemIdForDiagnosis ? (finalizedGuidelineForRubric as any)?.main_answer : undefined) ?? effectiveCotData?.answer ?? "";
  const grade = (!problemIdForDiagnosis ? (finalizedGuidelineForRubric as any)?.grade : undefined) ?? effectiveCotData?.grade ?? "";
  const subjectArea = (!problemIdForDiagnosis ? (finalizedGuidelineForRubric as any)?.subject_area : undefined) ?? effectiveCotData?.subject_area ?? "";

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
    const matchedRubric = (rawSubQuestionId && rubricBySubQuestionId[rawSubQuestionId]) || rubrics[idx] || null;

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
  const activeItem = activeItemIndex >= 0 ? diagnosisItems[activeItemIndex] : (diagnosisItems[0] ?? null);

  const [students, setStudents] = useState<StudentInfo[]>([{ id: "student-1", name: "학생 1" }]);
  const [currentStudentId, setCurrentStudentId] = useState<string>("student-1");
  // studentAnswers[studentId][problemKey][subQuestionId] = answer
  const [studentAnswers, setStudentAnswers] = useState<
    Record<string, Record<string, Record<string, string>>>
  >({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  // 학생별·문제별로 최소 한 번 이상 저장이 완료되었는지 여부
  const [canDiagnose, setCanDiagnose] = useState<Record<string, Record<string, boolean>>>({});
  const [bulkDiagnosing, setBulkDiagnosing] = useState(false);
  // diagnosisResults[studentId][problemKey][subQuestionId] = { level, reason }
  const [diagnosisResults, setDiagnosisResults] = useState<
    Record<string, Record<string, Record<string, { level: string; reason: string }>>>
  >({});
  const [showGuidePanel, setShowGuidePanel] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<{
    problem_rows: Array<{
      problem_id: string;
      step_count: number;
      high_count: number;
      mid_count: number;
      low_count: number;
      average_level: "상" | "중" | "하" | "-";
    }>;
    step_rows: Array<{
      display_code: string;
      problem_count: number;
      final_level: "상" | "중" | "하";
    }>;
  } | null>(null);
  // 학생별 · 문제별 단계 수준 요약 (여러 문제 진단 결과를 표로 보여주기 위함)
  const [studentProblemSummaries, setStudentProblemSummaries] = useState<
    Record<string, Record<string, ProblemStepSummary>>
  >({});

  // 브라우저 로컬 스토리지에서 기존 학생 답안 복원
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(
        getStudentAnswersStorageKey(userId),
      );
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setStudentAnswers(parsed);
      }
    } catch (err) {
      console.error("저장된 학생 답안을 불러오는 중 오류:", err);
    }
  }, [userId]);

  // 학생 답안이 변경될 때마다 로컬 스토리지에 자동 저장
  useEffect(() => {
    try {
      window.localStorage.setItem(
        getStudentAnswersStorageKey(userId),
        JSON.stringify(studentAnswers),
      );
    } catch (err) {
      console.error("학생 답안을 저장하는 중 오류:", err);
    }
  }, [userId, studentAnswers]);

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

  const currentProblemKey = problemIdForDiagnosis ?? "__current__";

  const handleStudentAnswerChange = (id: string, value: string) => {
    setStudentAnswers((prev) => ({
      ...prev,
      [currentStudentId]: {
        ...(prev[currentStudentId] ?? {}),
        [currentProblemKey]: {
          ...(prev[currentStudentId]?.[currentProblemKey] ?? {}),
          [id]: value,
        },
      },
    }));
    setSaveMessage(null);
  };

  // 현재 학생의 모든 하위문항(답안이 있는 것만)을 한 번에 진단
  const handleRunDiagnosisForAll = async () => {
    if (!problemIdForDiagnosis) {
      alert("먼저 진단할 문제를 선택해 주세요.");
      return;
    }
    if (!currentStudentId) {
      alert("학생 정보를 먼저 선택해 주세요.");
      return;
    }
    if (!diagnosisItems.length) {
      alert("진단할 하위문항이 없습니다.");
      return;
    }

    const answersForStudent =
      studentAnswers[currentStudentId]?.[currentProblemKey] || {};
    const targetItems = diagnosisItems.filter((item) => item.rubric && item.rubric.levels?.length && (answersForStudent[item.id] ?? "").trim().length > 0);

    if (!targetItems.length) {
      alert("답안이 입력된 하위문항이 없습니다. 먼저 학생 답안을 입력해 주세요.");
      return;
    }

    setBulkDiagnosing(true);
    try {
      const newResultsForStudent: Record<string, { level: string; reason: string }> = {
        ...(diagnosisResults[currentStudentId]?.[currentProblemKey] ?? {}),
      };

      for (const item of targetItems) {
        const answerText = answersForStudent[item.id] ?? "";

        // 루브릭을 백엔드 진단 스키마에 맞게 변환
        const rubricLevels: Record<string, any> = {};
        for (const lv of item.rubric.levels) {
          rubricLevels[lv.level] = {
            level: lv.level,
            description: lv.description || "",
            criteria: Array.isArray(lv.bullets) ? lv.bullets : [],
            examples: Array.isArray(lv.examples) ? lv.examples : [],
          };
        }

        try {
          const result = await api.diagnoseStudentAnswer({
            problem_id: problemIdForDiagnosis,
            sub_question_id: item.id,
            question: item.question,
            correct_answer: item.answer,
            rubric: { levels: rubricLevels },
            student_answer: answerText,
          });

          newResultsForStudent[item.id] = {
            level: result.level,
            reason: result.reason,
          };
        } catch (err: any) {
          console.error("하위문항 일괄 진단 중 오류:", item.id, err);
          // 개별 항목 실패는 계속 진행하고, 마지막에 한 번만 안내
        }
      }

      setDiagnosisResults((prev) => {
        const perStudent = { ...(prev[currentStudentId] ?? {}) };
        perStudent[currentProblemKey] = newResultsForStudent;
        return {
          ...prev,
          [currentStudentId]: perStudent,
        };
      });

      // 이 학생의 현재 문제에 대한 단계별 수준 요약을 저장 (표용)
      const levelOnlyByDisplayCode: Record<string, "상" | "중" | "하"> = {};
      targetItems.forEach((item) => {
        const res = newResultsForStudent[item.id];
        if (res?.level === "상" || res?.level === "중" || res?.level === "하") {
          levelOnlyByDisplayCode[item.displayCode] = res.level;
        }
      });

      if (Object.keys(levelOnlyByDisplayCode).length > 0 && problemIdForDiagnosis) {
        setStudentProblemSummaries((prev) => {
          const perStudent = { ...(prev[currentStudentId] ?? {}) };
          perStudent[problemIdForDiagnosis] = {
            problemId: problemIdForDiagnosis,
            levelsByDisplayCode: levelOnlyByDisplayCode,
          };
          return {
            ...prev,
            [currentStudentId]: perStudent,
          };
        });
      }
    } finally {
      setBulkDiagnosing(false);
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
    const answersForStudent =
      studentAnswers[currentStudentId]?.[currentProblemKey] || {};
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
      setCanDiagnose((prev) => ({
        ...prev,
        [currentStudentId]: {
          ...(prev[currentStudentId] ?? {}),
          [currentProblemKey]: true,
        },
      }));
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

  // 한 학생이 여러 문제를 진단한 경우, 표 요약용 파생 데이터 계산
  const summariesForCurrentStudent = studentProblemSummaries[currentStudentId] ?? {};
  const summaryProblemIds = Object.keys(summariesForCurrentStudent);
  const hasMultiProblemSummary = summaryProblemIds.length >= 2;

  // 페이지 내 인라인 요약 표용 (집계는 모달에서 API 사용, 여기서는 표시만)
  type LevelType = "상" | "중" | "하";
  const LEVEL_SCORE: Record<LevelType, number> = { 상: 3, 중: 2, 하: 1 };
  const scoreToLevel = (score: number): LevelType => {
    if (score >= 2.5) return "상";
    if (score >= 1.5) return "중";
    return "하";
  };

  const openReport = async () => {
    const perStudent = studentProblemSummaries[currentStudentId] ?? {};
    const problemIds = Object.keys(perStudent);
    if (!problemIds.length) {
      alert("먼저 한 개 이상의 문제에 대해 진단을 완료해 주세요.");
      return;
    }
    setReportOpen(true);
    setReportLoading(true);
    setReportError(null);
    try {
      const payload = {
        student_id: currentStudentId,
        problem_summaries: problemIds.map((pid) => ({
          problem_id: pid,
          levels_by_display_code: perStudent[pid].levelsByDisplayCode,
        })),
      };
      const data = await api.generateStudentDiagnosisReport(payload);
      setReportData(data);
    } catch (err: any) {
      console.error("학생 진단 리포트 생성 오류:", err);
      setReportError(err.message || "학생 진단 리포트를 불러오는 중 오류가 발생했습니다.");
      setReportData(null);
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className={styles.page} ref={containerRef}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>학생 진단하기</h1>

          <span className={styles.headerSummary}>
            학생 {students.findIndex((s) => s.id === currentStudentId) + 1}/{students.length} · 문항 {activeItemIndex + 1}/{diagnosisItems.length}
          </span>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.backBtn} onClick={onClose}>
            문항 생성으로 돌아가기
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
                  <select className={styles.problemSelect} value={selectedProblemId ?? ""} onChange={(e) => setSelectedProblemId(e.target.value || null)}>
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
                <div className={styles.mainProblemContent} dangerouslySetInnerHTML={{ __html: formatQuestion(mainProblem) }} />
                {mainAnswer && (
                  <div className={styles.mainProblemAnswer}>
                    <span className={styles.mainProblemAnswerLabel}>정답:</span> <span className={styles.mainProblemAnswerText} dangerouslySetInnerHTML={{ __html: formatAnswer(mainAnswer) }} />
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
                const answersForProblem =
                  studentAnswers[s.id]?.[currentProblemKey] ?? {};
                const answeredCount = Object.values(answersForProblem).filter(
                  (v) => !!v?.trim(),
                ).length;
                const diagnosedForProblem =
                  diagnosisResults[s.id]?.[currentProblemKey] ?? {};
                const diagnosedCount = Object.keys(diagnosedForProblem).length;
                const total = diagnosisItems.length || 0;
                const isActiveStudent = currentStudentId === s.id;
                return (
                  <button key={s.id} type="button" className={`${styles.studentListItem} ${isActiveStudent ? styles.studentListItemActive : ""}`} onClick={() => setCurrentStudentId(s.id)}>
                    <div className={styles.studentListName}>
                      {idx + 1}. {s.name}
                    </div>
                    <div className={styles.studentListMeta}>
                      {total > 0
                        ? `답안 ${answeredCount} · 진단 ${diagnosedCount}/${total}`
                        : "문항 없음"}
                    </div>
                  </button>
                );
              })}
            </div>
            <button type="button" className={styles.addStudentBtn} onClick={handleAddStudent}>
              + 학생 추가
            </button>
            {summaryProblemIds.length > 0 && (
              <button
                type="button"
                className={styles.reportBtn}
                onClick={openReport}
              >
                학생 진단 리포트
              </button>
            )}
          </aside>

          {/* 우측: 문항 탭 + 문항/루브릭 + 학생 답안/진단 */}
          <section className={styles.mainColumn}>
            <div className={`${styles.contentSplit} ${showGuidePanel ? "" : styles.contentSplitSingle}`}>
              {showGuidePanel && (
                <section className={styles.leftColumn}>
                  <div className={styles.leftHeaderRow}>
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
                    <button type="button" className={styles.toggleGuideBtn} onClick={() => setShowGuidePanel(false)} aria-label="하위문항 및 루브릭 패널 숨기기" title="하위문항·루브릭 패널 숨기기">
                      <span className={styles.toggleGuideIcon}>
                        {/* eye-off 스타일 */}
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M3 3l18 18M10.58 10.58A3 3 0 0012 15a3 3 0 002.42-4.58M9.88 5.09A8.25 8.25 0 0112 5c4.5 0 8.27 2.94 9.5 7-0.46 1.55-1.3 2.93-2.4 4.06M6.1 6.1C4.24 7.36 2.9 9.27 2.5 12c1.23 4.06 5 7 9.5 7 1.08 0 2.12-0.16 3.1-0.46"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </button>
                  </div>

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
                            <div className={styles.qaContent} dangerouslySetInnerHTML={{ __html: formatQuestion(activeItem.question) }} />
                          </div>
                          <div className={styles.qaBlock}>
                            <div className={styles.qaLabel}>정답</div>
                            <div className={styles.qaContent} dangerouslySetInnerHTML={{ __html: formatAnswer(activeItem.answer) }} />
                          </div>
                        </section>

                        <div className={styles.rubricSection}>
                          <h4 className={styles.rubricSectionTitle}>루브릭</h4>
                          {rubricLoading && <p className={styles.empty}>루브릭을 불러오는 중입니다...</p>}
                          {rubricError && !rubricLoading && <p className={styles.empty}>{rubricError}</p>}
                          {!rubricLoading && !rubricError && (!activeItem.rubric || !activeItem.rubric.levels?.length) && (
                            <p className={styles.empty}>해당 하위문항에 대한 루브릭이 없습니다. 4단계에서 루브릭을 생성해 주세요.</p>
                          )}
                          {!rubricLoading && !rubricError && activeItem.rubric && activeItem.rubric.levels?.length > 0 && (
                            <div className={styles.rubricLevels}>
                              {activeItem.rubric.levels.map((lv: any) => {
                                const showTitle = typeof lv.title === "string" && lv.title.trim().length > 0 && lv.title.trim() !== (lv.description ?? "").trim();

                                return (
                                  <div key={lv.level} className={styles.rubricLevel}>
                                    <div className={styles.rubricLevelHeader}>
                                      <span className={styles.rubricLevelBadge}>{lv.level}</span>
                                      {showTitle && <span className={styles.rubricLevelTitle}>{lv.title}</span>}
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
              )}

              <section className={styles.rightColumn}>
                <div className={styles.studentPanel}>
                  <header className={styles.studentHeader}>
                    <div className={styles.studentHeaderTop}>
                      <h3 className={styles.studentTitle}>학생 답안 입력</h3>
                      <div className={styles.studentControls}>
                        {!showGuidePanel && (
                          <button
                            type="button"
                            className={styles.toggleGuideBtn}
                            onClick={() => setShowGuidePanel(true)}
                            aria-label="하위문항 및 루브릭 패널 보이기"
                            title="하위문항·루브릭 패널 보이기"
                          >
                            <span className={styles.toggleGuideIcon}>
                              {/* eye 스타일 */}
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M2.5 12C3.73 7.94 7.5 5 12 5s8.27 2.94 9.5 7c-1.23 4.06-5 7-9.5 7s-8.27-2.94-9.5-7z" fill="none" stroke="currentColor" strokeWidth="1.6" />
                                <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
                              </svg>
                            </span>
                          </button>
                        )}
                        <select className={styles.studentSelect} value={currentStudentId} onChange={(e) => handleChangeStudent(e.target.value)}>
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
                        선택된 진단 대상: {activeItem.id} · {activeItem.stepName} - {activeItem.subSkillName}
                      </span>
                    )}
                  </header>

                  {diagnosisItems.length > 0 ? (
                    <>
                      <p className={styles.studentAllDesc}>아래에서 모든 하위문항에 대한 학생 답안을 한 번에 입력할 수 있습니다. 왼쪽 탭은 참고용으로만 사용해 주세요.</p>
                      <div className={styles.studentAllList}>
                        {diagnosisItems.map((item) => {
                          const value =
                            studentAnswers[currentStudentId]?.[currentProblemKey]?.[
                              item.id
                            ] ?? "";
                          const result =
                            diagnosisResults[currentStudentId]?.[currentProblemKey]?.[
                              item.id
                            ];
                          const isActive = activeItem?.id === item.id;
                          return (
                            <div key={item.id} className={`${styles.studentAnswerBlock} ${isActive ? styles.studentAnswerBlockActive : ""}`}>
                              <div className={styles.studentAnswerHeader}>
                                <div className={styles.studentAnswerHeaderLeft}>
                                  <span className={styles.studentAnswerCode}>{item.displayCode}</span>
                                  <span className={styles.studentAnswerLabel}>
                                    {item.stepName} - {item.subSkillName}
                                  </span>
                                </div>
                                {result && <span className={styles.studentAnswerResult}>진단: {result.level}</span>}
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
                                onChange={(e) => handleStudentAnswerChange(item.id, e.target.value)}
                              />
                              {result?.reason && (
                                <div className={styles.studentFeedbackPanel}>
                                  <div className={styles.studentFeedbackHeader}>
                                    <span className={styles.studentFeedbackTitle}>
                                      진단 피드백 ({item.displayCode})
                                    </span>
                                    <span className={styles.studentFeedbackLevel}>
                                      진단: {result.level}
                                    </span>
                                  </div>
                                  <p className={styles.studentFeedbackBody}>
                                    {result.reason}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className={styles.studentActions}>
                        <button type="button" className={styles.studentSaveBtn} onClick={handleSaveCurrentStudentAnswers} disabled={saving}>
                          {saving ? "저장 중..." : "학생 답안 전체 저장"}
                        </button>
                        {canDiagnose[currentStudentId]?.[currentProblemKey] && activeItem && (
                          <button type="button" className={styles.studentDiagnoseBtn} onClick={handleRunDiagnosisForAll} disabled={bulkDiagnosing}>
                            {bulkDiagnosing ? "전체 진단 중..." : "전체 하위문항 진단"}
                          </button>
                        )}
                        {canDiagnose[currentStudentId]?.[currentProblemKey] &&
                          diagnosisItems.length > 0 &&
                          false && (
                          <button type="button" className={styles.studentDiagnoseBtn} onClick={handleRunDiagnosisForAll} disabled={bulkDiagnosing}>
                            {bulkDiagnosing ? "전체 진단 중..." : "전체 하위문항 진단"}
                          </button>
                        )}
                        {saveMessage && <span className={styles.studentSaveMessage}>{saveMessage}</span>}
                      </div>

                      {/* 개별 문항 진단 결과 요약 배지는 요약 섹션과 카드 상단에서 충분히 표현되므로,
                          별도의 상세 피드백 박스는 표시하지 않습니다. */}
                    </>
                  ) : (
                    <p className={styles.empty}>먼저 상단에서 문제를 선택하고, 좌측에서 하위문항을 불러와 주세요.</p>
                  )}
                </div>
              </section>
            </div>

            {diagnosisItems.length > 0 && (
              <section className={styles.studentSummary}>
                <h3 className={styles.studentSummaryTitle}>현재 학생 문항 요약</h3>
                <div className={styles.studentSummaryRow}>
                    {diagnosisItems.map((item) => {
                    const result =
                      diagnosisResults[currentStudentId]?.[currentProblemKey]?.[
                        item.id
                      ];
                    const hasAnswer = !!studentAnswers[currentStudentId]?.[
                      currentProblemKey
                    ]?.[item.id]?.trim();
                    const isActive = activeItem?.id === item.id;
                    return (
                      <button key={item.id} type="button" className={`${styles.studentSummaryChip} ${isActive ? styles.studentSummaryChipActive : ""}`} onClick={() => setActiveId(item.id)}>
                        <span className={styles.studentSummaryCode}>{item.displayCode}</span>
                        <span className={styles.studentSummaryStatus}>{result ? `진단: ${result.level}` : hasAnswer ? "답안 입력" : "미입력"}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {hasMultiProblemSummary && (
              <section className={styles.problemSummarySection}>
                <h3 className={styles.problemSummaryTitle}>이 학생의 문제별 진단 요약</h3>
                <div className={styles.problemSummaryTables}>
                  {/* 문제별 요약 표 */}
                  <div className={styles.problemSummaryBlock}>
                    <h4 className={styles.problemSummarySubTitle}>문제별 수준 요약</h4>
                    <table className={styles.problemSummaryTable}>
                      <thead>
                        <tr>
                          <th>문제 ID</th>
                          <th>진단한 단계 수</th>
                          <th>상</th>
                          <th>중</th>
                          <th>하</th>
                          <th>평균 수준</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryProblemIds.map((pid) => {
                          const s = summariesForCurrentStudent[pid];
                          const levels = Object.values(s.levelsByDisplayCode);
                          const total = levels.length || 0;
                          const high = levels.filter((l) => l === "상").length;
                          const mid = levels.filter((l) => l === "중").length;
                          const low = levels.filter((l) => l === "하").length;
                          const avgScore =
                            total > 0
                              ? levels.reduce((acc, lv) => acc + LEVEL_SCORE[lv as LevelType], 0) / total
                              : 0;
                          const avgLevel = total > 0 ? scoreToLevel(avgScore) : "-";
                          return (
                            <tr key={pid}>
                              <td>{pid}</td>
                              <td>{total}</td>
                              <td>{high}</td>
                              <td>{mid}</td>
                              <td>{low}</td>
                              <td>{avgLevel}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* 단계별 최종 수준 표 */}
                  <div className={styles.problemSummaryBlock}>
                    <h4 className={styles.problemSummarySubTitle}>단계별 최종 수준 (여러 문제 기준)</h4>
                    {(() => {
                      const perStepAgg: Record<
                        string,
                        {
                          count: number;
                          totalScore: number;
                        }
                      > = {};

                      summaryProblemIds.forEach((pid) => {
                        const s = summariesForCurrentStudent[pid];
                        Object.entries(s.levelsByDisplayCode).forEach(([code, level]) => {
                          const lv = level as LevelType;
                          if (!perStepAgg[code]) {
                            perStepAgg[code] = { count: 0, totalScore: 0 };
                          }
                          perStepAgg[code].count += 1;
                          perStepAgg[code].totalScore += LEVEL_SCORE[lv];
                        });
                      });

                      const rows = Object.entries(perStepAgg)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([code, v]) => {
                          const avgScore = v.totalScore / v.count;
                          const level = scoreToLevel(avgScore);
                          return { code, count: v.count, level };
                        });

                      if (!rows.length) {
                        return <p className={styles.problemSummaryEmpty}>아직 요약할 단계 진단 결과가 없습니다.</p>;
                      }

                      return (
                        <table className={styles.problemSummaryTable}>
                          <thead>
                            <tr>
                              <th>단계 코드</th>
                              <th>진단한 문제 수</th>
                              <th>최종 수준</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => (
                              <tr key={r.code}>
                                <td>{r.code}</td>
                                <td>{r.count}</td>
                                <td>{r.level}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </div>
              </section>
            )}
          </section>
        </div>
      </main>

      {reportOpen && summaryProblemIds.length > 0 && (
        <div className={styles.reportOverlay} role="dialog" aria-modal="true">
          <div className={styles.reportModal}>
            <header className={styles.reportHeader}>
              <div>
                <h2 className={styles.reportTitle}>학생 진단 리포트</h2>
                <p className={styles.reportSubtitle}>
                  {students.find((s) => s.id === currentStudentId)?.name} · 진단한 문제 수{" "}
                  {summaryProblemIds.length}개
                </p>
              </div>
              <button
                type="button"
                className={styles.reportCloseBtn}
                onClick={() => setReportOpen(false)}
              >
                닫기
              </button>
            </header>

            <div className={styles.reportBody}>
              <div className={styles.problemSummaryBlock}>
                <h4 className={styles.problemSummarySubTitle}>문제별 수준 요약</h4>
                {reportLoading && <p className={styles.problemSummaryEmpty}>리포트를 불러오는 중입니다...</p>}
                {reportError && !reportLoading && (
                  <p className={styles.problemSummaryEmpty}>{reportError}</p>
                )}
                {!reportLoading && !reportError && reportData && (
                  <table className={styles.problemSummaryTable}>
                    <thead>
                      <tr>
                        <th>문제 ID</th>
                        <th>진단한 단계 수</th>
                        <th>상</th>
                        <th>중</th>
                        <th>하</th>
                        <th>평균 수준</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.problem_rows.map((row) => (
                        <tr key={row.problem_id}>
                          <td>{row.problem_id}</td>
                          <td>{row.step_count}</td>
                          <td>{row.high_count}</td>
                          <td>{row.mid_count}</td>
                          <td>{row.low_count}</td>
                          <td>{row.average_level}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className={styles.problemSummaryBlock}>
                <h4 className={styles.problemSummarySubTitle}>단계별 최종 수준 (여러 문제 기준)</h4>
                {reportLoading && <p className={styles.problemSummaryEmpty}>리포트를 불러오는 중입니다...</p>}
                {reportError && !reportLoading && (
                  <p className={styles.problemSummaryEmpty}>{reportError}</p>
                )}
                {!reportLoading && !reportError && reportData && (
                  <>
                    {reportData.step_rows.length === 0 ? (
                      <p className={styles.problemSummaryEmpty}>
                        아직 요약할 단계 진단 결과가 없습니다.
                      </p>
                    ) : (
                      <table className={styles.problemSummaryTable}>
                        <thead>
                          <tr>
                            <th>단계 코드</th>
                            <th>진단한 문제 수</th>
                            <th>최종 수준</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.step_rows.map((row) => (
                            <tr key={row.display_code}>
                              <td>{row.display_code}</td>
                              <td>{row.problem_count}</td>
                              <td>{row.final_level}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
