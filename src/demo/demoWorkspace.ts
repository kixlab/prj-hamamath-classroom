import type { CoTData, CoTStep } from "../types";
import { demoDelay, DEMO_LOADING_MS, DEMO_RESULT_LOAD_MS } from "./demoDelay";
import { getDemoSourceUserId } from "./demoAccount";
import { fetchHistoryListForUser, loadResultForUser, type SavedResult } from "../hooks/useStorage";
import example1Meta from "../../data/finalized_data/example1.json";
import example1Image from "../../data/finalized_data/example1.png?url";
import example4Meta from "../../data/finalized_data/example4.json";
import example4Image from "../../data/finalized_data/example4.png?url";
import example1EnMeta from "../../data/finalized_data/example1-en.json";
import example1EnImage from "../../data/finalized_data/example1-en.png?url";
import example4EnMeta from "../../data/finalized_data/example4-en.json";
import example4EnImage from "../../data/finalized_data/example4-en.png?url";
import {
  getDemoCotStepContents,
  getDemoSubQuestions,
  getDemoSubjectArea,
  resolveDemoProblemKey,
  type DemoProblemKey,
} from "./demoProfiles";
import { getDemoSimulationExamples } from "./demoSimulationExamples";

export const DEMO_PROBLEM_ID = "demo-example1";

const COT_FRAMEWORK: Array<Pick<CoTStep, "sub_skill_id" | "step_name" | "sub_skill_name" | "step_title">> = [
  { sub_skill_id: "1-1", step_name: "문제 이해", sub_skill_name: "핵심 정보 파악하기", step_title: "핵심 정보 파악하기" },
  { sub_skill_id: "1-2", step_name: "문제 이해", sub_skill_name: "문제 요지 확인하기", step_title: "문제 요지 확인하기" },
  { sub_skill_id: "2-1", step_name: "정보 구조화", sub_skill_name: "조건 정리하기", step_title: "조건 정리하기" },
  { sub_skill_id: "2-2", step_name: "정보 구조화", sub_skill_name: "조건 연결하기", step_title: "조건 연결하기" },
  { sub_skill_id: "3-1", step_name: "수학적 표현", sub_skill_name: "지식 활용하기", step_title: "지식 활용하기" },
  { sub_skill_id: "3-2", step_name: "수학적 표현", sub_skill_name: "식, 모델 세우기", step_title: "식, 모델 세우기" },
  { sub_skill_id: "4-1", step_name: "수학적 계산", sub_skill_name: "계산 실행하기", step_title: "계산 실행하기" },
  { sub_skill_id: "4-2", step_name: "수학적 계산", sub_skill_name: "결과 정리하기", step_title: "결과 정리하기" },
];

export interface DemoProblemInput {
  problem: string;
  answer: string;
  solution?: string;
  grade: string;
  semester?: string;
  imageData?: string | null;
  problemId?: string | null;
}

function buildCotSteps(stepContents: string[]): CoTStep[] {
  return COT_FRAMEWORK.map((frame, index) => ({
    step_number: index + 1,
    step_title: frame.step_title ?? frame.sub_skill_name ?? `단계 ${index + 1}`,
    step_content: stepContents[index] ?? "",
    sub_skill_id: frame.sub_skill_id,
    step_name: frame.step_name,
    sub_skill_name: frame.sub_skill_name,
    prompt_used: index === 0 ? "[데모] CoT 생성에 사용된 프롬프트 예시입니다." : null,
  }));
}

/** 1단계 입력값으로 데모 CoT 생성 (API 없이 2단계 표시용) */
export function buildDemoCotFromProblemInput(input: DemoProblemInput): CoTData {
  const problem = input.problem.trim();
  const answer = input.answer.trim();
  const key = resolveDemoProblemKey(input.problemId, problem);
  const stepContents = getDemoCotStepContents(key, problem, answer);

  return {
    problem,
    answer,
    grade: input.grade,
    semester: input.semester,
    main_solution: input.solution?.trim() ?? "",
    image_data: input.imageData ?? undefined,
    steps: buildCotSteps(stepContents),
    subject_area: getDemoSubjectArea(key),
  } as CoTData & { subject_area: string };
}

