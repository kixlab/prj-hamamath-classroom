import type { Locale } from "../i18n/translations";

/** 학생용 5점 리커트 설문 문항. id는 저장 키라 배포 후 바꾸지 말 것 */
export interface SurveyItem {
  id: string;
  /** 연구용 구인 이름 — 교사 화면에만 노출, 학생 PDF에는 안 넣음 */
  construct: Record<Locale, string>;
  question: Record<Locale, string>;
}

export const SURVEY_ITEMS: SurveyItem[] = [
  {
    id: "articulating_reasoning",
    construct: { ko: "사고 과정 표현", en: "Articulating Reasoning Process" },
    question: {
      ko: "단계별 질문에 답을 하면서, 내 생각을 더 잘 표현할 수 있었나요?",
      en: "While answering the step-by-step questions, were you able to express your thinking better?",
    },
  },
  {
    id: "step_structure",
    construct: { ko: "단계별 접근의 유용성", en: "Usefulness of Step-by-Step Structure" },
    question: {
      ko: "큰 문제를 여러 단계로 나눠서 푸는 것이 도움이 되었나요?",
      en: "Was it helpful to break a big problem into several steps?",
    },
  },
  {
    id: "self_awareness",
    construct: { ko: "자기 인식", en: "Self-Awareness of Strengths/Weaknesses" },
    question: {
      ko: "문제를 풀면서 내가 어디를 잘하고 어디를 어려워하는지 알게 되었나요?",
      en: "While solving the problem, did you notice what you are good at and what you find difficult?",
    },
  },
  {
    id: "future_use",
    construct: { ko: "지속 사용 의향", en: "Willingness for Future Use" },
    question: {
      ko: "이 방식이 앞으로 수학 공부를 하는 데 도움이 될 것 같나요?",
      en: "Do you think this approach will help you study math in the future?",
    },
  },
];

/** 리커트 문항 뒤에 붙는 주관식 문항. 응답은 responses가 아니라 reflection에 저장한다 */
export const SURVEY_OPEN_QUESTION: Record<Locale, string> = {
  ko: "평소 수학 문제 풀이와 비교했을 때, 이 방식이 어떻게 달랐나요? 어떤 점이 좋았고, 어떤 점이 별로였나요?",
  en: "Compared with how you usually solve math problems, how was this different? What did you like, and what did you not like?",
};

export const SURVEY_SCALE = [1, 2, 3, 4, 5] as const;
export type SurveyScore = (typeof SURVEY_SCALE)[number];

/** 척도 라벨 (1 → 5 순서) */
export const SURVEY_SCALE_LABELS: Record<Locale, string[]> = {
  ko: ["전혀 그렇지 않다", "그렇지 않다", "보통이다", "그렇다", "매우 그렇다"],
  en: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"],
};

/** 문제와 무관한 '학생당 1회' 설문의 scope 값. 서버 app/api/survey와 동일해야 한다. */
export const OVERALL_SURVEY_SCOPE = "__overall__";

/**
 * 설문 종류.
 * - overall: 리커트 4문항 + 주관식 (학생당 1회, 전용 설문지 PDF)
 * - problem: 문제별 — 학습지 맨 마지막 '느낀점' 페이지의 자유 서술만 받는다 (리커트 없음)
 */
export type SurveyKind = "overall" | "problem";

export function surveyKindOf(scope: string): SurveyKind {
  return scope === OVERALL_SURVEY_SCOPE ? "overall" : "problem";
}

/** 학생 한 명·한 scope당 올릴 수 있는 설문지 스캔 장수. 서버 MAX_SURVEY_SLOTS와 같아야 한다. */
export const MAX_SURVEY_SLOTS = 4;

/** item_id → 1~5 점수. 미응답은 null */
export type SurveyResponses = Record<string, number | null>;

/** 한 학생·한 scope의 설문 1건 */
export interface SurveyRecord {
  responses: SurveyResponses;
  /** 주관식 답변 (문제별 설문은 이 값만 쓴다) */
  reflection: string;
}

export function emptySurveyRecord(): SurveyRecord {
  return { responses: emptySurveyResponses(), reflection: "" };
}

export function emptySurveyResponses(): SurveyResponses {
  return Object.fromEntries(SURVEY_ITEMS.map((item) => [item.id, null]));
}

/** 1~5 정수로 정규화, 범위 밖이면 null */
export function normalizeScore(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.trim()) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded >= 1 && rounded <= 5 ? rounded : null;
}

export function normalizeSurveyResponses(raw: unknown): SurveyResponses {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out = emptySurveyResponses();
  for (const item of SURVEY_ITEMS) out[item.id] = normalizeScore(src[item.id]);
  return out;
}

/** 응답 평균 (미응답 제외). 응답이 하나도 없으면 null */
export function surveyAverage(responses: SurveyResponses): number | null {
  const values = SURVEY_ITEMS.map((i) => responses[i.id]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
