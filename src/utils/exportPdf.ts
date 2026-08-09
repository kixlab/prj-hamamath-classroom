import { escapeHtml, formatAnswer, splitQuestionAndAnswer, formatQuestionHtml } from "./formatting";
import type { Locale, TranslationKey } from "../i18n/translations";
import { translations } from "../i18n/translations";
import kaistLogoUrl from "../assets/kaist-logo.png";
import kixlabLogoUrl from "../assets/kixlab-logo.png";
import {
  THEME,
  fieldCell,
  logoBar,
  metaChips,
  renderSheetsPdf,
  safeFilePart,
  sheetFontFamily,
  SHEET_BASE_STYLE,
  stripHtml,
  todayStamp,
  typesetMathJax,
  urlToDataUrl,
  type SheetPage,
} from "./pdfSheet";

// 기존 임포트 경로 호환 (미리보기 모달·api.ts가 이 모듈에서 가져다 씀)
export { typesetMathJax };
export const WORKSHEET_BASE_STYLE = SHEET_BASE_STYLE;
export const worksheetFontFamily = sheetFontFamily;

function pdfLabel(locale: Locale, key: TranslationKey): string {
  return translations[locale][key] ?? translations.ko[key] ?? key;
}

/** 학습지 로고를 base64 data URL로 로드 (PDF·Word 공용, 없으면 null) */
export async function loadWorksheetLogosBase64(): Promise<{ kaist: string | null; kixlab: string | null }> {
  const [kaist, kixlab] = await Promise.all([urlToDataUrl(kaistLogoUrl), urlToDataUrl(kixlabLogoUrl)]);
  return { kaist, kixlab };
}

interface CotData {
  problem?: string;
  answer?: string;
  main_solution?: string;
  grade?: string;
  image_data?: string | null;
}

interface SubQ {
  sub_question_id: string;
  step_id: string | number;
  guide_sub_question: string;
  guide_sub_answer?: string;
}

interface SubQuestionExportData {
  subject_area?: string;
  guide_sub_questions?: SubQ[];
}

/**
 * 확정된 문제(원본/재생성 선택 반영)를 학습지 PDF로 다운로드
 * 구성: 표지 → 본문(문제 + 하위 문항) → 마무리/메모
 * (모범답안 포함본은 학생이 적을 칸이 없으므로 마무리 장을 넣지 않는다)
 */
export interface WorksheetSections {
  pages: SheetPage[];
  fontFamily: string;
  filename: string;
}

export interface WorksheetOptions {
  /**
   * true면 답안 기입란 대신 모범답안을 채워 넣은 '교사용' 학습지를 만든다.
   * (기본 false — 학생 배포용으로 빈 답안 박스가 들어감)
   */
  includeAnswers?: boolean;
}

/** 모범답안 블록 (문제/하위문항 공용) */
function solutionBlock(label: string, answerHtml: string): string {
  return `
    <div style="margin: 10px 0 0 36px;">
      <div style="font-size: 12px; color: ${THEME.muted}; margin-bottom: 8px;">${escapeHtml(label)}</div>
      <div class="mj" style="border: 1.2px solid ${THEME.accent}; border-radius: 8px; background: #fffdf3; padding: 12px 14px;">${answerHtml}</div>
    </div>`;
}

/**
 * 학습지 표지/본문/마지막장 HTML 섹션 생성 (미리보기 모달과 PDF 내보내기 공용)
 */
