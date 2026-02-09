/** 배포 빌드에서 VITE_ADMIN_IDS가 없을 때도 사용할 기본 관리자 ID */
const DEFAULT_ADMIN_IDS = ["db"];

/**
 * 관리자 ID 목록: .env의 VITE_ADMIN_IDS (쉼표 구분)에 포함된 ID만 관리자.
 * 빌드 시 env가 없으면 DEFAULT_ADMIN_IDS(db)를 사용해 배포 환경에서도 db 계정이 DB 보기 가능.
 */
export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId?.trim()) return false;
  const fromEnv = (import.meta.env.VITE_ADMIN_IDS as string | undefined)?.split(",").map((s) => s.trim()).filter(Boolean);
  const ids = fromEnv?.length ? fromEnv : DEFAULT_ADMIN_IDS;
  return ids.includes(userId.trim());
}
