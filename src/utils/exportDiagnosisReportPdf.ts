import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { escapeHtml } from "./formatting";
import { loadWorksheetLogosBase64 } from "./exportPdf";

/** 학습지 PDF와 동일한 디자인 토큰 */
const THEME = {
  navy: "#004191",
  navyDeep: "#00306e",
  ink: "#1a2230",
  muted: "#5b6472",
  line: "#d5deec",
  soft: "#eef3fb",
  accent: "#eab308",
  white: "#ffffff",
};

/** 문항 생성(2·3·4단계)과 동일한 대단계(1~4) 색 — index.css --framework-step-* */
const STAGE_COLORS: Record<string, { accent: string; bg: string; border: string; text: string }> = {
  "1": { accent: "#f87171", bg: "#fef2f2", border: "#fecaca", text: "#f87171" },
  "2": { accent: "#f9a8d4", bg: "#fdf2f8", border: "#fbcfe8", text: "#f9a8d4" },
  "3": { accent: "#fdba74", bg: "#fff7ed", border: "#fed7aa", text: "#fdba74" },
  "4": { accent: "#fcd34d", bg: "#fffbeb", border: "#fde68a", text: "#fcd34d" },
};

/** 상·중·하 및 5등급 — 자연스럽고 구분되는 색 */
const LEVEL_COLORS = {
  high: "#3d6b5a",
  mid: "#a8894f",
  low: "#9a6e7c",
} as const;

const GRADE_COLORS: Record<string, string> = {
  상: "#3d6b5a",
  중상: "#5a7a8c",
  중: "#a8894f",
  중하: "#b8846a",
  하: "#9a6e7c",
};

const LEVEL_SCORE: Record<string, number> = { 상: 2, 중: 1, 하: 0 };

function scoreToGradeFrom100(score_100: number): string {
  if (score_100 < 0 || score_100 > 100) return "-";
  if (score_100 >= 80) return "상";
  if (score_100 >= 60) return "중상";
  if (score_100 >= 40) return "중";
  if (score_100 >= 20) return "중하";
  return "하";
}

export interface DiagnosisReportData {
  problem_rows: Array<{
    problem_id: string;
    step_count: number;
    high_count: number;
    mid_count: number;
    low_count: number;
  }>;
  step_rows: Array<{
    display_code: string;
    problem_count: number;
    score_100?: number;
    final_level: string;
    feedback_summary?: string | null;
  }>;
}

export interface ProblemStepSummaryForPdf {
  problemId: string;
  levelsByDisplayCode: Record<string, "상" | "중" | "하">;
  feedbackByDisplayCode?: Record<string, string>;
}

/** 모달과 동일한 문구·표시 규칙을 PDF에 주입 */
export interface DiagnosisReportPdfViewOptions {
  researchTitle: string;
  reportTitle: string;
  /** 크게 표시할 학생 이름 */
  studentName: string;
  levelSummaryTitle: string;
  stageSummaryTitle: string;
  colProblemId: string;
  colDiagnosedStepCount: string;
  colHigh: string;
  colMid: string;
  colLow: string;
  colAverageGrade: string;
  colStage: string;
  colSubSkill: string;
  colScore100: string;
  colFinalGrade: string;
  stageFeedbackLabel: string;
  formatProblemId: (problemId: string) => string;
  formatGrade: (gradeKo: string) => string;
  formatScorePoints: (n: number) => string;
  formatCountHigh: (n: number) => string;
  formatCountMid: (n: number) => string;
  formatCountLow: (n: number) => string;
  getStepGroupInfo: (displayCode: string) => { group: string; stageLabel: string; detailLabel: string };
}

function logoBar(kaist: string | null, kixlab: string | null, heightPx = 40): string {
  const imgs: string[] = [];
  if (kaist) imgs.push(`<img src="${kaist}" alt="KAIST" style="height: ${heightPx}px; object-fit: contain;" />`);
  if (kixlab) imgs.push(`<img src="${kixlab}" alt="KIXLAB" style="height: ${heightPx}px; object-fit: contain;" />`);
  if (imgs.length === 0) return "";
  return `<div style="display: flex; align-items: center; gap: 18px;">${imgs.join("")}</div>`;
}

