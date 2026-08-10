/**
 * 1단계에서 문제를 수정한 뒤에도 2·3·4단계가 어긋나지 않게 맞춰 주는 헬퍼.
 *
 * 정책: 문제를 고쳐 다시 제출해도 이미 만든 하위문항·루브릭은 **지우지 않는다**
 * (오타 하나 고쳤다고 작업물이 통째로 날아가면 안 되므로).
 * 대신 두 가지를 보장한다.
 *   1) 화면에 보이는 본문제와, 하위 단계가 서버로 보내는 본문제는 항상 최신 CoT 기준
 *   2) 하위문항·루브릭이 '수정 전 문제'로 만들어진 상태면 배너로 알리고 재생성을 유도
 */

/** 비교용 정규화 — 공백 차이만으로 stale 판정이 뜨지 않게 한다 */
function normalize(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

interface CotLike {
  problem?: string;
  answer?: string;
  steps_source_problem?: string;
  steps_source_answer?: string;
}

/**
 * 8단계 풀이과정이 만들어진 뒤에 본문제가 수정됐는지.
 * `steps_source_problem`이 없으면 (풀이 생성 이후 문제를 고친 적이 없다는 뜻이므로) false.
 */
export function isCotStale(cotData: CotLike | null | undefined): boolean {
  if (!cotData?.steps_source_problem) return false;
  return (
    normalize(cotData.steps_source_problem) !== normalize(cotData.problem) ||
    normalize(cotData.steps_source_answer) !== normalize(cotData.answer)
  );
}

/**
 * 풀이과정을 새로 만든 시점의 문제를 기록해 stale 표시를 해제한다.
 * (CoT를 재생성했을 때 호출)
 */
export function markCotFresh<T extends CotLike>(cotData: T): T {
  return { ...cotData, steps_source_problem: cotData.problem ?? "", steps_source_answer: cotData.answer ?? "" };
}

/**
 * 문제 내용만 고쳐 저장할 때, 기존 풀이과정이 어느 문제로 만들어졌는지를 남긴다.
 * 이미 기록이 있으면 그대로 두어 '최초 생성 시점'을 잃지 않는다.
 */
export function rememberCotSource<T extends CotLike>(cotData: T): Pick<CotLike, "steps_source_problem" | "steps_source_answer"> {
  return {
    steps_source_problem: cotData.steps_source_problem ?? cotData.problem ?? "",
    steps_source_answer: cotData.steps_source_answer ?? cotData.answer ?? "",
  };
}

interface SubQuestionSnapshot {
  /** 하위문항을 생성할 당시의 본문제 (SubQs가 currentCotData에서 복사해 둔 값) */
  main_problem?: string;
  main_answer?: string;
  guide_sub_questions?: unknown[];
}

/**
 * 하위문항이 만들어진 뒤에 본문제(또는 정답)가 바뀌었는지.
 * 하위문항이 아직 없으면 비교할 대상이 없으므로 false.
 */
export function isDownstreamStale(
  cotData: CotLike | null | undefined,
  subQuestionData: SubQuestionSnapshot | null | undefined,
): boolean {
  if (!cotData || !subQuestionData) return false;
  if (!subQuestionData.guide_sub_questions?.length) return false;
  return (
    normalize(subQuestionData.main_problem) !== normalize(cotData.problem) ||
    normalize(subQuestionData.main_answer) !== normalize(cotData.answer)
  );
}

/**
 * 하위 단계가 서버로 보내거나 화면에 표시할 본문제 정보.
 * 항상 최신 CoT를 우선하고, CoT에 없을 때만 스냅샷으로 폴백한다.
 * (스냅샷의 main_problem은 '생성 당시의 문제'라 stale 판정용으로만 남겨 둔다)
 */
export function resolveMainProblem(
  cotData: (CotLike & { grade?: string; main_solution?: string | null }) | null | undefined,
  subQuestionData: (SubQuestionSnapshot & { grade?: string; main_solution?: string | null }) | null | undefined,
): { problem: string; answer: string; grade: string; solution: string | null } {
  return {
    problem: (cotData?.problem ?? subQuestionData?.main_problem ?? "").trim(),
    answer: (cotData?.answer ?? subQuestionData?.main_answer ?? "").trim(),
    grade: (cotData?.grade ?? subQuestionData?.grade ?? "").trim(),
    solution: cotData?.main_solution ?? subQuestionData?.main_solution ?? null,
  };
}
