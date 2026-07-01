import type { DemoLevel } from "./demoSimulationExamples";
import { DEMO_PROBLEM_ID, buildDemoRubricsFromSubQuestionData, getDemoWorkspaceSnapshot, type DemoSubQuestionData } from "./demoWorkspace";

export interface DemoRubricLevel {
  level: DemoLevel;
  score: number;
  description: string;
  bullets: string[];
  examples: string[];
}

export interface DemoRubricItem {
  sub_question_id: string;
  step_name: string;
  sub_skill_name: string;
  question: string;
  answer?: string;
  levels: DemoRubricLevel[];
}

export interface DemoDiagnosisStudent {
  id: string;
  name: string;
  /** 하위문항별 시뮬레이션 등급 패턴 */
  levelBySubQuestionId: Record<string, DemoLevel>;
}

const DEMO_STUDENT_PROFILES: Array<{ id: string; name: string; pattern: DemoLevel[] }> = [
  {
    id: "demo-student-minji",
    name: "민지",
    pattern: ["상", "상", "상", "상", "상", "상", "상", "상"],
  },
  {
    id: "demo-student-junho",
    name: "준호",
    pattern: ["상", "중", "중", "중", "중", "하", "중", "중"],
  },
  {
    id: "demo-student-seoyeon",
    name: "서연",
    pattern: ["중", "하", "하", "하", "하", "하", "중", "하"],
  },
];

const SUB_QUESTION_ORDER = ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"];

function buildLevelBySubQuestionId(pattern: DemoLevel[]): Record<string, DemoLevel> {
  const map: Record<string, DemoLevel> = {};
  SUB_QUESTION_ORDER.forEach((id, index) => {
    map[id] = pattern[index] ?? "중";
  });
  return map;
}

function pickSimulationExample(subQuestionId: string, level: DemoLevel, rubric: DemoRubricItem): string {
  const simulated = DEMO_SIMULATION_EXAMPLES[subQuestionId]?.[level] ?? [];
  if (simulated.length > 0) return simulated[0];
  const rubricLevel = rubric.levels.find((lv) => lv.level === level);
  if (rubricLevel?.examples?.length) return rubricLevel.examples[0];
  if (level === "상" && rubric.answer?.trim()) return rubric.answer.trim();
  return rubricLevel?.description ?? "";
}

export function buildDemoRubricsWithSimulation(
  subQuestionData?: DemoSubQuestionData | null,
  rubrics?: DemoRubricItem[],
): DemoRubricItem[] {
  if (rubrics?.length) return rubrics;
  if (subQuestionData?.guide_sub_questions?.length) {
    return buildDemoRubricsFromSubQuestionData(subQuestionData) as DemoRubricItem[];
  }
  const snapshot = getDemoWorkspaceSnapshot();
  return snapshot.rubrics as DemoRubricItem[];
}

export function getDemoDiagnosisStudents(): DemoDiagnosisStudent[] {
  return DEMO_STUDENT_PROFILES.map(({ id, name, pattern }) => ({
    id,
    name,
    levelBySubQuestionId: buildLevelBySubQuestionId(pattern),
  }));
}

export function buildDemoStudentAnswers(
  rubrics: DemoRubricItem[],
  student: DemoDiagnosisStudent,
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const rubric of rubrics) {
    const level = student.levelBySubQuestionId[rubric.sub_question_id] ?? "중";
    answers[rubric.sub_question_id] = pickSimulationExample(rubric.sub_question_id, level, rubric);
  }
  return answers;
}

const LEVEL_SCORE: Record<DemoLevel, number> = { 상: 2, 중: 1, 하: 0 };

function scoreToAverageLevel(score: number): DemoLevel | "-" {
  if (score >= 1.5) return "상";
  if (score >= 0.5) return "중";
  return "하";
}

function scoreToGradeFrom100(score_100: number): string {
  if (score_100 >= 80) return "A";
  if (score_100 >= 60) return "B";
  if (score_100 >= 40) return "C";
  if (score_100 >= 20) return "D";
  return "F";
}

