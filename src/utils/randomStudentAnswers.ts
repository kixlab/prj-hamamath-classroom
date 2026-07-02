type RubricLevel = "상" | "중" | "하";

const LEVELS: RubricLevel[] = ["상", "중", "하"];

export interface RubricForRandomAnswer {
  sub_question_id: string;
  answer?: string;
  levels: Array<{
    level: RubricLevel;
    description?: string;
    examples?: string[];
  }>;
}

function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

function pickAnswerForLevel(rubric: RubricForRandomAnswer, level: RubricLevel): string {
  const lv = rubric.levels.find((l) => l.level === level);
  const examples = (lv?.examples ?? []).map((e) => e.trim()).filter(Boolean);
  if (examples.length > 0) return pickRandom(examples) ?? "";
  if (level === "상" && rubric.answer?.trim()) return rubric.answer.trim();
  return lv?.description?.trim() ?? "";
}

/** 루브릭 상·중·하 예시에서 하위문항별 랜덤 답안 조합 */
export function buildRandomAnswersFromRubrics(rubrics: RubricForRandomAnswer[]): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const rubric of rubrics) {
    const level = pickRandom(LEVELS) ?? "중";
    answers[rubric.sub_question_id] = pickAnswerForLevel(rubric, level);
  }
  return answers;
}
