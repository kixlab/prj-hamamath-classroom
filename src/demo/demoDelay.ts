/** 데모 모드 API 대체 로딩 시간 (실제보다 짧게) */
export const DEMO_LOADING_MS = 550;
export const DEMO_COT_LOADING_MS = 2000;
export const DEMO_RUBRIC_LOADING_MS = 700;
export const DEMO_REGENERATE_MS = 400;
export const DEMO_SUBQ_STEP_MS = 320;

export function demoDelay(ms: number = DEMO_LOADING_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
