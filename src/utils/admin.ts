/**
 * 관리자 ID 목록: .env의 VITE_ADMIN_IDS (쉼표 구분)에 포함된 ID만 관리자.
 * 예: VITE_ADMIN_IDS=doh,admin
 */
export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId?.trim()) return false;
  const ids = (import.meta.env.VITE_ADMIN_IDS as string | undefined)?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return ids.includes(userId.trim());
}