export type DemoSubQuestionData = {
  problem_id: string;
  main_problem: string;
  main_answer: string;
  main_solution: string;
  grade: string;
  semester?: string;
  subject_area: string;
  guide_sub_questions: Array<{
    sub_question_id: string;
    step_id: string;
    sub_skill_id: string;
    step_name: string;
    sub_skill_name: string;
    guide_sub_question: string;
    guide_sub_answer: string;
    system_prompt: string;
    user_prompt: string;
  }>;
};

export function buildDemoSubQuestionData(
  problemId: string | null | undefined,
  cotData: CoTData | null | undefined,
): DemoSubQuestionData {
  const problem = (cotData?.problem ?? "").trim();
  const answer = (cotData?.answer ?? "").trim();
  const key = resolveDemoProblemKey(problemId, problem);
  const subQuestions = getDemoSubQuestions(key, problem, answer);

  return {
    problem_id: problemId?.trim() || DEMO_PROBLEM_ID,
    main_problem: problem,
    main_answer: answer,
    main_solution: String((cotData as { main_solution?: string } | null)?.main_solution ?? ""),
    grade: cotData?.grade ?? "",
    semester: (cotData as { semester?: string } | null)?.semester,
    subject_area: getDemoSubjectArea(key),
    guide_sub_questions: subQuestions.map((sq) => ({
      sub_question_id: sq.sub_question_id,
      step_id: String(sq.step_id),
      sub_skill_id: sq.sub_skill_id,
      step_name: sq.step_name,
      sub_skill_name: sq.sub_skill_name,
      guide_sub_question: sq.final_question,
      guide_sub_answer: sq.final_answer,
      system_prompt: "[데모] 하위문항 생성 system prompt 예시",
      user_prompt: "[데모] 하위문항 생성 user prompt 예시",
    })),
  };
}

const RUBRIC_LEVEL_META_KO: Array<{ level: "상" | "중" | "하"; score: number; description: string; bullets: string[] }> = [
  {
    level: "상",
    score: 2,
    description: "핵심 개념을 정확히 설명한 만점 답변",
    bullets: ["문제의 핵심 조건을 정확히 파악했다.", "수학적 근거를 명확히 제시했다."],
  },
  {
    level: "중",
    score: 1,
    description: "일부 개념은 맞지만 설명이 불완전한 답변",
    bullets: ["핵심은 이해했으나 표현이나 근거가 부족하다."],
  },
  {
    level: "하",
    score: 0,
    description: "핵심 개념을 이해하지 못한 답변",
    bullets: ["문제 조건과 무관하거나 잘못된 접근을 했다."],
  },
];

const RUBRIC_LEVEL_META_EN: Array<{ level: "상" | "중" | "하"; score: number; description: string; bullets: string[] }> = [
  {
    level: "상",
    score: 2,
    description: "A complete answer that accurately explains the key concept",
    bullets: ["Identified the key conditions correctly.", "Provided clear mathematical reasoning."],
  },
  {
    level: "중",
    score: 1,
    description: "Partially correct but incomplete explanation",
    bullets: ["Shows some understanding but lacks precision or justification."],
  },
  {
    level: "하",
    score: 0,
    description: "Shows little or no understanding of the key concept",
    bullets: ["Irrelevant to the problem or uses an incorrect approach."],
  },
];

export function buildDemoRubricsFromSubQuestionData(
  subQuestionData: DemoSubQuestionData | null | undefined,
  problemKey?: DemoProblemKey,
): Array<{
  sub_question_id: string;
  step_name: string;
  sub_skill_name: string;
  question: string;
  answer: string;
  levels: Array<{
    level: "상" | "중" | "하";
    score: number;
    description: string;
    bullets: string[];
    examples: string[];
  }>;
}> {
  if (!subQuestionData?.guide_sub_questions?.length) return [];

  const key = problemKey ?? resolveDemoProblemKey(subQuestionData.problem_id, subQuestionData.main_problem);
  const simulated = getDemoSimulationExamples(key);
  const levelMeta = key === "example1-en" || key === "example4-en" ? RUBRIC_LEVEL_META_EN : RUBRIC_LEVEL_META_KO;

  return subQuestionData.guide_sub_questions.map((sq) => ({
    sub_question_id: sq.sub_question_id,
    step_name: sq.step_name,
    sub_skill_name: sq.sub_skill_name,
    question: sq.guide_sub_question,
    answer: sq.guide_sub_answer,
    levels: levelMeta.map((meta) => ({
      ...meta,
      examples:
        simulated[sq.sub_question_id]?.[meta.level]?.length > 0
          ? simulated[sq.sub_question_id][meta.level]
          : meta.level === "상"
            ? [sq.guide_sub_answer]
            : [],
    })),
  }));
}

