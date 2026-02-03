function saveResult(problemId, cotData, subQData, guidelineData) {
  const savedResults = getSavedResults();
  const resultData = {
    problemId: problemId,
    timestamp: new Date().toISOString(),
    cotData: cotData,
    subQData: subQData,
    guidelineData: guidelineData,
  };
  savedResults[problemId] = resultData;
  currentProblemId = problemId;

  // 저장 개수 제한: 오래된 결과부터 삭제
  const resultKeys = Object.keys(savedResults);
  if (resultKeys.length > MAX_SAVED_RESULTS) {
    // 타임스탬프 기준으로 정렬하여 오래된 것부터 삭제
    const sortedKeys = resultKeys.sort((a, b) => {
      const timeA = new Date(savedResults[a].timestamp || 0).getTime();
      const timeB = new Date(savedResults[b].timestamp || 0).getTime();
      return timeA - timeB;
    });

    // 최신 MAX_SAVED_RESULTS개만 유지
    const keysToKeep = sortedKeys.slice(-MAX_SAVED_RESULTS);
    const newSavedResults = {};
    keysToKeep.forEach((key) => {
      newSavedResults[key] = savedResults[key];
    });
    Object.assign(savedResults, newSavedResults);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedResults));
    // 마지막으로 작업한 문제 ID도 함께 저장
    if (typeof LAST_PROBLEM_KEY !== "undefined") {
      localStorage.setItem(LAST_PROBLEM_KEY, problemId);
    }
    updateSavedResultsList();
  } catch (e) {
    if (e.name === "QuotaExceededError" || e.code === 22) {
      // localStorage 용량 초과 시 오래된 결과를 더 많이 삭제하고 재시도
      console.warn("localStorage 용량 초과. 오래된 결과를 삭제합니다.");
      const resultKeys = Object.keys(savedResults);
      const sortedKeys = resultKeys.sort((a, b) => {
        const timeA = new Date(savedResults[a].timestamp || 0).getTime();
        const timeB = new Date(savedResults[b].timestamp || 0).getTime();
        return timeA - timeB;
      });

      // 절반만 유지하고 재시도
      const keysToKeep = sortedKeys.slice(-Math.floor(MAX_SAVED_RESULTS / 2));
      const newSavedResults = {};
      keysToKeep.forEach((key) => {
        newSavedResults[key] = savedResults[key];
      });

      // 현재 결과는 반드시 포함
      newSavedResults[problemId] = resultData;

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSavedResults));
        if (typeof LAST_PROBLEM_KEY !== "undefined") {
          localStorage.setItem(LAST_PROBLEM_KEY, problemId);
        }
        updateSavedResultsList();
        alert(`저장 공간이 부족하여 오래된 결과 ${resultKeys.length - keysToKeep.length}개가 삭제되었습니다.`);
      } catch (e2) {
        console.error("localStorage 저장 실패:", e2);
        alert("저장 공간이 부족하여 결과를 저장할 수 없습니다. 오래된 결과를 삭제해주세요.");
      }
    } else {
      console.error("localStorage 저장 실패:", e);
      alert("결과 저장 중 오류가 발생했습니다.");
    }
  }

  // 서버에도 비동기로 저장 (로컬 저장과 별개로 동작)
  try {
    fetch("/api/v1/history/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resultData),
    }).catch((err) => {
      console.error("서버 저장 실패:", err);
    });
  } catch (err) {
    console.error("서버 저장 요청 중 오류:", err);
  }
}

function getSavedResults() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (e) {
    console.error("저장된 결과 불러오기 실패:", e);
    return {};
  }
}

