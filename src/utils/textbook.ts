/** 학년 문자열에서 학기를 추출합니다. 없으면 1학기 기본값. */
export function parseSemesterFromGrade(grade: string): string {
  if (/2\s*학기/.test(grade)) return "2";
  if (/1\s*학기/.test(grade)) return "1";
  return "1";
}

/** 명시적 semester 필드 우선, 없으면 학년 문자열에서 추론 */
export function resolveSemester(grade: string, explicitSemester?: string | null): string {
  const raw = (explicitSemester ?? "").trim();
  if (raw === "1" || raw === "2") return raw;
  if (/^2\s*학기$/i.test(raw) || raw === "2학기") return "2";
  if (/^1\s*학기$/i.test(raw) || raw === "1학기") return "1";
  return parseSemesterFromGrade(grade);
}
