import { useState, useEffect, useCallback } from "react";
import styles from "./StudentDiagnosis.module.css";
import { useApp } from "../../contexts/AppContext";
import { useLocale } from "../../i18n/LocaleContext";
import { getAppLanguage, translations } from "../../i18n/translations";
import { useMathJax } from "../../hooks/useMathJax";
import { formatQuestion, formatAnswer } from "../../utils/formatting";
import { MainProblemSidebar } from "../MainProblemSidebar/MainProblemSidebar";
import { api } from "../../services/api";
import { getSavedResults } from "../../hooks/useStorage";
import { exportDiagnosisReportPdf } from "../../utils/exportDiagnosisReportPdf";
import { compressImageDataUrl } from "../../utils/imageCompression";

interface StudentDiagnosisProps {
  userId: string;
  historyRefreshToken?: number;
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
type LevelType = "상" | "중" | "하";

// 학생 진단 상태를 브라우저에 임시로 보관하기 위한 로컬 스토리지 키
const getStudentAnswersStorageKey = (userId: string) => `hamamath_student_answers_${userId}`; // 구버전 호환용
const getStudentDiagnosisStateKey = (userId: string) => `hamamath_student_diagnosis_state_${userId}`;

/** guide_sub_questions에서 sub_question_id → display_code 매핑 생성 (리포트용 요약 복원 시 사용) */
function buildSubQuestionIdToDisplayCode(guideSubQuestions: Array<{ sub_question_id?: string; step_name?: string }>): Record<string, string> {
  const stepIndexByName: Record<string, number> = {};
  const withinStepCount: Record<string, number> = {};
  let stepCounter = 0;
  const map: Record<string, string> = {};
  guideSubQuestions.forEach((sq, idx) => {
    const id = sq.sub_question_id ?? `SQ-${idx + 1}`;
    const stepName = sq.step_name ?? "";
    let stepIndex = stepIndexByName[stepName];
    if (!stepIndex) {
      stepIndex = ++stepCounter;
      stepIndexByName[stepName] = stepIndex;
    }
    const withinKey = String(stepIndex);
    const withinIndex = (withinStepCount[withinKey] ?? 0) + 1;
    withinStepCount[withinKey] = withinIndex;
    map[id] = `${stepIndex}-${withinIndex}`;
  });
  return map;
}

function normalizeDiagnosisLevel(level?: string): LevelType | null {
  if (!level) return null;
  if (level === "상" || level === "중" || level === "하") return level;
  const normalized = level.trim().toLowerCase();
  if (normalized === "high") return "상";
  if (normalized === "medium") return "중";
  if (normalized === "low") return "하";
  return null;
}

function isDisplayCode(value?: string): boolean {
  if (!value) return false;
  return /^\d+-\d+$/.test(value.trim());
}

export const StudentDiagnosis = ({ userId, historyRefreshToken, onClose }: StudentDiagnosisProps) => {
  const { currentProblemId, currentCotData, currentGuidelineData, finalizedGuidelineForRubric, currentRubrics } = useApp();
  const { t, formatLevel, formatGrade, formatCategory, locale } = useLocale();

  const defaultStudentName = useCallback((n: number) => t("diagnosis.studentDefault", { n }), [t]);

  const isDefaultStudentName = useCallback((id: string, name: string) => {
    const m = /^student-(\d+)$/.exec(id);
    if (!m) return false;
    const n = m[1];
    const koDefault = translations.ko["diagnosis.studentDefault"].replace("{n}", n);
    const enDefault = translations.en["diagnosis.studentDefault"].replace("{n}", n);
    return name === koDefault || name === enDefault;
  }, []);

  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [diagnosisCotData, setDiagnosisCotData] = useState<any | null>(null);
  const [apiRubrics, setApiRubrics] = useState<any[] | null>(null);
  const [apiGuideSubQuestions, setApiGuideSubQuestions] = useState<any[] | null>(null);

  // 로그인한 사용자 저장 결과 목록만 가져와 드롭다운에 표시
  useEffect(() => {
    if (!userId?.trim()) {
      setHistoryItems([]);
      return;
    }
    const fetchHistory = async () => {
      try {
        const list = await api.getMyHistoryList(userId);
        setHistoryItems(list || []);
      } catch (err) {
        console.error("저장 결과 목록 불러오기 오류:", err);
      }
    };
    fetchHistory();
  }, [userId, currentProblemId, historyRefreshToken]);

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
  const mainImage = effectiveCotData?.image_data ?? null;
  const mainAnswer = (!problemIdForDiagnosis ? (finalizedGuidelineForRubric as any)?.main_answer : undefined) ?? effectiveCotData?.answer ?? "";
  const mainSolution = effectiveCotData?.main_solution ?? null;
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

  const activeItem = diagnosisItems[0] ?? null;

  const [students, setStudents] = useState<StudentInfo[]>([{ id: "student-1", name: "학생 1" }]);

  useEffect(() => {
    setStudents((prev) =>
      prev.map((s) => (isDefaultStudentName(s.id, s.name) ? { ...s, name: defaultStudentName(parseInt(/^student-(\d+)$/.exec(s.id)![1], 10)) } : s)),
    );
  }, [locale, defaultStudentName, isDefaultStudentName]);
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
  // 개별 하위문항 진단 편집 모드 (등급/피드백)
  const [editingDiagnosisById, setEditingDiagnosisById] = useState<Record<string, boolean>>({});
  // 하위문항 카드별 정답/루브릭 보기 토글 상태
  const [showAnswerById, setShowAnswerById] = useState<Record<string, boolean>>({});
  const [showRubricById, setShowRubricById] = useState<Record<string, boolean>>({});
  const [reportOpen, setReportOpen] = useState(false);
  /** 모달에 표시 중인 리포트의 학생 ID (학생별 버튼으로 열 때 사용) */
  const [reportStudentId, setReportStudentId] = useState<string | null>(null);
  /** 학생 이름/ID 편집: 편집 중인 학생 id, 필드('name'|'id'), 입력값 */
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingStudentValue, setEditingStudentValue] = useState("");
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
  // 리포트 단계별 피드백(요약) 편집 상태 — display_code 기준
  const [reportFeedbackEdits, setReportFeedbackEdits] = useState<Record<string, string>>({});
  // 학생별 · 문제별 단계 수준 요약 (여러 문제 진단 결과를 표로 보여주기 위함)
  const [studentProblemSummaries, setStudentProblemSummaries] = useState<Record<string, Record<string, ProblemStepSummary>>>({});
  /** 해당 학생·문제별 업로드한 손글씨 이미지 (data URL). [이미지1, 이미지2] */
  const [handwrittenUploads, setHandwrittenUploads] = useState<Record<string, Record<string, [string | null, string | null]>>>({});

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
          // 학생 목록은 서버(getStudentList)만 소스로 사용. localStorage에서는 복원하지 않음 → 삭제 후 재접속 시 서버 목록과 일치
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
  }, [userId, historyItems]);

  // 서버에 저장된 학생 목록 불러오기 (단일 소스: 삭제 반영·다른 브라우저 복원)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { students: serverStudents } = await api.getStudentList();
        if (cancelled) return;
        if (Array.isArray(serverStudents)) {
          const list = serverStudents.filter((s: any) => s && s.id).map((s: any) => ({ id: s.id, name: s.name || s.id }));
          setStudents(list.length > 0 ? list : [{ id: "student-1", name: defaultStudentName(1) }]);
        }
      } catch (err) {
        if (!cancelled) console.warn("학생 목록 불러오기 오류:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, defaultStudentName]);

  // 서버에 저장된 학생 답안 불러와서 복원 (다른 브라우저/기기에서도 접근 가능). 학생 목록은 건드리지 않음(삭제 반영 유지).
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
            const existing = next[item.student_id][item.problem_id];
            if (!existing || Object.keys(existing).length === 0) {
              next[item.student_id][item.problem_id] = { ...(item.answers || {}) };
            }
          }
          return next;
        });
        // 서버에서 답안을 불러온 (학생, 문제)는 진단 가능으로 표시 → 다른 브라우저(사파리 등)에서도 "전체 하위문항 진단" 버튼 노출
        setCanDiagnose((prev) => {
          const next = { ...prev };
          for (const item of items) {
            if (!item.student_id || !item.problem_id) continue;
            const hasAnswers = item.answers && typeof item.answers === "object" && Object.keys(item.answers).length > 0;
            if (!hasAnswers) continue;
            if (!next[item.student_id]) next[item.student_id] = {};
            next[item.student_id][item.problem_id] = true;
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

  // 서버에 저장된 진단 결과 불러와서 복원 (다른 브라우저/기기 동기화)
  // + 모든 문제에 대해 studentProblemSummaries 복원 → 리포트가 여러 문제를 반영하도록 함
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { results } = await api.getDiagnosisResults(userId);
        if (cancelled || !results || typeof results !== "object") return;
        if (Object.keys(results).length === 0) return;

        setDiagnosisResults((prev) => {
          const next = JSON.parse(JSON.stringify(prev));
          for (const sid of Object.keys(results)) {
            if (!next[sid]) next[sid] = {};
            for (const pid of Object.keys(results[sid] || {})) {
              next[sid][pid] = { ...(next[sid][pid] ?? {}), ...(results[sid][pid] ?? {}) };
            }
          }
          return next;
        });

        // 진단 결과에 등장하는 문제 ID 수집
        const problemIds = new Set<string>();
        for (const sid of Object.keys(results)) {
          for (const pid of Object.keys(results[sid] || {})) {
            problemIds.add(pid);
          }
        }
        const builtSummaries: Record<string, Record<string, ProblemStepSummary>> = {};
        for (const problemId of problemIds) {
          if (cancelled) return;
          let guideSubQuestions: Array<{ sub_question_id?: string; step_name?: string }> = [];
          try {
            const result = await api.getResult(problemId);
            const local = getSavedResults()[problemId] || null;
            const gd = (result as any)?.guidelineData || (local as any)?.guidelineData;
            if (gd?.guide_sub_questions && Array.isArray(gd.guide_sub_questions)) {
              guideSubQuestions = gd.guide_sub_questions;
            }
          } catch {
            // 문제별 가이드라인 없으면 해당 문제는 요약 스킵
          }
          for (const studentId of Object.keys(results)) {
            const perProblem = results[studentId]?.[problemId];
            if (!perProblem || typeof perProblem !== "object") continue;
            const subIdToDisplayCode = guideSubQuestions.length > 0 ? buildSubQuestionIdToDisplayCode(guideSubQuestions) : {};
            const levelsByDisplayCode: Record<string, "상" | "중" | "하"> = {};
            const feedbackByDisplayCode: Record<string, string> = {};
            for (const subId of Object.keys(perProblem)) {
              const dc = subIdToDisplayCode[subId] ?? (isDisplayCode(subId) ? subId : undefined);
              if (!dc) continue;
              const res = perProblem[subId];
              const normalizedLevel = normalizeDiagnosisLevel(res?.level);
              if (normalizedLevel) levelsByDisplayCode[dc] = normalizedLevel;
              if (res?.reason?.trim()) feedbackByDisplayCode[dc] = res.reason.trim();
            }
            if (Object.keys(levelsByDisplayCode).length > 0) {
              if (!builtSummaries[studentId]) builtSummaries[studentId] = {};
              builtSummaries[studentId][problemId] = {
                problemId,
                levelsByDisplayCode,
                feedbackByDisplayCode: Object.keys(feedbackByDisplayCode).length > 0 ? feedbackByDisplayCode : undefined,
              };
            }
          }
        }

        if (!cancelled && Object.keys(builtSummaries).length > 0) {
          setStudentProblemSummaries((prev) => {
            const next = { ...prev };
            for (const sid of Object.keys(builtSummaries)) {
              next[sid] = { ...(next[sid] ?? {}), ...builtSummaries[sid] };
            }
            return next;
          });
        }
      } catch (err) {
        if (!cancelled) console.error("저장된 진단 결과 불러오기 오류:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 동일 로그인 id·문제·학생에 해당하는 저장 답안이 있으면 화면에 표시
  useEffect(() => {
    if (!problemIdForDiagnosis || !currentStudentId) return;
    let cancelled = false;
    (async () => {
      try {
        const item = await api.getStudentAnswers(problemIdForDiagnosis, currentStudentId);
        if (cancelled || !item?.answers) return;
        const problemKey = problemIdForDiagnosis;
        setStudentAnswers((prev) => ({
          ...prev,
          [currentStudentId]: {
            ...(prev[currentStudentId] ?? {}),
            [problemKey]: { ...(item.answers || {}) },
          },
        }));
        setCanDiagnose((prev) => ({
          ...prev,
          [currentStudentId]: {
            ...(prev[currentStudentId] ?? {}),
            [problemKey]: true,
          },
        }));
      } catch (err) {
        if (!cancelled) console.error("저장된 학생 답안(단건) 불러오기 오류:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, problemIdForDiagnosis, currentStudentId]);

  // 해당 학생·문제의 손글씨 이미지 서버에서 조회 (다른 브라우저 동기화)
  useEffect(() => {
    if (!problemIdForDiagnosis || !currentStudentId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getHandwritten(currentStudentId, problemIdForDiagnosis, userId);
        if (cancelled) return;
        setHandwrittenUploads((prev) => ({
          ...prev,
          [currentStudentId]: {
            ...(prev[currentStudentId] ?? {}),
            [problemIdForDiagnosis]: [res.slot1 ?? null, res.slot2 ?? null],
          },
        }));
      } catch {
        if (!cancelled) {
          setHandwrittenUploads((prev) => ({
            ...prev,
            [currentStudentId]: {
              ...(prev[currentStudentId] ?? {}),
              [problemIdForDiagnosis]: [null, null],
            },
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, problemIdForDiagnosis, currentStudentId]);

  // 학생 진단 상태가 변경될 때마다 로컬 스토리지에 자동 저장 (다른 탭/같은 브라우저 복원용)
  useEffect(() => {
    try {
      const stateToSave = {
        studentAnswers,
        diagnosisResults,
        canDiagnose,
        studentProblemSummaries,
        currentStudentId,
        selectedProblemId,
        students,
      };
      window.localStorage.setItem(getStudentDiagnosisStateKey(userId), JSON.stringify(stateToSave));
    } catch (err) {
      console.error("학생 진단 상태를 저장하는 중 오류:", err);
    }
  }, [userId, studentAnswers, diagnosisResults, canDiagnose, studentProblemSummaries, currentStudentId, selectedProblemId, students]);

  const startEditStudentName = (studentId: string) => {
    const s = students.find((x) => x.id === studentId);
    if (!s) return;
    setEditingStudentId(studentId);
    setEditingStudentValue(s.name);
  };

  const cancelEditStudent = () => {
    setEditingStudentId(null);
    setEditingStudentValue("");
  };

  const saveEditStudentName = async () => {
    if (!editingStudentId || !editingStudentValue.trim()) {
      cancelEditStudent();
      return;
    }
    const newName = editingStudentValue.trim();
    const nextList = students.map((s) => (s.id === editingStudentId ? { ...s, name: newName } : s));
    setStudents(nextList);
    cancelEditStudent();
    try {
      await api.saveStudentList(
        nextList.map((s) => ({ id: s.id, name: s.name })),
        userId,
      );
    } catch (err: any) {
      console.warn("학생 목록 저장 실패:", err);
      alert(t("diagnosis.saveNameFail"));
    }
  };

  const handleAddStudent = () => {
    const name = window.prompt(t("diagnosis.addStudentPrompt"), defaultStudentName(students.length + 1));
    if (!name || !name.trim()) return;
    const nextNum =
      students.reduce((max, s) => {
        const m = /^student-(\d+)$/.exec(s.id);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
      }, 0) + 1;
    const id = `student-${nextNum}`;
    const newStudent = { id, name: name.trim() };
    const nextList = [...students, newStudent];
    setStudents(nextList);
    setCurrentStudentId(id);
    api
      .saveStudentList(
        nextList.map((s) => ({ id: s.id, name: s.name })),
        userId,
      )
      .catch((err) => console.warn("학생 목록 저장 실패:", err));
  };

  const handleDeleteStudent = async (studentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (students.length <= 1) {
      alert(t("diagnosis.cannotDeleteLast"));
      return;
    }
    if (!window.confirm(t("diagnosis.deleteStudentConfirm", { name: students.find((s) => s.id === studentId)?.name ?? studentId }))) return;
    const nextList = students.filter((s) => s.id !== studentId);
    setStudents(nextList);
    setStudentAnswers((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setDiagnosisResults((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setCanDiagnose((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setStudentProblemSummaries((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    if (currentStudentId === studentId) {
      setCurrentStudentId(nextList[0]?.id ?? "");
    }
    try {
      await api.saveStudentList(
        nextList.map((s) => ({ id: s.id, name: s.name })),
        userId,
      );
    } catch (err: any) {
      console.error("학생 목록 저장 실패:", err);
      alert(t("diagnosis.deleteSaveFail"));
      setStudents(students);
      setCurrentStudentId(currentStudentId);
    }
  };

  const currentProblemKey = problemIdForDiagnosis ?? "__current__";

  const handleHandwrittenUpload = async (slot: 1 | 2, file: File | null) => {
    if (!currentStudentId || !currentProblemKey) return;
    if (file && !file.type.startsWith("image/")) {
      alert(t("diagnosis.imagesOnly"));
      return;
    }
    if (!file) {
      setHandwrittenUploads((prev) => {
        const byStudent = prev[currentStudentId] ?? {};
        const current = byStudent[currentProblemKey] ?? [null, null];
        const next: [string | null, string | null] = slot === 1 ? [null, current[1]] : [current[0], null];
        return { ...prev, [currentStudentId]: { ...byStudent, [currentProblemKey]: next } };
      });
      try {
        await api.deleteHandwritten(currentStudentId, currentProblemKey, slot, userId);
      } catch (err: any) {
        console.warn("손글씨 이미지 서버 삭제 실패:", err);
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = reader.result as string;
      let dataUrl: string;
      try {
        dataUrl = await compressImageDataUrl(rawDataUrl);
      } catch (e) {
        console.warn("이미지 압축 실패, 원본으로 전송:", e);
        dataUrl = rawDataUrl;
      }
      setHandwrittenUploads((prev) => {
        const byStudent = prev[currentStudentId] ?? {};
        const current = byStudent[currentProblemKey] ?? [null, null];
        const next: [string | null, string | null] = slot === 1 ? [dataUrl, current[1]] : [current[0], dataUrl];
        return { ...prev, [currentStudentId]: { ...byStudent, [currentProblemKey]: next } };
      });
      try {
        await api.uploadHandwritten(currentStudentId, currentProblemKey, slot, dataUrl, userId);
      } catch (err: any) {
        console.warn("손글씨 이미지 서버 저장 실패:", err);
        alert(err?.message ?? t("diagnosis.imageSaveFail"));
      }
    };
    reader.readAsDataURL(file);
  };

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

  // 개별 하위문항 진단 결과(등급/피드백) 수정 → 요약·서버 저장 반영
  const updateDiagnosisForItem = (item: DiagnosisItem, field: "level" | "reason", value: string) => {
    setDiagnosisResults((prev) => {
      const perStudentPrev = prev[currentStudentId] ?? {};
      const forProblemPrev = perStudentPrev[currentProblemKey] ?? {};
      const prevRes = forProblemPrev[item.id] ?? { level: "중", reason: "" };
      const nextRes = { ...prevRes, [field]: value };
      const nextForProblem = { ...forProblemPrev, [item.id]: nextRes };
      const next: typeof prev = {
        ...prev,
        [currentStudentId]: { ...perStudentPrev, [currentProblemKey]: nextForProblem },
      };

      const levelOnlyByDisplayCode: Record<string, LevelType> = {};
      const feedbackByDisplayCode: Record<string, string> = {};
      diagnosisItems.forEach((it) => {
        const res = nextForProblem[it.id];
        if (!res) return;
        const normalizedLevel = normalizeDiagnosisLevel(res.level);
        if (normalizedLevel) levelOnlyByDisplayCode[it.displayCode] = normalizedLevel;
        if (res.reason?.trim()) feedbackByDisplayCode[it.displayCode] = res.reason.trim();
      });

      if (Object.keys(levelOnlyByDisplayCode).length > 0) {
        setStudentProblemSummaries((prevSummaries) => {
          const perStudent = { ...(prevSummaries[currentStudentId] ?? {}) };
          perStudent[currentProblemKey] = {
            problemId: currentProblemKey,
            levelsByDisplayCode: levelOnlyByDisplayCode,
            feedbackByDisplayCode: Object.keys(feedbackByDisplayCode).length > 0 ? feedbackByDisplayCode : undefined,
          };
          return { ...prevSummaries, [currentStudentId]: perStudent };
        });
      }

      const toSave: typeof next = {};
      for (const sid of Object.keys(next)) {
        toSave[sid] = {};
        for (const pkey of Object.keys(next[sid] ?? {})) {
          const serverKey = pkey === "__current__" ? (currentProblemId ?? pkey) : pkey;
          if (serverKey) toSave[sid][serverKey] = next[sid][pkey];
        }
      }
      api.saveDiagnosisResults({ user_id: userId, results: toSave }).catch((err) => console.error("진단 결과 수정 저장 오류:", err));
      return next;
    });
  };

  // 현재 학생의 모든 하위문항(답안이 있는 것만)을 한 번에 진단
  const handleRunDiagnosisForAll = async () => {
    if (!currentStudentId) {
      alert(t("diagnosis.selectStudentFirst"));
      return;
    }
    if (!diagnosisItems.length) {
      alert(t("diagnosis.noSubqToDiagnose"));
      return;
    }

    const answersForStudent = studentAnswers[currentStudentId]?.[currentProblemKey] || {};
    const itemsWithAnswer = diagnosisItems.filter((item) => (answersForStudent[item.id] ?? "").trim().length > 0);
    const targetItems = diagnosisItems.filter((item) => item.rubric && item.rubric.levels?.length && (answersForStudent[item.id] ?? "").trim().length > 0);

    if (!targetItems.length) {
      if (itemsWithAnswer.length > 0) {
        alert(t("diagnosis.noRubric"));
      } else {
        alert(t("diagnosis.noAnsweredSubq"));
      }
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
            problem_id: problemIdForDiagnosis ?? currentProblemId ?? "__current__",
            sub_question_id: item.id,
            question: item.question,
            correct_answer: item.answer,
            rubric: { levels: rubricLevels },
            student_answer: answerText,
            language: getAppLanguage(locale),
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
      const levelOnlyByDisplayCode: Record<string, LevelType> = {};
      const feedbackByDisplayCode: Record<string, string> = {};
      targetItems.forEach((item) => {
        const res = newResultsForStudent[item.id];
        const normalizedLevel = normalizeDiagnosisLevel(res?.level);
        if (normalizedLevel) levelOnlyByDisplayCode[item.displayCode] = normalizedLevel;
        if (res?.reason?.trim()) {
          feedbackByDisplayCode[item.displayCode] = res.reason.trim();
        }
      });

      if (Object.keys(levelOnlyByDisplayCode).length > 0) {
        setStudentProblemSummaries((prev) => {
          const perStudent = { ...(prev[currentStudentId] ?? {}) };
          perStudent[currentProblemKey] = {
            problemId: currentProblemKey,
            levelsByDisplayCode: levelOnlyByDisplayCode,
            feedbackByDisplayCode: Object.keys(feedbackByDisplayCode).length > 0 ? feedbackByDisplayCode : undefined,
          };
          return {
            ...prev,
            [currentStudentId]: perStudent,
          };
        });
      }

      // 진단 결과 즉시 서버 저장 (다른 브라우저에서 복원되도록)
      const nextResults: Record<string, Record<string, Record<string, { level: string; reason: string }>>> = {
        ...diagnosisResults,
        [currentStudentId]: {
          ...(diagnosisResults[currentStudentId] ?? {}),
          [currentProblemKey]: newResultsForStudent,
        },
      };
      const toSaveResults: typeof nextResults = {};
      for (const sid of Object.keys(nextResults)) {
        toSaveResults[sid] = {};
        for (const pkey of Object.keys(nextResults[sid] ?? {})) {
          const sk = pkey === "__current__" ? (currentProblemId ?? pkey) : pkey;
          if (sk) toSaveResults[sid][sk] = nextResults[sid][pkey];
        }
      }
      try {
        await api.saveDiagnosisResults({ user_id: userId, results: toSaveResults });
      } catch (err: any) {
        console.error("진단 결과 자동 저장 오류:", err);
        alert(err?.message ?? t("diagnosis.saveResultsFail"));
      }

      // 현재 학생 진단 리포트도 서버에 저장 (다른 브라우저에서 리포트까지 복원되도록)
      if (Object.keys(levelOnlyByDisplayCode).length > 0 && userId?.trim()) {
        const serverProblemKey = currentProblemKey === "__current__" ? (currentProblemId ?? currentProblemKey) : currentProblemKey;
        const existingSummaries = studentProblemSummaries[currentStudentId] ?? {};
        const mergedSummaries: Record<string, { levelsByDisplayCode: Record<string, LevelType>; feedbackByDisplayCode?: Record<string, string> }> = { ...existingSummaries };
        mergedSummaries[serverProblemKey] = { levelsByDisplayCode: levelOnlyByDisplayCode, feedbackByDisplayCode: Object.keys(feedbackByDisplayCode ?? {}).length > 0 ? feedbackByDisplayCode : undefined };
        try {
          const reportPayload = {
            student_id: currentStudentId,
            problem_summaries: Object.entries(mergedSummaries).map(([pid, s]) => ({
              problem_id: pid,
              levels_by_display_code: s.levelsByDisplayCode,
              feedback_by_display_code: s.feedbackByDisplayCode ?? {},
            })),
            language: getAppLanguage(locale),
          };
          const reportData = await api.generateStudentDiagnosisReport(reportPayload);
          await api.saveDiagnosisReport({ user_id: userId, student_id: currentStudentId, report: reportData });
          // 리포트 모달이 열려 있고 같은 학생이면 즉시 최신 계산 결과를 반영
          if (reportOpen && reportStudentId === currentStudentId) {
            setReportData(reportData);
            const initialEdits: Record<string, string> = {};
            (reportData.step_rows || []).forEach((row: { display_code: string; feedback_summary?: string | null }) => {
              if (row.feedback_summary && typeof row.feedback_summary === "string") {
                initialEdits[row.display_code] = row.feedback_summary;
              }
            });
            setReportFeedbackEdits(initialEdits);
            setReportError(null);
          }
        } catch (reportErr: any) {
          console.warn("진단 후 리포트 자동 저장 실패:", reportErr);
        }
      }

      setSaveMessage(t("diagnosis.diagnosisDone"));
    } finally {
      setBulkDiagnosing(false);
    }
  };

  /** 서버 저장용 문제 ID (__current__ → 실제 문제 ID로 치환, 서버가 식별 가능하도록) */
  const effectiveProblemIdForSave = currentProblemId ?? null;

  /** 학생 답안 전체 저장: 화면에 있는 모든 (학생 × 문제) 답안을 서버에 저장 */
  const handleSaveCurrentStudentAnswers = async () => {
    const toSave: Array<{ studentId: string; problemId: string; answers: Record<string, string> }> = [];
    for (const studentId of Object.keys(studentAnswers)) {
      const byProblem = studentAnswers[studentId];
      if (!byProblem || typeof byProblem !== "object") continue;
      for (const problemId of Object.keys(byProblem)) {
        const answers = byProblem[problemId];
        if (answers && typeof answers === "object" && Object.keys(answers).length > 0) {
          const serverProblemId = problemId === "__current__" ? (effectiveProblemIdForSave ?? problemId) : problemId;
          if (serverProblemId) toSave.push({ studentId, problemId: serverProblemId, answers });
        }
      }
    }
    if (toSave.length === 0) {
      alert(t("diagnosis.noAnswersToSave"));
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    let savedAnswers = 0;
    const parts: string[] = [];
    try {
      for (const { studentId, problemId, answers } of toSave) {
        const student = students.find((s) => s.id === studentId) || null;
        await api.saveStudentAnswers({
          problem_id: problemId,
          user_id: userId,
          student_id: studentId,
          student_name: student?.name,
          answers,
        });
        savedAnswers++;
        setCanDiagnose((prev) => ({
          ...prev,
          [studentId]: {
            ...(prev[studentId] ?? {}),
            [problemId]: true,
          },
        }));
      }
      if (savedAnswers > 0) parts.push(t("diagnosis.savedAnswers", { n: savedAnswers }));

      // 학생 목록 저장 (다른 브라우저에서 왼쪽 패널 복원용)
      try {
        await api.saveStudentList(
          students.map((s) => ({ id: s.id, name: s.name })),
          userId,
        );
        if (students.length > 0) parts.push(t("diagnosis.savedStudentList"));
      } catch (e) {
        console.warn("학생 목록 저장 실패:", e);
      }

      // 진단 결과 전체 저장 (다른 브라우저 복원용). 문제 키 __current__ → 실제 문제 ID로 정규화
      const hasDiagnosisResults = diagnosisResults && typeof diagnosisResults === "object" && Object.keys(diagnosisResults).length > 0;
      if (hasDiagnosisResults) {
        const normalizedResults: Record<string, Record<string, Record<string, { level: string; reason: string }>>> = {};
        for (const sid of Object.keys(diagnosisResults)) {
          normalizedResults[sid] = {};
          for (const problemKey of Object.keys(diagnosisResults[sid] ?? {})) {
            const serverKey = problemKey === "__current__" ? (effectiveProblemIdForSave ?? problemKey) : problemKey;
            if (serverKey) normalizedResults[sid][serverKey] = diagnosisResults[sid][problemKey];
          }
        }
        await api.saveDiagnosisResults({ user_id: userId, results: normalizedResults });
        parts.push(t("diagnosis.savedResults"));
      }

      // 현재 학생의 진단 리포트가 있으면 저장
      if (reportData && currentStudentId) {
        await api.saveDiagnosisReport({
          user_id: userId,
          student_id: currentStudentId,
          report: reportData,
        });
        parts.push(t("diagnosis.savedReport"));
      }

      setSaveMessage(parts.length > 0 ? t("diagnosis.saveComplete") : t("diagnosis.nothingToSave"));
    } catch (err: any) {
      console.error("학생 답안/진단 저장 오류:", err);
      alert(err.message || t("diagnosis.saveError"));
      setSaveMessage(null);
    } finally {
      setSaving(false);
    }
  };

  const mainProblemRef = useMathJax([mainProblem, mainAnswer, problemIdForDiagnosis]);
  const containerRef = useMathJax([activeItem, finalizedGuidelineForRubric, currentRubrics, currentStudentId, studentAnswers]);

  /** 모달에 표시 중인 학생의 진단 문제 수 (학생별 리포트용) */
  const reportSummaryProblemIds = Object.keys(studentProblemSummaries[reportStudentId ?? ""] ?? {});

  // 하: 0점 / 중: 1점 / 상: 2점
  const LEVEL_SCORE: Record<LevelType, number> = { 상: 2, 중: 1, 하: 0 };

  const getStepGroupInfo = (displayCode: string) => {
    const [group] = displayCode.split("-");
    const formattedGroup = formatCategory(group);
    const stageLabel = formattedGroup !== group ? formattedGroup : locale === "ko" ? `${group}단계` : `Stage ${group}`;
    const formattedDetail = formatCategory(displayCode);
    const detailLabel = formattedDetail !== displayCode ? formattedDetail : stageLabel;
    return { group, stageLabel, detailLabel };
  };
  // 100점 만점을 5등급 한글: 상(80+), 중상(60+), 중(40+), 중하(20+), 하(20 미만) — 화면·PDF 통일
  const scoreToGradeFrom100Korean = (score_100: number): "상" | "중상" | "중" | "중하" | "하" | "-" => {
    if (score_100 < 0 || score_100 > 100) return "-";
    if (score_100 >= 80) return "상";
    if (score_100 >= 60) return "중상";
    if (score_100 >= 40) return "중";
    if (score_100 >= 20) return "중하";
    return "하";
  };
  const handleDownloadReportPdf = async () => {
    const sid = reportStudentId ?? currentStudentId;
    if (!reportData || !sid) return;
    const perStudent = studentProblemSummaries[sid] ?? {};
    const summariesForPdf = Object.fromEntries(
      Object.entries(perStudent).map(([pid, v]) => [
        pid,
        {
          problemId: pid,
          levelsByDisplayCode: v.levelsByDisplayCode ?? {},
          feedbackByDisplayCode: v.feedbackByDisplayCode,
        },
      ]),
    );
    try {
      await exportDiagnosisReportPdf(reportData, students.find((s) => s.id === sid)?.name ?? t("diagnosis.student"), sid, summariesForPdf);
    } catch (err: any) {
      alert(err?.message || t("diagnosis.pdfError"));
    }
  };

  /** 해당 학생의 진단 리포트 모달 열기 (학생 목록에서 학생별 버튼으로 호출). 최초 제외하고는 이전 결과를 바로 표시 */
  const openReport = async (studentId: string) => {
    // 해당 학생에 대해 진단 결과/요약이 있는 모든 문제 ID 사용
    const diagnosisProblemIds = Array.from(
      new Set([...Object.keys(diagnosisResults[studentId] ?? {}), ...Object.keys(studentProblemSummaries[studentId] ?? {})]),
    );
    if (!diagnosisProblemIds.length) {
      alert(t("diagnosis.completeOneProblem"));
      return;
    }
    let fullPerStudent: Record<string, ProblemStepSummary> = { ...(studentProblemSummaries[studentId] ?? {}) };
    const saved = getSavedResults();
    for (const problemId of diagnosisProblemIds) {
      const perProblem = diagnosisResults[studentId]?.[problemId];
      if (!perProblem || typeof perProblem !== "object") continue;
      let guideSubQuestions: Array<{ sub_question_id?: string; step_name?: string }> = [];
      try {
        const result = await api.getResult(problemId);
        const local = saved[problemId] || null;
        const gd = (result as any)?.guidelineData || (local as any)?.guidelineData;
        if (gd?.guide_sub_questions && Array.isArray(gd.guide_sub_questions)) {
          guideSubQuestions = gd.guide_sub_questions;
        }
      } catch {
        // 스킵
      }
      const subIdToDisplayCode = guideSubQuestions.length > 0 ? buildSubQuestionIdToDisplayCode(guideSubQuestions) : {};
      const levelsByDisplayCode: Record<string, LevelType> = {};
      const feedbackByDisplayCode: Record<string, string> = {};
      for (const subId of Object.keys(perProblem)) {
        const dc = subIdToDisplayCode[subId] ?? (isDisplayCode(subId) ? subId : undefined);
        if (!dc) continue;
        const res = perProblem[subId];
        const normalizedLevel = normalizeDiagnosisLevel(res?.level);
        if (normalizedLevel) levelsByDisplayCode[dc] = normalizedLevel;
        if (res?.reason?.trim()) feedbackByDisplayCode[dc] = res.reason.trim();
      }
      if (Object.keys(levelsByDisplayCode).length > 0) {
        fullPerStudent[problemId] = {
          problemId,
          levelsByDisplayCode,
          feedbackByDisplayCode: Object.keys(feedbackByDisplayCode).length > 0 ? feedbackByDisplayCode : undefined,
        };
      }
    }
    const problemIds = Object.keys(fullPerStudent);
    if (!problemIds.length) {
      alert(t("diagnosis.reportBuildFail"));
      return;
    }
    if (Object.keys(fullPerStudent).length > Object.keys(studentProblemSummaries[studentId] ?? {}).length) {
      setStudentProblemSummaries((prev) => ({
        ...prev,
        [studentId]: { ...(prev[studentId] ?? {}), ...fullPerStudent },
      }));
    }

    // 같은 학생 리포트가 이미 화면 상태에 있으면 재계산 없이 그대로 재사용
    if (reportStudentId === studentId && reportData && !reportError) {
      setReportStudentId(studentId);
      setReportOpen(true);
      setReportLoading(false);
      return;
    }

    setReportStudentId(studentId);
    setReportOpen(true);
    setReportLoading(true);
    setReportError(null);
    try {
      // 저장된 리포트가 있으면 우선 사용 (버튼 클릭마다 자동 재계산하지 않음)
      const savedReport = await api.getDiagnosisReport(studentId, userId);
      if (savedReport && savedReport.problem_rows?.length > 0) {
        setReportData(savedReport);
        const initialEdits: Record<string, string> = {};
        (savedReport.step_rows || []).forEach((row: { display_code: string; feedback_summary?: string | null }) => {
          if (row.feedback_summary && typeof row.feedback_summary === "string") {
            initialEdits[row.display_code] = row.feedback_summary;
          }
        });
        setReportFeedbackEdits(initialEdits);
        setReportLoading(false);
        return;
      }

      const payload = {
        student_id: studentId,
        problem_summaries: problemIds.map((pid) => ({
          problem_id: pid,
          levels_by_display_code: fullPerStudent[pid].levelsByDisplayCode,
          feedback_by_display_code: fullPerStudent[pid].feedbackByDisplayCode ?? {},
        })),
        language: getAppLanguage(locale),
      };
      const data = await api.generateStudentDiagnosisReport(payload);
      setReportData(data);
      const initialEdits: Record<string, string> = {};
      (data.step_rows || []).forEach((row: { display_code: string; feedback_summary?: string | null }) => {
        if (row.feedback_summary && typeof row.feedback_summary === "string") {
          initialEdits[row.display_code] = row.feedback_summary;
        }
      });
      setReportFeedbackEdits(initialEdits);
      // 리포트 서버 저장 (다른 브라우저에서 복원되도록)
      api.saveDiagnosisReport({ user_id: userId, student_id: studentId, report: data }).catch((err) => console.error("리포트 저장 오류:", err));
    } catch (err: any) {
      console.error("학생 진단 리포트 생성 오류:", err);
      setReportError(err.message || t("diagnosis.reportLoadError"));
      setReportData(null);
    } finally {
      setReportLoading(false);
    }
  };

  /** 리포트 모달에서 새로고침: 열려 있는 리포트 학생 기준으로 다시 계산·생성 */
  const handleRefreshReport = async () => {
    const sid = reportStudentId ?? currentStudentId;
    const perStudent = studentProblemSummaries[sid] ?? {};
    // 현재 요약에 포함된 모든 문제를 대상으로 리포트 재계산
    const problemIds = Object.keys(perStudent);
    if (!problemIds.length) {
      setReportError(t("diagnosis.noDiagnosedProblems"));
      return;
    }
    setReportLoading(true);
    setReportError(null);
    try {
      const payload = {
        student_id: sid,
        problem_summaries: problemIds.map((pid) => ({
          problem_id: pid,
          levels_by_display_code: perStudent[pid].levelsByDisplayCode,
          feedback_by_display_code: perStudent[pid].feedbackByDisplayCode ?? {},
        })),
        language: getAppLanguage(locale),
      };
      const data = await api.generateStudentDiagnosisReport(payload);
      setReportData(data);
      const initialEdits: Record<string, string> = {};
      (data.step_rows || []).forEach((row: { display_code: string; feedback_summary?: string | null }) => {
        if (row.feedback_summary && typeof row.feedback_summary === "string") {
          initialEdits[row.display_code] = row.feedback_summary;
        }
      });
      setReportFeedbackEdits(initialEdits);
      // 리포트 서버 저장 (다른 브라우저에서 복원되도록)
      api.saveDiagnosisReport({ user_id: userId, student_id: sid, report: data }).catch((err) => console.error("리포트 저장 오류:", err));
    } catch (err: any) {
      console.error("리포트 새로고침 오류:", err);
      setReportError(err.message ?? t("diagnosis.reportRefreshError"));
    } finally {
      setReportLoading(false);
    }
  };

  /** 현재 리포트(피드백 수정 반영)를 서버에 저장 */
  const handleSaveReportToServer = async () => {
    const sid = reportStudentId ?? currentStudentId;
    if (!reportData || !sid) return;
    const step_rows = reportData.step_rows.map((r) => ({
      ...r,
      feedback_summary: (reportFeedbackEdits[r.display_code] ?? r.feedback_summary ?? "") || null,
    }));
    const reportToSave = { ...reportData, step_rows };
    try {
      await api.saveDiagnosisReport({ user_id: userId, student_id: sid, report: reportToSave });
      setSaveMessage(t("diagnosis.reportSaved"));
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err: any) {
      console.error("리포트 저장 오류:", err);
      alert(err?.message ?? t("diagnosis.reportSaveFail"));
    }
  };

  const handleRemoveProblemFromReport = async (problemId: string) => {
    const sid = reportStudentId ?? currentStudentId;
    if (!sid) return;
    if (!window.confirm(t("diagnosis.removeProblemConfirm", { problemId }))) return;

    const currentPerStudent = studentProblemSummaries[sid] ?? {};
    if (!currentPerStudent[problemId]) return;
    const nextPerStudent = { ...currentPerStudent };
    delete nextPerStudent[problemId];

    setStudentProblemSummaries((prev) => ({ ...prev, [sid]: nextPerStudent }));

    const remainingProblemIds = Object.keys(nextPerStudent);
    if (!remainingProblemIds.length) {
      setReportData(null);
      setReportFeedbackEdits({});
      setReportError(t("diagnosis.noDiagnosedProblems"));
      return;
    }

    setReportLoading(true);
    setReportError(null);
    try {
      const payload = {
        student_id: sid,
        problem_summaries: remainingProblemIds.map((pid) => ({
          problem_id: pid,
          levels_by_display_code: nextPerStudent[pid].levelsByDisplayCode,
          feedback_by_display_code: nextPerStudent[pid].feedbackByDisplayCode ?? {},
        })),
        language: getAppLanguage(locale),
      };
      const data = await api.generateStudentDiagnosisReport(payload);
      setReportData(data);
      const initialEdits: Record<string, string> = {};
      (data.step_rows || []).forEach((row: { display_code: string; feedback_summary?: string | null }) => {
        if (row.feedback_summary && typeof row.feedback_summary === "string") {
          initialEdits[row.display_code] = row.feedback_summary;
        }
      });
      setReportFeedbackEdits(initialEdits);
      await api.saveDiagnosisReport({ user_id: userId, student_id: sid, report: data });
    } catch (err: any) {
      console.error("리포트 문제 제외 후 재생성 오류:", err);
      setReportError(err?.message ?? t("diagnosis.reportRefreshError"));
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className={styles.page} ref={containerRef}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{t("diagnosis.title")}</h1>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.diagnosisSplitLayout}>
          {problemIdForDiagnosis ? (
            <MainProblemSidebar
              panelRef={mainProblemRef}
              problem={mainProblem}
              answer={mainAnswer}
              imageData={mainImage}
              solution={mainSolution}
              grade={grade}
              subjectArea={subjectArea}
            />
          ) : (
            <aside className={styles.diagnosisProblemPlaceholder}>
              <p className={styles.mainProblemEmpty}>{t("diagnosis.selectProblemFirst")}</p>
            </aside>
          )}

          <div className={styles.diagnosisWorkspace}>
            <aside className={styles.studentListRail}>
              {historyItems.length > 0 && (
                <div className={styles.railProblemSelect}>
                  <label className={styles.railProblemSelectLabel}>
                    <span className={styles.railProblemSelectCaption}>{t("diagnosis.selectProblemLabel")}</span>
                    <select
                      className={styles.railProblemSelectInput}
                      value={selectedProblemId ?? ""}
                      onChange={(e) => setSelectedProblemId(e.target.value || null)}
                    >
                      <option value="">{t("diagnosis.selectProblem")}</option>
                      {historyItems.map((item: any) => (
                        <option key={item.problem_id} value={item.problem_id}>
                          {item.problem_id}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <div className={styles.studentListRailHead}>
                <h3 className={styles.studentListTitle}>{t("diagnosis.studentList")}</h3>
                <span className={styles.studentListCount}>{students.length}</span>
              </div>
              <div className={styles.studentList}>
                {students.map((s) => {
                  const isActiveStudent = currentStudentId === s.id;
                  const isEditingName = editingStudentId === s.id;
                  const summaryProblemCount = Object.keys(studentProblemSummaries[s.id] ?? {}).length;
                  const diagnosedProblemCount = Object.values(diagnosisResults[s.id] ?? {}).filter((perProblem) =>
                    Object.values(perProblem ?? {}).some((res) => !!normalizeDiagnosisLevel((res as { level?: string })?.level)),
                  ).length;
                  const diagnosedCount = Math.max(summaryProblemCount, diagnosedProblemCount);
                  return (
                    <div
                      key={s.id}
                      className={`${styles.studentListRow} ${isActiveStudent ? styles.studentListRowActive : ""}`}
                      title={s.id}
                    >
                      {isEditingName ? (
                        <input
                          type="text"
                          className={styles.studentListEditInput}
                          value={editingStudentValue}
                          onChange={(e) => setEditingStudentValue(e.target.value)}
                          onBlur={saveEditStudentName}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEditStudentName();
                            if (e.key === "Escape") cancelEditStudent();
                          }}
                          autoFocus
                          aria-label={t("diagnosis.editName")}
                        />
                      ) : (
                        <>
                          <button type="button" className={styles.studentListRowSelect} onClick={() => setCurrentStudentId(s.id)}>
                            <span className={styles.studentListRowName}>{s.name}</span>
                            {diagnosedCount > 0 && (
                              <span className={styles.studentListRowMeta}>
                                {t("diagnosis.studentDiagnosedCount", { count: diagnosedCount })}
                              </span>
                            )}
                          </button>
                          <div className={styles.studentListRowActions}>
                            <button
                              type="button"
                              className={styles.studentListIconBtn}
                              onClick={() => startEditStudentName(s.id)}
                              title={t("diagnosis.editName")}
                              aria-label={`${s.name} ${t("diagnosis.editName")}`}
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              className={styles.studentListIconBtn}
                              onClick={() => openReport(s.id)}
                              title={t("diagnosis.report")}
                              aria-label={t("diagnosis.reportAria", { name: s.name })}
                            >
                              R
                            </button>
                            <button
                              type="button"
                              className={`${styles.studentListIconBtn} ${styles.studentListIconBtnDanger}`}
                              onClick={(e) => handleDeleteStudent(s.id, e)}
                              title={t("diagnosis.deleteStudent")}
                              aria-label={t("diagnosis.deleteStudentAria", { name: s.name })}
                            >
                              ×
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <button type="button" className={styles.addStudentBtn} onClick={handleAddStudent}>
                {t("diagnosis.addStudent")}
              </button>
            </aside>

            <section className={styles.studentWorkArea}>
            <div className={styles.contentSingle}>
              <section className={styles.rightColumn}>
                <div className={styles.studentPanel}>
                  {!problemIdForDiagnosis ? (
                    <p className={styles.mainProblemEmpty}>{t("diagnosis.selectProblemTop")}</p>
                  ) : (
                    <>
                      <header className={styles.studentHeader}>
                        <div className={styles.studentHeaderTop}>
                          <h3 className={styles.studentTitle}>
                            {t("diagnosis.studentAnswers")}
                            {(() => {
                              const name = students.find((s) => s.id === currentStudentId)?.name;
                              return name ? <span className={styles.studentTitleName}> — {name}</span> : null;
                            })()}
                          </h3>
                        </div>
                      </header>

                      {currentStudentId && currentProblemKey && (() => {
                        const urls = handwrittenUploads[currentStudentId]?.[currentProblemKey] ?? [null, null];
                        const hasAnyImage = !!(urls[0] || urls[1]);
                        return (
                          <div className={styles.handwritingToolbar}>
                            <span className={styles.handwritingToolbarLabel}>{t("diagnosis.handwrittenTitle")}</span>
                            <div className={styles.handwritingToolbarActions}>
                              <label className={styles.handwritingUploadBtn}>
                                {hasAnyImage ? t("diagnosis.replace") : t("diagnosis.uploadHandwriting")}
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className={styles.handwritingFileInput}
                                  onChange={(e) => {
                                    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
                                    if (files[0]) handleHandwrittenUpload(1, files[0]);
                                    if (files[1]) handleHandwrittenUpload(2, files[1]);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                              {([1, 2] as const).map((slot) => {
                                const dataUrl = urls[slot - 1];
                                if (!dataUrl) return null;
                                return (
                                  <div key={slot} className={styles.handwritingSlotCompact}>
                                    <img
                                      src={dataUrl}
                                      alt={t("diagnosis.handwritingAlt", { n: slot })}
                                      className={styles.handwritingThumb}
                                    />
                                    <button
                                      type="button"
                                      className={styles.handwritingRemoveBtn}
                                      onClick={() => handleHandwrittenUpload(slot, null)}
                                      aria-label={t("diagnosis.remove")}
                                    >
                                      ×
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {diagnosisItems.length > 0 ? (
                        <>
                          <div className={styles.studentAnswerColumn}>
                              <div className={styles.studentAllList}>
                                {diagnosisItems.map((item) => {
                                  const value = studentAnswers[currentStudentId]?.[currentProblemKey]?.[item.id] ?? "";
                                  const result = diagnosisResults[currentStudentId]?.[currentProblemKey]?.[item.id];
                                  const showAnswer = !!showAnswerById[item.id];
                                  const showRubric = !!showRubricById[item.id];
                                  const isEditingDiagnosis = !!editingDiagnosisById[item.id];
                                  return (
                                    <div key={item.id} className={styles.studentAnswerBlock}>
                                      <div className={styles.studentAnswerHeader}>
                                        <div className={styles.studentAnswerHeaderLeft}>
                                          <span className={styles.studentAnswerCode}>{item.displayCode}</span>
                                          <span className={styles.studentAnswerLabel}>
                                            {(() => {
                                              const [group] = item.displayCode.split("-");
                                              const groupLabel = formatCategory(group) !== group ? formatCategory(group) : item.stepName;
                                              const skillLabel = formatCategory(item.displayCode) !== item.displayCode ? formatCategory(item.displayCode) : item.subSkillName;
                                              return `${groupLabel} - ${skillLabel}`;
                                            })()}
                                          </span>
                                        </div>
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
                                        placeholder={t("diagnosis.answerPlaceholder")}
                                        value={value}
                                        onChange={(e) => handleStudentAnswerChange(item.id, e.target.value)}
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
                                            {t("diagnosis.showAnswer")}
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
                                            {t("diagnosis.showRubric")}
                                          </button>
                                        )}
                                      </div>
                                      {showAnswer && item.answer && (
                                        <div className={styles.studentAnswerSolution}>
                                          <span className={styles.studentAnswerSolutionLabel}>{t("common.answer")}</span>
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
                                                  <span className={styles.studentRubricBadge}>{formatLevel(lv.level)}</span>
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
                                      {result && (
                                        <div className={styles.studentFeedbackPanel}>
                                          <div className={styles.studentFeedbackHeader}>
                                            <span className={styles.studentFeedbackTitle}>{t("diagnosis.individualResult", { code: item.displayCode })}</span>
                                            <div className={styles.studentFeedbackControls}>
                                              {!isEditingDiagnosis && <span className={styles.studentFeedbackLevelDisplay}>{t("diagnosis.diagnosed", { level: formatLevel(result.level) })}</span>}
                                              <button
                                                type="button"
                                                className={styles.studentFeedbackEditBtn}
                                                onClick={() => setEditingDiagnosisById((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                                              >
                                                {isEditingDiagnosis ? t("common.endEdit") : t("common.edit")}
                                              </button>
                                            </div>
                                          </div>
                                          {isEditingDiagnosis ? (
                                            <>
                                              <label className={styles.studentFeedbackLevelLabel}>
                                                {t("diagnosis.diagnosisGradeLabel")}
                                                <select className={styles.studentFeedbackLevelSelect} value={result.level} onChange={(e) => updateDiagnosisForItem(item, "level", e.target.value)}>
                                                  <option value="상">{formatLevel("상")}</option>
                                                  <option value="중">{formatLevel("중")}</option>
                                                  <option value="하">{formatLevel("하")}</option>
                                                </select>
                                              </label>
                                              <label className={styles.studentFeedbackBodyLabel}>
                                                {t("diagnosis.diagnosisFeedbackLabel")}
                                                <textarea
                                                  className={styles.studentFeedbackBodyInput}
                                                  rows={3}
                                                  value={result.reason ?? ""}
                                                  placeholder={t("diagnosis.feedbackPlaceholder")}
                                                  onChange={(e) => updateDiagnosisForItem(item, "reason", e.target.value)}
                                                />
                                              </label>
                                            </>
                                          ) : (
                                            <p className={styles.studentFeedbackBodyReadonly}>{result.reason?.trim() ? result.reason : t("diagnosis.noFeedback")}</p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              <div className={styles.studentActions}>
                                <button type="button" className={styles.studentSaveBtn} onClick={handleSaveCurrentStudentAnswers} disabled={saving}>
                                  {saving ? t("diagnosis.saving") : t("diagnosis.saveAllAnswers")}
                                </button>
                                {canDiagnose[currentStudentId]?.[currentProblemKey] && activeItem && (
                                  <button type="button" className={styles.studentDiagnoseBtn} onClick={handleRunDiagnosisForAll} disabled={bulkDiagnosing}>
                                    {bulkDiagnosing ? t("diagnosis.bulkDiagnosing") : t("diagnosis.bulkDiagnose")}
                                  </button>
                                )}
                                {canDiagnose[currentStudentId]?.[currentProblemKey] && diagnosisItems.length > 0 && false && (
                                  <button type="button" className={styles.studentDiagnoseBtn} onClick={handleRunDiagnosisForAll} disabled={bulkDiagnosing}>
                                    {bulkDiagnosing ? t("diagnosis.bulkDiagnosing") : t("diagnosis.bulkDiagnose")}
                                  </button>
                                )}
                                {saveMessage && <span className={styles.studentSaveMessage}>{saveMessage}</span>}
                              </div>
                          </div>

                          {/* 개별 문항 진단 결과 요약 배지는 요약 섹션과 카드 상단에서 충분히 표현되므로,
                          별도의 상세 피드백 박스는 표시하지 않습니다. */}
                        </>
                      ) : (
                        <p className={styles.empty}>{t("diagnosis.loadSubqFirst")}</p>
                      )}
                    </>
                  )}
                </div>
              </section>
            </div>

            </section>
          </div>
        </div>
      </main>

      {reportOpen && (
        <div className={styles.reportOverlay} role="dialog" aria-modal="true">
          <div className={styles.reportModal}>
            <header className={styles.reportHeader}>
              <div>
                <h2 className={styles.reportTitle}>{t("diagnosis.reportTitle")}</h2>
                <p className={styles.reportSubtitle}>
                  {t("diagnosis.reportMeta", {
                    name: students.find((s) => s.id === reportStudentId)?.name ?? t("diagnosis.student"),
                    count: reportSummaryProblemIds.length,
                  })}
                </p>
              </div>
              <div className={styles.reportHeaderActions}>
                <button type="button" className={styles.reportRefreshBtn} onClick={handleRefreshReport} disabled={reportLoading} title={t("diagnosis.refreshTitle")}>
                  {reportLoading ? t("diagnosis.refreshing") : t("diagnosis.refresh")}
                </button>
                {reportData && !reportLoading && !reportError && (
                  <>
                    <button type="button" className={styles.reportSaveBtn} onClick={handleSaveReportToServer} title={t("diagnosis.saveReport")}>
                      {t("diagnosis.saveReport")}
                    </button>
                    <button type="button" className={styles.reportPdfBtn} onClick={handleDownloadReportPdf}>
                      {t("common.pdfDownload")}
                    </button>
                  </>
                )}
                <button type="button" className={styles.reportCloseBtn} onClick={() => setReportOpen(false)}>
                  {t("common.close")}
                </button>
              </div>
            </header>

            <div className={styles.reportBody}>
              <div className={styles.problemSummaryBlock}>
                <h4 className={styles.problemSummarySubTitle}>{t("diagnosis.levelSummary")}</h4>
                {reportLoading && <p className={styles.problemSummaryEmpty}>{t("diagnosis.loadingReport")}</p>}
                {reportError && !reportLoading && <p className={styles.problemSummaryEmpty}>{reportError}</p>}
                {!reportLoading && !reportError && reportData && (
                  <>
                    <table className={styles.problemSummaryTable}>
                      <thead>
                        <tr>
                          <th>{t("diagnosis.problemId")}</th>
                          <th>{t("diagnosis.diagnosedStepCount")}</th>
                          <th>{formatLevel("상")}</th>
                          <th>{formatLevel("중")}</th>
                          <th>{formatLevel("하")}</th>
                          <th>{t("diagnosis.averageGrade")}</th>
                          <th>{t("diagnosis.actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.problem_rows.map((row) => {
                          const total = row.high_count + row.mid_count + row.low_count || 0;
                          const sum = total > 0 ? row.high_count * 2 + row.mid_count * 1 + row.low_count * 0 : 0;
                          const score_100 = total > 0 ? (sum / (total * 2)) * 100 : 0;
                          const gradeKo = total > 0 ? scoreToGradeFrom100Korean(score_100) : "-";
                          return (
                            <tr key={row.problem_id}>
                              <td>{row.problem_id}</td>
                              <td>{row.step_count}</td>
                              <td>{row.high_count}</td>
                              <td>{row.mid_count}</td>
                              <td>{row.low_count}</td>
                              <td>{formatGrade(gradeKo)}</td>
                              <td>
                                <button type="button" className={styles.reportRemoveProblemBtn} onClick={() => handleRemoveProblemFromReport(row.problem_id)} disabled={reportLoading}>
                                  {t("diagnosis.excludeFromReport")}
                                </button>
                              </td>
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
                        const gradeKo = total > 0 ? scoreToGradeFrom100Korean(score_100) : "-";
                        return (
                          <div key={`graph-${row.problem_id}`} className={styles.reportGraphItem}>
                            <div className={styles.reportGraphHeader}>
                              <span className={styles.reportGraphTitle}>{row.problem_id}</span>
                              <div className={styles.reportGraphHeaderRight}>
                                <span className={styles.reportGraphLevelBadge}>{formatGrade(gradeKo)}</span>
                                <span className={styles.reportGraphScoreText}>{t("diagnosis.scorePoints", { n: Math.round(score_100) })}</span>
                              </div>
                            </div>
                            <div className={styles.reportGraphBar}>
                              <div className={`${styles.reportGraphSegment} ${styles.reportGraphHigh}`} style={{ width: `${score_100}%` }} />
                            </div>
                            <div className={styles.reportGraphLegend}>
                              <span>{t("diagnosis.countHigh", { n: row.high_count })}</span>
                              <span>{t("diagnosis.countMid", { n: row.mid_count })}</span>
                              <span>{t("diagnosis.countLow", { n: row.low_count })}</span>
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
                  {reportData ? t("diagnosis.stageSummaryReport", { count: reportData.problem_rows.length }) : t("diagnosis.stageSummary")}
                </h4>
                {reportLoading && <p className={styles.problemSummaryEmpty}>{t("diagnosis.loadingReport")}</p>}
                {reportError && !reportLoading && <p className={styles.problemSummaryEmpty}>{reportError}</p>}
                {!reportLoading && !reportError && reportData && (
                  <>
                    {reportData.step_rows.length === 0 ? (
                      <p className={styles.problemSummaryEmpty}>{t("diagnosis.noStageSummary")}</p>
                    ) : (
                      <>
                        <table className={styles.problemSummaryTable}>
                          <thead>
                            <tr>
                              <th className={styles.reportTableThStage}>{t("diagnosis.problemSolvingStage")}</th>
                              <th>{t("diagnosis.subSkill")}</th>
                              <th>{t("diagnosis.score100")}</th>
                              <th>{t("diagnosis.finalGrade")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const perStudent = studentProblemSummaries[reportStudentId ?? currentStudentId] ?? {};
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
                                  const gradeKo = stepCount > 0 ? scoreToGradeFrom100Korean(score_100) : "-";
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
                                      <td>{formatGrade(gradeKo)}</td>
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
                              const stageLabel = getStepGroupInfo(`${g}-1`).stageLabel;
                              const groupClass = g === "1" ? styles.reportStepGroup1 : g === "2" ? styles.reportStepGroup2 : g === "3" ? styles.reportStepGroup3 : styles.reportStepGroup4;
                              return (
                                <div key={`graph-group-${g}`} className={styles.reportGraphGroup}>
                                  <div className={`${styles.reportGraphGroupTitle} ${groupClass}`}>{stageLabel}</div>
                                  <div className={styles.reportGraphGroupItems}>
                                    {rows.map((row) => {
                                      const info = getStepGroupInfo(row.display_code);
                                      const perStudent = studentProblemSummaries[reportStudentId ?? currentStudentId] ?? {};
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
                                      const gradeKo = stepCount > 0 ? scoreToGradeFrom100Korean(score_100) : "-";
                                      const feedbackValue = reportFeedbackEdits[row.display_code] ?? row.feedback_summary ?? "";
                                      return (
                                        <div key={`step-graph-${row.display_code}`} className={styles.reportGraphItem}>
                                          <div className={styles.reportGraphHeader}>
                                            <span className={styles.reportGraphTitle}>
                                              {row.display_code} · {info.detailLabel}
                                            </span>
                                            <div className={styles.reportGraphHeaderRight}>
                                              <span className={`${styles.reportGraphLevelBadge} ${groupClass}`}>{formatGrade(gradeKo)}</span>
                                              <span className={styles.reportGraphScoreText}>{t("diagnosis.scorePoints", { n: Math.round(score_100) })}</span>
                                            </div>
                                          </div>
                                          <div className={styles.reportGraphBar}>
                                            <div className={`${styles.reportGraphSegment} ${styles.reportGraphStepFill} ${groupClass}`} style={{ width: `${score_100}%` }} />
                                          </div>
                                          <div className={styles.reportGraphFeedbackEdit}>
                                            <label className={styles.reportGraphFeedbackLabel}>{t("diagnosis.stageFeedback")}</label>
                                            <textarea
                                              className={styles.reportGraphFeedbackTextarea}
                                              rows={3}
                                              value={feedbackValue}
                                              placeholder={t("diagnosis.stageFeedbackPlaceholder")}
                                              onChange={(e) => {
                                                const value = e.target.value;
                                                setReportFeedbackEdits((prev) => ({ ...prev, [row.display_code]: value }));
                                                setReportData((prev) =>
                                                  prev
                                                    ? {
                                                        ...prev,
                                                        step_rows: prev.step_rows.map((r) => (r.display_code === row.display_code ? { ...r, feedback_summary: value || null } : r)),
                                                      }
                                                    : prev,
                                                );
                                              }}
                                              onBlur={() => handleSaveReportToServer()}
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