async function loadResult(problemId) {
  // 먼저 localStorage에서 확인
  const savedResults = getSavedResults();
  let result = savedResults[problemId];
  
  // localStorage에 없으면 서버에서 불러오기
  if (!result) {
    try {
      const response = await fetch(`/api/v1/history/${encodeURIComponent(problemId)}`);
      if (response.ok) {
        result = await response.json();
        // 서버에서 불러온 결과를 localStorage에도 저장
        savedResults[problemId] = result;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedResults));
        if (typeof LAST_PROBLEM_KEY !== "undefined") {
          localStorage.setItem(LAST_PROBLEM_KEY, problemId);
        }
      } else if (response.status === 404) {
        console.warn(`문제 ID '${problemId}'에 대한 저장된 결과를 찾을 수 없습니다.`);
        return false;
      } else {
        console.error(`서버에서 결과를 불러오는 중 오류 발생: ${response.status}`);
        return false;
      }
    } catch (err) {
      console.error("서버에서 결과를 불러오는 중 오류:", err);
      return false;
    }
  }

  if (!result) return false;

  currentProblemId = problemId;
  currentCotData = result.cotData;
  currentSubQData = result.subQData;
  currentGuidelineData = result.guidelineData;

  // 입력 필드에도 문제 정보 복원 (CoT 데이터가 있는 경우)
  if (result.cotData) {
    const problemInput = document.getElementById("problem");
    const answerInput = document.getElementById("answer");
    const solutionInput = document.getElementById("solution");
    const gradeInput = document.getElementById("grade");
    const problemSelect = document.getElementById("problemSelect");

    if (problemInput) problemInput.value = result.cotData.problem || "";
    if (answerInput) answerInput.value = result.cotData.answer || "";
    if (solutionInput) solutionInput.value = result.cotData.solution || "";
    if (gradeInput) gradeInput.value = result.cotData.grade || "3";
    
    // problemSelect도 설정 (문제 ID가 선택 가능한 경우)
    if (problemSelect && problemId && !problemId.startsWith("manual_")) {
      // 문제 ID를 파일명 형식으로 변환하여 선택
      const filename = problemId.endsWith(".json") ? problemId : `${problemId}.json`;
      const option = Array.from(problemSelect.options).find(opt => opt.value === filename);
      if (option) {
        problemSelect.value = filename;
      } else {
        problemSelect.value = "";
      }
    }
  }

  // 결과 섹션을 명시적으로 표시
  const resultSection = document.getElementById("resultSection");
  if (resultSection) {
    resultSection.style.display = "block";
    resultSection.classList.add("show");
  }

  // 결과 표시
  if (result.guidelineData && result.cotData) {
    // Guideline 데이터가 있으면:
    // 1. 먼저 CoT 데이터를 2단계에 표시
    if (typeof displayResult === "function") {
      displayResult(result.cotData);
    } else if (typeof window.displayResult === "function") {
      window.displayResult(result.cotData);
    }
    // 2. 그 다음 Guideline 뷰를 3단계에 표시
    if (typeof displayGuidelineComparison === "function") {
      displayGuidelineComparison(result.cotData, result.guidelineData);
    } else if (typeof window.displayGuidelineComparison === "function") {
      window.displayGuidelineComparison(result.cotData, result.guidelineData);
    }
  } else if (result.subQData && result.cotData) {
    // 하위 문항 데이터가 있으면 비교 뷰 표시 (2단계)
    if (typeof displayComparison === "function") {
      displayComparison(result.cotData, result.subQData);
    } else if (typeof window.displayComparison === "function") {
      window.displayComparison(result.cotData, result.subQData);
    }
  } else if (result.cotData) {
    // CoT 데이터만 있으면 단일 뷰 표시 (2단계)
    if (typeof displayResult === "function") {
      displayResult(result.cotData);
    } else if (typeof window.displayResult === "function") {
      window.displayResult(result.cotData);
    }
  }

  return true;
}

async function deleteResult(problemId) {
  // localStorage에서 삭제
  const savedResults = getSavedResults();
  delete savedResults[problemId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedResults));

  // 서버에서도 삭제
  try {
    const response = await fetch(`/api/v1/history/${encodeURIComponent(problemId)}`, {
      method: "DELETE",
    });
    if (!response.ok && response.status !== 404) {
      // 404는 이미 삭제된 것이므로 무시, 다른 오류만 로그
      console.error(`서버에서 결과를 삭제하는 중 오류 발생: ${response.status}`);
    }
  } catch (err) {
    console.error("서버에서 결과를 삭제하는 중 오류:", err);
    // 서버 삭제 실패해도 localStorage 삭제는 완료되었으므로 계속 진행
  }

  // 마지막 문제 ID가 삭제된 경우, 다른 최근 문제로 갱신하거나 제거
  if (typeof LAST_PROBLEM_KEY !== "undefined") {
    const lastId = localStorage.getItem(LAST_PROBLEM_KEY);
    if (lastId === problemId) {
      const remainingIds = Object.keys(savedResults).sort((a, b) => {
        return new Date(savedResults[b].timestamp || 0) - new Date(savedResults[a].timestamp || 0);
      });
      if (remainingIds.length > 0) {
        localStorage.setItem(LAST_PROBLEM_KEY, remainingIds[0]);
      } else {
        localStorage.removeItem(LAST_PROBLEM_KEY);
      }
    }
  }

  updateSavedResultsList();
}

function clearAllResults() {
  if (confirm("모든 저장된 결과를 삭제하시겠습니까?")) {
    localStorage.removeItem(STORAGE_KEY);
    if (typeof LAST_PROBLEM_KEY !== "undefined") {
      localStorage.removeItem(LAST_PROBLEM_KEY);
    }
    updateSavedResultsList();
    alert("모든 결과가 삭제되었습니다.");
  }
}