export async function buildWorksheetSections(
  cotData: CotData,
  subQuestionData: SubQuestionExportData,
  preferredVersion: Record<string, "original" | "regenerated">,
  problemId: string | null,
  locale: Locale = "ko",
  options: WorksheetOptions = {},
): Promise<WorksheetSections> {
  const includeAnswers = !!options.includeAnswers;
  const subQs = subQuestionData.guide_sub_questions || [];
  const finalSubQuestions = subQs.map((subQ) => {
    const originalQ = (subQ.guide_sub_question || "").trim();
    const originalA = (subQ.guide_sub_answer || "").trim();
    const reQ = ((subQ as { re_sub_question?: string }).re_sub_question || "").trim();
    const reA = ((subQ as { re_sub_answer?: string }).re_sub_answer || "").trim();
    const chosen = preferredVersion[subQ.sub_question_id];
    const useRegenerated = chosen === "regenerated" && reQ;
    return splitQuestionAndAnswer(useRegenerated ? reQ : originalQ, useRegenerated ? reA || originalA : originalA);
  });

  const fontFamily = sheetFontFamily(locale);

  const L = (key: TranslationKey) => pdfLabel(locale, key);

  const [kaistLogo, kixlabLogo] = await Promise.all([urlToDataUrl(kaistLogoUrl), urlToDataUrl(kixlabLogoUrl)]);

  const grade = cotData.grade ? stripHtml(cotData.grade) : "";
  const subjectArea = subQuestionData.subject_area ? stripHtml(subQuestionData.subject_area) : "";
  const safeProblemId = safeFilePart(problemId);
  const researchTitle = L("exportPdf.coverResearchTitle");
  const docType = includeAnswers ? L("exportPdf.coverDocTypeWithAnswers") : L("exportPdf.coverDocType");

  // ---------- 표지 ----------
  const coverMetaChips: string[] = [];
  if (safeProblemId) coverMetaChips.push(`${L("exportPdf.problemId")} · ${escapeHtml(safeProblemId)}`);
  if (subjectArea) coverMetaChips.push(`${L("exportPdf.subjectArea")} · ${escapeHtml(subjectArea)}`);
  if (includeAnswers) coverMetaChips.push(escapeHtml(L("exportPdf.teacherCopy")));
  const coverMetaHtml = metaChips(coverMetaChips);

  // 모범답안본은 학생이 적을 칸이 없으므로 학생 정보란도 뺀다
  const studentInfoHtml = includeAnswers
    ? ""
    : `
      <div style="border: 1.5px solid ${THEME.line}; border-radius: 14px; padding: 26px 30px; background: #fff;">
        <div style="font-size: 13px; font-weight: 700; color: ${THEME.navy}; letter-spacing: 2px; margin-bottom: 18px;">${escapeHtml(
          L("exportPdf.studentInfo"),
        )}</div>
        <div style="display: flex; gap: 28px; flex-wrap: wrap;">
          ${fieldCell(L("exportPdf.name"), "", "200px")}
          ${fieldCell(L("exportPdf.grade"), grade, "150px")}
          ${fieldCell(L("exportPdf.date"), "", "160px")}
        </div>
      </div>`;

  const coverHtml = `
    <div style="box-sizing: border-box; padding: 46px 46px 40px; min-height: 1040px; display: flex; flex-direction: column;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        ${logoBar(kaistLogo, kixlabLogo)}
      </div>

      <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
        <div style="width: 64px; height: 5px; background: ${THEME.navy}; border-radius: 3px; margin-bottom: 30px;"></div>
        <div style="font-size: 22px; color: ${THEME.muted}; letter-spacing: 1px; font-weight: 600;">${escapeHtml(researchTitle)}</div>
        <div style="font-size: ${includeAnswers ? 46 : 62}px; font-weight: 800; color: ${THEME.navy}; margin: 18px 0 8px; letter-spacing: 6px;">${escapeHtml(docType)}</div>
        <div style="width: 64px; height: 5px; background: ${THEME.navy}; border-radius: 3px; margin-top: 26px;"></div>
        ${coverMetaHtml}
      </div>

      ${studentInfoHtml}
    </div>`;

  // ---------- 본문 ----------
  const answerLabel = escapeHtml(L("exportPdf.answer"));
  const solutionLabel = L("exportPdf.modelAnswer");
  let bodyItems = "";
  finalSubQuestions.forEach((sq, i) => {
    const answerArea = includeAnswers
      ? sq.answer
        ? solutionBlock(solutionLabel, formatAnswer(sq.answer))
        : ""
      : `
        <div style="margin: 10px 0 0 36px;">
          <div style="font-size: 12px; color: ${THEME.muted}; margin-bottom: 8px;">${answerLabel}</div>
          <div style="border: 1.2px solid ${THEME.line}; border-radius: 8px; background: #fbfcfe; height: 140px;"></div>
        </div>`;

    bodyItems += `
      <div data-block style="margin-bottom: 22px; break-inside: avoid;">
        <div style="display: flex; gap: 10px; align-items: flex-start;">
          <span style="flex: 0 0 auto; width: 26px; height: 26px; border-radius: 50%; background: ${THEME.navy}; color: #fff; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center;">${i + 1}</span>
          <div class="mj" style="flex: 1; padding-top: 2px;">${formatQuestionHtml(sq.question)}</div>
        </div>
        ${answerArea}
      </div>`;
  });

  const problemHtml = cotData.problem
    ? `<div data-block style="margin-bottom: 20px;">
         <div style="font-size: 13px; font-weight: 700; color: ${THEME.navy}; letter-spacing: 1px; margin-bottom: 8px;">${escapeHtml(
           L("exportPdf.problem"),
         )}</div>
         <div class="mj" style="border: 1.5px solid ${THEME.navy}; border-radius: 10px; padding: 16px 18px; background: ${THEME.soft};">${formatQuestionHtml(
           cotData.problem,
         )}</div>
       </div>`
    : "";

  // 교사용에는 본문제의 정답·모범답안도 함께 싣는다
  const mainAnswerText = (cotData.answer || "").trim();
  const mainSolutionText = (cotData.main_solution || "").trim();
  const mainSolutionHtml =
    includeAnswers && (mainAnswerText || mainSolutionText)
      ? `<div data-block style="margin-bottom: 20px;">
           <div style="font-size: 13px; font-weight: 700; color: ${THEME.navyDeep}; letter-spacing: 1px; margin-bottom: 8px;">${escapeHtml(
             L("exportPdf.mainSolution"),
           )}</div>
           <div class="mj" style="border: 1.2px solid ${THEME.accent}; border-radius: 10px; padding: 14px 16px; background: #fffdf3;">
             ${mainAnswerText ? `<div style="margin-bottom: ${mainSolutionText ? "10px" : "0"};"><strong style="color: ${THEME.navyDeep};">${escapeHtml(L("exportPdf.answer"))}:</strong> ${formatAnswer(mainAnswerText)}</div>` : ""}
             ${mainSolutionText ? formatAnswer(mainSolutionText) : ""}
           </div>
         </div>`
      : "";

  // 서버 Storage 이미지는 URL로 저장돼 있다. html2canvas가 원격 이미지를 캡처하면
  // canvas가 오염돼 빈칸으로 나올 수 있으므로, 미리 dataURL로 바꿔서 심는다.
  const rawImage = cotData.image_data;
  const embeddedImage = rawImage
    ? rawImage.startsWith("data:")
      ? rawImage
      : await urlToDataUrl(rawImage)
    : null;

  const imageHtml = embeddedImage
    ? `<div data-block style="margin-bottom: 20px; text-align: center;">
         <img src="${embeddedImage}" alt="${escapeHtml(L("app.problemImage"))}" style="max-width: 100%; max-height: 320px; object-fit: contain; border: 1px solid ${THEME.line}; border-radius: 8px; padding: 8px;" />
       </div>`
    : "";

  // 모범답안본에는 이름/날짜 기입란 대신 '교사용' 표시를 둔다
  const bodyHeaderRight = includeAnswers
    ? `<span style="background: ${THEME.accent}; color: #4a3a00; border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 700;">${escapeHtml(
        L("exportPdf.teacherCopy"),
      )}</span>`
    : `
    <div style="display: flex; gap: 16px; align-items: flex-end;">
      ${fieldCell(L("exportPdf.name"), "", "130px")}
      ${fieldCell(L("exportPdf.date"), "", "120px")}
    </div>`;

  const bodyHtml = `
    <div style="box-sizing: border-box; padding: 30px 34px;">
      <div data-block style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid ${THEME.navy}; padding-bottom: 12px; margin-bottom: 22px;">
        <div>
          <div style="font-size: 12px; color: ${THEME.muted};">${escapeHtml(researchTitle)}</div>
          <div style="font-size: 20px; font-weight: 800; color: ${THEME.navy}; margin-top: 2px;">${escapeHtml(
            L("exportPdf.title"),
          )}${grade ? ` <span style="font-size: 14px; font-weight: 600; color: ${THEME.muted};">· ${escapeHtml(grade)}</span>` : ""}</div>
        </div>
        ${bodyHeaderRight}
      </div>
      ${problemHtml}
      ${imageHtml}
      ${mainSolutionHtml}
      <div style="height: 1px; background: ${THEME.line}; margin: 6px 0 22px;"></div>
      ${bodyItems}
    </div>`;

  // ---------- 마지막장: 마무리 + 메모 ----------
  const memoLines = Array.from({ length: 12 })
    .map(() => `<div style="border-bottom: 1px solid ${THEME.line}; height: 34px;"></div>`)
    .join("");
  const finalHtml = `
    <div style="box-sizing: border-box; padding: 40px 40px 44px; min-height: 1040px; display: flex; flex-direction: column;">
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="font-size: 30px; font-weight: 800; color: ${THEME.navy}; letter-spacing: 4px;">${escapeHtml(
          L("exportPdf.finalTitle"),
        )}</div>
        <div style="width: 54px; height: 4px; background: ${THEME.accent}; border-radius: 3px; margin: 16px auto 0;"></div>
        <div style="margin-top: 18px; color: ${THEME.muted}; font-size: 14px; line-height: 1.8;">${escapeHtml(
          L("exportPdf.finalMessage"),
        )}</div>
      </div>
      <div style="flex: 1; border: 1.5px solid ${THEME.line}; border-radius: 14px; padding: 22px 26px;">
        <div style="font-size: 13px; font-weight: 700; color: ${THEME.navy}; letter-spacing: 2px; margin-bottom: 16px;">${escapeHtml(
          L("exportPdf.memo"),
        )}</div>
        ${memoLines}
      </div>
      <div style="margin-top: 22px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 11px; color: ${THEME.muted};">${escapeHtml(researchTitle)}</span>
        ${logoBar(kaistLogo, kixlabLogo, 28)}
      </div>
    </div>`;

  const dateStr = todayStamp();
  const filePrefix = includeAnswers ? L("exportPdf.filePrefixWithAnswers") : L("exportPdf.filePrefix");
  const defaultGrade = L("exportPdf.defaultGrade");
  const filename = safeProblemId
    ? `${filePrefix}_${safeProblemId}_${dateStr}.pdf`
    : `${filePrefix}_${cotData.grade || defaultGrade}_${dateStr}.pdf`;

  const pages: SheetPage[] = [
    { key: "cover", label: L("exportPreview.pageCover"), html: coverHtml, fit: "fit" },
    { key: "body", label: L("exportPreview.pageBody"), html: bodyHtml, fit: "flow" },
  ];
  // 마무리/메모 장은 학생용에만 (교사용 모범답안본에는 불필요)
  if (!includeAnswers) {
    pages.push({ key: "final", label: L("exportPreview.pageFinal"), html: finalHtml, fit: "fit" });
  }

  return { pages, fontFamily, filename };
}

/**
 * 확정된 문제를 학습지 PDF로 바로 저장 (오프스크린 캡처, 미리보기 없이)
 * 구성: 표지 → 본문(문제 + 하위 문항) → 마무리/메모
 */
export async function exportPdfFromSubQuestion(
  cotData: CotData,
  subQuestionData: SubQuestionExportData,
  preferredVersion: Record<string, "original" | "regenerated">,
  problemId: string | null,
  locale: Locale = "ko",
  options: WorksheetOptions = {},
): Promise<void> {
  const { pages, fontFamily, filename } = await buildWorksheetSections(
    cotData,
    subQuestionData,
    preferredVersion,
    problemId,
    locale,
    options,
  );

  await renderSheetsPdf(pages, fontFamily, filename);
}
