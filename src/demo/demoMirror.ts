import { getDemoSourceUserId } from "./demoAccount";
import {
  buildDemoRubricsFromSubQuestionData,
  buildDemoSubQuestionData,
  type DemoSubQuestionData,
} from "./demoWorkspace";
import { loadResultForUser, type SavedResult } from "../hooks/useStorage";

let cachedProblemId: string | null = null;
let cachedResult: SavedResult | null | undefined;

/** test 계정에 저장된 결과를 데모가 그대로 미러링할 때 사용 */
export async function loadMirroredTestResult(problemId: string | null | undefined): Promise<SavedResult | null> {
  const pid = problemId?.trim();
  const sourceUserId = getDemoSourceUserId();
  if (!pid || !sourceUserId) return null;

  if (cachedProblemId === pid && cachedResult !== undefined) {
    return cachedResult;
  }

  try {
    cachedResult = await loadResultForUser(pid, sourceUserId);
  } catch {
    cachedResult = null;
  }
  cachedProblemId = pid;
  return cachedResult;
}

export function clearMirroredTestResultCache(): void {
  cachedProblemId = null;
  cachedResult = undefined;
}

/** 3단계 데모: test 저장 하위문항이 있으면 우선 사용 */
export function resolveDemoSubQuestionData(
  problemId: string | null | undefined,
  cotData: Parameters<typeof buildDemoSubQuestionData>[1],
  mirrored: SavedResult | null,
  visibleCount: number,
): DemoSubQuestionData {
  const mirroredData = mirrored?.subQuestionData as DemoSubQuestionData | null | undefined;
  const mirroredSubs = mirroredData?.guide_sub_questions;

  if (mirroredSubs?.length) {
    return {
      ...mirroredData,
      guide_sub_questions: mirroredSubs.slice(0, Math.min(visibleCount, mirroredSubs.length)),
    };
  }

  const built = buildDemoSubQuestionData(problemId, cotData);
  return {
    ...built,
    guide_sub_questions: built.guide_sub_questions.slice(0, Math.min(visibleCount, built.guide_sub_questions.length)),
  };
}

/** 4단계 데모: test 저장 루브릭이 있으면 우선 사용 */
export function resolveDemoRubrics(
  mirrored: SavedResult | null,
  subQuestionData: DemoSubQuestionData | null | undefined,
) {
  if (mirrored?.rubrics?.length) {
    return mirrored.rubrics;
  }
  if (subQuestionData?.guide_sub_questions?.length) {
    return buildDemoRubricsFromSubQuestionData(subQuestionData);
  }
  return [];
}
