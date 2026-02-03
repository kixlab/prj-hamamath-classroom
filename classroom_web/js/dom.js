const form = document.getElementById("cotForm");
const submitBtn = document.getElementById("submitBtn");
const loading = document.getElementById("loading");
const error = document.getElementById("error");
const resultSection = document.getElementById("resultSection");
const problemInfo = document.getElementById("problemInfo");
const stepsContainer = document.getElementById("stepsContainer");
// 모달 관련 변수는 main.js에서 선언됨
const comparisonView = document.getElementById("comparisonView");
const singleView = document.getElementById("singleView");
const cotStepsContainer = document.getElementById("cotStepsContainer");
const subQuestionsContainer = document.getElementById("subQuestionsContainer");
const toggleFormBtn = document.getElementById("toggleFormBtn");
const formSection = document.getElementById("formSection");
const generateGuidelineBtn = document.getElementById("generateGuidelineBtn");
const regenerateGuidelineBtn = document.getElementById("regenerateGuidelineBtn");
const guidelineView = document.getElementById("guidelineView");
const guidelineCotStepsContainer = document.getElementById("guidelineCotStepsContainer");
const guidelineSubQuestionsContainer = document.getElementById("guidelineSubQuestionsContainer");

// 햄버거 메뉴, 토글 버튼 등은 각 컴포넌트 파일에서 선언됨

const problemSelect = document.getElementById("problemSelect");
const exportWordBtn = document.getElementById("exportWordBtn");

// clearAllResults / 수동 저장 버튼 이벤트는 events.js에서 처리됨

// 저장된 결과 CSV 다운로드
const exportSavedResultsCsvBtn = document.getElementById("exportSavedResultsCsvBtn");
if (exportSavedResultsCsvBtn) {
  exportSavedResultsCsvBtn.addEventListener("click", () => {
    const savedResults = getSavedResults();
    const problemIds = Object.keys(savedResults);

    if (problemIds.length === 0) {
      alert("다운로드할 저장된 결과가 없습니다.");
      return;
    }

    // CSV 생성
    const escapeCsv = (str) => {
      if (!str) return "";
      const s = String(str);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    // 헤더 생성: 기본 필드 + 단계별 CoT (8단계) + 단계별 하위문항 (8개)
    const baseHeaders = ["problem_id", "grade", "main_problem", "main_answer", "main_solution", "subject_area"];
    const cotHeaders = [];
    const subQHeaders = [];

    // sub_question_id 형식 확인 (첫 번째 결과에서)
    let subQIdFormats = [];
    const firstResult = savedResults[problemIds[0]];
    if (firstResult && firstResult.guidelineData && firstResult.guidelineData.guide_sub_questions) {
      subQIdFormats = firstResult.guidelineData.guide_sub_questions.map((subQ) => {
        if (subQ && subQ.sub_question_id) {
          return subQ.sub_question_id.replace(/-/g, "_");
        }
        return null;
      });
    }

    // 기본값 설정
    const defaultFormats = ["1_1", "1_2", "2_1", "2_2", "3_1", "3_2", "4_1", "4_2"];
    for (let i = 0; i < 8; i++) {
      if (!subQIdFormats[i]) {
        subQIdFormats[i] = defaultFormats[i];
      }
    }

    for (let i = 1; i <= 8; i++) {
      cotHeaders.push(`cot_step_${i}_name`, `cot_step_${i}_prompt`);
      const subQIdFormat = subQIdFormats[i - 1];
      subQHeaders.push(
        `${subQIdFormat}_guide_sub_question`,
        `${subQIdFormat}_guide_sub_answer`,
        `${subQIdFormat}_verification_result`,
        `${subQIdFormat}_re_sub_question`,
        `${subQIdFormat}_re_sub_answer`,
        `${subQIdFormat}_re_verification_result`
      );
    }

    const headers = [...baseHeaders, ...cotHeaders, ...subQHeaders];

    const csvRows = [
      headers.join(","),
      ...problemIds.map((problemId) => {
        const result = savedResults[problemId];
        const cotData = result.cotData || {};
        const guidelineData = result.guidelineData || {};

        // 문제 정보 추출
        const mainProblem = cotData.problem || "";
        const mainAnswer = cotData.answer || "";
        const grade = cotData.grade || "";
        // main_solution은 원본 요청 데이터에 있지만 CoT 응답에는 없음
        // guidelineData에도 없으므로 빈 값으로 처리
        const mainSolution = cotData.main_solution || guidelineData.main_solution || "";
        // subject_area는 guidelineData에 있음
        const subjectArea = guidelineData.subject_area || cotData.subject_area || "";

        const row = [escapeCsv(problemId), escapeCsv(grade), escapeCsv(mainProblem), escapeCsv(mainAnswer), escapeCsv(mainSolution), escapeCsv(subjectArea)];

        // CoT 단계별 정보 추가 (8단계)
        if (cotData.steps) {
          for (let i = 0; i < 8; i++) {
            if (cotData.steps[i]) {
              const step = cotData.steps[i];
              row.push(escapeCsv(step.step_name || ""));
              row.push(escapeCsv(step.step_content || ""));
            } else {
              row.push("", "");
            }
          }
        } else {
          for (let i = 0; i < 8; i++) {
            row.push("", "");
          }
        }

        // 하위 문항별 정보 추가 (8개)
        if (guidelineData.guide_sub_questions) {
          for (let i = 0; i < 8; i++) {
            if (guidelineData.guide_sub_questions[i]) {
              const subQ = guidelineData.guide_sub_questions[i];
              row.push(escapeCsv(subQ.guide_sub_question || subQ.cot_sub_question || ""));
              row.push(escapeCsv(subQ.guide_sub_answer || subQ.sub_answer || ""));
              row.push(escapeCsv(subQ.verification_result || ""));
              row.push(escapeCsv(subQ.re_sub_question || ""));
              row.push(escapeCsv(subQ.re_sub_answer || ""));
              row.push(escapeCsv(subQ.re_verification_result || ""));
            } else {
              row.push("", "", "", "", "", "");
            }
          }
        } else {
          for (let i = 0; i < 8; i++) {
            row.push("", "", "", "", "", "");
          }
        }

        return row.join(",");
      }),
    ];

    const csvContent = csvRows.join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const filename = `saved_results_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// 현재 결과 수동 저장 버튼
const saveCurrentResultBtn = document.getElementById("saveCurrentResultBtn");
if (saveCurrentResultBtn && window.saveCurrentResult) {
  saveCurrentResultBtn.addEventListener("click", () => {
    window.saveCurrentResult();
  });
}

// 페이지 로드 시 저장된 결과 목록 표시
// DOM이 완전히 로드된 후 실행되도록 보장
(function initSavedResultsList() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      // 약간의 지연을 두어 DOM이 완전히 렌더링된 후 실행
      setTimeout(() => {
        updateSavedResultsList();
      }, 100);
    });
  } else {
    // DOM이 이미 로드된 경우 약간의 지연 후 실행
    setTimeout(() => {
      updateSavedResultsList();
    }, 100);
  }
})();

// 페이지 로드 시 마지막으로 작업한 문제 자동 복원
(async () => {
  try {
    if (typeof LAST_PROBLEM_KEY !== "undefined") {
      const lastProblemId = localStorage.getItem(LAST_PROBLEM_KEY);
      if (lastProblemId) {
        await loadResult(lastProblemId);
      }
    }
  } catch (e) {
    console.error("마지막 작업 문제 복원 중 오류:", e);
  }
})();

// 이미지 업로드 및 문제 선택 관련은 form.js에서 처리됨

// 페이지 로드 시 문제 목록 로드
loadProblemList();