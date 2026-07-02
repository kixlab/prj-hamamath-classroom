/** 학년 문자열에서 학기를 추출합니다. 없으면 undefined. */
export function parseSemesterFromGrade(grade: string): string | undefined {
  if (/2\s*학기/.test(grade)) return "2";
  if (/1\s*학기/.test(grade)) return "1";
  return undefined;
}

/** 명시적 semester 필드 우선, 없으면 학년 문자열에서 추론. 둘 다 없으면 undefined (1·2학기 자동 판별). */
export function resolveSemester(grade: string, explicitSemester?: string | null): string | undefined {
  const raw = (explicitSemester ?? "").trim();
  if (raw === "1" || raw === "2") return raw;
  if (/^2\s*학기$/i.test(raw) || raw === "2학기") return "2";
  if (/^1\s*학기$/i.test(raw) || raw === "1학기") return "1";
  return parseSemesterFromGrade(grade);
}
