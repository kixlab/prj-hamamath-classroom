import type { CSSProperties } from "react";

/** 2·3단계 대단계(1~4) 구분용 — index.css 변수 참조 */
export function resolveFrameworkStepId(stepId: string | number | undefined, fallback: number): number {
  const n = Number(stepId);
  if (n >= 1 && n <= 4) return n;
  const fromSubSkill = String(stepId ?? "").split("-")[0];
  const parsed = Number(fromSubSkill);
  if (parsed >= 1 && parsed <= 4) return parsed;
  return Math.min(4, Math.max(1, fallback));
}

export function frameworkStepSectionStyle(stepId: number): CSSProperties {
  const n = resolveFrameworkStepId(stepId, stepId);
  return {
    ["--step-accent" as string]: `var(--framework-step-${n}-accent)`,
    ["--step-badge-bg" as string]: `var(--framework-step-${n}-bg)`,
    ["--step-badge-border" as string]: `var(--framework-step-${n}-border)`,
    ["--step-badge-text" as string]: `var(--framework-step-${n}-text)`,
    ["--step-divider" as string]: `var(--framework-step-${n}-divider)`,
  } as CSSProperties;
}
