import type { Locale, VerifierLanguage } from "../i18n/translations";
import { toVerifierLanguage } from "../i18n/translations";

export const escapeHtml = (str: string | null | undefined): string => {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

/** LaTeX 구간 보존: $ 또는 \( \) 등이 있거나 TeX 명령이 있으면 백슬래시 제거하지 않음 */
const LATEX_COMMAND_RE = /\\[a-zA-Z]+|\\[,;!]/;

export const looksLikeMathContent = (s: string): boolean =>
  /\$|\\\(|\\\[/.test(s) || LATEX_COMMAND_RE.test(s);

/** $...$ / \( \) 없이 \div, \dots 등만 있는 수식을 MathJax가 인식하도록 구간을 감쌈 */
function wrapInlineMathSegments(text: string): string {
  if (!text || /\$|\\\(|\\\[/.test(text)) return text;

  return text.replace(
    /((?:\\[a-zA-Z]+(?:\{[^{}]*\})*|[0-9()]+)(?:\s*(?:\\[a-zA-Z]+(?:\{[^{}]*\})*|[0-9+\-=<>()[\].,^_]|\\[,;!])*)*)/g,
    (match) => {
      const trimmed = match.trim();
      if (!trimmed) return match;
      if (!LATEX_COMMAND_RE.test(trimmed) && !/=\s*\d/.test(trimmed)) return match;
      if (!LATEX_COMMAND_RE.test(trimmed) && trimmed.length < 4) return match;
      return `$${trimmed}$`;
    },
  );
}

function normalizeMathDelimiters(text: string): string {
  let s = text.trim();
  // LLM이 자주 내는 $...$$ 형태를 $...$로 정리
  if (s.startsWith("$") && !s.startsWith("$$") && s.endsWith("$$")) {
    s = s.slice(0, -1);
  }
  return s;
}

function prepareMathText(text: string): string {
  let formatted = normalizeMathDelimiters(text.trim());
  if (/^\\+$/.test(formatted)) return "";
  if (!looksLikeMathContent(formatted)) {
    formatted = formatted.replace(/(^|\s)\\(\s|$)/g, "$1$2").trim();
  } else {
    formatted = wrapInlineMathSegments(formatted);
  }
  return formatted;
}

/** LLM 프롬프트용 플레이스홀더 — UI에서는 정답을 별도 영역에 표시 */
const ANSWER_TAG_RE = /\{answer(?:_tag)?\}/i;
const QUESTION_TAG_RE = /\{question(?:_tag)?\}/i;

/** 문항 텍스트 끝에 붙은 정답/수식 블록 제거 (플레이스홀더 분리 실패 시 보조) */
function stripTrailingAnswerSection(text: string): string {
  return text
    .replace(/\n\s*(?:정답|Answer)\s*[:：][\s\S]*$/i, "")
    .trim();
}

/** LLM/오케스트레이터 프롬프트용 플레이스홀더 — UI에서는 정답을 별도 영역에 표시 */
export const stripQuestionTemplateTags = (text: string | null | undefined): string => {
  if (!text) return "";
  let cleaned = String(text);
  cleaned = cleaned
    .replace(ANSWER_TAG_RE, "")
    .replace(QUESTION_TAG_RE, "")
    .replace(/\{\{answer(?:_tag)?\}\}/gi, "")
    .replace(/\{\{question(?:_tag)?\}\}/gi, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return stripTrailingAnswerSection(cleaned);
};

/** guide_sub_question 안에 붙은 {answer_tag}·불릿 정답을 분리 (guide_sub_answer 우선) */
export const splitQuestionAndAnswer = (
  rawQuestion: string | null | undefined,
  explicitAnswer?: string | null | undefined,
): { question: string; answer: string } => {
  const raw = (rawQuestion ?? "").trim();
  let explicit = (explicitAnswer ?? "").trim();

  let questionPart = raw;
  let embeddedAnswer = "";

  const tagMatch = ANSWER_TAG_RE.exec(raw);
  if (tagMatch) {
    questionPart = raw.slice(0, tagMatch.index).trim();
    embeddedAnswer = raw.slice(tagMatch.index + tagMatch[0].length).trim();
  } else if (!explicit) {
    const bulletMatch = raw.match(/\n\s*[-•·]\s+/);
    if (bulletMatch?.index != null && bulletMatch.index > 0) {
      questionPart = raw.slice(0, bulletMatch.index).trim();
      embeddedAnswer = raw.slice(bulletMatch.index).trim();
    }
  }

  questionPart = stripQuestionTemplateTags(questionPart);
  embeddedAnswer = stripQuestionTemplateTags(embeddedAnswer).replace(/^[-•·]\s+/, "").trim();
  // "정답: ..." 형태가 문항 끝에 남지 않도록
  questionPart = stripTrailingAnswerSection(questionPart);

  return {
    question: questionPart,
    answer: explicit || embeddedAnswer,
  };
};

export const formatAnswer = (answer: string | null | undefined): string => {
  if (!answer) return "";
  const formatted = prepareMathText(answer);
  if (!formatted) return "";
  return formatted.replace(/\n/g, "<br>").replace(/(=\s*\d+)\s+(?=\d)/g, "$1<br>");
};

export const formatQuestion = (question: string | null | undefined): string => {
  if (!question) return "";
  const formatted = prepareMathText(stripQuestionTemplateTags(question));
  return formatted || "";
};

/** formatQuestion + 줄바꿈을 <br>로 (dangerouslySetInnerHTML용) */
export const formatQuestionHtml = (question: string | null | undefined): string => {
  const formatted = formatQuestion(question);
  return formatted ? formatted.replace(/\n/g, "<br>") : "";
};

/** 모범답안 등 긴 수식 텍스트 (formatAnswer와 동일) */
export const formatSolution = formatAnswer;

const VERIFIER_DISPLAY_NAMES: Record<string, string> = {
  stage_elicitation: "Stage Elicitation",
  context_alignment: "Context Alignment",
  answer_validity: "Answer Validity",
  prompt_validity: "Prompt Validity",
};

const VERIFICATION_LABELS = {
  ko: {
    scoreLabel: "점수",
    evalMarker: "[평가 요약]",
    improveMarker: "[개선 제안]",
    evalTitle: "평가 요약",
    improveTitle: "개선 제안",
    pointsSuffix: "점",
  },
  en: {
    scoreLabel: "Score",
    evalMarker: "[Evaluation Summary]",
    improveMarker: "[Improvement Suggestions]",
    evalTitle: "Evaluation Summary",
    improveTitle: "Improvement Suggestions",
    pointsSuffix: " pts",
  },
} as const;

const ALL_EVAL_MARKERS = [
  VERIFICATION_LABELS.ko.evalMarker,
  VERIFICATION_LABELS.en.evalMarker,
  "[Evaluation summary]",
  "[evaluation summary]",
];
const ALL_IMPROVE_MARKERS = [
  VERIFICATION_LABELS.ko.improveMarker,
  VERIFICATION_LABELS.en.improveMarker,
  "[Improvement suggestions]",
  "[improvement suggestions]",
];
const VERIFIER_HEADER_LINE = /^\[[^\]]+\]\s*(?:점수|Score):\s*([0-9.]+|N\/A)/i;
const VERIFIER_HEADER_PARSE = /^\[([^\]]+)\]\s*(?:점수|Score):\s*([0-9.]+|N\/A)/i;
const NEXT_VERIFIER_LINE = /\n\[[^\]]+\]\s*(?:점수|Score):/i;

type VerifierResultPayload = {
  score?: number | null;
  evaluation_summary?: string;
  improvement_suggestions?: string;
  feedback?: string;
};

function labelsFor(language: VerifierLanguage) {
  return VERIFICATION_LABELS[language];
}

function findMarkerMatch(text: string, markers: readonly string[]): { index: number; length: number } | null {
  const lower = text.toLowerCase();
  let best: { index: number; length: number } | null = null;
  for (const marker of markers) {
    const idx = lower.indexOf(marker.toLowerCase());
    if (idx !== -1 && (best === null || idx < best.index)) {
      best = { index: idx, length: marker.length };
    }
  }
  return best;
}

function extractSection(text: string, markers: readonly string[], endIndex: number): string {
  const match = findMarkerMatch(text, markers);
  if (!match) return "";
  return text.substring(match.index + match.length, endIndex).replace(/^\s*\n+|\n+$/g, "").trim();
}

function buildFromResultsOrSummary(
  results: unknown,
  summary: unknown,
  language: VerifierLanguage,
): string {
  if (typeof summary === "string" && summary.trim()) return summary.trim();
  if (results && typeof results === "object" && !Array.isArray(results)) {
    const record = results as Record<string, VerifierResultPayload>;
    if (Object.keys(record).length > 0) return buildVerificationTextFromResults(record, language);
  }
  return "";
}

/** verify-and-regenerate 응답에서 원본·재생성 검증 텍스트 분리 */
export function extractVerificationTexts(
  verifyResponse: Record<string, unknown>,
  language: VerifierLanguage,
  existing?: { verification_result?: string; re_verification_result?: string },
): { original: string; regenerated: string } {
  const wasRegenerated = !!verifyResponse.was_regenerated;
  const priorOriginal = existing?.verification_result?.trim() || "";
  const priorRegenerated = existing?.re_verification_result?.trim() || "";

  // 원본: original_* 우선, 재생성 시에는 verification_results가 원본인 경우가 많음
  const originalFromApi =
    buildFromResultsOrSummary(
      verifyResponse.original_verification_results ?? verifyResponse.pre_verification_results,
      verifyResponse.original_verification_result ?? verifyResponse.pre_verification_result,
      language,
    ) ||
    (wasRegenerated
      ? buildFromResultsOrSummary(verifyResponse.verification_results, null, language)
      : buildFromResultsOrSummary(verifyResponse.verification_results, verifyResponse.verification_result, language));

  // 재생성: regenerated_* / re_* 만 사용 (verification_results를 재생성에 쓰지 않음)
  const regeneratedFromApi = buildFromResultsOrSummary(
    verifyResponse.regenerated_verification_results ?? verifyResponse.re_verification_results,
    verifyResponse.re_verification_result ??
      verifyResponse.regenerated_verification_result ??
      (wasRegenerated ? verifyResponse.verification_result : undefined),
    language,
  );

  if (wasRegenerated) {
    return {
      original: originalFromApi || priorOriginal,
      regenerated: regeneratedFromApi || priorRegenerated,
    };
  }

  return {
    original:
      originalFromApi ||
      buildFromResultsOrSummary(verifyResponse.verification_results, verifyResponse.verification_result, language) ||
      priorOriginal,
    regenerated: priorRegenerated,
  };
}

/** API `verification_results` → 저장용 평문 (오케스트레이터 라벨 규칙과 동일) */
export function buildVerificationTextFromResults(
  verificationResults: Record<string, VerifierResultPayload>,
  language: VerifierLanguage,
): string {
  const L = labelsFor(language);
  return Object.entries(verificationResults)
    .map(([key, result]) => {
      const verifierName = VERIFIER_DISPLAY_NAMES[key] || key;
      const scoreStr = result.score !== null && result.score !== undefined ? String(result.score) : "N/A";
      const evalSummary = result.evaluation_summary || "";
      const improveSuggestions = result.improvement_suggestions || "";
      if (evalSummary || improveSuggestions) {
        return `[${verifierName}] ${L.scoreLabel}: ${scoreStr}\n${L.evalMarker}\n${evalSummary}\n${L.improveMarker}\n${improveSuggestions}`;
      }
      return `[${verifierName}] ${L.scoreLabel}: ${scoreStr}, ${result.feedback || ""}`;
    })
    .join("\n");
}

export const formatVerificationResult = (
  verificationResult: string | null | undefined,
  locale: Locale = "ko",
): string => {
  if (!verificationResult || !verificationResult.trim()) return "";

  const labels = labelsFor(toVerifierLanguage(locale));
  let cleanedResult = verificationResult.trim();
  if (cleanedResult.startsWith('"') && cleanedResult.endsWith('"')) {
    cleanedResult = cleanedResult.slice(1, -1);
  }

  // 과거에 HTML로 저장된 검증 결과는 그대로 표시
  if (/^<div[\s>]/i.test(cleanedResult)) {
    return cleanedResult;
  }

  const lines = cleanedResult.split(/\n/);
  const verifierBlocks: string[] = [];
  let currentBlock = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (VERIFIER_HEADER_LINE.test(line)) {
      if (currentBlock.trim()) verifierBlocks.push(currentBlock.trim());
      currentBlock = line;
    } else if (currentBlock) {
      currentBlock += "\n" + line;
    } else {
      currentBlock = line;
    }
  }

  if (currentBlock.trim()) verifierBlocks.push(currentBlock.trim());
  if (verifierBlocks.length === 0) verifierBlocks.push(cleanedResult.trim());

  const verifierCards: string[] = [];

  verifierBlocks.forEach((block) => {
    const blockLines = block.split("\n").filter((line) => line.trim());
    if (blockLines.length === 0) return;

    const headerMatch = blockLines[0].match(VERIFIER_HEADER_PARSE);
    if (!headerMatch) {
      verifierCards.push(
        `<div style="margin-bottom: 10px; padding: 12px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #6c757d;">
          <div style="color: #495057; font-size: 0.9em; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(block)}</div>
        </div>`,
      );
      return;
    }

    const verifierName = escapeHtml(headerMatch[1].trim());
    const score = headerMatch[2].trim();
    const scoreNum = score === "N/A" ? null : parseFloat(score);
    const isValid = scoreNum !== null && scoreNum >= 3;
    const scoreColor = scoreNum === null ? "#6c757d" : isValid ? "#28a745" : "#dc3545";
    const scoreBg = scoreNum === null ? "#f8f9fa" : isValid ? "#d4edda" : "#f8d7da";

    const evalMatch = findMarkerMatch(block, ALL_EVAL_MARKERS);
    const improveMatch = findMarkerMatch(block, ALL_IMPROVE_MARKERS);
    const evalIndex = evalMatch?.index ?? -1;
    const improveIndex = improveMatch?.index ?? -1;
    const evaluationSummary = extractSection(
      block,
      ALL_EVAL_MARKERS,
      improveIndex !== -1 ? improveIndex : block.length,
    );
    const improvementSuggestions = extractSection(
      block,
      ALL_IMPROVE_MARKERS,
      (() => {
        if (improveIndex === -1) return block.length;
        const tail = block.substring(improveIndex);
        const next = tail.match(NEXT_VERIFIER_LINE);
        return next?.index !== undefined ? improveIndex + next.index : block.length;
      })(),
    );

    const scoreDisplay =
      scoreNum !== null
        ? locale === "en"
          ? `${scoreNum}${labels.pointsSuffix}`.trim()
          : `${scoreNum}${labels.pointsSuffix}`
        : "N/A";

    verifierCards.push(`
      <div style="margin-bottom: 12px; padding: 14px; background: ${scoreBg}; border-radius: 8px; border-left: 4px solid ${scoreColor};">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <strong style="color: #495057; font-size: 0.95em;">${verifierName}</strong>
          <span style="background: ${scoreColor}; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.85em; font-weight: 600;">
            ${escapeHtml(scoreDisplay)}
          </span>
        </div>
        ${
          evaluationSummary
            ? `
        <div style="margin-top: 10px; padding: 10px; background: white; border-radius: 6px;">
          <div style="font-weight: 600; color: #495057; margin-bottom: 6px; font-size: 0.9em;">${escapeHtml(labels.evalTitle)}</div>
          <div style="color: #495057; font-size: 0.9em; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(evaluationSummary)}</div>
        </div>
        `
            : ""
        }
        ${
          improvementSuggestions
            ? `
        <div style="margin-top: 10px; padding: 10px; background: white; border-radius: 6px;">
          <div style="font-weight: 600; color: #495057; margin-bottom: 6px; font-size: 0.9em;">${escapeHtml(labels.improveTitle)}</div>
          <div style="color: #495057; font-size: 0.9em; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(improvementSuggestions)}</div>
        </div>
        `
            : ""
        }
      </div>
    `);
  });

  return verifierCards.length === 0 ? "" : verifierCards.join("");
};

