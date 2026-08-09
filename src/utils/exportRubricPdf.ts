import { escapeHtml, formatAnswer, formatQuestionHtml } from "./formatting";
import type { Locale, TranslationKey } from "../i18n/translations";
import { translations } from "../i18n/translations";
import kaistLogoUrl from "../assets/kaist-logo.png";
import kixlabLogoUrl from "../assets/kixlab-logo.png";
import {
  THEME,
  logoBar,
  metaChips,
  renderSheetsPdf,
  safeFilePart,
  sheetFontFamily,
  stripHtml,
  todayStamp,
  urlToDataUrl,
  type SheetPage,
} from "./pdfSheet";

/** Rubrics.tsx의 RubricLevel/RubricItem과 같은 모양 (내보내기에 필요한 필드만) */
export interface RubricLevelExport {
  level: string;
  score: number;
  description: string;
  bullets: string[];
  examples: string[];
}

export interface RubricItemExport {
  sub_question_id: string;
  step_name?: string;
  sub_skill_name?: string;
  question: string;
  answer?: string;
  levels: RubricLevelExport[];
}

export interface RubricExportMeta {
  problemId: string | null;
  mainProblem: string;
  mainAnswer: string;
  grade?: string;
  subjectArea?: string;
}

export interface RubricExportOptions {
  /** 등급별 예시 답안(examples)을 함께 실을지 (기본 true) */
  includeExamples?: boolean;
}

export interface RubricSections {
  pages: SheetPage[];
  fontFamily: string;
  filename: string;
}

function pdfLabel(locale: Locale, key: TranslationKey): string {
  return translations[locale][key] ?? translations.ko[key] ?? key;
}

/** 등급별 색상 — 상(초록)/중(주황)/하(회색). 알 수 없는 등급은 남색으로 */
function levelPalette(level: string): { bg: string; border: string; text: string } {
  if (level === "상" || /high/i.test(level)) return { bg: "#eaf7ee", border: "#2f9e5b", text: "#1d6b3d" };
  if (level === "중" || /mid/i.test(level)) return { bg: "#fff6e5", border: "#d9930a", text: "#8a5c00" };
  if (level === "하" || /low/i.test(level)) return { bg: "#f4f6f9", border: "#8a94a6", text: "#4a5464" };
  return { bg: THEME.soft, border: THEME.navy, text: THEME.navyDeep };
}

/** 한 등급 카드 (등급 뱃지 + 배점 + 설명 + 채점 기준 + 예시) */
function levelCardHtml(
  lv: RubricLevelExport,
  labels: { criteria: string; examples: string; points: string; levelName: string },
  includeExamples: boolean,
): string {
  const c = levelPalette(lv.level);

  const bullets = lv.bullets.filter((b) => b && b.trim());
  const bulletsHtml = bullets.length
    ? `<div style="margin-top: 8px;">
         <div style="font-size: 11.5px; font-weight: 700; color: ${THEME.muted}; margin-bottom: 4px;">${escapeHtml(labels.criteria)}</div>
         <ul class="mj" style="margin: 0; padding-left: 18px;">
           ${bullets.map((b) => `<li style="margin-bottom: 3px;">${formatQuestionHtml(b)}</li>`).join("")}
         </ul>
       </div>`
    : "";

  const examples = lv.examples.filter((e) => e && e.trim());
  const examplesHtml =
    includeExamples && examples.length
      ? `<div style="margin-top: 8px;">
           <div style="font-size: 11.5px; font-weight: 700; color: ${THEME.muted}; margin-bottom: 4px;">${escapeHtml(labels.examples)}</div>
           ${examples
             .map(
               (ex) =>
                 `<div class="mj" style="background: #fff; border: 1px dashed ${c.border}; border-radius: 6px; padding: 7px 10px; margin-bottom: 5px; font-size: 13px;">${formatQuestionHtml(ex)}</div>`,
             )
             .join("")}
         </div>`
      : "";

  return `
    <div style="border: 1.2px solid ${c.border}; border-left-width: 4px; border-radius: 8px; background: ${c.bg}; padding: 10px 12px; margin-bottom: 8px;">
      <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;">
        <span style="background: ${c.border}; color: #fff; border-radius: 6px; padding: 2px 9px; font-size: 12px; font-weight: 800;">${escapeHtml(labels.levelName)}</span>
        <span style="color: ${c.text}; font-size: 12px; font-weight: 700;">${lv.score}${escapeHtml(labels.points)}</span>
        ${lv.description ? `<span class="mj" style="color: ${THEME.ink}; font-size: 13px; flex: 1; min-width: 180px;">${formatQuestionHtml(lv.description)}</span>` : ""}
      </div>
      ${bulletsHtml}
      ${examplesHtml}
    </div>`;
}