function pageShell(
  inner: string,
  logos: { kaist: string | null; kixlab: string | null },
  researchTitle: string,
): string {
  return `
    <div style="box-sizing: border-box; padding: 34px 36px 30px; color: ${THEME.ink};">
      ${inner}
      <div style="margin-top: 28px; padding-top: 14px; border-top: 1px solid ${THEME.line}; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 11px; color: ${THEME.muted};">${escapeHtml(researchTitle)}</span>
        ${logoBar(logos.kaist, logos.kixlab, 26)}
      </div>
    </div>`;
}

function sectionTitle(text: string): string {
  return `
    <div style="display: flex; align-items: center; gap: 10px; margin: 22px 0 12px;">
      <div style="width: 4px; height: 18px; background: ${THEME.navy}; border-radius: 2px;"></div>
      <div style="font-size: 15px; font-weight: 800; color: ${THEME.navy}; letter-spacing: 0.3px;">${escapeHtml(text)}</div>
    </div>`;
}

function gradeBadge(displayGrade: string, gradeKo?: string): string {
  if (!displayGrade || displayGrade === "-" || !gradeKo || gradeKo === "-") {
    return `<span style="display: inline-block; padding: 3px 10px; border-radius: 999px; background: #eef1f4; color: ${THEME.muted}; border: 1px solid ${THEME.line}; font-size: 12px; font-weight: 700;">-</span>`;
  }
  const color = GRADE_COLORS[gradeKo] || THEME.navy;
  return `<span style="display: inline-block; padding: 3px 10px; border-radius: 999px; background: ${color}; color: #fff; font-size: 12px; font-weight: 700;">${escapeHtml(displayGrade)}</span>`;
}

function progressBar(score: number, color = THEME.navy): string {
  const w = Math.max(0, Math.min(100, score));
  return `
    <div style="width: 100%; height: 10px; background: #eef1f4; border: 1px solid ${THEME.line}; border-radius: 999px; overflow: hidden;">
      <div style="width: ${w}%; height: 100%; background: ${color}; border-radius: 999px;"></div>
    </div>`;
}

function stackedLevelBar(high: number, mid: number, low: number): string {
  const total = high + mid + low;
  if (total <= 0) {
    return `<div style="width: 100%; height: 10px; background: #eef1f4; border: 1px solid ${THEME.line}; border-radius: 999px;"></div>`;
  }
  const pct = (n: number) => `${(n / total) * 100}%`;
  return `
    <div style="width: 100%; height: 10px; background: #eef1f4; border: 1px solid ${THEME.line}; border-radius: 999px; overflow: hidden; display: flex;">
      <div style="width: ${pct(high)}; height: 100%; background: ${LEVEL_COLORS.high};"></div>
      <div style="width: ${pct(mid)}; height: 100%; background: ${LEVEL_COLORS.mid};"></div>
      <div style="width: ${pct(low)}; height: 100%; background: ${LEVEL_COLORS.low};"></div>
    </div>`;
}

async function captureToCanvas(html: string): Promise<HTMLCanvasElement> {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    width: "210mm",
    maxWidth: "794px",
    backgroundColor: THEME.white,
    color: THEME.ink,
    fontFamily: "Malgun Gothic, Apple SD Gothic Neo, AppleGothic, sans-serif",
    fontSize: "14px",
    lineHeight: "1.6",
  });
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  try {
    return await html2canvas(wrap, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: THEME.white,
    });
  } finally {
    if (wrap.parentNode) document.body.removeChild(wrap);
  }
}

