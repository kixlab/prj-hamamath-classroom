import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { escapeHtml, splitQuestionAndAnswer } from "./formatting";
import type { Locale, TranslationKey } from "../i18n/translations";
import { translations } from "../i18n/translations";

/** HTML 태그 제거 후 플레인 텍스트 반환 */
function stripHtml(html: string): string {
  if (!html || !html.trim()) return "";
  const div = document.createElement("div");
  div.innerHTML = html.trim();
  return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

/** PDF용 텍스트: 태그 제거 후 이스케이프, 줄바꿈은 <br>로 */
function pdfText(s: string): string {
  return escapeHtml(stripHtml(s)).replace(/\n/g, "<br>");
}

function pdfLabel(locale: Locale, key: TranslationKey): string {
  return translations[locale][key] ?? translations.ko[key] ?? key;
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
 * 확정된 문제(원본/재생성 선택 반영)를 PDF로 다운로드
 */
export async function exportPdfFromSubQuestion(
  cotData: CotData,
  subQuestionData: SubQuestionExportData,
  preferredVersion: Record<string, "original" | "regenerated">,
  problemId: string | null,
  locale: Locale = "ko",
): Promise<void> {
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

  const fontFamily =
    locale === "en"
      ? "Helvetica, Arial, sans-serif"
      : "Malgun Gothic, Apple SD Gothic Neo, sans-serif";

  const wrap = document.createElement("div");
  wrap.style.position = "fixed";
  wrap.style.left = "-9999px";
  wrap.style.top = "0";
  wrap.style.width = "210mm";
  wrap.style.maxWidth = "794px";
  wrap.style.padding = "24px";
  wrap.style.backgroundColor = "#fff";
  wrap.style.color = "#000";
  wrap.style.fontFamily = fontFamily;
  wrap.style.fontSize = "14px";
  wrap.style.lineHeight = "1.6";

  const L = (key: TranslationKey) => pdfLabel(locale, key);

  let html = "";
  html += `<div style="margin-bottom: 20px; font-size: 18px; font-weight: bold;">${escapeHtml(L("exportPdf.title"))}</div>`;
  if (cotData.grade) {
    html += `<div style="margin-bottom: 12px; color: #555;">${escapeHtml(L("exportPdf.grade"))}: ${escapeHtml(stripHtml(cotData.grade))}</div>`;
  }
  if (cotData.problem) {
    html += `<div style="margin-bottom: 24px;"><strong>${escapeHtml(L("exportPdf.problem"))}</strong>`;
    html += `<div style="margin-top: 8px; border: 1px solid #333; padding: 14px; border-radius: 4px;">${pdfText(cotData.problem)}</div>`;
    html += `</div>`;
  }
  if (cotData.image_data) {
    html += `<div style="margin-bottom: 24px;"><strong>${escapeHtml(L("app.problemImage"))}</strong>`;
    html += `<div style="margin-top: 8px; border: 1px solid #333; padding: 10px; border-radius: 4px; text-align: center;">`;
    html += `<img src="${cotData.image_data}" alt="${escapeHtml(L("app.problemImage"))}" style="max-width: 100%; max-height: 320px; object-fit: contain;" />`;
    html += `</div>`;
    html += `</div>`;
  }
  html += `<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />`;
  const answerLabel = escapeHtml(L("exportPdf.answer"));
  finalSubQuestions.forEach((sq, i) => {
    html += `<div style="margin-bottom: 28px;">`;
    html += `<strong>(${i + 1})</strong> <span style="white-space: pre-wrap;">${pdfText(sq.question)}</span>`;
    html += `<div style="margin-top: 10px;"><div style="min-height: 26px; border-bottom: 1px solid #ccc;">${answerLabel}: </div><div style="min-height: 26px; border-bottom: 1px solid #ccc; margin-top: 4px;"></div></div>`;
    html += `</div>`;
  });

  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  try {
    const canvas = await html2canvas(wrap, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });
    document.body.removeChild(wrap);

    const pdf = new jsPDF("p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2;
    const scale = contentW / canvas.width;
    const fullImgH = canvas.height * scale;
    const pageCount = Math.max(1, Math.ceil(fullImgH / contentH));
    const sliceHeight = canvas.height / pageCount;

    for (let p = 0; p < pageCount; p++) {
      if (p > 0) pdf.addPage();
      const offscreen = document.createElement("canvas");
      offscreen.width = canvas.width;
      offscreen.height = Math.ceil(sliceHeight);
      const ctx = offscreen.getContext("2d");
      if (!ctx) throw new Error("Canvas 2d context failed");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);
      ctx.drawImage(
        canvas,
        0,
        p * sliceHeight,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight,
      );
      const imgData = offscreen.toDataURL("image/jpeg", 0.92);
      const drawH = (sliceHeight * contentW) / canvas.width;
      pdf.addImage(imgData, "JPEG", margin, margin, contentW, drawH);
    }

    const safeProblemId =
      problemId && typeof problemId === "string"
        ? problemId.replace(/[/\\:*?"<>|\n\r]+/g, "_").trim()
        : "";
    const dateStr = new Date().toISOString().slice(0, 10);
    const filePrefix = L("exportPdf.filePrefix");
    const defaultGrade = L("exportPdf.defaultGrade");
    const filename = safeProblemId
      ? `${filePrefix}_${safeProblemId}_${dateStr}.pdf`
      : `${filePrefix}_${cotData.grade || defaultGrade}_${dateStr}.pdf`;
    pdf.save(filename);
  } catch (e) {
    document.body.removeChild(wrap);
    throw e;
  }
}
