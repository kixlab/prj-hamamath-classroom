/** 학년 미지정 참고 자료 저장 키 (서버와 동일) */
export const AUX_GRADE_COMMON = "common";

/** 업로드 시 사용할 학년 키 — 숫자 학년이 없으면 공통 */
export function resolveAuxUploadGrade(grade: string): string {
  const match = (grade || "").match(/(\d+)/);
  return match ? match[1] : AUX_GRADE_COMMON;
}

/** 목록·탭 표시용 학년 키 */
export function parseAuxMaterialGradeKey(grade: string): string {
  const match = (grade || "").match(/(\d+)/);
  if (match) return match[1];
  const trimmed = (grade || "").trim();
  return trimmed || AUX_GRADE_COMMON;
}

export function sortAuxGradeKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    if (a === AUX_GRADE_COMMON) return -1;
    if (b === AUX_GRADE_COMMON) return 1;
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.localeCompare(b);
  });
}
