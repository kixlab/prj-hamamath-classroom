export const DEMO_USER_ID = "demo";
export const PREVIOUS_USER_ID_KEY = "hamamath_previous_user_id";

export function isDemoUserId(userId: string | null | undefined): boolean {
  return userId?.trim() === DEMO_USER_ID;
}

/** 프로필 메뉴에 표시할 전환 가능 계정 목록 */
export function getSwitchableAccountIds(currentUserId: string): string[] {
  const current = currentUserId.trim();
  if (isDemoUserId(current)) {
    const previous =
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem(PREVIOUS_USER_ID_KEY)?.trim() : "";
    return previous && previous !== DEMO_USER_ID ? [previous, DEMO_USER_ID] : [DEMO_USER_ID];
  }
  return current === DEMO_USER_ID ? [DEMO_USER_ID] : [current, DEMO_USER_ID];
}

export function rememberPreviousUserId(userId: string): void {
  if (typeof sessionStorage === "undefined" || isDemoUserId(userId)) return;
  sessionStorage.setItem(PREVIOUS_USER_ID_KEY, userId.trim());
}

export function clearPreviousUserId(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(PREVIOUS_USER_ID_KEY);
}

/** 데모 계정이 미러링할 test(또는 이전) 계정 ID */
export function getDemoSourceUserId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const previous = sessionStorage.getItem(PREVIOUS_USER_ID_KEY)?.trim();
  if (!previous || isDemoUserId(previous)) return null;
  return previous;
}
