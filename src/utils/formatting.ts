import { marked } from "marked";
import type { Locale, VerifierLanguage } from "../i18n/translations";
import { toVerifierLanguage } from "../i18n/translations";

marked.setOptions({ breaks: true, gfm: true });

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

/**
 * LLM이 여는/닫는 구분자를 다르게 내는 경우($$..$ 등)를 짝 맞춰 준다.
 * 짝이 어긋나면 MathJax가 구간을 찾지 못해 raw LaTeX가 그대로 보인다.
 * 짝이 이미 맞는 구간은 한 글자도 건드리지 않는다.
 */
function balanceMathDelimiters(text: string): string {
  let out = "";
  let i = 0;

  while (i < text.length) {
    // processEscapes로 살려두는 \$는 구분자가 아니다
    if (text[i] !== "$" || text[i - 1] === "\\") {
      out += text[i++];
      continue;
    }

    const openLen = text.startsWith("$$", i) ? 2 : 1;
    let close = i + openLen;
    while (close < text.length && text[close] !== "$") close++;
    if (close >= text.length) {
      out += text.slice(i); // 닫는 짝이 없으면 손대지 않는다
      break;
    }

    // $a$$b$처럼 인라인 수식이 붙어 있으면 앞의 $$는 닫는 짝 하나 + 여는 짝 하나다.
    // 뒤에 남은 $가 없을 때만 $$ 전체를 (잘못 쓴) 닫는 짝으로 본다.
    const closeLen =
      text.startsWith("$$", close) && (openLen === 2 || !text.includes("$", close + 2)) ? 2 : 1;
    const body = text.slice(i + openLen, close);
    // 줄바꿈이 있으면 인라인($..$)으로는 조판되지 않으므로 디스플레이로 맞춘다
    const len = openLen === closeLen ? openLen : body.includes("\n") ? 2 : 1;
    const fence = "$".repeat(len);
    out += fence + body + fence;
    i = close + closeLen;
  }

  return out;
}

function normalizeMathDelimiters(text: string): string {
  let s = text.trim();
  // LLM이 자주 내는 $...$$ 형태를 $...$로 정리
  if (s.startsWith("$") && !s.startsWith("$$") && s.endsWith("$$")) {
    s = s.slice(0, -1);
  }
  return balanceMathDelimiters(s);
}

/** 수식 구간($$..$$, \[..\], $..$, \(..\)). 캡처 그룹이 정확히 하나여야 split 결과의 홀수 인덱스가 수식이 된다. */
const MATH_SEGMENT_RE = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^$\n]*?\$|\\\([\s\S]*?\\\))/g;

/**
 * 수식($$..$$, $..$, \(..\), \[..\]) 구간 '바깥'의 텍스트에서 LaTeX 이스케이프를 일반 텍스트로 복원.
 * (예: 수식 밖에 남은 `\_\_\_` → `___`, `\,` → 공백) 수식 구간은 MathJax가 처리하도록 그대로 둔다.
 */
