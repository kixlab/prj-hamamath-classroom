import { useState, useEffect, useRef } from "react";
import styles from "./StudentDiagnosis.module.css";
import { useApp } from "../../contexts/AppContext";
import { useMathJax } from "../../hooks/useMathJax";
import { formatQuestion, formatAnswer } from "../../utils/formatting";
import { api } from "../../services/api";
import { getSavedResults } from "../../hooks/useStorage";
import { exportDiagnosisReportPdf } from "../../utils/exportDiagnosisReportPdf";

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
  /** 단계(display_code)별 LLM 진단 피드백(reason) */
  feedbackByDisplayCode?: Record<string, string>;
}

// 학생 진단 상태를 브라우저에 임시로 보관하기 위한 로컬 스토리지 키
const getStudentAnswersStorageKey = (userId: string) => `hamamath_student_answers_${userId}`; // 구버전 호환용
const getStudentDiagnosisStateKey = (userId: string) => `hamamath_student_diagnosis_state_${userId}`;

export const StudentDiagnosis = ({ userId, onClose }: StudentDiagnosisProps) => {
  const { currentProblemId, currentCotData, currentGuidelineData, finalizedGuidelineForRubric, currentRubrics } = useApp();

  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [diagnosisCotData, setDiagnosisCotData] = useState<any | null>(null);
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
  const isCurrentProblemSelected = !!problemIdForDiagnosis && problemIdForDiagnosis === currentProblemId;

  useEffect(() => {
    const fetchRubrics = async () => {
      if (!problemIdForDiagnosis) return;
      try {
        const result = await api.getResult(problemIdForDiagnosis);
        const saved = getSavedResults();
        const local = saved[problemIdForDiagnosis] || null;
        if (result) {
          // 메인 문제/정답/학년/수학 영역 등도 함께 저장된 CoT 데이터에서 가져온다.
          const cot = result.cotData || local?.cotData || null;
          setDiagnosisCotData(cot);

          const rubricsFromServer = Array.isArray((result as any).rubrics) ? (result as any).rubrics : null;
          const rubricsFromLocal = Array.isArray((local as any)?.rubrics) ? (local as any).rubrics : null;
          setApiRubrics(rubricsFromServer ?? rubricsFromLocal ?? null);

          const gd = (result as any).guidelineData || (local as any)?.guidelineData || null;
          if (gd?.guide_sub_questions && Array.isArray(gd.guide_sub_questions)) {
            setApiGuideSubQuestions(gd.guide_sub_questions);
          } else {
            setApiGuideSubQuestions(null);
          }
        } else {
          // 서버에 결과가 없으면 로컬 저장 결과라도 최대한 사용
          if (local) {
            setDiagnosisCotData(local.cotData ?? null);
            setApiRubrics((local as any).rubrics ?? null);
            const gd = (local as any).guidelineData;
            if (gd?.guide_sub_questions && Array.isArray(gd.guide_sub_questions)) {
              setApiGuideSubQuestions(gd.guide_sub_questions);
            } else {
              setApiGuideSubQuestions(null);
            }
          } else {
            setDiagnosisCotData(null);
            setApiRubrics(null);
            setApiGuideSubQuestions(null);
          }
        }
      } catch (err: any) {
        console.error("루브릭 불러오기 오류:", err);
        setDiagnosisCotData(null);
        setApiRubrics(null);
        setApiGuideSubQuestions(null);
      }
    };
    fetchRubrics();
  }, [problemIdForDiagnosis]);

  // 현재 워크플로우에서 작업 중인 문제를 선택한 경우에는,
  // 3·4단계에서 수정된 최신 문항/루브릭(컨텍스트 값)을 우선 사용하고,
  // 그 외(이전에 저장만 된 다른 문제)는 서버에 저장된 값(API 응답)을 사용한다.
  const rubrics = (isCurrentProblemSelected ? (currentRubrics ?? apiRubrics ?? []) : (apiRubrics ?? [])) as any[];

  // 하위문항 소스 우선순위:
  // - 현재 문제를 진단하는 경우: 3단계 확정 JSON → API 저장값 → 현재 가이드라인
  // - 과거 문제를 진단하는 경우: API 저장값만 사용
  const guideSubQuestions: any[] = isCurrentProblemSelected
    ? ((finalizedGuidelineForRubric as any)?.guide_sub_questions ?? apiGuideSubQuestions ?? ((currentGuidelineData as any)?.guide_sub_questions as any[] | undefined) ?? [])
    : (apiGuideSubQuestions ?? ((currentGuidelineData as any)?.guide_sub_questions as any[] | undefined) ?? []);

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
  const [studentAnswers, setStudentAnswers] = useState<Record<string, Record<string, Record<string, string>>>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  // 학생별·문제별로 최소 한 번 이상 저장이 완료되었는지 여부
  const [canDiagnose, setCanDiagnose] = useState<Record<string, Record<string, boolean>>>({});
  const [bulkDiagnosing, setBulkDiagnosing] = useState(false);
  // diagnosisResults[studentId][problemKey][subQuestionId] = { level, reason }
  const [diagnosisResults, setDiagnosisResults] = useState<Record<string, Record<string, Record<string, { level: string; reason: string }>>>>({});
  // 하위문항 카드별 정답/루브릭 보기 토글 상태
  const [showAnswerById, setShowAnswerById] = useState<Record<string, boolean>>({});
  const [showRubricById, setShowRubricById] = useState<Record<string, boolean>>({});
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
      score_100?: number;
      final_level: string;
      /** 단계별 LLM 피드백 요약 (여러 문제 피드백 통합) */
      feedback_summary?: string | null;
    }>;
  } | null>(null);
  // 리포트 단계별 피드백(요약)을 사용자가 수정할 수 있도록 display_code 기준 편집 상태
  const [reportFeedbackEdits, setReportFeedbackEdits] = useState<Record<string, string>>({});
  // 학생별 · 문제별 단계 수준 요약 (여러 문제 진단 결과를 표로 보여주기 위함)
  const [studentProblemSummaries, setStudentProblemSummaries] = useState<Record<string, Record<string, ProblemStepSummary>>>({});
  // 마운트 후 저장 effect 첫 실행 시 localStorage 덮어쓰기 방지 (복원이 적용된 뒤에만 저장)
  const saveEffectHasRunRef = useRef(false);
  // "답안 없음" 알림 시 원인 확인용 (화면에 표시)
  const [debugNoAnswerReason, setDebugNoAnswerReason] = useState<{
    answersKeys: string[];
    itemsDetail: Array<{ id: string; displayCode: string; hasRubric: boolean; valueByDisplayCode: string; valueById: string }>;
    currentProblemKey: string;
  } | null>(null);

  // 브라우저 로컬 스토리지에서 기존 학생 진단 상태 복원
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(getStudentDiagnosisStateKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          if (parsed.studentAnswers && typeof parsed.studentAnswers === "object") {
            setStudentAnswers(parsed.studentAnswers);
          }
          if (parsed.diagnosisResults && typeof parsed.diagnosisResults === "object") {
            setDiagnosisResults(parsed.diagnosisResults);
          }
          if (parsed.canDiagnose && typeof parsed.canDiagnose === "object") {
            setCanDiagnose(parsed.canDiagnose);
          }
          if (parsed.studentProblemSummaries && typeof parsed.studentProblemSummaries === "object") {
            setStudentProblemSummaries(parsed.studentProblemSummaries);
          }
          if (parsed.currentStudentId && typeof parsed.currentStudentId === "string") {
            setCurrentStudentId(parsed.currentStudentId);
          }
          if (parsed.selectedProblemId && typeof parsed.selectedProblemId === "string") {
            setSelectedProblemId(parsed.selectedProblemId);
          }
        }
      } else {
        // 구버전(답안만 저장)과의 호환
        const legacyRaw = window.localStorage.getItem(getStudentAnswersStorageKey(userId));
        if (legacyRaw) {
          const legacyParsed = JSON.parse(legacyRaw);
          if (legacyParsed && typeof legacyParsed === "object") {
            setStudentAnswers(legacyParsed);
          }
        }
      }
    } catch (err) {
      console.error("저장된 학생 진단 상태를 불러오는 중 오류:", err);
    }
  }, [userId]);

  // 서버에 저장된 학생 답안 불러와서 복원 (새로고침 후 빈 화면 방지)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { items } = await api.getStudentAnswersList();
        if (cancelled || !items?.length) return;
        setStudentAnswers((prev) => {
          const next = JSON.parse(JSON.stringify(prev));
          for (const item of items) {
            if (!item.student_id || !item.problem_id) continue;
            if (!next[item.student_id]) next[item.student_id] = {};
            next[item.student_id][item.problem_id] = { ...(next[item.student_id][item.problem_id] ?? {}), ...(item.answers || {}) };
          }
          return next;
        });
      } catch (err) {
        if (!cancelled) console.error("저장된 학생 답안 목록 불러오기 오류:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 서버에 저장된 진단 결과 불러와서 studentProblemSummaries에 병합
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { items } = await api.getDiagnosisResultsList();
        if (cancelled || !items?.length) return;
        setStudentProblemSummaries((prev) => {
          const next = JSON.parse(JSON.stringify(prev));
          for (const item of items) {
            if (!item.student_id || !item.problem_id || !item.levels_by_display_code) continue;
            if (!next[item.student_id]) next[item.student_id] = {};
            next[item.student_id][item.problem_id] = {
              problemId: item.problem_id,
              levelsByDisplayCode: item.levels_by_display_code,
              feedbackByDisplayCode: item.feedback_by_display_code,
            };
          }
          return next;
        });
      } catch (err) {
        if (!cancelled) console.error("저장된 진단 결과 목록 불러오기 오류:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // studentProblemSummaries(서버 복원 포함) → 현재 학생/문제의 diagnosisResults 동기화 (displayCode → item.id)
  const problemKeyForSync = problemIdForDiagnosis ?? "__current__";
  const summaryForSync = studentProblemSummaries[currentStudentId]?.[problemKeyForSync];
  useEffect(() => {
    if (!summaryForSync?.levelsByDisplayCode || !diagnosisItems.length) return;
    setDiagnosisResults((prev) => {
      const cur = prev[currentStudentId]?.[problemKeyForSync] ?? {};
      let changed = false;
      const nextForProblem = { ...cur };
      for (const item of diagnosisItems) {
        const level = summaryForSync.levelsByDisplayCode[item.displayCode];
        const reason = summaryForSync.feedbackByDisplayCode?.[item.displayCode] ?? "";
        if (level && !nextForProblem[item.id]) {
          nextForProblem[item.id] = { level, reason };
          changed = true;
        }
      }
      if (!changed) return prev;
      return {
        ...prev,
        [currentStudentId]: {
          ...(prev[currentStudentId] ?? {}),
          [problemKeyForSync]: nextForProblem,
        },
      };
    });
  }, [currentStudentId, problemKeyForSync, summaryForSync, diagnosisItems.length]);

  // 동일 로그인 id·문제·학생에 해당하는 저장 답안이 있으면 화면에 표시
  useEffect(() => {
    if (!problemIdForDiagnosis || !currentStudentId) return;
    let cancelled = false;
    (async () => {
      try {
        const item = await api.getStudentAnswers(problemIdForDiagnosis, currentStudentId);
        if (cancelled) return;
        const problemKey = problemIdForDiagnosis;
        setStudentAnswers((prev) => {
          const existing = prev[currentStudentId]?.[problemKey] ?? {};
          const fromServer = item?.answers && typeof item.answers === "object" ? item.answers : {};
          // 서버 값으로 채우되, 이미 입력된 값(현재 세션)은 유지해 덮어쓰지 않음
          const merged = { ...fromServer, ...existing };
          return {
            ...prev,
            [currentStudentId]: {
              ...(prev[currentStudentId] ?? {}),
              [problemKey]: merged,
            },
          };
        });
      } catch (err) {
        if (!cancelled) console.error("저장된 학생 답안(단건) 불러오기 오류:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, problemIdForDiagnosis, currentStudentId]);

  // 학생 진단 상태가 변경될 때마다 로컬 스토리지에 자동 저장
  // 마운트 직후 첫 실행에서는 복원 전 빈 state로 덮어쓰지 않도록 스킵
  useEffect(() => {
    if (!saveEffectHasRunRef.current) {
      saveEffectHasRunRef.current = true;
      return;
    }
    try {
      const stateToSave = {
        studentAnswers,
        diagnosisResults,
        canDiagnose,
        studentProblemSummaries,
        currentStudentId,
        selectedProblemId,
      };
      window.localStorage.setItem(getStudentDiagnosisStateKey(userId), JSON.stringify(stateToSave));
    } catch (err) {
      console.error("학생 진단 상태를 저장하는 중 오류:", err);
    }
  }, [userId, studentAnswers, diagnosisResults, canDiagnose, studentProblemSummaries, currentStudentId, selectedProblemId]);

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

  const handleStudentAnswerChange = (displayCode: string, value: string) => {
    setStudentAnswers((prev) => ({
      ...prev,
      [currentStudentId]: {
        ...(prev[currentStudentId] ?? {}),
        [currentProblemKey]: {
          ...(prev[currentStudentId]?.[currentProblemKey] ?? {}),
          [displayCode]: value,
        },
      },
    }));
    setSaveMessage(null);
  };

  // 현재 학생의 모든 하위문항(답안이 있는 것만)을 한 번에 진단
  const handleRunDiagnosisForAll = async () => {
    console.warn("[진단] 전체 하위문항 진단 버튼 클릭됨");
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

    const answersForStudent = studentAnswers[currentStudentId]?.[currentProblemKey] || {};
    const targetItems = diagnosisItems.filter((item) => {
      const text = (answersForStudent[item.displayCode] ?? answersForStudent[item.id] ?? "").trim();
      return !!(item.rubric && item.rubric.levels?.length && text.length > 0);
    });

    if (!targetItems.length) {
      const itemsDetail = diagnosisItems.slice(0, 15).map((item) => ({
        id: item.id,
        displayCode: item.displayCode,
        hasRubric: !!(item.rubric && item.rubric.levels?.length),
        valueByDisplayCode: answersForStudent[item.displayCode] ?? "(없음)",
        valueById: answersForStudent[item.id] ?? "(없음)",
      }));
      setDebugNoAnswerReason({
        answersKeys: Object.keys(answersForStudent),
        itemsDetail,
        currentProblemKey,
      });
      console.warn("[진단] 답안 없음 원인 확인", { currentStudentId, currentProblemKey, answersKeys: Object.keys(answersForStudent), itemsDetail });
      alert("답안이 입력된 하위문항이 없습니다. 먼저 학생 답안을 입력해 주세요.");
      return;
    }

    setDebugNoAnswerReason(null);
    setBulkDiagnosing(true);
    try {
      const newResultsForStudent: Record<string, { level: string; reason: string }> = {
        ...(diagnosisResults[currentStudentId]?.[currentProblemKey] ?? {}),
      };

      for (const item of targetItems) {
        const answerText = answersForStudent[item.displayCode] ?? answersForStudent[item.id] ?? "";

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

      // 이 학생의 현재 문제에 대한 단계별 수준·피드백 요약 저장 (표·리포트용)
      const levelOnlyByDisplayCode: Record<string, "상" | "중" | "하"> = {};
      const feedbackByDisplayCode: Record<string, string> = {};
      targetItems.forEach((item) => {
        const res = newResultsForStudent[item.id];
        if (res?.level === "상" || res?.level === "중" || res?.level === "하") {
          levelOnlyByDisplayCode[item.displayCode] = res.level;
        }
        if (res?.reason?.trim()) {
          feedbackByDisplayCode[item.displayCode] = res.reason.trim();
        }
      });

      if (Object.keys(levelOnlyByDisplayCode).length > 0 && problemIdForDiagnosis) {
        setStudentProblemSummaries((prev) => {
          const perStudent = { ...(prev[currentStudentId] ?? {}) };
          perStudent[problemIdForDiagnosis] = {
            problemId: problemIdForDiagnosis,
            levelsByDisplayCode: levelOnlyByDisplayCode,
            feedbackByDisplayCode: Object.keys(feedbackByDisplayCode).length > 0 ? feedbackByDisplayCode : undefined,
          };
          return {
            ...prev,
            [currentStudentId]: perStudent,
          };
        });
        // 진단 결과 서버 저장
        try {
          await api.saveDiagnosisResults({
            user_id: userId,
            student_id: currentStudentId,
            problem_id: problemIdForDiagnosis,
            levels_by_display_code: levelOnlyByDisplayCode,
            feedback_by_display_code: Object.keys(feedbackByDisplayCode).length > 0 ? feedbackByDisplayCode : undefined,
          });
        } catch (err: any) {
          console.error("진단 결과 서버 저장 오류:", err);
        }
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
    const answersForStudent = studentAnswers[currentStudentId]?.[currentProblemKey] || {};
    const answersToSave: Record<string, string> = {};
    diagnosisItems.forEach((item) => {
      const v = answersForStudent[item.displayCode] ?? answersForStudent[item.id];
      if (v != null && String(v).trim() !== "") answersToSave[item.displayCode] = String(v).trim();
    });
    if (!Object.keys(answersToSave).length) {
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
        answers: answersToSave,
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

  const containerRef = useMathJax([activeId, activeItem, finalizedGuidelineForRubric, currentRubrics, currentStudentId, studentAnswers]);

  // 한 학생이 여러 문제를 진단한 경우, 표 요약용 파생 데이터 계산
  const summariesForCurrentStudent = studentProblemSummaries[currentStudentId] ?? {};
  const summaryProblemIds = Object.keys(summariesForCurrentStudent);
  const hasMultiProblemSummary = summaryProblemIds.length >= 2;

  // 하: 0점 / 중: 1점 / 상: 2점
  type LevelType = "상" | "중" | "하";
  const LEVEL_SCORE: Record<LevelType, number> = { 상: 2, 중: 1, 하: 0 };
  const scoreToLevel = (score: number): LevelType => {
    if (score >= 1.5) return "상";
    if (score >= 0.5) return "중";
    return "하";
  };

  // 문제 풀이 단계(이미지 기준): 1=문제 이해, 2=정보 구조화, 3=수학적 표현, 4=수학적 계산
  const STEP_GROUP_LABELS: Record<string, string> = {
    "1": "문제 이해",
    "2": "정보 구조화",
    "3": "수학적 표현",
    "4": "수학적 계산",
  };
  // 세부 역량(이미지 기준)
  const STEP_DETAIL_LABELS: Record<string, string> = {
    "1-1": "핵심 정보 파악하기",
    "1-2": "문제 요지 확인하기",
    "2-1": "조건 정리하기",
    "2-2": "조건 연결하기",
    "3-1": "지식 활용하기",
    "3-2": "식, 모델 세우기",
    "4-1": "계산 실행하기",
    "4-2": "결과 정리하기",
  };
  const getStepGroupInfo = (displayCode: string) => {
    const [group] = displayCode.split("-");
    const stageLabel = STEP_GROUP_LABELS[group] || `${group}단계`;
    const detailLabel = STEP_DETAIL_LABELS[displayCode] || stageLabel;
    return { group, stageLabel, detailLabel };
  };
  // 100점 만점을 5등급: 상 80+, 중상 60+, 중 40+, 중하 20+, 하 20 미만
  const scoreToGradeFrom100 = (score_100: number): "상" | "중상" | "중" | "중하" | "하" | "-" => {
    if (score_100 < 0 || score_100 > 100) return "-";
    if (score_100 >= 80) return "상";
    if (score_100 >= 60) return "중상";
    if (score_100 >= 40) return "중";
    if (score_100 >= 20) return "중하";
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
          feedback_by_display_code: perStudent[pid].feedbackByDisplayCode ?? {},
        })),
      };
      const data = await api.generateStudentDiagnosisReport(payload);
      setReportData(data);
      // 단계(display_code)별 LLM 요약 피드백을 편집 상태로 초기화
      const initialEdits: Record<string, string> = {};
      (data.step_rows || []).forEach((row) => {
        if (row.feedback_summary && typeof row.feedback_summary === "string") {
          initialEdits[row.display_code] = row.feedback_summary;
        }
      });
      setReportFeedbackEdits(initialEdits);
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
                const answersForProblem = studentAnswers[s.id]?.[currentProblemKey] ?? {};
                const answeredCount = Object.values(answersForProblem).filter((v) => !!v?.trim()).length;
                const diagnosedForProblem = diagnosisResults[s.id]?.[currentProblemKey] ?? {};
                const diagnosedCount = Object.keys(diagnosedForProblem).length;
                const total = diagnosisItems.length || 0;
                const isActiveStudent = currentStudentId === s.id;
                return (
                  <button key={s.id} type="button" className={`${styles.studentListItem} ${isActiveStudent ? styles.studentListItemActive : ""}`} onClick={() => setCurrentStudentId(s.id)}>
                    <div className={styles.studentListName}>
                      {idx + 1}. {s.name}
                    </div>
                    <div className={styles.studentListMeta}>{total > 0 ? `답안 ${answeredCount} · 진단 ${diagnosedCount}/${total}` : "문항 없음"}</div>
                  </button>
                );
              })}
            </div>
            <button type="button" className={styles.addStudentBtn} onClick={handleAddStudent}>
              + 학생 추가
            </button>
            {summaryProblemIds.length > 0 && (
              <button type="button" className={styles.reportBtn} onClick={openReport}>
                학생 진단 리포트
              </button>
            )}
          </aside>

          {/* 우측: 학생 답안/진단 */}
          <section className={styles.mainColumn}>
            <div className={styles.contentSingle}>
              <section className={styles.rightColumn}>
                <div className={styles.studentPanel}>
                  <header className={styles.studentHeader}>
                    <div className={styles.studentHeaderTop}>
                      <h3 className={styles.studentTitle}>학생 답안 입력</h3>
                      <div className={styles.studentControls}>
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
                      <p className={styles.studentAllDesc}>아래에서 모든 하위문항에 대한 학생 답안을 한 번에 입력할 수 있습니다.</p>
                      {(() => {
                        const currentAnswers = studentAnswers[currentStudentId]?.[currentProblemKey] ?? {};
                        const hasSaved = Object.values(currentAnswers).some((v) => !!v?.trim());
                        return hasSaved ? <p className={styles.studentSavedHint}>저장된 답안이 불러와졌습니다. 수정 후 다시 저장할 수 있습니다.</p> : null;
                      })()}
                      <div className={styles.studentAllList}>
                        {diagnosisItems.map((item) => {
                          const value = studentAnswers[currentStudentId]?.[currentProblemKey]?.[item.displayCode] ?? studentAnswers[currentStudentId]?.[currentProblemKey]?.[item.id] ?? "";
                          const result = diagnosisResults[currentStudentId]?.[currentProblemKey]?.[item.id];
                          const isActive = activeItem?.id === item.id;
                          const showAnswer = !!showAnswerById[item.id];
                          const showRubric = !!showRubricById[item.id];
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
                                onChange={(e) => handleStudentAnswerChange(item.displayCode, e.target.value)}
                              />
                              <div className={styles.studentAnswerToggles}>
                                {item.answer && (
                                  <button
                                    type="button"
                                    className={`${styles.studentToggleBtn} ${showAnswer ? styles.studentToggleBtnActive : ""}`}
                                    onClick={() =>
                                      setShowAnswerById((prev) => ({
                                        ...prev,
                                        [item.id]: !prev[item.id],
                                      }))
                                    }
                                  >
                                    정답 보기
                                  </button>
                                )}
                                {item.rubric && item.rubric.levels?.length > 0 && (
                                  <button
                                    type="button"
                                    className={`${styles.studentToggleBtn} ${showRubric ? styles.studentToggleBtnActive : ""}`}
                                    onClick={() =>
                                      setShowRubricById((prev) => ({
                                        ...prev,
                                        [item.id]: !prev[item.id],
                                      }))
                                    }
                                  >
                                    루브릭 보기
                                  </button>
                                )}
                              </div>
                              {showAnswer && item.answer && (
                                <div className={styles.studentAnswerSolution}>
                                  <span className={styles.studentAnswerSolutionLabel}>정답</span>
                                  <span
                                    className={styles.studentAnswerSolutionText}
                                    dangerouslySetInnerHTML={{
                                      __html: formatAnswer(item.answer),
                                    }}
                                  />
                                </div>
                              )}
                              {showRubric && item.rubric && item.rubric.levels?.length > 0 && (
                                <div className={styles.studentRubricInline}>
                                  {item.rubric.levels.map((lv: any) => {
                                    const showTitle = typeof lv.title === "string" && lv.title.trim().length > 0 && lv.title.trim() !== (lv.description ?? "").trim();
                                    return (
                                      <div key={lv.level} className={styles.studentRubricLevel}>
                                        <div className={styles.studentRubricLevelHeader}>
                                          <span className={styles.studentRubricBadge}>{lv.level}</span>
                                          {showTitle && <span className={styles.studentRubricTitle}>{lv.title}</span>}
                                        </div>
                                        {Array.isArray(lv.bullets) && lv.bullets.length > 0 && (
                                          <ul className={styles.studentRubricBullets}>
                                            {lv.bullets.map((b: string, i: number) => (
                                              <li key={i}>{b}</li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {result?.reason && (
                                <div className={styles.studentFeedbackPanel}>
                                  <div className={styles.studentFeedbackHeader}>
                                    <span className={styles.studentFeedbackTitle}>진단 피드백 ({item.displayCode})</span>
                                    <span className={styles.studentFeedbackLevel}>진단: {result.level}</span>
                                  </div>
                                  <p className={styles.studentFeedbackBody}>{result.reason}</p>
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
                        {canDiagnose[currentStudentId]?.[currentProblemKey] && diagnosisItems.length > 0 && false && (
                          <button type="button" className={styles.studentDiagnoseBtn} onClick={handleRunDiagnosisForAll} disabled={bulkDiagnosing}>
                            {bulkDiagnosing ? "전체 진단 중..." : "전체 하위문항 진단"}
                          </button>
                        )}
                        {saveMessage && <span className={styles.studentSaveMessage}>{saveMessage}</span>}
                      </div>

                      {debugNoAnswerReason && (
                        <div style={{ marginTop: 12, padding: 12, background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8 }}>
                          <div style={{ fontWeight: 600, marginBottom: 8 }}>답안 없음 원인 (확인 후 닫기)</div>
                          <div style={{ fontSize: 12 }}>
                            <p>
                              <strong>저장된 답안 키:</strong> {debugNoAnswerReason.answersKeys.length ? debugNoAnswerReason.answersKeys.join(", ") : "(비어 있음)"}
                            </p>
                            <p>
                              <strong>문제 키:</strong> {debugNoAnswerReason.currentProblemKey}
                            </p>
                            <p>
                              <strong>문항별 매칭:</strong>
                            </p>
                            <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                              {debugNoAnswerReason.itemsDetail.map((row, i) => (
                                <li key={i}>
                                  id={row.id}, displayCode={row.displayCode}, rubric={row.hasRubric ? "O" : "X"} · displayCode값={String(row.valueByDisplayCode).slice(0, 20)} · id값=
                                  {String(row.valueById).slice(0, 20)}
                                </li>
                              ))}
                            </ul>
                            <p style={{ marginTop: 8 }}>키가 다르면(예: 저장은 SQ-1, 문항은 1-1) 매칭이 안 됩니다. 입력 후 저장하고 다시 진단해 보세요.</p>
                          </div>
                          <button type="button" onClick={() => setDebugNoAnswerReason(null)} style={{ marginTop: 8 }}>
                            닫기
                          </button>
                        </div>
                      )}

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
                    const result = diagnosisResults[currentStudentId]?.[currentProblemKey]?.[item.id];
                    const hasAnswer = !!(studentAnswers[currentStudentId]?.[currentProblemKey]?.[item.displayCode] ?? studentAnswers[currentStudentId]?.[currentProblemKey]?.[item.id])?.trim();
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
                          const avgScore = total > 0 ? levels.reduce((acc, lv) => acc + LEVEL_SCORE[lv as LevelType], 0) / total : 0;
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
                  {students.find((s) => s.id === currentStudentId)?.name} · 진단한 문제 수 {summaryProblemIds.length}개
                </p>
              </div>
              <div className={styles.reportHeaderActions}>
                <button
                  type="button"
                  className={styles.reportPdfBtn}
                  disabled={reportLoading || !!reportError || !reportData}
                  onClick={async () => {
                    if (!reportData) return;
                    const perStudent = studentProblemSummaries[currentStudentId] ?? {};
                    try {
                      await exportDiagnosisReportPdf(reportData, students.find((s) => s.id === currentStudentId)?.name ?? "학생", currentStudentId, perStudent);
                    } catch (err: any) {
                      console.error("진단 리포트 PDF 내보내기 오류:", err);
                      alert(err?.message ?? "PDF 저장 중 오류가 발생했습니다.");
                    }
                  }}
                >
                  PDF 다운로드
                </button>
                <button type="button" className={styles.reportCloseBtn} onClick={() => setReportOpen(false)}>
                  닫기
                </button>
              </div>
            </header>

            <div className={styles.reportBody}>
              <div className={styles.problemSummaryBlock}>
                <h4 className={styles.problemSummarySubTitle}>문제별 수준 요약</h4>
                {reportLoading && <p className={styles.problemSummaryEmpty}>리포트를 불러오는 중입니다...</p>}
                {reportError && !reportLoading && <p className={styles.problemSummaryEmpty}>{reportError}</p>}
                {!reportLoading && !reportError && reportData && (
                  <>
                    <table className={styles.problemSummaryTable}>
                      <thead>
                        <tr>
                          <th>문제 ID</th>
                          <th>진단한 단계 수</th>
                          <th>상</th>
                          <th>중</th>
                          <th>하</th>
                          <th>평균 등급</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.problem_rows.map((row) => {
                          const total = row.high_count + row.mid_count + row.low_count || 0;
                          const sum = total > 0 ? row.high_count * 2 + row.mid_count * 1 + row.low_count * 0 : 0;
                          const score_100 = total > 0 ? (sum / (total * 2)) * 100 : 0;
                          const grade = total > 0 ? scoreToGradeFrom100(score_100) : "-";
                          return (
                            <tr key={row.problem_id}>
                              <td>{row.problem_id}</td>
                              <td>{row.step_count}</td>
                              <td>{row.high_count}</td>
                              <td>{row.mid_count}</td>
                              <td>{row.low_count}</td>
                              <td>{grade}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className={styles.reportGraphList}>
                      {reportData.problem_rows.map((row) => {
                        const total = row.high_count + row.mid_count + row.low_count || 0;
                        const sum = total > 0 ? row.high_count * 2 + row.mid_count * 1 + row.low_count * 0 : 0;
                        const score_100 = total > 0 ? (sum / (total * 2)) * 100 : 0;
                        const grade = total > 0 ? scoreToGradeFrom100(score_100) : "-";
                        return (
                          <div key={`graph-${row.problem_id}`} className={styles.reportGraphItem}>
                            <div className={styles.reportGraphHeader}>
                              <span className={styles.reportGraphTitle}>{row.problem_id}</span>
                              <div className={styles.reportGraphHeaderRight}>
                                <span className={styles.reportGraphLevelBadge}>{grade}</span>
                                <span className={styles.reportGraphScoreText}>{Math.round(score_100)}점</span>
                              </div>
                            </div>
                            <div className={styles.reportGraphBar}>
                              <div className={`${styles.reportGraphSegment} ${styles.reportGraphHigh}`} style={{ width: `${score_100}%` }} />
                            </div>
                            <div className={styles.reportGraphLegend}>
                              <span>상 {row.high_count}</span>
                              <span>중 {row.mid_count}</span>
                              <span>하 {row.low_count}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className={styles.problemSummaryBlock}>
                <h4 className={styles.problemSummarySubTitle}>
                  단계별 최종 수준
                  {reportData ? ` (진단한 문제 수: ${reportData.problem_rows.length}개)` : " (여러 문제 기준)"}
                </h4>
                {reportLoading && <p className={styles.problemSummaryEmpty}>리포트를 불러오는 중입니다...</p>}
                {reportError && !reportLoading && <p className={styles.problemSummaryEmpty}>{reportError}</p>}
                {!reportLoading && !reportError && reportData && (
                  <>
                    {reportData.step_rows.length === 0 ? (
                      <p className={styles.problemSummaryEmpty}>아직 요약할 단계 진단 결과가 없습니다.</p>
                    ) : (
                      <>
                        <table className={styles.problemSummaryTable}>
                          <thead>
                            <tr>
                              <th className={styles.reportTableThStage}>문제 풀이 단계</th>
                              <th>세부 역량</th>
                              <th>점수(100)</th>
                              <th>최종 등급</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const perStudent = studentProblemSummaries[currentStudentId] ?? {};
                              const sorted = [...reportData.step_rows].sort((a, b) => a.display_code.localeCompare(b.display_code, undefined, { numeric: true }));
                              const byGroup: Record<string, typeof sorted> = {};
                              sorted.forEach((row) => {
                                const g = getStepGroupInfo(row.display_code).group;
                                if (!byGroup[g]) byGroup[g] = [];
                                byGroup[g].push(row);
                              });
                              const order = ["1", "2", "3", "4"];
                              return order.flatMap((g) =>
                                (byGroup[g] || []).map((row, idx) => {
                                  const info = getStepGroupInfo(row.display_code);
                                  const problemIds = Object.keys(perStudent);
                                  let sum = 0,
                                    stepCount = 0;
                                  problemIds.forEach((pid) => {
                                    const level = perStudent[pid].levelsByDisplayCode?.[row.display_code];
                                    if (level === "상" || level === "중" || level === "하") {
                                      sum += LEVEL_SCORE[level as LevelType];
                                      stepCount += 1;
                                    }
                                  });
                                  const score_100 = stepCount > 0 ? (sum / (stepCount * 2)) * 100 : 0;
                                  const grade = stepCount > 0 ? scoreToGradeFrom100(score_100) : "-";
                                  const isFirst = idx === 0;
                                  const span = (byGroup[g] || []).length;
                                  return (
                                    <tr key={row.display_code}>
                                      {isFirst && (
                                        <td rowSpan={span} className={styles.reportStageTd}>
                                          {info.stageLabel}
                                        </td>
                                      )}
                                      <td className={styles.reportDetailTd}>
                                        <span className={styles.stepCodeText}>{row.display_code}</span>
                                        <span className={styles.stepAbilityText}>{info.detailLabel}</span>
                                      </td>
                                      <td>{stepCount > 0 ? Math.round(score_100) : "-"}</td>
                                      <td>{grade}</td>
                                    </tr>
                                  );
                                }),
                              );
                            })()}
                          </tbody>
                        </table>
                        <div className={styles.reportGraphList}>
                          {(() => {
                            const sorted = [...reportData.step_rows].sort((a, b) => a.display_code.localeCompare(b.display_code, undefined, { numeric: true }));
                            const byGroup: Record<string, typeof sorted> = {};
                            sorted.forEach((row) => {
                              const g = getStepGroupInfo(row.display_code).group;
                              if (!byGroup[g]) byGroup[g] = [];
                              byGroup[g].push(row);
                            });
                            const order = ["1", "2", "3", "4"];
                            return order.map((g) => {
                              const rows = byGroup[g] || [];
                              if (rows.length === 0) return null;
                              const stageLabel = STEP_GROUP_LABELS[g] || `${g}단계`;
                              const groupClass = g === "1" ? styles.reportStepGroup1 : g === "2" ? styles.reportStepGroup2 : g === "3" ? styles.reportStepGroup3 : styles.reportStepGroup4;
                              return (
                                <div key={`graph-group-${g}`} className={styles.reportGraphGroup}>
                                  <div className={`${styles.reportGraphGroupTitle} ${groupClass}`}>{stageLabel}</div>
                                  <div className={styles.reportGraphGroupItems}>
                                    {rows.map((row) => {
                                      const info = getStepGroupInfo(row.display_code);
                                      const perStudent = studentProblemSummaries[currentStudentId] ?? {};
                                      const problemIds = Object.keys(perStudent);
                                      let sum = 0,
                                        stepCount = 0;
                                      problemIds.forEach((pid) => {
                                        const level = perStudent[pid].levelsByDisplayCode?.[row.display_code];
                                        if (level === "상" || level === "중" || level === "하") {
                                          sum += LEVEL_SCORE[level as LevelType];
                                          stepCount += 1;
                                        }
                                      });
                                      const score_100 = stepCount > 0 ? (sum / (stepCount * 2)) * 100 : 0;
                                      const grade = stepCount > 0 ? scoreToGradeFrom100(score_100) : "-";
                                      const feedbackValue =
                                        reportFeedbackEdits[row.display_code] ??
                                        row.feedback_summary ??
                                        "";
                                      return (
                                        <div key={`step-graph-${row.display_code}`} className={styles.reportGraphItem}>
                                          <div className={styles.reportGraphHeader}>
                                            <span className={styles.reportGraphTitle}>
                                              {row.display_code} · {info.detailLabel}
                                            </span>
                                            <div className={styles.reportGraphHeaderRight}>
                                              <span className={`${styles.reportGraphLevelBadge} ${groupClass}`}>{grade}</span>
                                              <span className={styles.reportGraphScoreText}>{Math.round(score_100)}점</span>
                                            </div>
                                          </div>
                                          <div className={styles.reportGraphBar}>
                                            <div className={`${styles.reportGraphSegment} ${styles.reportGraphStepFill} ${groupClass}`} style={{ width: `${score_100}%` }} />
                                          </div>
                                          <div className={styles.reportGraphFeedbackEdit}>
                                            <label className={styles.reportGraphFeedbackLabel}>
                                              리포트용 단계별 피드백
                                            </label>
                                            <textarea
                                              className={styles.reportGraphFeedbackTextarea}
                                              rows={3}
                                              value={feedbackValue}
                                              placeholder="이 단계에 대한 학생의 강점·보완점 등을 간단히 적어 주세요."
                                              onChange={(e) => {
                                                const value = e.target.value;
                                                setReportFeedbackEdits((prev) => ({
                                                  ...prev,
                                                  [row.display_code]: value,
                                                }));
                                                setReportData((prev) =>
                                                  prev
                                                    ? {
                                                        ...prev,
                                                        step_rows: prev.step_rows.map((r) =>
                                                          r.display_code === row.display_code
                                                            ? { ...r, feedback_summary: value || null }
                                                            : r,
                                                        ),
                                                      }
                                                    : prev,
                                                );
                                              }}
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </>
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