function summarizeDemoFeedbacks(feedbacks: string[]): string | null {
  const texts = feedbacks.map((f) => f.trim()).filter(Boolean);
  if (texts.length === 0) return null;
  if (texts.length === 1) return texts[0];
  return `${texts[0]} ${texts.length > 1 ? `외 ${texts.length - 1}건의 피드백을 종합하면, 전반적으로 이 단계에 대한 이해가 드러납니다.` : ""}`.trim();
}

export interface DemoDiagnosisReport {
  problem_rows: Array<{
    problem_id: string;
    step_count: number;
    high_count: number;
    mid_count: number;
    low_count: number;
    average_level: DemoLevel | "-";
  }>;
  step_rows: Array<{
    display_code: string;
    problem_count: number;
    score_100?: number;
    final_level: string;
    feedback_summary?: string | null;
  }>;
}

export function buildDemoDiagnosisReport(
  problemSummaries: Array<{
    problem_id: string;
    levelsByDisplayCode: Record<string, DemoLevel>;
    feedbackByDisplayCode?: Record<string, string>;
  }>,
): DemoDiagnosisReport {
  const problem_rows: DemoDiagnosisReport["problem_rows"] = [];

  for (const summary of problemSummaries) {
    const levels = Object.values(summary.levelsByDisplayCode);
    const total = levels.length;
    const high_count = levels.filter((lv) => lv === "상").length;
    const mid_count = levels.filter((lv) => lv === "중").length;
    const low_count = levels.filter((lv) => lv === "하").length;
    const average_level =
      total > 0 ? scoreToAverageLevel(levels.reduce((sum, lv) => sum + LEVEL_SCORE[lv], 0) / total) : "-";

    problem_rows.push({
      problem_id: summary.problem_id,
      step_count: total,
      high_count,
      mid_count,
      low_count,
      average_level,
    });
  }

  const perStepAgg: Record<string, { count: number; totalScore: number }> = {};
  const perStepFeedbacks: Record<string, string[]> = {};

  for (const summary of problemSummaries) {
    for (const [code, level] of Object.entries(summary.levelsByDisplayCode)) {
      if (!perStepAgg[code]) perStepAgg[code] = { count: 0, totalScore: 0 };
      perStepAgg[code].count += 1;
      perStepAgg[code].totalScore += LEVEL_SCORE[level];
    }
    for (const [code, feedback] of Object.entries(summary.feedbackByDisplayCode ?? {})) {
      if (feedback?.trim()) {
        (perStepFeedbacks[code] ??= []).push(feedback.trim());
      }
    }
  }

  const step_rows: DemoDiagnosisReport["step_rows"] = Object.entries(perStepAgg)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([display_code, agg]) => {
      const score_100 = (agg.totalScore / (agg.count * 2)) * 100;
      return {
        display_code,
        problem_count: agg.count,
        score_100: Math.round(score_100 * 10) / 10,
        final_level: scoreToGradeFrom100(score_100),
        feedback_summary: summarizeDemoFeedbacks(perStepFeedbacks[display_code] ?? []),
      };
    });

  return { problem_rows, step_rows };
}

export function buildDemoDiagnosisReportFromSummaries(
  perStudent: Record<
    string,
    {
      problemId: string;
      levelsByDisplayCode: Record<string, DemoLevel>;
      feedbackByDisplayCode?: Record<string, string>;
    }
  >,
): DemoDiagnosisReport {
  return buildDemoDiagnosisReport(
    Object.entries(perStudent).map(([problem_id, summary]) => ({
      problem_id,
      levelsByDisplayCode: summary.levelsByDisplayCode,
      feedbackByDisplayCode: summary.feedbackByDisplayCode,
    })),
  );
}