function unescapeTextOutsideMath(text: string): string {
  if (!text) return text;
  return text
    .split(MATH_SEGMENT_RE)
    .map((part, i) => {
      if (i % 2 === 1) return part; // 캡처된 수식 구간 → 유지
      return part
        .replace(/\\_/g, "_")
        .replace(/\\,/g, " ")
        .replace(/\\;/g, " ")
        .replace(/\\:/g, " ")
        .replace(/\\%/g, "%")
        .replace(/\\#/g, "#")
        .replace(/\\&/g, "&")
        .replace(/\\\$/g, "$")
        .replace(/\\\{/g, "{")
        .replace(/\\\}/g, "}");
    })
    .join("");
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

/** LLM이 `-`만 넣는 경우 — marked가 빈 `<ul><li></li></ul>`로 렌더되어 점만 보임 */
function isPlaceholderAnswer(text: string): boolean {
  const t = text.trim();
  return t === "" || /^[-•·―]\s*$/.test(t);
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
  if (isPlaceholderAnswer(explicit)) explicit = "";

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

  const answer = explicit || embeddedAnswer;
  return {
    question: questionPart,
    answer: isPlaceholderAnswer(answer) ? "" : answer,
  };
};

/**
 * marked는 LaTeX 백슬래시를 마크다운 이스케이프로 해석해 지워버린다.
 * `\\`(행 구분자) → `\`, `\[` → `[`. 그러면 array의 행이 서로 붙어
 * "Misplaced \hline"이 나고, 디스플레이 수식은 구분자를 잃어 조판조차 되지 않는다.
 * breaks:true가 수식 중간에 <br>을 넣는 문제도 같이 생긴다.
 *
 * 그래서 수식 구간을 자리표시자로 빼두고 마크다운을 돌린 뒤 원문으로 되돌린다.
 * 자리표시자는 마크다운 문법 문자를 쓰지 않아야 하므로 영문자+숫자만 사용한다.
 */
const MATH_TOKEN_PREFIX = "mjxmathseg";
const MATH_TOKEN_SUFFIX = "endmjx";

function renderMarkdownPreservingMath(text: string): string {
  const segments: string[] = [];
  const masked = text.replace(MATH_SEGMENT_RE, (segment) => {
    segments.push(segment);
    return `${MATH_TOKEN_PREFIX}${segments.length - 1}${MATH_TOKEN_SUFFIX}`;
  });

  const html = marked.parse(masked, { async: false }) as string;

  return html.replace(
    new RegExp(`${MATH_TOKEN_PREFIX}(\\d+)${MATH_TOKEN_SUFFIX}`, "g"),
    (whole, index: string) => {
      const segment = segments[Number(index)];
      if (segment === undefined) return whole;
      // MathJax는 DOM 텍스트를 읽으므로 &, <, > 만 엔티티로 돌려놓으면 원문 그대로 조판된다
      return segment.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    },
  );
}

/** LaTeX 전처리 후 마크다운 → HTML (정답·모범답안 등) */
function formatRichTextHtml(text: string): string {
  const formatted = prepareMathText(text);
  if (!formatted) return "";
  return renderMarkdownPreservingMath(formatted);
}

export const formatAnswer = (answer: string | null | undefined): string => {
  if (!answer || isPlaceholderAnswer(answer)) return "";
  return formatRichTextHtml(answer.trim());
};

export const formatQuestion = (question: string | null | undefined): string => {
  if (!question) return "";
  const formatted = unescapeTextOutsideMath(prepareMathText(stripQuestionTemplateTags(question)));
  return formatted || "";
};

/**
 * 문항은 마크다운을 돌리지 않는다 — `___` 빈칸이 <hr>/강조로 먹히기 때문.
 * 대신 GFM 표 블록(헤더행 + |---| 구분행)만 골라내 그 부분만 marked로 렌더한다.
 */
const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isTableDelimiter = (line: string) => /^\s*\|[\s:|-]*\|\s*$/.test(line) && line.includes("-");

type QuestionSegment = { table: boolean; text: string };

function splitTableSegments(text: string): QuestionSegment[] {
  const lines = text.split("\n");
  const segments: QuestionSegment[] = [];
  let buffer: string[] = [];
  const flushText = () => {
    if (buffer.length) segments.push({ table: false, text: buffer.join("\n") });
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    if (isTableRow(lines[i]) && isTableDelimiter(lines[i + 1] ?? "")) {
      flushText();
      let end = i + 2;
      while (end < lines.length && isTableRow(lines[end])) end++;
      segments.push({ table: true, text: lines.slice(i, end).join("\n") });
      i = end - 1;
    } else {
      buffer.push(lines[i]);
    }
  }
  flushText();
  return segments;
}

/** 문항 표는 PDF 내보내기(스타일시트 없음)에서도 같이 쓰이므로 인라인 스타일로 붙인다 */
const QUESTION_TABLE_STYLE = "border-collapse: collapse; margin: 0.4em 0; font-size: 0.95em;";
const QUESTION_CELL_STYLE = "border: 1px solid var(--color-border, #dee2e6); padding: 4px 8px;";

function renderTableBlock(block: string): string {
  return renderMarkdownPreservingMath(block)
    // .questionContent가 white-space: pre-wrap이라 태그 사이 줄바꿈이 빈 줄로 보인다
    .replace(/>\s*\n\s*</g, "><")
    .replace(/<table>/g, `<table style="${QUESTION_TABLE_STYLE}">`)
    .replace(/<(th|td)((?:\s[^>]*)?)>/g, (_whole, tag: string, attrs: string) => {
      const align = /align="(\w+)"/.exec(attrs)?.[1] ?? "left";
      return `<${tag}${attrs} style="${QUESTION_CELL_STYLE} text-align: ${align}; white-space: normal;">`;
    })
    .trim();
}

/**
 * formatQuestion + 줄바꿈을 <br>로 (dangerouslySetInnerHTML용).
 * 수식 구간 안의 줄바꿈은 그대로 둔다 — $$..$$ 사이에 <br>이 끼면 MathJax가
 * 수식 구간을 찾지 못해 array 같은 여러 줄 수식이 조판되지 않는다.
 */
export const formatQuestionHtml = (question: string | null | undefined): string => {
  const formatted = formatQuestion(question);
  if (!formatted) return "";
  return splitTableSegments(formatted)
    .map((segment) =>
      segment.table
        ? renderTableBlock(segment.text)
        : segment.text
            .split(MATH_SEGMENT_RE)
            .map((part, i) => (i % 2 === 1 ? part : part.replace(/\n/g, "<br>")))
            .join(""),
    )
    .join("");
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

