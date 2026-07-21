import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { escapeHtml, splitQuestionAndAnswer, formatQuestionHtml } from "./formatting";
import type { Locale, TranslationKey } from "../i18n/translations";
import { translations } from "../i18n/translations";
import kaistLogoUrl from "../assets/kaist-logo.png";
import kixlabLogoUrl from "../assets/kixlab-logo.png";

/** 학습지 공통 디자인 토큰 */
const THEME = {
  navy: "#004191",
  navyDeep: "#00306e",
  ink: "#1a2230",
  muted: "#5b6472",
  line: "#d5deec",
  soft: "#eef3fb",
  accent: "#eab308",
};

/** HTML 태그 제거 후 플레인 텍스트 반환 */
function stripHtml(html: string): string {
  if (!html || !html.trim()) return "";
  const div = document.createElement("div");
  div.innerHTML = html.trim();
  return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

function pdfLabel(locale: Locale, key: TranslationKey): string {
  return translations[locale][key] ?? translations.ko[key] ?? key;
}

/** 번들된 에셋 URL을 dataURL로 변환 (html2canvas가 안정적으로 렌더하도록). 실패 시 null */
async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
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

const A4_WRAP_STYLE = {
  position: "fixed" as const,
  left: "-9999px",
  top: "0",
  width: "210mm",
  maxWidth: "794px",
  backgroundColor: "#fff",
  color: THEME.ink,
  fontSize: "14px",
  lineHeight: "1.6",
};

/**
 * html2canvas 공통 옵션.
 * MathJax가 접근성용으로 삽입하는 숨김 요소(mjx-assistive-mml)는 CSS로 화면에선 보이지 않지만
 * html2canvas가 그 클리핑을 무시하고 렌더해 수식 위에 글자가 겹쳐 찍힌다. 캡처에서 제외한다.
 */
const H2C_OPTIONS = {
  scale: 2,
  useCORS: true,
  logging: false,
  backgroundColor: "#ffffff",
  ignoreElements: (el: Element) => (el.nodeName || "").toUpperCase() === "MJX-ASSISTIVE-MML",
} as const;

/** 임시 DOM에 HTML을 붙이고 html2canvas로 캡처 */
async function captureToCanvas(html: string, fontFamily: string): Promise<HTMLCanvasElement> {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, A4_WRAP_STYLE, { fontFamily });
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  try {
    return await html2canvas(wrap, { ...H2C_OPTIONS });
  } finally {
    if (wrap.parentNode) document.body.removeChild(wrap);
  }
}

/** 요소의 LaTeX 수식을 MathJax로 렌더 (캡처/미리보기 전에 호출). MathJax가 없으면 조용히 통과 */
export async function typesetMathJax(el: HTMLElement): Promise<void> {
  const getMj = () => (window as unknown as { MathJax?: { typesetPromise?: (els: HTMLElement[]) => Promise<void>; typesetClear?: (els: HTMLElement[]) => void } }).MathJax;
  if (!getMj()?.typesetPromise) {
    await new Promise<void>((resolve) => {
      let waited = 0;
      const iv = setInterval(() => {
        waited += 100;
        if (getMj()?.typesetPromise || waited >= 6000) {
          clearInterval(iv);
          resolve();
        }
      }, 100);
    });
  }
  const mj = getMj();
  if (!mj?.typesetPromise) return;
  try {
    mj.typesetClear?.([el]);
    await mj.typesetPromise([el]);
  } catch {
    /* 수식 렌더 실패 시 원문 텍스트로 유지 */
  }
  // MathJax/폰트 렌더 안정화 대기
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }
}

interface BlockBound {
  top: number;
  bottom: number;
}

/** 본문 HTML을 캡처. 수식을 렌더링하고, [data-block] 요소들의 세로 위치(canvas px)를 함께 반환 */
async function captureWithBlocks(
  html: string,
  fontFamily: string,
): Promise<{ canvas: HTMLCanvasElement; blocks: BlockBound[] }> {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, A4_WRAP_STYLE, { fontFamily });
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  try {
    await typesetMathJax(wrap);
    const canvas = await html2canvas(wrap, { ...H2C_OPTIONS });
    return { canvas, blocks: measureBlocksIn(wrap, canvas) };
  } finally {
    if (wrap.parentNode) document.body.removeChild(wrap);
  }
}

/**
 * 캔버스를 페이지로 나눠 추가하되, 페이지 경계가 블록([data-block]) 내부를 가로지르지 않게 함.
 * (답변 박스가 페이지 분할로 잘리는 문제 방지)
 */
