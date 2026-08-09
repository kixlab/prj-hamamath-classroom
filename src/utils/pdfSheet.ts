import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { escapeHtml } from "./formatting";
import type { Locale } from "../i18n/translations";

/**
 * A4 시트 PDF 공통 엔진.
 * 학습지(exportPdf.ts)와 루브릭(exportRubricPdf.ts)이 같은 조판·페이지 분할 로직을 공유한다.
 */

/** 시트 공통 디자인 토큰 */
export const THEME = {
  navy: "#004191",
  navyDeep: "#00306e",
  ink: "#1a2230",
  muted: "#5b6472",
  line: "#d5deec",
  soft: "#eef3fb",
  accent: "#eab308",
};

/** HTML 태그 제거 후 플레인 텍스트 반환 */
export function stripHtml(html: string): string {
  if (!html || !html.trim()) return "";
  const div = document.createElement("div");
  div.innerHTML = html.trim();
  return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

/** 번들된 에셋 URL을 dataURL로 변환 (html2canvas가 안정적으로 렌더하도록). 실패 시 null */
export async function urlToDataUrl(url: string): Promise<string | null> {
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

/** A4(794px) 시트 컨테이너 기본 스타일 (미리보기 DOM에도 동일 적용) */
export const SHEET_BASE_STYLE: Record<string, string> = {
  width: "794px",
  backgroundColor: "#fff",
  color: THEME.ink,
  fontSize: "14px",
  lineHeight: "1.6",
};

export function sheetFontFamily(locale: Locale): string {
  return locale === "en" ? "Helvetica, Arial, sans-serif" : "Malgun Gothic, Apple SD Gothic Neo, sans-serif";
}

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

/** 요소의 LaTeX 수식을 MathJax로 렌더 (캡처/미리보기 전에 호출). MathJax가 없으면 조용히 통과 */
export async function typesetMathJax(el: HTMLElement): Promise<void> {
  const getMj = () =>
    (
      window as unknown as {
        MathJax?: { typesetPromise?: (els: HTMLElement[]) => Promise<void>; typesetClear?: (els: HTMLElement[]) => void };
      }
    ).MathJax;
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
 * 캔버스를 페이지로 나눠 추가하되, 페이지 경계가 블록([data-block]) 내부를 가로지르지 않게 함.
 * (답변 박스·루브릭 카드가 페이지 분할로 잘리는 문제 방지)
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
function addCanvasSinglePage(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  pageW: number,
  pageH: number,
  margin: number,
): void {
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

/**
 * 시트를 PDF의 몇 페이지로 앉힐지 결정하는 방식.
 * - `fit`: 시트 전체를 한 페이지에 축소해 넣음 (표지·마무리처럼 한 장짜리)
 * - `flow`: 내용 길이에 따라 여러 페이지로 나눔 ([data-block] 경계 존중)
 */
export type SheetFit = "fit" | "flow";

export interface SheetSource {
  html: string;
  fit: SheetFit;
}

/** 미리보기 모달과 PDF 내보내기가 공유하는 한 장의 정의 */
export interface SheetPage extends SheetSource {
  /** React key 겸 DOM ref 식별자 */
  key: string;
  /** 미리보기에서 시트 위에 표시할 이름 (표지/본문/…) */
  label: string;
}

export interface SheetElement {
  el: HTMLElement;
  fit: SheetFit;
}

const PAGE_MARGIN_MM = 10;

function newA4() {
  const pdf = new jsPDF("p", "mm", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  return {
    pdf,
    pageW,
    pageH,
    margin: PAGE_MARGIN_MM,
    contentW: pageW - PAGE_MARGIN_MM * 2,
    contentH: pageH - PAGE_MARGIN_MM * 2,
  };
}

/**
 * 이미 화면(미리보기 모달)에 렌더된 시트 요소들을 캡처해 PDF로 저장.
 * MathJax가 화면에서 이미 조판된 상태라 수식이 안정적으로 캡처된다.
 */
export async function renderSheetsPdfFromElements(sheets: SheetElement[], filename: string): Promise<void> {
  if (sheets.length === 0) return;
  const { pdf, pageW, pageH, margin, contentW, contentH } = newA4();

  // 수식이 확실히 조판된 뒤 캡처되도록 모든 시트의 조판을 기다림
  // (미리보기에서 조판이 끝나기 전에 다운로드를 눌러도 raw LaTeX가 박히지 않도록)
  for (const s of sheets) await typesetMathJax(s.el);
  // 레이아웃 안정화 대기 (조판 직후 리플로우)
  await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 60)));

  for (let i = 0; i < sheets.length; i++) {
    const { el, fit } = sheets[i];
    if (i > 0) pdf.addPage();
    const canvas = await html2canvas(el, { ...H2C_OPTIONS });
    if (fit === "fit") {
      addCanvasSinglePage(pdf, canvas, pageW, pageH, margin);
    } else {
      addBlockPagedCanvas(pdf, canvas, measureBlocksIn(el, canvas), margin, contentW, contentH);
    }
  }

  pdf.save(filename);
}

/** 오프스크린 DOM에 HTML을 붙여 캡처한 뒤 PDF로 저장 (미리보기 없이 바로 다운로드) */
export async function renderSheetsPdf(sheets: SheetSource[], fontFamily: string, filename: string): Promise<void> {
  if (sheets.length === 0) return;
  const { pdf, pageW, pageH, margin, contentW, contentH } = newA4();

  for (let i = 0; i < sheets.length; i++) {
    const { html, fit } = sheets[i];
    const wrap = document.createElement("div");
    Object.assign(wrap.style, A4_WRAP_STYLE, { fontFamily });
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    try {
      await typesetMathJax(wrap);
      const canvas = await html2canvas(wrap, { ...H2C_OPTIONS });
      if (i > 0) pdf.addPage();
      if (fit === "fit") {
        addCanvasSinglePage(pdf, canvas, pageW, pageH, margin);
      } else {
        addBlockPagedCanvas(pdf, canvas, measureBlocksIn(wrap, canvas), margin, contentW, contentH);
      }
    } finally {
      if (wrap.parentNode) document.body.removeChild(wrap);
    }
  }

  pdf.save(filename);
}

/** 상단 로고 바 (KAIST·KIXLAB). 로고 로드에 실패하면 빈 문자열 */
export function logoBar(kaist: string | null, kixlab: string | null, heightPx = 46): string {
  const imgs: string[] = [];
  if (kaist) imgs.push(`<img src="${kaist}" alt="KAIST" style="height: ${heightPx}px; object-fit: contain;" />`);
  if (kixlab) imgs.push(`<img src="${kixlab}" alt="KIXLAB" style="height: ${heightPx}px; object-fit: contain;" />`);
  if (imgs.length === 0) return "";
  return `<div style="display: flex; align-items: center; gap: 22px;">${imgs.join("")}</div>`;
}

/** 기입란 (라벨 + 밑줄). value가 있으면 미리 채워서 표시 */
export function fieldCell(label: string, value: string, minWidth: string): string {
  const filled = value ? escapeHtml(value) : "&nbsp;";
  return `
    <div style="display: flex; align-items: flex-end; gap: 8px; min-width: ${minWidth};">
      <span style="color: ${THEME.muted}; font-size: 13px; white-space: nowrap;">${escapeHtml(label)}</span>
      <span style="flex: 1; border-bottom: 1.4px solid ${THEME.navy}; padding: 0 6px 2px; min-height: 20px; color: ${THEME.ink}; font-weight: 600;">${filled}</span>
    </div>`;
}

/** 표지의 메타 정보 칩 묶음 */
export function metaChips(labels: string[]): string {
  if (labels.length === 0) return "";
  const chips = labels
    .map(
      (c) =>
        `<span style="background: ${THEME.soft}; color: ${THEME.navyDeep}; border: 1px solid ${THEME.line}; border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 600;">${c}</span>`,
    )
    .join("");
  return `<div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 18px;">${chips}</div>`;
}

/** 파일명에 쓸 수 없는 문자 제거 */
export function safeFilePart(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "";
  return value.replace(/[/\\:*?"<>|\n\r]+/g, "_").trim();
}

/** YYYY-MM-DD */
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