export interface DemoWorkflowPack {
  problemKey: DemoProblemKey;
  subQuestionData: DemoSubQuestionData;
  rubrics: ReturnType<typeof buildDemoRubricsFromSubQuestionData>;
}

export function buildDemoWorkflowPack(
  problemId: string | null | undefined,
  cotData: CoTData | null | undefined,
): DemoWorkflowPack {
  const problemKey = resolveDemoProblemKey(problemId, cotData?.problem ?? "");
  const subQuestionData = buildDemoSubQuestionData(problemId, cotData);
  const rubrics = buildDemoRubricsFromSubQuestionData(subQuestionData, problemKey);
  return { problemKey, subQuestionData, rubrics };
}

function normalizeProblemJsonId(problemId: string): string {
  const id = problemId.trim();
  return id.endsWith(".json") ? id : `${id}.json`;
}

const KNOWN_DEMO_PROBLEM_FILES: Record<
  string,
  { meta: { main_problem: string; main_answer: string; main_solution?: string; grade: string; semester?: string }; image: string }
> = {
  "example1.json": { meta: example1Meta as any, image: example1Image },
  "example4.json": { meta: example4Meta as any, image: example4Image },
  "example1-en.json": { meta: example1EnMeta as any, image: example1EnImage },
  "example4-en.json": { meta: example4EnMeta as any, image: example4EnImage },
};

function buildDemoPackFromProblemFile(problemId: string): DemoWorkflowPack | null {
  const jsonId = normalizeProblemJsonId(problemId);
  const known = KNOWN_DEMO_PROBLEM_FILES[jsonId];
  if (!known) return null;
  const cotData = buildDemoCotFromProblemInput({
    problem: known.meta.main_problem,
    answer: known.meta.main_answer,
    solution: known.meta.main_solution,
    grade: known.meta.grade,
    semester: known.meta.semester,
    imageData: known.image,
    problemId: jsonId,
  });
  return buildDemoWorkflowPack(jsonId, cotData);
}

function buildLegacySnapshotCotData(): CoTData {
  const meta = example1Meta as {
    main_problem: string;
    main_answer: string;
    main_solution?: string;
    grade: string;
    semester?: string;
  };
  const key = resolveDemoProblemKey("example1.json", meta.main_problem);
  return {
    problem: meta.main_problem,
    answer: meta.main_answer,
    grade: meta.grade,
    semester: meta.semester,
    main_solution: meta.main_solution ?? "",
    image_data: example1Image,
    steps: buildCotSteps(getDemoCotStepContents(key, meta.main_problem, meta.main_answer)),
    subject_area: getDemoSubjectArea(key),
  } as CoTData & { subject_area: string };
}

export interface DemoWorkspaceSnapshot {
  problemId: string;
  initialStep: number;
  cotData: CoTData;
  subQuestionData: DemoSubQuestionData;
  rubrics: ReturnType<typeof buildDemoRubricsFromSubQuestionData>;
}

/** 레거시 호환 — example1 기본 스냅샷 */
export function getDemoWorkspaceSnapshot(): DemoWorkspaceSnapshot {
  const cotData = buildLegacySnapshotCotData();
  const pack = buildDemoWorkflowPack(DEMO_PROBLEM_ID, cotData);
  return {
    problemId: DEMO_PROBLEM_ID,
    initialStep: 2,
    cotData,
    subQuestionData: pack.subQuestionData,
    rubrics: pack.rubrics,
  };
}

