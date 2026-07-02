import example1Meta from "../../data/finalized_data/example1.json";
import example4Meta from "../../data/finalized_data/example4.json";
import example1EnMeta from "../../data/finalized_data/example1-en.json";
import example4EnMeta from "../../data/finalized_data/example4-en.json";

const DEMO_EXAMPLE1_ALIAS = "demo-example1";

export type DemoProblemKey = "example1" | "example4" | "example1-en" | "example4-en" | "generic";

type FinalizedSubQuestion = {
  sub_question_id: string;
  step_id: number;
  sub_skill_id: string;
  step_name: string;
  sub_skill_name: string;
  final_question: string;
  final_answer: string;
};

const FRAMEWORK_STEP_NAMES_KO = [
  { step_name: "문제 이해", sub_skill_name: "핵심 정보 파악하기" },
  { step_name: "문제 이해", sub_skill_name: "문제 요지 확인하기" },
  { step_name: "정보 구조화", sub_skill_name: "조건 정리하기" },
  { step_name: "정보 구조화", sub_skill_name: "조건 연결하기" },
  { step_name: "수학적 표현", sub_skill_name: "지식 활용하기" },
  { step_name: "수학적 표현", sub_skill_name: "식, 모델 세우기" },
  { step_name: "수학적 계산", sub_skill_name: "계산 실행하기" },
  { step_name: "수학적 계산", sub_skill_name: "결과 정리하기" },
] as const;

const FRAMEWORK_STEP_NAMES_EN = [
  { step_name: "Understanding", sub_skill_name: "Identify key information" },
  { step_name: "Understanding", sub_skill_name: "Clarify what to find" },
  { step_name: "Structuring", sub_skill_name: "Organize conditions" },
  { step_name: "Structuring", sub_skill_name: "Connect conditions" },
  { step_name: "Mathematical expression", sub_skill_name: "Apply knowledge" },
  { step_name: "Mathematical expression", sub_skill_name: "Set up an equation or model" },
  { step_name: "Calculation", sub_skill_name: "Carry out calculations" },
  { step_name: "Calculation", sub_skill_name: "State the result" },
] as const;

const STEP_IDS = ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"] as const;

function toSubQuestions(
  items: Array<{ final_question: string; final_answer: string }>,
  labels: typeof FRAMEWORK_STEP_NAMES_KO | typeof FRAMEWORK_STEP_NAMES_EN,
): FinalizedSubQuestion[] {
  return items.map((item, index) => {
    const id = STEP_IDS[index];
    const frame = labels[index];
    return {
      sub_question_id: id,
      step_id: Number(id.split("-")[0]),
      sub_skill_id: id,
      step_name: frame.step_name,
      sub_skill_name: frame.sub_skill_name,
      final_question: item.final_question,
      final_answer: item.final_answer,
    };
  });
}

const EXAMPLE1_SUB_QUESTIONS = toSubQuestions(
  [
    { final_question: "문제에서 주어진 핵심 정보를 모두 골라 보세요.", final_answer: "동화책은 314쪽이다.\n민영이는 매일 23쪽씩 읽는다." },
    { final_question: "이 문제에서 구해야 하는 것은 무엇인가요?", final_answer: "동화책을 끝까지 읽는 데 걸리는 일수" },
    { final_question: "전체 쪽수와 하루에 읽는 쪽수를 이용해 어떤 계산이 필요한지 적어 보세요.", final_answer: "314 ÷ 23" },
    { final_question: "나눗셈의 몫과 나머지가 각각 무엇을 의미하는지 설명해 보세요.", final_answer: "몫은 23쪽씩 읽는 날 수이고, 나머지는 마지막에 더 읽어야 하는 쪽수이다." },
    { final_question: "나머지가 있을 때 읽는 일수를 구하는 방법을 설명해 보세요.", final_answer: "몫에 1일을 더한다." },
    { final_question: "읽는 데 걸리는 일수를 구하는 식을 세워 보세요.", final_answer: "$$314 \\div 23$$" },
    { final_question: "$314 \\div 23$을 계산해 보세요.", final_answer: "$13 \\ldots 15$" },
    { final_question: "동화책을 끝까지 읽는 데 걸리는 일수를 구해 보세요.", final_answer: "14일" },
  ],
  FRAMEWORK_STEP_NAMES_KO,
);

