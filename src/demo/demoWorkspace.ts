import type { CoTData, CoTStep } from "../types";
import { demoDelay } from "./demoDelay";
import example1Meta from "../../data/finalized_data/example1.json";
import example1Image from "../../data/finalized_data/example1.png?url";

const DEMO_PROBLEM_ID = "demo-example1";

type FinalizedSubQuestion = {
  sub_question_id: string;
  step_id: number;
  sub_skill_id: string;
  step_name: string;
  sub_skill_name: string;
  final_question: string;
  final_answer: string;
};

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

const COT_STEP_CONTENTS = [
  "동화책은 314쪽이고, 민영이는 매일 23쪽씩 읽는다는 정보가 중요합니다.",
  "구해야 하는 것은 동화책을 끝까지 읽는 데 걸리는 일수입니다.",
  "314쪽을 23쪽씩 나누면 몇 일 동안 읽는지 구할 수 있습니다.",
  "314 ÷ 23을 계산하면 몫과 나머지를 구할 수 있습니다.",
  "나머지가 있으면 하루를 더 읽어야 하므로, 몫에 1일을 더해야 합니다.",
  "314 ÷ 23 = 13 … 15이므로 13일을 읽고 15쪽을 더 읽는 데 1일이 더 필요합니다.",
  "따라서 13 + 1 = 14일이 걸립니다.",
  "동화책을 끝까지 읽는 데 14일이 걸립니다.",
];

const DEMO_SUB_QUESTIONS: FinalizedSubQuestion[] = [
  {
    sub_question_id: "1-1",
    step_id: 1,
    sub_skill_id: "1-1",
    step_name: "문제 이해",
    sub_skill_name: "핵심 정보 파악하기",
    final_question: "문제에서 주어진 핵심 정보를 모두 골라 보세요.",
    final_answer: "동화책은 314쪽이다.\n민영이는 매일 23쪽씩 읽는다.",
  },
  {
    sub_question_id: "1-2",
    step_id: 1,
    sub_skill_id: "1-2",
    step_name: "문제 이해",
    sub_skill_name: "문제 요지 확인하기",
    final_question: "이 문제에서 구해야 하는 것은 무엇인가요?",
    final_answer: "동화책을 끝까지 읽는 데 걸리는 일수",
  },
  {
    sub_question_id: "2-1",
    step_id: 2,
    sub_skill_id: "2-1",
    step_name: "정보 구조화",
    sub_skill_name: "조건 정리하기",
    final_question: "전체 쪽수와 하루에 읽는 쪽수를 이용해 어떤 계산이 필요한지 적어 보세요.",
    final_answer: "314 ÷ 23",
  },
  {
    sub_question_id: "2-2",
    step_id: 2,
    sub_skill_id: "2-2",
    step_name: "정보 구조화",
    sub_skill_name: "조건 연결하기",
    final_question: "나눗셈의 몫과 나머지가 각각 무엇을 의미하는지 설명해 보세요.",
    final_answer: "몫은 23쪽씩 읽는 날 수이고, 나머지는 마지막에 더 읽어야 하는 쪽수이다.",
  },
  {
    sub_question_id: "3-1",
    step_id: 3,
    sub_skill_id: "3-1",
    step_name: "수학적 표현",
    sub_skill_name: "지식 활용하기",
    final_question: "나머지가 있을 때 읽는 일수를 구하는 방법을 설명해 보세요.",
    final_answer: "몫에 1일을 더한다.",
  },
  {
    sub_question_id: "3-2",
    step_id: 3,
    sub_skill_id: "3-2",
    step_name: "수학적 표현",
    sub_skill_name: "식, 모델 세우기",
    final_question: "읽는 데 걸리는 일수를 구하는 식을 세워 보세요.",
    final_answer: "$$314 \\div 23$$",
  },
  {
    sub_question_id: "4-1",
    step_id: 4,
    sub_skill_id: "4-1",
    step_name: "수학적 계산",
    sub_skill_name: "계산 실행하기",
    final_question: "$314 \\div 23$을 계산해 보세요.",
    final_answer: "$13 \\ldots 15$",
  },
  {
    sub_question_id: "4-2",
    step_id: 4,
    sub_skill_id: "4-2",
    step_name: "수학적 계산",
    sub_skill_name: "결과 정리하기",
    final_question: "동화책을 끝까지 읽는 데 걸리는 일수를 구해 보세요.",
    final_answer: "14일",
  },
];