async function updateSavedResultsList() {
  const listContainer = document.getElementById("savedResultsList");
  if (!listContainer) return;

  // localStorage에서 저장된 결과 가져오기
  const savedResults = getSavedResults();
  const localProblemIds = Object.keys(savedResults).sort((a, b) => {
    return new Date(savedResults[b].timestamp || 0) - new Date(savedResults[a].timestamp || 0);
  });

  // 서버 목록도 가져오기 (병합용)
  let serverResults = [];
  try {
    const resp = await fetch("/api/v1/history/list");
    if (resp.ok) {
      const serverData = await resp.json();
      if (Array.isArray(serverData)) {
        serverResults = serverData;
      }
    }
  } catch (err) {
    console.warn("서버 저장 목록 불러오기 실패 (무시하고 localStorage 사용):", err);
  }

  // localStorage와 서버 결과를 병합 (중복 제거, localStorage 우선)
  const allResults = [];
  const seenIds = new Set();

  // localStorage 결과 먼저 추가
  for (const problemId of localProblemIds) {
    if (!seenIds.has(problemId)) {
      const result = savedResults[problemId];
      const date = new Date(result.timestamp || 0);
      const dateStr = date.toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const hasCot = !!result.cotData;
      const hasSubQ = !!result.subQData;
      const hasGuideline = !!result.guidelineData;
      const status = [];
      if (hasCot) status.push("CoT");
      if (hasSubQ) status.push("하위문항");
      if (hasGuideline) status.push("Guideline");

      allResults.push({
        problemId: problemId,
        timestamp: result.timestamp || date.toISOString(),
        dateStr: dateStr,
        status: status,
        source: "local",
      });
      seenIds.add(problemId);
    }
  }

  // 서버 결과 추가 (localStorage에 없는 것만)
  for (const item of serverResults) {
    if (!seenIds.has(item.problem_id)) {
      const date = new Date(item.timestamp);
      const dateStr = date.toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const status = [];
      if (item.has_cot) status.push("CoT");
      if (item.has_subq) status.push("하위문항");
      if (item.has_guideline) status.push("Guideline");

      allResults.push({
        problemId: item.problem_id,
        timestamp: item.timestamp,
        dateStr: dateStr,
        status: status,
        source: "server",
      });
      seenIds.add(item.problem_id);
    }
  }

  // 타임스탬프 기준으로 정렬 (최신순)
  allResults.sort((a, b) => {
    return new Date(b.timestamp) - new Date(a.timestamp);
  });

  if (allResults.length === 0) {
    listContainer.innerHTML =
      '<div style="color: #6c757d; font-size: 0.9em; text-align: center; padding: 20px">저장된 결과가 없습니다.</div>';
    return;
  }

  // 최대 표시 개수 및 스크롤 설정
  const maxVisibleItems = 10;
  const itemHeight = 50;
  const maxHeight = allResults.length > maxVisibleItems ? itemHeight * maxVisibleItems : "none";
  listContainer.style.maxHeight = maxHeight === "none" ? "none" : `${maxHeight}px`;
  listContainer.style.overflowY = allResults.length > maxVisibleItems ? "auto" : "visible";

  listContainer.innerHTML = allResults
    .map((item) => {
      return `
        <div class="saved-result-item" onclick="loadSavedResult('${item.problemId}')">
          <div class="saved-result-item-info">
            <div class="saved-result-item-title">${escapeHtml(item.problemId)}</div>
            <div class="saved-result-item-meta">${item.dateStr} | ${item.status.join(", ")}</div>
          </div>
          <div class="saved-result-item-actions">
            <button onclick="event.stopPropagation(); deleteSavedResult('${item.problemId}')" 
                    style="background: #dc3545; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; white-space: nowrap">
              삭제
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

// 현재 화면의 CoT/하위문항/Guideline 상태를 수동으로 저장하는 헬퍼
function saveCurrentResult() {
  if (!currentCotData) {
    alert("저장할 결과가 없습니다. 먼저 문제를 풀어주세요.");
    return;
  }

  // problemSelect 선택값 또는 기존 currentProblemId를 사용
  const selectEl = typeof problemSelect !== "undefined" ? problemSelect : document.getElementById("problemSelect");
  const selectedId = selectEl && selectEl.value ? selectEl.value.replace(".json", "") : null;
  const problemId = currentProblemId || selectedId || `manual_${Date.now()}`;

  saveResult(problemId, currentCotData, currentSubQData, currentGuidelineData);
  alert("현재 결과를 저장했습니다.");
}

window.saveCurrentResult = saveCurrentResult;

// 전역 함수로 등록
window.loadSavedResult = async function (problemId) {
  await loadResult(problemId);
};

window.deleteSavedResult = async function (problemId) {
  if (confirm(`"${problemId}" 결과를 삭제하시겠습니까?`)) {
    await deleteResult(problemId);
  }
};

// 초기화 버튼 이벤트