const EXAMPLE4_SUB_QUESTIONS = toSubQuestions(
  [
    { final_question: "문제에서 주어진 핵심 정보를 모두 골라 보세요.", final_answer: "우유는 1L(1000mL)이다.\n지호는 250mL를 마셨다.\n혜원은 300mL를 마셨다." },
    { final_question: "이 문제에서 구해야 하는 것은 무엇인가요?", final_answer: "남은 우유의 양(mL)" },
    { final_question: "전체 우유량과 마신 양을 이용해 어떤 계산이 필요한지 적어 보세요.", final_answer: "1000 - 250 - 300" },
    { final_question: "왜 전체에서 마신 양을 빼야 하는지 설명해 보세요.", final_answer: "남은 양을 구하려면 전체에서 마신 양의 합을 빼야 하기 때문이다." },
    { final_question: "1L를 mL로 바꾸면 몇 mL인지 적어 보세요.", final_answer: "1000mL" },
    { final_question: "남은 우유의 양을 구하는 식을 세워 보세요.", final_answer: "$$1000 - 250 - 300$$" },
    { final_question: "$1000 - 250 - 300$을 계산해 보세요.", final_answer: "450" },
    { final_question: "남은 우유의 양을 구해 보세요.", final_answer: "450mL" },
  ],
  FRAMEWORK_STEP_NAMES_KO,
);

const EXAMPLE1_EN_SUB_QUESTIONS = toSubQuestions(
  [
    { final_question: "List all key information given in the problem.", final_answer: "The storybook has 314 pages.\nMike reads 23 pages each day." },
    { final_question: "What are you asked to find?", final_answer: "The number of days to finish the book" },
    { final_question: "What calculation is needed using the total pages and pages read per day?", final_answer: "314 ÷ 23" },
    { final_question: "Explain what the quotient and remainder mean in this situation.", final_answer: "The quotient is the number of full days reading 23 pages; the remainder is pages left for one more day." },
    { final_question: "How do you find the total days when there is a remainder?", final_answer: "Add 1 day to the quotient." },
    { final_question: "Write an expression for the number of days.", final_answer: "$$314 \\div 23$$" },
    { final_question: "Calculate $314 \\div 23$.", final_answer: "$13 \\ldots 15$" },
    { final_question: "How many days does it take to finish the book?", final_answer: "14 days" },
  ],
  FRAMEWORK_STEP_NAMES_EN,
);

const EXAMPLE4_EN_SUB_QUESTIONS = toSubQuestions(
  [
    { final_question: "List all key information given in the problem.", final_answer: "There is 1 L (1000 mL) of milk.\nJack drank 250 mL.\nHarry drank 300 mL." },
    { final_question: "What are you asked to find?", final_answer: "The amount of milk left in milliliters" },
    { final_question: "What calculation is needed using the total and amounts drunk?", final_answer: "1000 - 250 - 300" },
    { final_question: "Why should you subtract the amounts drunk from the total?", final_answer: "To find what remains after both people drank." },
    { final_question: "How many milliliters are in 1 L?", final_answer: "1000 mL" },
    { final_question: "Write an expression for the amount of milk left.", final_answer: "$$1000 - 250 - 300$$" },
    { final_question: "Calculate $1000 - 250 - 300$.", final_answer: "450" },
    { final_question: "How many milliliters of milk are left?", final_answer: "450 mL" },
  ],
  FRAMEWORK_STEP_NAMES_EN,
);

export const EXAMPLE1_COT_STEP_CONTENTS = [
  "동화책은 314쪽이고, 민영이는 매일 23쪽씩 읽는다는 정보가 중요합니다.",
  "구해야 하는 것은 동화책을 끝까지 읽는 데 걸리는 일수입니다.",
  "314쪽을 23쪽씩 나누면 몇 일 동안 읽는지 구할 수 있습니다.",
  "314 ÷ 23을 계산하면 몫과 나머지를 구할 수 있습니다.",
  "나머지가 있으면 하루를 더 읽어야 하므로, 몫에 1일을 더해야 합니다.",
  "314 ÷ 23 = 13 … 15이므로 13일을 읽고 15쪽을 더 읽는 데 1일이 더 필요합니다.",
  "따라서 13 + 1 = 14일이 걸립니다.",
  "동화책을 끝까지 읽는 데 14일이 걸립니다.",
];