function addBlockPagedCanvas(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  blocks: BlockBound[],
  margin: number,
  contentW: number,
  contentH: number,
): void {
  const maxSlicePx = (contentH * canvas.width) / contentW; // 페이지당 최대 canvas 높이(px)

  // 1) 블록 경계에서만 페이지를 끊는 컷 위치 계산 (직전 블록의 '아래'에서 끊어 잘림 방지)
  const rawCuts: number[] = [];
  let pageStart = 0;
  let lastBottom = 0; // 현재 페이지에 들어간 마지막 블록의 아래 위치
  for (const b of blocks) {
    if (b.bottom - pageStart <= maxSlicePx) {
      lastBottom = b.bottom;
      continue; // 현재 페이지에 들어감
    }
    // 이 블록은 현재 페이지에 안 들어감 → 직전 블록 아래에서 페이지를 끊음
    if (lastBottom > pageStart) {
      rawCuts.push(lastBottom);
      pageStart = lastBottom;
    }
    // 블록 자체가 한 페이지보다 크면 어쩔 수 없이 내부 분할
    while (b.bottom - pageStart > maxSlicePx) {
      rawCuts.push(pageStart + maxSlicePx);
      pageStart += maxSlicePx;
    }
    lastBottom = b.bottom;
  }
  rawCuts.push(canvas.height);

  // 2) 어떤 페이지도 최대 높이를 넘지 않도록 보정 (data-block이 없을 때의 안전장치)
  const cuts: number[] = [];
  let s = 0;
  for (const c of rawCuts) {
    while (c - s > maxSlicePx + 1) {
      s += maxSlicePx;
      cuts.push(s);
    }
    if (c > s) cuts.push(c);
    s = c;
  }

  // 3) 슬라이스별로 페이지에 그림
  let prev = 0;
  let drawn = 0;
  for (const rawEnd of cuts) {
    const end = Math.min(canvas.height, rawEnd);
    const sliceH = end - prev;
    if (sliceH <= 1) {
      prev = end;
      continue;
    }
    if (drawn > 0) pdf.addPage();
    const offscreen = document.createElement("canvas");
    offscreen.width = canvas.width;
    offscreen.height = Math.ceil(sliceH);
    const ctx = offscreen.getContext("2d");
    if (!ctx) throw new Error("Canvas 2d context failed");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    ctx.drawImage(canvas, 0, prev, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
    const imgData = offscreen.toDataURL("image/jpeg", 0.95);
    const drawH = (sliceH * contentW) / canvas.width;
    pdf.addImage(imgData, "JPEG", margin, margin, contentW, drawH);
    prev = end;
    drawn++;
  }
}

/** 캔버스 전체를 한 페이지에 맞춰 (비율 유지) 넣기 (표지/마지막장용) */
function addCanvasSinglePage(pdf: jsPDF, canvas: HTMLCanvasElement, pageW: number, pageH: number, margin: number): void {
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;
  let drawW = availW;
  let drawH = canvas.height * (availW / canvas.width);
  if (drawH > availH) {
    const s = availH / drawH;
    drawW *= s;
    drawH = availH;
  }
  const x = (pageW - drawW) / 2;
  const y = (pageH - drawH) / 2;
  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  pdf.addImage(imgData, "JPEG", x, y, drawW, drawH);
}

function logoBar(kaist: string | null, kixlab: string | null, heightPx = 46): string {
  const imgs: string[] = [];
  if (kaist) imgs.push(`<img src="${kaist}" alt="KAIST" style="height: ${heightPx}px; object-fit: contain;" />`);
  if (kixlab) imgs.push(`<img src="${kixlab}" alt="KIXLAB" style="height: ${heightPx}px; object-fit: contain;" />`);
  if (imgs.length === 0) return "";
  return `<div style="display: flex; align-items: center; gap: 22px;">${imgs.join("")}</div>`;
}

/** 기입란 (라벨 + 밑줄). value가 있으면 미리 채워서 표시 */
function fieldCell(label: string, value: string, minWidth: string): string {
  const filled = value ? escapeHtml(value) : "&nbsp;";
  return `
    <div style="display: flex; align-items: flex-end; gap: 8px; min-width: ${minWidth};">
      <span style="color: ${THEME.muted}; font-size: 13px; white-space: nowrap;">${escapeHtml(label)}</span>
      <span style="flex: 1; border-bottom: 1.4px solid ${THEME.navy}; padding: 0 6px 2px; min-height: 20px; color: ${THEME.ink}; font-weight: 600;">${filled}</span>
    </div>`;
}

/**
 * 확정된 문제(원본/재생성 선택 반영)를 학습지 PDF로 다운로드
 * 구성: 표지 → 본문(문제 + 하위 문항) → 마무리/메모
 */
export interface WorksheetSections {
  coverHtml: string;
  bodyHtml: string;
  finalHtml: string;
  fontFamily: string;
  filename: string;
}

/** A4(794px) 학습지 컨테이너 기본 스타일 (미리보기 DOM에도 동일 적용) */
export const WORKSHEET_BASE_STYLE: Record<string, string> = {
  width: "794px",
  backgroundColor: "#fff",
  color: THEME.ink,
  fontSize: "14px",
  lineHeight: "1.6",
};

export function worksheetFontFamily(locale: Locale): string {
  return locale === "en" ? "Helvetica, Arial, sans-serif" : "Malgun Gothic, Apple SD Gothic Neo, sans-serif";
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
): Promise<WorksheetSections> {
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

  const fontFamily = worksheetFontFamily(locale);

  const L = (key: TranslationKey) => pdfLabel(locale, key);

  const [kaistLogo, kixlabLogo] = await Promise.all([urlToDataUrl(kaistLogoUrl), urlToDataUrl(kixlabLogoUrl)]);

  const grade = cotData.grade ? stripHtml(cotData.grade) : "";
  const subjectArea = subQuestionData.subject_area ? stripHtml(subQuestionData.subject_area) : "";
  const safeProblemId =
    problemId && typeof problemId === "string" ? problemId.replace(/[/\\:*?"<>|\n\r]+/g, "_").trim() : "";
  const researchTitle = L("exportPdf.coverResearchTitle");
  const docType = L("exportPdf.coverDocType");

  // ---------- 표지 ----------
  const coverMetaChips: string[] = [];
  if (safeProblemId) coverMetaChips.push(`${L("exportPdf.problemId")} · ${escapeHtml(safeProblemId)}`);
  if (subjectArea) coverMetaChips.push(`${L("exportPdf.subjectArea")} · ${escapeHtml(subjectArea)}`);
  const coverMetaHtml = coverMetaChips.length
    ? `<div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 18px;">${coverMetaChips
        .map(
          (c) =>
            `<span style="background: ${THEME.soft}; color: ${THEME.navyDeep}; border: 1px solid ${THEME.line}; border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 600;">${c}</span>`,
        )
        .join("")}</div>`
    : "";

  const coverHtml = `
    <div style="box-sizing: border-box; padding: 46px 46px 40px; min-height: 1040px; display: flex; flex-direction: column;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        ${logoBar(kaistLogo, kixlabLogo)}
      </div>

      <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
        <div style="width: 64px; height: 5px; background: ${THEME.navy}; border-radius: 3px; margin-bottom: 30px;"></div>
        <div style="font-size: 22px; color: ${THEME.muted}; letter-spacing: 1px; font-weight: 600;">${escapeHtml(researchTitle)}</div>
        <div style="font-size: 62px; font-weight: 800; color: ${THEME.navy}; margin: 18px 0 8px; letter-spacing: 6px;">${escapeHtml(docType)}</div>
        <div style="width: 64px; height: 5px; background: ${THEME.navy}; border-radius: 3px; margin-top: 26px;"></div>
        ${coverMetaHtml}
      </div>

      <div style="border: 1.5px solid ${THEME.line}; border-radius: 14px; padding: 26px 30px; background: #fff;">
        <div style="font-size: 13px; font-weight: 700; color: ${THEME.navy}; letter-spacing: 2px; margin-bottom: 18px;">${escapeHtml(
          L("exportPdf.studentInfo"),
        )}</div>
        <div style="display: flex; gap: 28px; flex-wrap: wrap;">
          ${fieldCell(L("exportPdf.name"), "", "200px")}
          ${fieldCell(L("exportPdf.grade"), grade, "150px")}
          ${fieldCell(L("exportPdf.date"), "", "160px")}
        </div>
      </div>
    </div>`;

  // ---------- 본문 ----------
  const answerLabel = escapeHtml(L("exportPdf.answer"));
  let bodyItems = "";
  finalSubQuestions.forEach((sq, i) => {
    bodyItems += `
      <div data-block style="margin-bottom: 22px; break-inside: avoid;">
        <div style="display: flex; gap: 10px; align-items: flex-start;">
          <span style="flex: 0 0 auto; width: 26px; height: 26px; border-radius: 50%; background: ${THEME.navy}; color: #fff; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center;">${i + 1}</span>
          <div class="mj" style="flex: 1; padding-top: 2px;">${formatQuestionHtml(sq.question)}</div>
        </div>
        <div style="margin: 10px 0 0 36px;">
          <div style="font-size: 12px; color: ${THEME.muted}; margin-bottom: 8px;">${answerLabel}</div>
          <div style="border: 1.2px solid ${THEME.line}; border-radius: 8px; background: #fbfcfe; height: 140px;"></div>
        </div>
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

  const imageHtml = cotData.image_data
    ? `<div data-block style="margin-bottom: 20px; text-align: center;">
         <img src="${cotData.image_data}" alt="${escapeHtml(L("app.problemImage"))}" style="max-width: 100%; max-height: 320px; object-fit: contain; border: 1px solid ${THEME.line}; border-radius: 8px; padding: 8px;" />
       </div>`
    : "";

  const bodyHeaderRight = `
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

  const dateStr = new Date().toISOString().slice(0, 10);
  const filePrefix = L("exportPdf.filePrefix");
  const defaultGrade = L("exportPdf.defaultGrade");
  const filename = safeProblemId
    ? `${filePrefix}_${safeProblemId}_${dateStr}.pdf`
    : `${filePrefix}_${cotData.grade || defaultGrade}_${dateStr}.pdf`;

  return { coverHtml, bodyHtml, finalHtml, fontFamily, filename };
}

/** [data-block] 요소들의 세로 위치를 canvas px 기준으로 측정 */
function measureBlocksIn(wrap: HTMLElement, canvas: HTMLCanvasElement): BlockBound[] {
  const scaleY = wrap.offsetHeight > 0 ? canvas.height / wrap.offsetHeight : 2;
  const wrapTop = wrap.getBoundingClientRect().top;
  return Array.from(wrap.querySelectorAll<HTMLElement>("[data-block]")).map((elm) => {
    const r = elm.getBoundingClientRect();
    return { top: (r.top - wrapTop) * scaleY, bottom: (r.bottom - wrapTop) * scaleY };
  });
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
): Promise<void> {
  const { coverHtml, bodyHtml, finalHtml, fontFamily, filename } = await buildWorksheetSections(
    cotData,
    subQuestionData,
    preferredVersion,
    problemId,
    locale,
  );

  const pdf = new jsPDF("p", "mm", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2;

  const coverCanvas = await captureToCanvas(coverHtml, fontFamily);
  addCanvasSinglePage(pdf, coverCanvas, pageW, pageH, margin);

  pdf.addPage();
  const { canvas: bodyCanvas, blocks: bodyBlocks } = await captureWithBlocks(bodyHtml, fontFamily);
  addBlockPagedCanvas(pdf, bodyCanvas, bodyBlocks, margin, contentW, contentH);

  pdf.addPage();
  const finalCanvas = await captureToCanvas(finalHtml, fontFamily);
  addCanvasSinglePage(pdf, finalCanvas, pageW, pageH, margin);

  pdf.save(filename);
}

/**
 * 이미 화면(미리보기 모달)에 렌더된 표지/본문/마지막장 요소를 캡처해 PDF로 저장.
 * MathJax가 화면에서 이미 조판된 상태라 수식이 안정적으로 캡처됨.
 */
export async function renderWorksheetPdfFromElements(
  coverEl: HTMLElement,
  bodyEl: HTMLElement,
  finalEl: HTMLElement,
  filename: string,
): Promise<void> {
  const pdf = new jsPDF("p", "mm", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2;

  // 수식이 확실히 조판된 뒤 캡처되도록 세 섹션 모두 조판을 기다림
  // (미리보기에서 조판이 끝나기 전에 다운로드를 눌러도 raw LaTeX가 박히지 않도록)
  await typesetMathJax(coverEl);
  await typesetMathJax(bodyEl);
  await typesetMathJax(finalEl);
  // 레이아웃 안정화 대기 (조판 직후 리플로우)
  await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 60)));

  const capture = (el: HTMLElement) => html2canvas(el, { ...H2C_OPTIONS });

  const coverCanvas = await capture(coverEl);
  addCanvasSinglePage(pdf, coverCanvas, pageW, pageH, margin);

  pdf.addPage();
  const bodyCanvas = await capture(bodyEl);
  const blocks = measureBlocksIn(bodyEl, bodyCanvas);
  addBlockPagedCanvas(pdf, bodyCanvas, blocks, margin, contentW, contentH);

  pdf.addPage();
  const finalCanvas = await capture(finalEl);
  addCanvasSinglePage(pdf, finalCanvas, pageW, pageH, margin);

  pdf.save(filename);
}
