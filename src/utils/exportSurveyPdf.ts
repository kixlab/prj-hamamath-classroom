import { escapeHtml } from "./formatting";
import type { Locale, TranslationKey } from "../i18n/translations";
import { translations } from "../i18n/translations";
import kaistLogoUrl from "../assets/kaist-logo.png";
import kixlabLogoUrl from "../assets/kixlab-logo.png";
import {
  THEME,
  fieldCell,
  logoBar,
  renderSheetsPdf,
  sheetFontFamily,
  todayStamp,
  urlToDataUrl,
  type SheetPage,
} from "./pdfSheet";
import { SURVEY_ITEMS, SURVEY_OPEN_QUESTION, SURVEY_SCALE, SURVEY_SCALE_LABELS } from "./surveyItems";

function pdfLabel(locale: Locale, key: TranslationKey): string {
  return translations[locale][key] ?? translations.ko[key] ?? key;
}

export interface SurveySheetSections {
  pages: SheetPage[];
  fontFamily: string;
  filename: string;
}

export interface SurveySheetOptions {
  /** 미리 채울 학생 이름 (보통 비워 둠) */
  studentName?: string | null;
}

/** 한 문항 블록 — 질문이 위, 5점 척도가 그 아래 */
function itemBlock(index: number, question: string, scaleLabels: string[]): string {
  const options = SURVEY_SCALE.map(
    (n, i) => `
      <div style="flex: 1; text-align: center;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: 1.6px solid ${THEME.navy}; border-radius: 50%; color: ${THEME.navy}; font-size: 15px; font-weight: 700;">${n}</div>
        <div style="margin-top: 5px; font-size: 11px; line-height: 1.3; color: ${THEME.muted};">${escapeHtml(scaleLabels[i] ?? "")}</div>
      </div>`,
  ).join("");

  return `
    <div data-block style="margin-bottom: 16px; border: 1.2px solid ${THEME.line}; border-radius: 12px; padding: 14px 18px 12px;">
      <div style="display: flex; gap: 10px; align-items: flex-start;">
        <span style="flex: 0 0 auto; width: 24px; height: 24px; border-radius: 50%; background: ${THEME.navy}; color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center;">${index}</span>
        <span style="flex: 1; font-size: 15px; line-height: 1.5; font-weight: 600;">${escapeHtml(question)}</span>
      </div>
      <div style="display: flex; align-items: flex-start; gap: 4px; margin: 12px 4px 0 34px;">
        ${options}
      </div>
    </div>`;
}

/** 주관식 문항 블록 — 질문 + 손글씨용 줄 */
function openQuestionBlock(index: number, question: string, lineCount: number): string {
  const lines = Array.from({ length: lineCount })
    .map(() => `<div style="border-bottom: 1px solid ${THEME.line}; height: 30px;"></div>`)
    .join("");
  return `
    <div data-block style="margin-bottom: 4px; border: 1.2px solid ${THEME.line}; border-radius: 12px; padding: 14px 18px 16px;">
      <div style="display: flex; gap: 10px; align-items: flex-start;">
        <span style="flex: 0 0 auto; width: 24px; height: 24px; border-radius: 50%; background: ${THEME.accent}; color: #4a3a00; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center;">${index}</span>
        <span style="flex: 1; font-size: 15px; line-height: 1.5; font-weight: 600;">${escapeHtml(question)}</span>
      </div>
      <div style="margin: 12px 0 0 34px;">${lines}</div>
    </div>`;
}

/** 학생용 5점 리커트 설문지 한 장. 구인 이름 없이 문항 문구만 실음 */
export async function buildSurveySections(
  locale: Locale = "ko",
  options: SurveySheetOptions = {},
): Promise<SurveySheetSections> {
  const L = (key: TranslationKey) => pdfLabel(locale, key);
  const [kaistLogo, kixlabLogo] = await Promise.all([urlToDataUrl(kaistLogoUrl), urlToDataUrl(kixlabLogoUrl)]);
  const scaleLabels = SURVEY_SCALE_LABELS[locale] ?? SURVEY_SCALE_LABELS.ko;

  const itemBlocks = SURVEY_ITEMS.map((item, i) =>
    itemBlock(i + 1, item.question[locale] ?? item.question.ko, scaleLabels),
  ).join("");
  const openBlock = openQuestionBlock(
    SURVEY_ITEMS.length + 1,
    SURVEY_OPEN_QUESTION[locale] ?? SURVEY_OPEN_QUESTION.ko,
    5,
  );

  const html = `
    <div style="box-sizing: border-box; padding: 36px 40px 34px; min-height: 1040px; display: flex; flex-direction: column;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        ${logoBar(kaistLogo, kixlabLogo, 34)}
      </div>

      <div style="text-align: center; margin-top: 22px;">
        <div style="font-size: 13px; color: ${THEME.muted}; letter-spacing: 1px; font-weight: 600;">${escapeHtml(
          L("exportPdf.coverResearchTitle"),
        )}</div>
        <div style="font-size: 30px; font-weight: 800; color: ${THEME.navy}; margin-top: 6px; letter-spacing: 4px;">${escapeHtml(
          L("survey.sheetTitle"),
        )}</div>
        <div style="width: 54px; height: 4px; background: ${THEME.accent}; border-radius: 3px; margin: 12px auto 0;"></div>
      </div>

      <div data-block style="margin-top: 20px; border: 1.5px solid ${THEME.line}; border-radius: 12px; padding: 14px 20px;">
        <div style="display: flex; gap: 28px; flex-wrap: wrap;">
          ${fieldCell(L("exportPdf.name"), options.studentName || "", "220px")}
          ${fieldCell(L("exportPdf.date"), "", "180px")}
        </div>
      </div>

      <div data-block style="margin-top: 14px; margin-bottom: 16px; background: ${THEME.soft}; border: 1px solid ${THEME.line}; border-radius: 10px; padding: 12px 16px; font-size: 13px; color: ${THEME.navyDeep}; line-height: 1.6;">
        ${escapeHtml(L("survey.sheetInstruction"))}
      </div>

      ${itemBlocks}
      ${openBlock}

      <div style="flex: 1;"></div>
      <div style="margin-top: 16px; display: flex; justify-content: flex-end; align-items: center;">
        ${logoBar(kaistLogo, kixlabLogo, 22)}
      </div>
    </div>`;

  const filename = `${L("survey.filePrefix")}_${todayStamp()}.pdf`;

  return {
    pages: [{ key: "survey", label: L("survey.sheetTitle"), html, fit: "fit" }],
    fontFamily: sheetFontFamily(locale),
    filename,
  };
}

/** 미리보기 없이 설문지 PDF를 바로 저장 */
export async function exportSurveyPdf(locale: Locale = "ko", options: SurveySheetOptions = {}): Promise<void> {
  const { pages, fontFamily, filename } = await buildSurveySections(locale, options);
  await renderSheetsPdf(pages, fontFamily, filename);
}