export interface DemoWorkspaceSetters {
  setCurrentProblemId: (id: string | null) => void;
  setCurrentCotData: (data: CoTData | null) => void;
  setCurrentSubQData: (data: any | null) => void;
  setCurrentSubQuestionData: (data: any | null) => void;
  setFinalizedSubQuestionForRubric: (data: any | null) => void;
  setCurrentRubrics: (rubrics: any[] | null) => void;
  setPreferredVersion: (version: Record<string, "original" | "regenerated">) => void;
  setCurrentStep: (step: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export function applySavedResultToSetters(result: SavedResult, setters: DemoWorkspaceSetters): void {
  setters.setCurrentProblemId(result.problemId);
  setters.setCurrentCotData(result.cotData);
  setters.setCurrentSubQData(result.subQData ?? null);
  setters.setCurrentSubQuestionData(result.subQuestionData ?? null);
  setters.setPreferredVersion(result.preferredVersion ?? {});

  if (result.rubrics?.length) {
    setters.setFinalizedSubQuestionForRubric(result.subQuestionData ?? null);
    setters.setCurrentRubrics(result.rubrics);
    setters.setCurrentStep(4);
  } else if (result.subQuestionData && result.cotData) {
    setters.setFinalizedSubQuestionForRubric(result.subQuestionData);
    setters.setCurrentStep(3);
  } else if (result.cotData) {
    setters.setCurrentStep(2);
  } else {
    setters.setCurrentStep(1);
  }
}

export async function applyDemoWorkspace(setters: DemoWorkspaceSetters): Promise<void> {
  const sourceUserId = getDemoSourceUserId();
  setters.setError(null);
  setters.setLoading(true);
  setters.setCurrentProblemId(null);
  setters.setCurrentCotData(null);
  setters.setCurrentSubQData(null);
  setters.setCurrentSubQuestionData(null);
  setters.setFinalizedSubQuestionForRubric(null);
  setters.setCurrentRubrics(null);
  setters.setPreferredVersion({});
  setters.setCurrentStep(1);

  await demoDelay(DEMO_LOADING_MS);

  if (sourceUserId) {
    const list = await fetchHistoryListForUser(sourceUserId);
    if (list.length === 0) {
      setters.setLoading(false);
      return;
    }
    const result = await loadResultForUser(list[0].problemId, sourceUserId);
    if (result) {
      applySavedResultToSetters(result, setters);
      setters.setLoading(false);
      return;
    }
  }

  setters.setLoading(false);
}

/** 사이드바 등에서 test 저장 결과를 불러오는 것처럼 워크플로 복원 */
export async function loadDemoSavedWorkflow(problemId: string, setters: DemoWorkspaceSetters): Promise<boolean> {
  const sourceUserId = getDemoSourceUserId();
  setters.setError(null);
  setters.setLoading(true);
  setters.setCurrentProblemId(null);
  setters.setCurrentCotData(null);
  setters.setCurrentSubQData(null);
  setters.setCurrentSubQuestionData(null);
  setters.setFinalizedSubQuestionForRubric(null);
  setters.setCurrentRubrics(null);
  setters.setPreferredVersion({});
  setters.setCurrentStep(1);

  await demoDelay(DEMO_RESULT_LOAD_MS);

  if (sourceUserId) {
    const result = await loadResultForUser(problemId, sourceUserId);
    if (result) {
      applySavedResultToSetters(result, setters);
      setters.setLoading(false);
      return true;
    }
    setters.setLoading(false);
    return false;
  }

  const pack = buildDemoPackFromProblemFile(problemId);
  if (!pack) {
    setters.setLoading(false);
    return false;
  }

  const jsonId = normalizeProblemJsonId(problemId);
  const known = KNOWN_DEMO_PROBLEM_FILES[jsonId];
  const cotData = buildDemoCotFromProblemInput({
    problem: known.meta.main_problem,
    answer: known.meta.main_answer,
    solution: known.meta.main_solution,
    grade: known.meta.grade,
    semester: known.meta.semester,
    imageData: known.image,
    problemId: jsonId,
  });

  setters.setCurrentProblemId(problemId);
  setters.setCurrentCotData(cotData);
  setters.setCurrentSubQData(null);
  setters.setCurrentSubQuestionData(pack.subQuestionData);
  setters.setFinalizedSubQuestionForRubric(pack.subQuestionData);
  setters.setCurrentRubrics(pack.rubrics);
  setters.setPreferredVersion({});
  setters.setCurrentStep(4);
  setters.setLoading(false);
  return true;
}
