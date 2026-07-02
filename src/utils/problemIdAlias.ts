export type ProblemDropdownLanguage = "ko" | "en";

export interface ProblemDropdownOption {
  file: string;
  label: string;
  grade: "3" | "4";
  language: ProblemDropdownLanguage;
}

/** 문항 생성 드롭다운 — Grade 3·4 (한국어 / 영어) */
export const PROBLEM_DROPDOWN_OPTIONS: readonly ProblemDropdownOption[] = [
  { file: "example4.json", label: "Grade 3", grade: "3", language: "ko" },
  { file: "example4-en.json", label: "Grade 3 (Eng)", grade: "3", language: "en" },
  { file: "example1.json", label: "Grade 4", grade: "4", language: "ko" },
  { file: "example1-en.json", label: "Grade 4 (Eng)", grade: "4", language: "en" },
] as const;

/** 드롭다운에 없는 예전 예시·저장 ID 표시 이름 */
const LEGACY_LABEL_BY_FILE: Record<string, string> = {
  "example2.json": "Grade 5",
  "example5.json": "Grade 6",
  "example3.json": "Grade 6 (Eng)",
};

const LABEL_BY_FILE = Object.fromEntries(
  [
    ...PROBLEM_DROPDOWN_OPTIONS.map(({ file, label }) => [file, label]),
    ...Object.entries(LEGACY_LABEL_BY_FILE),
  ],
) as Record<string, string>;

/** 드롭다운 예시 외 저장 ID → 표시 이름 */
const EXTRA_PROBLEM_ALIASES: Record<string, string> = {
  "demo-example1": LABEL_BY_FILE["example1.json"],
};

/** 문제 ID를 문항 생성 드롭다운과 동일한 alias(표시 이름)로 변환 */
export function getProblemDisplayLabel(problemId: string | null | undefined): string {
  const id = (problemId ?? "").trim();
  if (!id) return "";

  if (LABEL_BY_FILE[id]) return LABEL_BY_FILE[id];
  if (EXTRA_PROBLEM_ALIASES[id]) return EXTRA_PROBLEM_ALIASES[id];

  const jsonName = id.endsWith(".json") ? id : `${id}.json`;
  if (LABEL_BY_FILE[jsonName]) return LABEL_BY_FILE[jsonName];

  if (id.endsWith(".json")) {
    return id.replace(/\.json$/i, "");
  }

  return id;
}

export function isKnownProblemDropdownFile(problemId: string): boolean {
  const id = problemId.trim();
  return PROBLEM_DROPDOWN_OPTIONS.some((opt) => opt.file === id || opt.file === `${id}.json`);
}

export function getProblemDropdownOption(problemId: string): ProblemDropdownOption | undefined {
  const jsonName = problemId.endsWith(".json") ? problemId : `${problemId}.json`;
  return PROBLEM_DROPDOWN_OPTIONS.find((opt) => opt.file === problemId || opt.file === jsonName);
}