export function diagnoseDemoStudentAnswer(
  rubric: DemoRubricItem,
  studentAnswer: string,
): { level: DemoLevel; reason: string } {
  const trimmed = studentAnswer.trim();
  for (const lv of rubric.levels) {
    if (lv.examples.some((ex) => ex.trim() === trimmed)) {
      return { level: lv.level, reason: lv.description };
    }
  }
  for (const lv of rubric.levels) {
    if (lv.examples.some((ex) => trimmed.includes(ex.trim()) || ex.trim().includes(trimmed))) {
      return { level: lv.level, reason: lv.description };
    }
  }
  const mid = rubric.levels.find((lv) => lv.level === "중");
  return { level: "중", reason: mid?.description ?? "부분적으로 이해한 답변으로 보입니다." };
}

export interface DemoDiagnosisSeed {
  problemId: string;
  historyItem: { problem_id: string };
  students: Array<{ id: string; name: string }>;
  studentAnswers: Record<string, Record<string, Record<string, string>>>;
  diagnosisResults: Record<string, Record<string, Record<string, { level: string; reason: string }>>>;
  canDiagnose: Record<string, Record<string, boolean>>;
  studentProblemSummaries: Record<
    string,
    Record<
      string,
      {
        problemId: string;
        levelsByDisplayCode: Record<string, DemoLevel>;
        feedbackByDisplayCode?: Record<string, string>;
      }
    >
  >;
  currentStudentId: string;
  /** 학생별 미리 계산된 진단 리포트 (데모에서 API 없이 즉시 표시) */
  reportsByStudentId: Record<string, DemoDiagnosisReport>;
}

/** 학생 진단 화면에 넣을 데모 예시 데이터 (답안·진단·리포트 프리로드) */
export function getDemoDiagnosisSeed(
  problemId: string = DEMO_PROBLEM_ID,
  rubrics: DemoRubricItem[] = buildDemoRubricsWithSimulation(),
): DemoDiagnosisSeed {
  const students = getDemoDiagnosisStudents();

  const studentAnswers: DemoDiagnosisSeed["studentAnswers"] = {};
  const diagnosisResults: DemoDiagnosisSeed["diagnosisResults"] = {};
  const canDiagnose: DemoDiagnosisSeed["canDiagnose"] = {};
  const studentProblemSummaries: DemoDiagnosisSeed["studentProblemSummaries"] = {};
  const reportsByStudentId: DemoDiagnosisSeed["reportsByStudentId"] = {};

  for (const student of students) {
    const answers = buildDemoStudentAnswers(rubrics, student);
    studentAnswers[student.id] = { [problemId]: answers };
    canDiagnose[student.id] = { [problemId]: true };

    const perProblemResults: Record<string, { level: string; reason: string }> = {};
    const levelsByDisplayCode: Record<string, DemoLevel> = {};
    const feedbackByDisplayCode: Record<string, string> = {};

    for (const rubric of rubrics) {
      const answer = answers[rubric.sub_question_id] ?? "";
      const result = diagnoseDemoStudentAnswer(rubric, answer);
      perProblemResults[rubric.sub_question_id] = result;
      levelsByDisplayCode[rubric.sub_question_id] = result.level;
      feedbackByDisplayCode[rubric.sub_question_id] = result.reason;
    }

    diagnosisResults[student.id] = { [problemId]: perProblemResults };
    const summary = {
      problemId,
      levelsByDisplayCode,
      feedbackByDisplayCode,
    };
    studentProblemSummaries[student.id] = { [problemId]: summary };
    reportsByStudentId[student.id] = buildDemoDiagnosisReport([
      {
        problem_id: problemId,
        levelsByDisplayCode,
        feedbackByDisplayCode,
      },
    ]);
  }

  return {
    problemId,
    historyItem: { problem_id: problemId },
    students: students.map(({ id, name }) => ({ id, name })),
    studentAnswers,
    diagnosisResults,
    canDiagnose,
    studentProblemSummaries,
    reportsByStudentId,
    currentStudentId: students[0].id,
  };
}
