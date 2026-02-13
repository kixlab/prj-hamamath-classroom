import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { escapeHtml } from "./formatting";

const STEP_GROUP_LABELS: Record<string, string> = {
  "1": "문제 이해",
  "2": "정보 구조화",
  "3": "수학적 표현",
  "4": "수학적 계산",
};
const STEP_DETAIL_LABELS: Record<string, string> = {
  "1-1": "핵심 정보 파악하기",
  "1-2": "문제 요지 확인하기",
  "2-1": "조건 정리하기",
  "2-2": "조건 연결하기",
  "3-1": "지식 활용하기",
  "3-2": "식, 모델 세우기",
  "4-1": "계산 실행하기",
  "4-2": "결과 정리하기",
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

function getStepGroupInfo(displayCode: string) {
  const [group] = displayCode.split("-");
  const stageLabel = STEP_GROUP_LABELS[group] || `${group}단계`;
  const detailLabel = STEP_DETAIL_LABELS[displayCode] || stageLabel;
  return { group, stageLabel, detailLabel };
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

const baseStyles = {
  position: "fixed" as const,
  left: "-9999px",
  top: "0",
  width: "210mm",
  maxWidth: "794px",
  padding: "24px",
  backgroundColor: "#fff",
  color: "#000",
  fontFamily: "Malgun Gothic, Apple SD Gothic Neo, AppleGothic, sans-serif",
  fontSize: "14px",
  lineHeight: "1.5",
};

async function captureToCanvas(html: string): Promise<HTMLCanvasElement> {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, baseStyles);
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  try {
    const canvas = await html2canvas(wrap, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });
    return canvas;
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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    ctx.drawImage(canvas, 0, p * sliceHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
    const imgData = offscreen.toDataURL("image/jpeg", 0.92);
    const drawH = (sliceHeight * contentW) / canvas.width;
    pdf.addImage(imgData, "JPEG", margin, margin, contentW, drawH);
  }
}

/**
 * 진단 리포트를 PDF로 다운로드
 * 1페이지: 문제별 수준 요약 + 문제별 그래프
 * 2페이지: 단계별 최종 수준 테이블
 * 3페이지: 단계별 그래프
 */
export async function exportDiagnosisReportPdf(
  reportData: DiagnosisReportData,
  studentName: string,
  _studentId: string,
  studentProblemSummaries: Record<string, ProblemStepSummaryForPdf>
): Promise<void> {
  const problemIds = Object.keys(studentProblemSummaries);
  const sorted = [...reportData.step_rows].sort((a, b) =>
    a.display_code.localeCompare(b.display_code, undefined, { numeric: true })
  );
  const byGroup: Record<string, typeof sorted> = {};
  sorted.forEach((row) => {
    const g = getStepGroupInfo(row.display_code).group;
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(row);
  });

  // ---------- 1페이지: 문제별 수준 요약 + 문제별 그래프 ----------
  let htmlPage1 = `
    <div style="margin-bottom: 20px; font-size: 18px; font-weight: bold;">학생 진단 리포트</div>
    <div style="margin-bottom: 16px; color: #333;">${escapeHtml(studentName || "학생")} · 진단한 문제 수 ${reportData.problem_rows.length}개</div>
    <h4 style="margin: 16px 0 8px; font-size: 14px;">문제별 수준 요약</h4>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px;">
      <thead>
        <tr style="background: #f0f0f0;">
          <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">문제 ID</th>
          <th style="border: 1px solid #ccc; padding: 8px;">진단한 단계 수</th>
          <th style="border: 1px solid #ccc; padding: 8px;">상</th>
          <th style="border: 1px solid #ccc; padding: 8px;">중</th>
          <th style="border: 1px solid #ccc; padding: 8px;">하</th>
          <th style="border: 1px solid #ccc; padding: 8px;">평균 등급</th>
        </tr>
      </thead>
      <tbody>
  `;
  reportData.problem_rows.forEach((row) => {
    const total = row.high_count + row.mid_count + row.low_count || 0;
    const sum = total > 0 ? row.high_count * 2 + row.mid_count * 1 + row.low_count * 0 : 0;
    const score_100 = total > 0 ? (sum / (total * 2)) * 100 : 0;
    const grade = total > 0 ? scoreToGradeFrom100(score_100) : "-";
    htmlPage1 += `
        <tr>
          <td style="border: 1px solid #ccc; padding: 6px 8px;">${escapeHtml(row.problem_id)}</td>
          <td style="border: 1px solid #ccc; padding: 6px 8px; text-align: center;">${row.step_count}</td>
          <td style="border: 1px solid #ccc; padding: 6px 8px; text-align: center;">${row.high_count}</td>
          <td style="border: 1px solid #ccc; padding: 6px 8px; text-align: center;">${row.mid_count}</td>
          <td style="border: 1px solid #ccc; padding: 6px 8px; text-align: center;">${row.low_count}</td>
          <td style="border: 1px solid #ccc; padding: 6px 8px;">${grade}</td>
        </tr>
    `;
  });
  htmlPage1 += `
      </tbody>
    </table>
    <div style="font-size: 13px; font-weight: 600; margin-bottom: 10px;">문제별 그래프</div>
  `;
  reportData.problem_rows.forEach((row) => {
    const total = row.high_count + row.mid_count + row.low_count || 0;
    const sum = total > 0 ? row.high_count * 2 + row.mid_count * 1 + row.low_count * 0 : 0;
    const score_100 = total > 0 ? (sum / (total * 2)) * 100 : 0;
    const grade = total > 0 ? scoreToGradeFrom100(score_100) : "-";
    htmlPage1 += `
      <div style="margin-bottom: 14px; padding: 10px; border: 1px solid #e5e7eb; border-radius: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-weight: 600; font-size: 12px;">${escapeHtml(row.problem_id)}</span>
          <span style="display: flex; gap: 8px; font-size: 12px;">
            <span style="background: #2563eb; color: #fff; padding: 2px 8px; border-radius: 4px;">${grade}</span>
            <span>${Math.round(score_100)}점</span>
          </span>
        </div>
        <div style="width: 100%; height: 10px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
          <div style="width: ${score_100}%; height: 100%; background: #2563eb; border-radius: 4px;"></div>
        </div>
        <div style="margin-top: 6px; font-size: 11px; color: #6b7280;">상 ${row.high_count} · 중 ${row.mid_count} · 하 ${row.low_count}</div>
      </div>
    `;
  });

  // ---------- 2페이지: 단계별 최종 수준 테이블만 ----------
  let htmlPage2 = `
    <h4 style="margin: 0 0 12px; font-size: 14px;">단계별 최종 수준 (진단한 문제 수: ${reportData.problem_rows.length}개)</h4>
    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
      <thead>
        <tr style="background: #f0f0f0;">
          <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">문제 풀이 단계</th>
          <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">세부 역량</th>
          <th style="border: 1px solid #ccc; padding: 8px;">점수(100)</th>
          <th style="border: 1px solid #ccc; padding: 8px;">최종 등급</th>
        </tr>
      </thead>
      <tbody>
  `;
  ["1", "2", "3", "4"].forEach((g) => {
    const rows = byGroup[g] || [];
    rows.forEach((row, idx) => {
      const info = getStepGroupInfo(row.display_code);
      let sum = 0,
        stepCount = 0;
      problemIds.forEach((pid) => {
        const level = studentProblemSummaries[pid]?.levelsByDisplayCode?.[row.display_code];
        if (level === "상" || level === "중" || level === "하") {
          sum += LEVEL_SCORE[level];
          stepCount += 1;
        }
      });
      const score_100 = stepCount > 0 ? (sum / (stepCount * 2)) * 100 : 0;
      const grade = stepCount > 0 ? scoreToGradeFrom100(score_100) : "-";
      const stageLabel = idx === 0 ? info.stageLabel : "";
      const detailText = `${row.display_code} ${info.detailLabel}`;
      htmlPage2 += `
        <tr>
          <td style="border: 1px solid #ccc; padding: 6px 8px;">${escapeHtml(stageLabel)}</td>
          <td style="border: 1px solid #ccc; padding: 6px 8px;">${escapeHtml(detailText)}</td>
          <td style="border: 1px solid #ccc; padding: 6px 8px; text-align: center;">${stepCount > 0 ? Math.round(score_100) : "-"}</td>
          <td style="border: 1px solid #ccc; padding: 6px 8px;">${grade}</td>
        </tr>
      `;
    });
  });
  htmlPage2 += `
      </tbody>
    </table>
  `;

  // ---------- 3페이지: 단계별 그래프만 ----------
  let htmlPage3 = `
    <h4 style="margin: 0 0 12px; font-size: 14px;">단계별 그래프</h4>
  `;
  const groupColors: Record<string, string> = { "1": "#2563eb", "2": "#f97316", "3": "#22c55e", "4": "#7c3aed" };
  ["1", "2", "3", "4"].forEach((g) => {
    const rows = byGroup[g] || [];
    if (rows.length === 0) return;
    const stageLabel = STEP_GROUP_LABELS[g] || `${g}단계`;
    const color = groupColors[g] || "#666";
    htmlPage3 += `
      <div style="margin-bottom: 16px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
        <div style="background: ${color}; color: #fff; padding: 8px 10px; font-size: 12px; font-weight: 700;">${stageLabel}</div>
        <div style="padding: 10px;">
    `;
    rows.forEach((row) => {
      const info = getStepGroupInfo(row.display_code);
      let sum = 0,
        stepCount = 0;
      problemIds.forEach((pid) => {
        const level = studentProblemSummaries[pid]?.levelsByDisplayCode?.[row.display_code];
        if (level === "상" || level === "중" || level === "하") {
          sum += LEVEL_SCORE[level];
          stepCount += 1;
        }
      });
      const score_100 = stepCount > 0 ? (sum / (stepCount * 2)) * 100 : 0;
      const grade = stepCount > 0 ? scoreToGradeFrom100(score_100) : "-";
      const feedbackHtml =
        row.feedback_summary && row.feedback_summary.trim()
          ? `<p style="margin: 6px 0 0; font-size: 11px; color: #4b5563; line-height: 1.4;">${escapeHtml(row.feedback_summary.trim())}</p>`
          : "";
      htmlPage3 += `
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 12px;">${row.display_code} · ${escapeHtml(info.detailLabel)}</span>
            <span style="display: flex; gap: 6px; font-size: 12px;">
              <span style="background: ${color}; color: #fff; padding: 2px 6px; border-radius: 4px;">${grade}</span>
              <span>${stepCount > 0 ? Math.round(score_100) : "-"}점</span>
            </span>
          </div>
          <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
            <div style="width: ${stepCount > 0 ? score_100 : 0}%; height: 100%; background: ${color}; border-radius: 4px;"></div>
          </div>
          ${feedbackHtml}
        </div>
      `;
    });
    htmlPage3 += `
        </div>
      </div>
    `;
  });

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

  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = (studentName || "학생").replace(/[/\\:*?"<>|\n\r]+/g, "_").trim();
  pdf.save(`진단리포트_${safeName}_${dateStr}.pdf`);
}