function addCanvasToPdf(pdf: jsPDF, canvas: HTMLCanvasElement, margin: number, contentW: number, contentH: number): void {
  const fullImgH = canvas.height * (contentW / canvas.width);
  const pageCount = Math.max(1, Math.ceil(fullImgH / contentH));
  const sliceHeight = canvas.height / pageCount;
  for (let p = 0; p < pageCount; p++) {
    if (p > 0) pdf.addPage();
    const offscreen = document.createElement("canvas");
    offscreen.width = canvas.width;
    offscreen.height = Math.ceil(sliceHeight);
    const ctx = offscreen.getContext("2d");
    if (!ctx) throw new Error("Canvas 2d context failed");
    ctx.fillStyle = THEME.white;
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    ctx.drawImage(canvas, 0, p * sliceHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
    const imgData = offscreen.toDataURL("image/jpeg", 0.92);
    const drawH = (sliceHeight * contentW) / canvas.width;
    pdf.addImage(imgData, "JPEG", margin, margin, contentW, drawH);
  }
}

/**
 * 진단 리포트 PDF — 모달에 보이는 내용(라벨·등급·문제명·피드백)과 동일하게 출력
 */
export async function exportDiagnosisReportPdf(
  reportData: DiagnosisReportData,
  studentName: string,
  _studentId: string,
  studentProblemSummaries: Record<string, ProblemStepSummaryForPdf>,
  view: DiagnosisReportPdfViewOptions,
): Promise<void> {
  const logos = await loadWorksheetLogosBase64();
  const problemIds = Object.keys(studentProblemSummaries);
  const name = studentName || "학생";
  const dateStr = new Date().toISOString().slice(0, 10);

  const sorted = [...reportData.step_rows].sort((a, b) =>
    a.display_code.localeCompare(b.display_code, undefined, { numeric: true }),
  );
  const byGroup: Record<string, typeof sorted> = {};
  sorted.forEach((row) => {
    const g = view.getStepGroupInfo(row.display_code).group;
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(row);
  });

  const headerBlock = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid ${THEME.navy}; padding-bottom: 14px; margin-bottom: 8px;">
      <div>
        <div style="font-size: 12px; color: ${THEME.muted}; letter-spacing: 0.4px;">${escapeHtml(view.researchTitle)}</div>
        <div style="font-size: 14px; font-weight: 700; color: ${THEME.navy}; margin-top: 6px; letter-spacing: 0.5px;">${escapeHtml(view.reportTitle)}</div>
      </div>
      ${logoBar(logos.kaist, logos.kixlab, 38)}
    </div>
    <div style="margin: 18px 0 8px;">
      <div style="font-size: 36px; font-weight: 800; color: ${THEME.navyDeep}; letter-spacing: -0.5px; line-height: 1.15;">${escapeHtml(view.studentName || name)}</div>
    </div>`;

  // ---------- 1페이지: 문제별 수준 요약 + 그래프 (모달 첫 블록과 동일) ----------
  let tableRows = "";
  reportData.problem_rows.forEach((row) => {
    const total = row.high_count + row.mid_count + row.low_count || 0;
    const sum = total > 0 ? row.high_count * 2 + row.mid_count * 1 + row.low_count * 0 : 0;
    const score_100 = total > 0 ? (sum / (total * 2)) * 100 : 0;
    const gradeKo = total > 0 ? scoreToGradeFrom100(score_100) : "-";
    const gradeLabel = view.formatGrade(gradeKo);
    tableRows += `
      <tr>
        <td style="border: 1px solid ${THEME.line}; padding: 9px 10px; text-align: left; font-weight: 600;">${escapeHtml(view.formatProblemId(row.problem_id))}</td>
        <td style="border: 1px solid ${THEME.line}; padding: 9px 10px; text-align: center;">${row.step_count}</td>
        <td style="border: 1px solid ${THEME.line}; padding: 9px 10px; text-align: center;">${row.high_count}</td>
        <td style="border: 1px solid ${THEME.line}; padding: 9px 10px; text-align: center;">${row.mid_count}</td>
        <td style="border: 1px solid ${THEME.line}; padding: 9px 10px; text-align: center;">${row.low_count}</td>
        <td style="border: 1px solid ${THEME.line}; padding: 9px 10px; text-align: center;">${gradeBadge(gradeLabel, gradeKo)}</td>
      </tr>`;
  });

  let problemGraphs = "";
  reportData.problem_rows.forEach((row) => {
    const total = row.high_count + row.mid_count + row.low_count || 0;
    const sum = total > 0 ? row.high_count * 2 + row.mid_count * 1 + row.low_count * 0 : 0;
    const score_100 = total > 0 ? (sum / (total * 2)) * 100 : 0;
    const gradeKo = total > 0 ? scoreToGradeFrom100(score_100) : "-";
    const gradeLabel = view.formatGrade(gradeKo);
    problemGraphs += `
      <div style="margin-bottom: 12px; padding: 14px 16px; border: 1.5px solid ${THEME.line}; border-radius: 12px; background: #fbfcfe;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 12px;">
          <span style="font-weight: 700; font-size: 13px; color: ${THEME.ink};">${escapeHtml(view.formatProblemId(row.problem_id))}</span>
          <span style="display: flex; gap: 8px; align-items: center; font-size: 12px; color: ${THEME.muted};">
            ${gradeBadge(gradeLabel, gradeKo)}
            <span style="font-weight: 700; color: ${THEME.ink};">${escapeHtml(view.formatScorePoints(Math.round(score_100)))}</span>
          </span>
        </div>
        ${stackedLevelBar(row.high_count, row.mid_count, row.low_count)}
        <div style="margin-top: 8px; font-size: 11px; color: ${THEME.muted}; display: flex; gap: 12px; flex-wrap: wrap;">
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${LEVEL_COLORS.high};margin-right:4px;vertical-align:middle;"></span>${escapeHtml(view.formatCountHigh(row.high_count))}</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${LEVEL_COLORS.mid};margin-right:4px;vertical-align:middle;"></span>${escapeHtml(view.formatCountMid(row.mid_count))}</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${LEVEL_COLORS.low};margin-right:4px;vertical-align:middle;"></span>${escapeHtml(view.formatCountLow(row.low_count))}</span>
        </div>
      </div>`;
  });

  const htmlPage1 = pageShell(
    `
    ${headerBlock}
    ${sectionTitle(view.levelSummaryTitle)}
    <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px;">
      <thead>
        <tr style="background: ${THEME.soft};">
          <th style="border: 1px solid ${THEME.line}; padding: 10px; text-align: left; color: ${THEME.navy}; font-weight: 700;">${escapeHtml(view.colProblemId)}</th>
          <th style="border: 1px solid ${THEME.line}; padding: 10px; color: ${THEME.navy}; font-weight: 700;">${escapeHtml(view.colDiagnosedStepCount)}</th>
          <th style="border: 1px solid ${THEME.line}; padding: 10px; color: ${THEME.navy}; font-weight: 700;">${escapeHtml(view.colHigh)}</th>
          <th style="border: 1px solid ${THEME.line}; padding: 10px; color: ${THEME.navy}; font-weight: 700;">${escapeHtml(view.colMid)}</th>
          <th style="border: 1px solid ${THEME.line}; padding: 10px; color: ${THEME.navy}; font-weight: 700;">${escapeHtml(view.colLow)}</th>
          <th style="border: 1px solid ${THEME.line}; padding: 10px; color: ${THEME.navy}; font-weight: 700;">${escapeHtml(view.colAverageGrade)}</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    ${problemGraphs}
    `,
    logos,
    view.researchTitle,
  );

  // ---------- 2페이지: 단계별 최종 수준 표 (모달 두 번째 블록 표와 동일) ----------
  let stepTableRows = "";
  ["1", "2", "3", "4"].forEach((g) => {
    const rows = byGroup[g] || [];
    rows.forEach((row, idx) => {
      const info = view.getStepGroupInfo(row.display_code);
      let sum = 0;
      let stepCount = 0;
      problemIds.forEach((pid) => {
        const level = studentProblemSummaries[pid]?.levelsByDisplayCode?.[row.display_code];
        if (level === "상" || level === "중" || level === "하") {
          sum += LEVEL_SCORE[level];
          stepCount += 1;
        }
      });
      const score_100 = stepCount > 0 ? (sum / (stepCount * 2)) * 100 : 0;
      const gradeKo = stepCount > 0 ? scoreToGradeFrom100(score_100) : "-";
      const gradeLabel = view.formatGrade(gradeKo);
      const stageLabel = idx === 0 ? info.stageLabel : "";
      const stageBg = idx === 0 ? THEME.soft : THEME.white;
      stepTableRows += `
        <tr>
          <td style="border: 1px solid ${THEME.line}; padding: 9px 10px; text-align: center; font-weight: 700; color: ${THEME.navy}; background: ${stageBg};">${escapeHtml(stageLabel)}</td>
          <td style="border: 1px solid ${THEME.line}; padding: 9px 10px; text-align: left;">
            <span style="font-weight: 700; color: ${THEME.navy}; margin-right: 6px;">${escapeHtml(row.display_code)}</span>
            <span style="color: ${THEME.muted};">${escapeHtml(info.detailLabel)}</span>
          </td>
          <td style="border: 1px solid ${THEME.line}; padding: 9px 10px; text-align: center; font-weight: 600;">${stepCount > 0 ? Math.round(score_100) : "-"}</td>
          <td style="border: 1px solid ${THEME.line}; padding: 9px 10px; text-align: center;">${gradeBadge(gradeLabel, gradeKo)}</td>
        </tr>`;
    });
  });

  const htmlPage2 = pageShell(
    `
    <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid ${THEME.navy}; padding-bottom: 12px; margin-bottom: 6px;">
      <div>
        <div style="font-size: 12px; color: ${THEME.muted};">${escapeHtml(view.researchTitle)}</div>
        <div style="font-size: 22px; font-weight: 800; color: ${THEME.navyDeep}; margin-top: 4px;">${escapeHtml(view.studentName || name)}</div>
        <div style="font-size: 15px; font-weight: 800; color: ${THEME.navy}; margin-top: 12px;">${escapeHtml(view.stageSummaryTitle)}</div>
      </div>
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 14px;">
      <thead>
        <tr style="background: ${THEME.soft};">
          <th style="border: 1px solid ${THEME.line}; padding: 10px; color: ${THEME.navy}; font-weight: 700;">${escapeHtml(view.colStage)}</th>
          <th style="border: 1px solid ${THEME.line}; padding: 10px; text-align: left; color: ${THEME.navy}; font-weight: 700;">${escapeHtml(view.colSubSkill)}</th>
          <th style="border: 1px solid ${THEME.line}; padding: 10px; color: ${THEME.navy}; font-weight: 700;">${escapeHtml(view.colScore100)}</th>
          <th style="border: 1px solid ${THEME.line}; padding: 10px; color: ${THEME.navy}; font-weight: 700;">${escapeHtml(view.colFinalGrade)}</th>
        </tr>
      </thead>
      <tbody>${stepTableRows}</tbody>
    </table>
    `,
    logos,
    view.researchTitle,
  );

  // ---------- 3페이지: 단계별 그래프 + 피드백 (모달 두 번째 블록 그래프와 동일) ----------
  let stageGraphs = "";
  ["1", "2", "3", "4"].forEach((g) => {
    const rows = byGroup[g] || [];
    if (rows.length === 0) return;
    const stageLabel = view.getStepGroupInfo(`${g}-1`).stageLabel;
    const stagePalette = STAGE_COLORS[g] || {
      accent: THEME.navy,
      bg: THEME.soft,
      border: THEME.line,
      text: THEME.navy,
    };
    let items = "";
    rows.forEach((row) => {
      const info = view.getStepGroupInfo(row.display_code);
      let sum = 0;
      let stepCount = 0;
      problemIds.forEach((pid) => {
        const level = studentProblemSummaries[pid]?.levelsByDisplayCode?.[row.display_code];
        if (level === "상" || level === "중" || level === "하") {
          sum += LEVEL_SCORE[level];
          stepCount += 1;
        }
      });
      const score_100 = stepCount > 0 ? (sum / (stepCount * 2)) * 100 : 0;
      const gradeKo = stepCount > 0 ? scoreToGradeFrom100(score_100) : "-";
      const gradeLabel = view.formatGrade(gradeKo);
      const gradeColor = GRADE_COLORS[gradeKo] || THEME.muted;
      const feedbackText = (row.feedback_summary || "").trim();
      const feedbackHtml = feedbackText
        ? `<div style="margin-top: 8px;">
             <div style="font-size: 11px; font-weight: 600; color: ${THEME.muted}; margin-bottom: 4px;">${escapeHtml(view.stageFeedbackLabel)}</div>
             <div style="padding: 8px 10px; background: #f7f8fa; border-radius: 8px; border-left: 3px solid ${gradeColor}; font-size: 11px; color: ${THEME.ink}; line-height: 1.5;">${escapeHtml(feedbackText)}</div>
           </div>`
        : "";
      items += `
        <div style="margin-bottom: 14px; padding: 12px 14px; border: 1px solid ${THEME.line}; border-radius: 10px; background: #fff;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 10px;">
            <span style="font-size: 12px; font-weight: 600; color: ${THEME.ink};">
              <span style="color: ${stagePalette.accent}; font-weight: 800;">${escapeHtml(row.display_code)}</span>
              · ${escapeHtml(info.detailLabel)}
            </span>
            <span style="display: flex; gap: 8px; align-items: center; font-size: 12px; color: ${THEME.muted};">
              ${gradeBadge(gradeLabel, gradeKo)}
              <span style="font-weight: 700; color: ${THEME.ink};">${escapeHtml(view.formatScorePoints(Math.round(score_100)))}</span>
            </span>
          </div>
          ${progressBar(stepCount > 0 ? score_100 : 0, gradeColor)}
          ${feedbackHtml}
        </div>`;
    });
    stageGraphs += `
      <div style="margin-bottom: 18px; border: 1.5px solid ${stagePalette.border}; border-radius: 14px; overflow: hidden;">
        <div style="background: ${stagePalette.bg}; color: ${stagePalette.text}; border-bottom: 1px solid ${stagePalette.border}; padding: 10px 14px; font-size: 13px; font-weight: 800; letter-spacing: 0.5px;">${escapeHtml(stageLabel)}</div>
        <div style="padding: 14px; background: #fbfcfe;">${items}</div>
      </div>`;
  });

  const htmlPage3 = pageShell(
    `
    <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid ${THEME.navy}; padding-bottom: 12px; margin-bottom: 6px;">
      <div>
        <div style="font-size: 12px; color: ${THEME.muted};">${escapeHtml(view.researchTitle)}</div>
        <div style="font-size: 22px; font-weight: 800; color: ${THEME.navyDeep}; margin-top: 4px;">${escapeHtml(view.studentName || name)}</div>
        <div style="font-size: 15px; font-weight: 800; color: ${THEME.navy}; margin-top: 12px;">${escapeHtml(view.stageSummaryTitle)}</div>
      </div>
      <div style="width: 40px; height: 4px; background: ${THEME.accent}; border-radius: 3px;"></div>
    </div>
    ${stageGraphs}
    `,
    logos,
    view.researchTitle,
  );

  const pdf = new jsPDF("p", "mm", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2;

  const canvas1 = await captureToCanvas(htmlPage1);
  addCanvasToPdf(pdf, canvas1, margin, contentW, contentH);

  pdf.addPage();
  const canvas2 = await captureToCanvas(htmlPage2);
  addCanvasToPdf(pdf, canvas2, margin, contentW, contentH);

  pdf.addPage();
  const canvas3 = await captureToCanvas(htmlPage3);
  addCanvasToPdf(pdf, canvas3, margin, contentW, contentH);

  const safeName = name.replace(/[/\\:*?"<>|\n\r]+/g, "_").trim();
  pdf.save(`진단리포트_${safeName}_${dateStr}.pdf`);
}