/**
 * 완성된 루브릭을 A4 시트(표지 + 본문) HTML로 만든다.
 * 미리보기 모달과 PDF 내보내기가 공용으로 쓴다.
 */
export async function buildRubricSections(
  rubrics: RubricItemExport[],
  meta: RubricExportMeta,
  locale: Locale = "ko",
  options: RubricExportOptions = {},
  formatLevelName: (level: string) => string = (l) => l,
): Promise<RubricSections> {
  const includeExamples = options.includeExamples !== false;
  const L = (key: TranslationKey) => pdfLabel(locale, key);
  const fontFamily = sheetFontFamily(locale);

  const [kaistLogo, kixlabLogo] = await Promise.all([urlToDataUrl(kaistLogoUrl), urlToDataUrl(kixlabLogoUrl)]);

  const grade = meta.grade ? stripHtml(meta.grade) : "";
  const subjectArea = meta.subjectArea ? stripHtml(meta.subjectArea) : "";
  const safeProblemId = safeFilePart(meta.problemId);
  const researchTitle = L("exportPdf.coverResearchTitle");

  // ---------- 표지 ----------
  const chips: string[] = [];
  if (safeProblemId) chips.push(`${L("exportPdf.problemId")} · ${escapeHtml(safeProblemId)}`);
  if (subjectArea) chips.push(`${L("exportPdf.subjectArea")} · ${escapeHtml(subjectArea)}`);
  if (grade) chips.push(`${L("exportPdf.grade")} · ${escapeHtml(grade)}`);
  chips.push(`${escapeHtml(L("exportRubric.itemCount"))} · ${rubrics.length}`);

  const coverProblemHtml = meta.mainProblem
    ? `<div style="border: 1.5px solid ${THEME.line}; border-radius: 14px; padding: 22px 26px; background: #fff; text-align: left;">
         <div style="font-size: 13px; font-weight: 700; color: ${THEME.navy}; letter-spacing: 2px; margin-bottom: 12px;">${escapeHtml(
           L("exportPdf.problem"),
         )}</div>
         <div class="mj" style="font-size: 14px;">${formatQuestionHtml(meta.mainProblem)}</div>
         ${
           meta.mainAnswer
             ? `<div class="mj" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid ${THEME.line}; font-size: 14px;"><strong style="color: ${THEME.navyDeep};">${escapeHtml(
                 L("exportPdf.answer"),
               )}:</strong> ${formatAnswer(meta.mainAnswer)}</div>`
             : ""
         }
       </div>`
    : "";

  const coverHtml = `
    <div style="box-sizing: border-box; padding: 46px 46px 40px; min-height: 1040px; display: flex; flex-direction: column;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        ${logoBar(kaistLogo, kixlabLogo)}
      </div>

      <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
        <div style="width: 64px; height: 5px; background: ${THEME.navy}; border-radius: 3px; margin-bottom: 30px;"></div>
        <div style="font-size: 22px; color: ${THEME.muted}; letter-spacing: 1px; font-weight: 600;">${escapeHtml(researchTitle)}</div>
        <div style="font-size: 56px; font-weight: 800; color: ${THEME.navy}; margin: 18px 0 8px; letter-spacing: 6px;">${escapeHtml(
          L("exportRubric.coverDocType"),
        )}</div>
        <div style="width: 64px; height: 5px; background: ${THEME.navy}; border-radius: 3px; margin-top: 26px;"></div>
        ${metaChips(chips)}
      </div>

      ${coverProblemHtml}
    </div>`;

  // ---------- 본문: 하위문항별 루브릭 카드 ----------
  const labels = {
    criteria: L("exportRubric.criteria"),
    examples: L("exportRubric.examples"),
    points: L("exportRubric.points"),
    question: L("common.questionColon"),
    modelAnswer: L("exportPdf.modelAnswer"),
  };

  const cards = rubrics
    .map((r, i) => {
      const heading = [r.step_name, r.sub_skill_name].filter(Boolean).join(" · ");
      const answerHtml = r.answer
        ? `<div style="margin-top: 10px;">
             <div style="font-size: 11.5px; font-weight: 700; color: ${THEME.muted}; margin-bottom: 4px;">${escapeHtml(labels.modelAnswer)}</div>
             <div class="mj" style="border: 1.2px solid ${THEME.accent}; border-radius: 8px; background: #fffdf3; padding: 10px 12px; font-size: 13.5px;">${formatAnswer(
               r.answer,
             )}</div>
           </div>`
        : "";

      return `
        <div data-block style="margin-bottom: 20px; break-inside: avoid; border: 1.4px solid ${THEME.line}; border-radius: 12px; padding: 14px 16px;">
          <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
            <span style="flex: 0 0 auto; width: 24px; height: 24px; border-radius: 50%; background: ${THEME.navy}; color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center;">${i + 1}</span>
            <span style="font-size: 11px; font-weight: 700; color: ${THEME.navyDeep}; background: ${THEME.soft}; border-radius: 999px; padding: 3px 9px;">${escapeHtml(
              r.sub_question_id,
            )}</span>
            ${heading ? `<span style="font-size: 13px; font-weight: 700; color: ${THEME.ink};">${escapeHtml(heading)}</span>` : ""}
          </div>

          <div style="margin-bottom: 4px;">
            <div style="font-size: 11.5px; font-weight: 700; color: ${THEME.muted}; margin-bottom: 4px;">${escapeHtml(labels.question)}</div>
            <div class="mj" style="border: 1.2px solid ${THEME.line}; border-radius: 8px; background: ${THEME.soft}; padding: 10px 12px; font-size: 13.5px;">${formatQuestionHtml(
              r.question,
            )}</div>
          </div>
          ${answerHtml}

          <div style="margin-top: 12px;">
            ${r.levels
              .map((lv) =>
                levelCardHtml(
                  lv,
                  {
                    criteria: labels.criteria,
                    examples: labels.examples,
                    points: labels.points,
                    levelName: formatLevelName(lv.level),
                  },
                  includeExamples,
                ),
              )
              .join("")}
          </div>
        </div>`;
    })
    .join("");

  const bodyHtml = `
    <div style="box-sizing: border-box; padding: 30px 34px;">
      <div data-block style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid ${THEME.navy}; padding-bottom: 12px; margin-bottom: 22px;">
        <div>
          <div style="font-size: 12px; color: ${THEME.muted};">${escapeHtml(researchTitle)}</div>
          <div style="font-size: 20px; font-weight: 800; color: ${THEME.navy}; margin-top: 2px;">${escapeHtml(
            L("exportRubric.title"),
          )}${safeProblemId ? ` <span style="font-size: 14px; font-weight: 600; color: ${THEME.muted};">· ${escapeHtml(safeProblemId)}</span>` : ""}</div>
        </div>
        <span style="background: ${THEME.accent}; color: #4a3a00; border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 700;">${escapeHtml(
          L("exportPdf.teacherCopy"),
        )}</span>
      </div>
      ${cards}
      <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 11px; color: ${THEME.muted};">${escapeHtml(researchTitle)}</span>
        ${logoBar(kaistLogo, kixlabLogo, 24)}
      </div>
    </div>`;

  const filePrefix = L("exportRubric.filePrefix");
  const dateStr = todayStamp();
  const filename = safeProblemId
    ? `${filePrefix}_${safeProblemId}_${dateStr}.pdf`
    : `${filePrefix}_${dateStr}.pdf`;

  const pages: SheetPage[] = [
    { key: "cover", label: L("exportPreview.pageCover"), html: coverHtml, fit: "fit" },
    { key: "body", label: L("exportRubric.pageBody"), html: bodyHtml, fit: "flow" },
  ];

  return { pages, fontFamily, filename };
}

/** 미리보기 없이 루브릭 PDF를 바로 저장 */
export async function exportRubricPdf(
  rubrics: RubricItemExport[],
  meta: RubricExportMeta,
  locale: Locale = "ko",
  options: RubricExportOptions = {},
  formatLevelName?: (level: string) => string,
): Promise<void> {
  const { pages, fontFamily, filename } = await buildRubricSections(rubrics, meta, locale, options, formatLevelName);
  await renderSheetsPdf(pages, fontFamily, filename);
}