function buildCotData(): CoTData {
  const meta = example1Meta as {
    main_problem: string;
    main_answer: string;
    main_solution?: string;
    grade: string;
    semester?: string;
  };

  const steps: CoTStep[] = COT_FRAMEWORK.map((frame, index) => ({
    step_number: index + 1,
    step_title: frame.step_title ?? frame.sub_skill_name ?? `단계 ${index + 1}`,
    step_content: COT_STEP_CONTENTS[index] ?? "",
    sub_skill_id: frame.sub_skill_id,
    step_name: frame.step_name,
    sub_skill_name: frame.sub_skill_name,
    prompt_used: index === 0 ? "[데모] CoT 생성에 사용된 프롬프트 예시입니다." : null,
  }));

  return {
    problem: meta.main_problem,
    answer: meta.main_answer,
    grade: meta.grade,
    semester: meta.semester,
    main_solution: meta.main_solution ?? "",
    image_data: example1Image,
    steps,
    subject_area: "수와 연산",
  } as CoTData & { subject_area: string };
}

function buildSubQuestionData() {
  const meta = example1Meta as {
    main_problem: string;
    main_answer: string;
    main_solution?: string;
    grade: string;
    semester?: string;
  };

  const guide_sub_questions = DEMO_SUB_QUESTIONS.map((sq) => ({
    sub_question_id: sq.sub_question_id,
    step_id: String(sq.step_id),
    sub_skill_id: sq.sub_skill_id,
    step_name: sq.step_name,
    sub_skill_name: sq.sub_skill_name,
    guide_sub_question: sq.final_question,
    guide_sub_answer: sq.final_answer,
    system_prompt: "[데모] 하위문항 생성 system prompt 예시",
    user_prompt: "[데모] 하위문항 생성 user prompt 예시",
  }));

  return {
    problem_id: DEMO_PROBLEM_ID,
    main_problem: meta.main_problem,
    main_answer: meta.main_answer,
    main_solution: meta.main_solution ?? "",
    grade: meta.grade,
    semester: meta.semester,
    subject_area: "수와 연산",
    guide_sub_questions,
  };
}

function buildRubrics() {
  const subQuestionData = buildSubQuestionData();
  return (subQuestionData.guide_sub_questions as Array<{
    sub_question_id: string;
    step_name: string;
    sub_skill_name: string;
    guide_sub_question: string;
    guide_sub_answer: string;
  }>).map((sq) => ({
    sub_question_id: sq.sub_question_id,
    step_name: sq.step_name,
    sub_skill_name: sq.sub_skill_name,
    question: sq.guide_sub_question,
    answer: sq.guide_sub_answer,
    levels: [
      {
        level: "상" as const,
        score: 2,
        description: "핵심 개념을 정확히 설명한 만점 답변",
        bullets: ["문제의 핵심 조건을 정확히 파악했다.", "수학적 근거를 명확히 제시했다."],
        examples: [sq.guide_sub_answer],
      },
      {
        level: "중" as const,
        score: 1,
        description: "일부 개념은 맞지만 설명이 불완전한 답변",
        bullets: ["핵심은 이해했으나 표현이나 근거가 부족하다."],
        examples: [],
      },
      {
        level: "하" as const,
        score: 0,
        description: "핵심 개념을 이해하지 못한 답변",
        bullets: ["문제 조건과 무관하거나 잘못된 접근을 했다."],
        examples: [],
      },
    ],
  }));
}

export interface DemoWorkspaceSnapshot {
  problemId: string;
  initialStep: number;
  cotData: CoTData;
  subQuestionData: ReturnType<typeof buildSubQuestionData>;
  rubrics: ReturnType<typeof buildRubrics>;
}

export function getDemoWorkspaceSnapshot(): DemoWorkspaceSnapshot {
  const subQuestionData = buildSubQuestionData();
  return {
    problemId: DEMO_PROBLEM_ID,
    initialStep: 2,
    cotData: buildCotData(),
    subQuestionData,
    rubrics: buildRubrics(),
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

export async function applyDemoWorkspace(setters: DemoWorkspaceSetters): Promise<void> {
  const snapshot = getDemoWorkspaceSnapshot();
  setters.setError(null);
  setters.setLoading(true);
  setters.setCurrentProblemId(snapshot.problemId);
  setters.setCurrentCotData(snapshot.cotData);
  setters.setCurrentSubQData(null);
  setters.setCurrentSubQuestionData(null);
  setters.setFinalizedSubQuestionForRubric(null);
  setters.setCurrentRubrics(null);
  setters.setPreferredVersion({});
  setters.setCurrentStep(snapshot.initialStep);

  await demoDelay();

  setters.setLoading(false);
}