export const EXAMPLE4_COT_STEP_CONTENTS = [
  "우유는 1L이고, 지호는 250mL, 혜원은 300mL를 마셨다는 정보가 중요합니다.",
  "구해야 하는 것은 남은 우유의 양입니다.",
  "1L는 1000mL이므로 전체 양을 먼저 확인할 수 있습니다.",
  "전체 1000mL에서 마신 양 250mL와 300mL를 빼면 남은 양을 구할 수 있습니다.",
  "단위를 mL로 맞춘 뒤 빼기를 해야 합니다.",
  "남은 양은 $1000 - 250 - 300$으로 나타낼 수 있습니다.",
  "$1000 - 250 - 300 = 450$이므로 450mL가 남습니다.",
  "남은 우유의 양은 450mL입니다.",
];

export const EXAMPLE1_EN_COT_STEP_CONTENTS = [
  "The book has 314 pages and Mike reads 23 pages each day.",
  "We need to find how many days it takes to finish the book.",
  "Dividing 314 by 23 gives the number of full reading days.",
  "The quotient and remainder tell us full days and leftover pages.",
  "If pages remain, one more day is needed beyond the quotient.",
  "314 ÷ 23 = 13 … 15, so 13 days plus 1 more day for 15 pages.",
  "Therefore 13 + 1 = 14 days in total.",
  "It takes 14 days to finish the book.",
];

export const EXAMPLE4_EN_COT_STEP_CONTENTS = [
  "There is 1 L of milk; Jack drank 250 mL and Harry drank 300 mL.",
  "We need to find how many milliliters of milk are left.",
  "1 L equals 1000 mL, so we work in milliliters.",
  "Subtract the amounts drunk from the total to find what remains.",
  "Both amounts must be subtracted from 1000 mL.",
  "The remaining amount can be written as $1000 - 250 - 300$.",
  "$1000 - 250 - 300 = 450$, so 450 mL remain.",
  "450 mL of milk are left.",
];

export const GENERIC_COT_STEP_CONTENTS_KO = [
  "문제에서 주어진 핵심 정보와 수치를 파악합니다.",
  "문제가 요구하는 것이 무엇인지 확인합니다.",
  "주어진 조건을 체계적으로 정리합니다.",
  "조건 사이의 관계를 연결하여 풀이 방향을 잡습니다.",
  "문제 해결에 필요한 수학적 지식을 활용합니다.",
  "조건을 식이나 모델로 표현합니다.",
  "계산을 단계적으로 수행합니다.",
  "구한 결과를 문제 상황에 맞게 정리합니다.",
];

export const GENERIC_COT_STEP_CONTENTS_EN = [
  "Identify the key information and values in the problem.",
  "Clarify what the problem is asking you to find.",
  "Organize the given conditions systematically.",
  "Connect the conditions to decide on a solution approach.",
  "Apply the mathematical knowledge needed to solve the problem.",
  "Express the conditions as an equation or model.",
  "Carry out the calculations step by step.",
  "State the result in the context of the problem.",
];

function buildGenericSubQuestions(
  mainProblem: string,
  mainAnswer: string,
  english: boolean,
): FinalizedSubQuestion[] {
  const labels = english ? FRAMEWORK_STEP_NAMES_EN : FRAMEWORK_STEP_NAMES_KO;
  const prompts = english
    ? [
        "List the key information given in the problem.",
        "What are you asked to find?",
        "What calculation or reasoning is needed from the conditions?",
        "Explain how the conditions are connected.",
        "What mathematical knowledge should you use?",
        "Write an equation or model for this problem.",
        "Carry out the calculation.",
        "State the final answer.",
      ]
    : [
        "문제에서 주어진 핵심 정보를 모두 골라 보세요.",
        "이 문제에서 구해야 하는 것은 무엇인가요?",
        "주어진 조건으로 어떤 계산이나 추론이 필요한지 적어 보세요.",
        "조건들이 어떻게 연결되는지 설명해 보세요.",
        "어떤 수학적 지식을 활용해야 하는지 설명해 보세요.",
        "이 문제를 풀기 위한 식을 세워 보세요.",
        "계산을 수행해 보세요.",
        "최종 답을 구해 보세요.",
      ];

  return prompts.map((final_question, index) => {
    const id = STEP_IDS[index];
    const frame = labels[index];
    const final_answer = index === prompts.length - 1 ? mainAnswer.trim() : mainProblem.trim().slice(0, 280);
    return {
      sub_question_id: id,
      step_id: Number(id.split("-")[0]),
      sub_skill_id: id,
      step_name: frame.step_name,
      sub_skill_name: frame.sub_skill_name,
      final_question,
      final_answer,
    };
  });
}

const PROFILE_META: Record<
  DemoProblemKey,
  {
    subQuestions: FinalizedSubQuestion[] | ((mainProblem: string, mainAnswer: string) => FinalizedSubQuestion[]);
    cotSteps: string[];
    subjectArea: string;
    english: boolean;
  }
> = {
  example1: { subQuestions: EXAMPLE1_SUB_QUESTIONS, cotSteps: EXAMPLE1_COT_STEP_CONTENTS, subjectArea: "수와 연산", english: false },
  example4: { subQuestions: EXAMPLE4_SUB_QUESTIONS, cotSteps: EXAMPLE4_COT_STEP_CONTENTS, subjectArea: "수와 연산", english: false },
  "example1-en": { subQuestions: EXAMPLE1_EN_SUB_QUESTIONS, cotSteps: EXAMPLE1_EN_COT_STEP_CONTENTS, subjectArea: "Number & Operations", english: true },
  "example4-en": { subQuestions: EXAMPLE4_EN_SUB_QUESTIONS, cotSteps: EXAMPLE4_EN_COT_STEP_CONTENTS, subjectArea: "Number & Operations", english: true },
  generic: {
    subQuestions: (p, a) => buildGenericSubQuestions(p, a, false),
    cotSteps: GENERIC_COT_STEP_CONTENTS_KO,
    subjectArea: "수와 연산",
    english: false,
  },
};

function normalizeProblemJsonId(problemId: string | null | undefined): string {
  const id = (problemId ?? "").trim();
  if (!id) return "";
  return id.endsWith(".json") ? id : `${id}.json`;
}

function matchesMeta(problem: string, meta: { main_problem?: string }): boolean {
  return problem.trim() === String(meta.main_problem ?? "").trim();
}

/** problemId·본문으로 데모 프로필 키 결정 */
export function resolveDemoProblemKey(problemId: string | null | undefined, problem: string): DemoProblemKey {
  const jsonId = normalizeProblemJsonId(problemId);
  if (jsonId === "example1.json" || problemId?.trim() === DEMO_EXAMPLE1_ALIAS) return "example1";
  if (jsonId === "example4.json") return "example4";
  if (jsonId === "example1-en.json") return "example1-en";
  if (jsonId === "example4-en.json") return "example4-en";

  if (matchesMeta(problem, example1Meta)) return "example1";
  if (matchesMeta(problem, example4Meta)) return "example4";
  if (matchesMeta(problem, example1EnMeta)) return "example1-en";
  if (matchesMeta(problem, example4EnMeta)) return "example4-en";

  const isMostlyAscii = /^[\x00-\x7F\s$\\.,!?;:()\-+×÷=…'"[\]{}^_%]+$/.test(problem.trim());
  return isMostlyAscii ? "generic" : "generic";
}

export function getDemoCotStepContents(key: DemoProblemKey, problem: string, mainAnswer: string): string[] {
  if (key === "generic") {
    const english = /^[\x00-\x7F\s$\\.,!?;:()\-+×÷=…'"[\]{}^_%]+$/.test(`${problem} ${mainAnswer}`.trim());
    return english ? GENERIC_COT_STEP_CONTENTS_EN : GENERIC_COT_STEP_CONTENTS_KO;
  }
  return PROFILE_META[key].cotSteps;
}

export function getDemoSubQuestions(
  key: DemoProblemKey,
  mainProblem: string,
  mainAnswer: string,
): FinalizedSubQuestion[] {
  const profile = PROFILE_META[key];
  const subs = profile.subQuestions;
  if (typeof subs === "function") {
    const english = /^[\x00-\x7F\s$\\.,!?;:()\-+×÷=…'"[\]{}^_%]+$/.test(`${mainProblem} ${mainAnswer}`.trim());
    return buildGenericSubQuestions(mainProblem, mainAnswer, english);
  }
  return subs;
}

export function getDemoSubjectArea(key: DemoProblemKey): string {
  return PROFILE_META[key].subjectArea;
}

export function isDemoEnglishProfile(key: DemoProblemKey): boolean {
  if (key === "generic") return false;
  return PROFILE_META[key].english;
}
