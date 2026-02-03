function updateProblemInfo(cotData, subjectArea = null, problemInfoElement = null) {
  // problemInfoElement가 제공되지 않으면 기본 problemInfo 사용
  const targetProblemInfo = problemInfoElement || problemInfo;
  if (!targetProblemInfo) return;
  
  // 영역 이름 매핑
  const areaNames = {
    수와연산: "수와 연산",
    변화와관계: "변화와 관계",
    도형과측정: "도형과 측정",
    자료와가능성: "자료와 가능성",
  };

  // 수학 영역 표시: subjectArea가 있으면 표시, 없으면 "분석 전..." (CoT 단계)
  const areaDisplay = subjectArea ? `${areaNames[subjectArea] || subjectArea}` : "분석 전...";

  // 이미지 데이터 확인 (currentCotData에만 의존)
  // 문제 정보 섹션은 현재 실행 중인 문제의 이미지만 표시
  let imageData = null;
  if (currentCotData && currentCotData.image_data) {
    imageData = currentCotData.image_data;
  }
  // problemImage 요소는 사용하지 않음 (다른 문제의 이미지일 수 있음)
  const hasImage = imageData && imageData.startsWith("data:image");

  // 이미지 HTML (더 깔끔한 스타일)
  const imageHtml = hasImage
    ? `<div class="problem-image-container" style="flex-shrink: 0; margin-left: 30px; padding: 15px; background: var(--color-bg); border-radius: 8px; border: 1px solid var(--color-border);">
        <div style="font-size: 0.85em; color: var(--color-text-muted); margin-bottom: 8px; font-weight: 500;">문제 이미지</div>
        <img src="${imageData}" alt="문제 이미지" style="max-width: 350px; max-height: 350px; width: auto; height: auto; display: block; border-radius: 6px;" />
      </div>`
    : "";

  // 문제 정보 표시
  const imgDescriptionHtml =
    currentCotData && currentCotData.img_description
      ? `<div class="info-item" style="margin-top: 10px; padding: 12px; background: var(--color-bg-secondary); border-radius: 6px; border-left: 3px solid var(--color-primary);"><strong>이미지 설명:</strong> ${currentCotData.img_description}</div>`
      : "";

  targetProblemInfo.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding: 4px 0 10px 0; border-bottom: 1px solid var(--color-border);">
            <h2 style="margin: 0; color: var(--color-text); font-size: 1.25rem; font-weight: 600;">📝 문제 정보</h2>
          </div>
          <div class="info-flex-container" style="display: flex; gap: 30px; align-items: flex-start; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 300px;">
              <div style="display: grid; gap: 12px;">
                <div class="info-item" style="padding: 12px; background: var(--color-bg); border-radius: 8px; border-left: 3px solid var(--color-primary); border: 1px solid var(--color-border);">
                  <div style="font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: 4px; font-weight: 500;">문제</div>
                  <div style="color: var(--color-text); line-height: 1.6;">${cotData.problem}</div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div class="info-item" style="padding: 12px; background: var(--color-bg); border-radius: 8px; border: 1px solid var(--color-border);">
                    <div style="font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: 4px; font-weight: 500;">학년</div>
                    <div style="color: var(--color-text); font-weight: 600;">${cotData.grade}학년</div>
                  </div>
                  <div class="info-item" style="padding: 12px; background: var(--color-bg); border-radius: 8px; border: 1px solid var(--color-border);">
                    <div style="font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: 4px; font-weight: 500;">정답</div>
                    <div style="color: var(--color-text); font-weight: 600;">${cotData.answer}</div>
                  </div>
                </div>
                ${imgDescriptionHtml}
                <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start;">
                  <div 
                    id="subjectAreaCard" 
                    class="info-item" 
                    style="padding: 12px; background: white; border-radius: 8px; ${
                      cotData.considerations && cotData.considerations.length > 0 ? "cursor: pointer; transition: all 0.2s;" : ""
                    }"
                    ${
                      cotData.considerations && cotData.considerations.length > 0
                        ? "onmouseover=\"this.style.background='var(--color-bg-secondary)';\" onmouseout=\"this.style.background='var(--color-bg)';\""
                        : ""
                    }
                  >
                    <div style="font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: 4px; font-weight: 500;">
                      수학 영역
                      ${
                        cotData.considerations && cotData.considerations.length > 0
                          ? '<span style="margin-left: 6px; font-size: 0.85em; color: var(--color-primary);">(클릭하여 고려사항 보기)</span>'
                          : ""
                      }
                    </div>
                    <div style="color: var(--color-text); font-weight: 600;">${areaDisplay}</div>
                  </div>
                  ${
                    cotData.considerations && cotData.considerations.length > 0
                      ? `<button class="btn-considerations" id="btnConsiderations" style="align-self: center; padding: 12px 20px;">고려사항 보기</button>`
                      : ""
                  }
                </div>
              </div>
            </div>
            ${imageHtml}
          </div>
      `;

  // 고려사항 버튼 및 수학 영역 카드 이벤트 리스너 추가
  if (cotData.considerations && cotData.considerations.length > 0) {
    // targetProblemInfo 내부에서 요소 찾기
    const btnConsiderations = targetProblemInfo.querySelector("#btnConsiderations");
    if (btnConsiderations) {
      btnConsiderations.onclick = function () {
        showConsiderations(subjectArea || cotData.subject_area, cotData.considerations);
      };
    }

    // 수학 영역 카드 클릭 이벤트
    const subjectAreaCard = targetProblemInfo.querySelector("#subjectAreaCard");
    if (subjectAreaCard) {
      subjectAreaCard.onclick = function () {
        showConsiderations(subjectArea || cotData.subject_area, cotData.considerations);
      };
    }
  }
}

function displayResult(data) {
  // 2단계 탭에서는 문제 정보 숨김
  if (problemInfo) {
    problemInfo.style.display = "none";
  }

  // 단계별 풀이 표시
  stepsContainer.innerHTML = "";
  data.steps.forEach((step, index) => {
    const stepCard = document.createElement("div");
    stepCard.className = "step-card";
    stepCard.id = `cot-step-${step.sub_skill_id}`;
    stepCard.innerHTML = `
              <div class="step-header">
                  <div class="step-number">${index + 1}</div>
                  <div class="step-title">
                      <h3>${step.step_name}</h3>
                      <div class="sub-skill">${step.sub_skill_name} (${step.sub_skill_id})</div>
                  </div>
              </div>
              <div class="step-content">${step.step_content}</div>
          `;
    stepsContainer.appendChild(stepCard);
  });

  resultSection.classList.add("show");
  comparisonView.style.display = "none";
  guidelineView.style.display = "none";
  singleView.style.display = "block";
  generateGuidelineBtn.style.display = "block";
  if (regenerateGuidelineBtn) {
    regenerateGuidelineBtn.style.display =
      currentGuidelineData && currentGuidelineData.guide_sub_questions && currentGuidelineData.guide_sub_questions.length === 8
        ? "block"
        : "none";
  }
  exportWordBtn.style.display = "none"; // Guideline 데이터가 있을 때만 표시

  // 입력 영역은 숨기지 않고 유지 (사용자가 직접 숨길 수 있도록 토글 버튼만 표시)
  // formSection.classList.add("hidden");
  toggleFormBtn.style.display = "block";

  // 탭 전환: 2단계로 이동
  if (window.updateWorkflowProgress) {
    window.updateWorkflowProgress(2);
  }

  // MathJax로 LaTeX 수식 렌더링
  if (window.MathJax) {
    MathJax.typesetPromise([stepsContainer]).catch((err) => {
      console.error("MathJax 렌더링 오류:", err);
    });
  }
}

function displayComparison(cotData, subQData) {
  // 비교 뷰로 전환
  singleView.style.display = "none";
  comparisonView.style.display = "block";

  // 1단계: CoT 풀이 과정 표시
  cotStepsContainer.innerHTML = "";
  cotData.steps.forEach((step, index) => {
    const stepCard = document.createElement("div");
    stepCard.className = "step-card";
    stepCard.id = `comparison-cot-step-${step.sub_skill_id}`;
    stepCard.innerHTML = `
              <div class="step-header">
                  <div class="step-number">${index + 1}</div>
                  <div class="step-title">
                      <h3>${step.step_name}</h3>
                      <div class="sub-skill">${step.sub_skill_name} (${step.sub_skill_id})</div>
                  </div>
              </div>
              <div class="step-content">${step.step_content}</div>
          `;
    cotStepsContainer.appendChild(stepCard);
  });

  // 2단계: 하위 문항 표시
  updateSubQuestions(subQData);

  // 비교 뷰로 스크롤 (너무 아래로 내려가지 않도록)
  comparisonView.scrollIntoView({ behavior: "smooth", block: "start" });

  // 스크롤 위치를 약간 조정 (상단 여백 확보)
  setTimeout(() => {
    window.scrollBy(0, -20);
  }, 500);

  // MathJax로 LaTeX 수식 렌더링
  if (window.MathJax) {
    MathJax.typesetPromise([cotStepsContainer, subQuestionsContainer]).catch((err) => {
      console.error("MathJax 렌더링 오류:", err);
    });
  }
}

function updateSubQuestions(subQData) {
  // 하위 문항 부분만 업데이트
  subQuestionsContainer.innerHTML = "";
  subQData.sub_questions.forEach((subQ) => {
    const subQCard = document.createElement("div");
    subQCard.className = "sub-question-card";
    subQCard.id = `sub-question-${subQ.sub_question_id}`;
    subQCard.innerHTML = `
              <div class="sub-question-header">
                  <span class="sub-question-id">${subQ.sub_question_id}</span>
                  <span class="sub-question-title">${subQ.step_name} - ${subQ.sub_skill_name}</span>
              </div>
              <div class="sub-question-content">
                  <strong>문제:</strong><br>
                  ${formatQuestion(subQ.cot_sub_question)}
              </div>
              ${
                subQ.sub_answer || subQ.cot_sub_answer
                  ? `<div class="sub-question-answer"><strong>정답:</strong> ${formatAnswer(subQ.sub_answer || subQ.cot_sub_answer)}</div>`
                  : ""
              }
              ${formatVerificationResult(subQ.verification_result)}
          `;
    subQuestionsContainer.appendChild(subQCard);
  });

  // MathJax로 LaTeX 수식 렌더링 (하위 문항만)
  if (window.MathJax) {
    MathJax.typesetPromise([subQuestionsContainer]).catch((err) => {
      console.error("MathJax 렌더링 오류:", err);
    });
  }
}

function displayGuidelineComparison(cotData, guidelineData) {
  // 3단계 패널의 요소들 가져오기
  const resultSectionStep3 = document.getElementById("resultSectionStep3");
  const problemInfoStep3 = document.getElementById("problemInfoStep3");
  
  // Guideline 비교 뷰로 전환 (3단계 탭만 관리)
  if (resultSectionStep3) {
    resultSectionStep3.style.display = "block";
    resultSectionStep3.classList.add("show");
  }
  // 2단계 탭의 내용은 그대로 유지 (각 탭은 독립적)
  guidelineView.style.display = "block";
  generateGuidelineBtn.style.display = "none";
  if (regenerateGuidelineBtn) {
    regenerateGuidelineBtn.style.display = "block"; // Guideline 데이터가 있으므로 재생성 버튼 표시
  }
  exportWordBtn.style.display = "inline-block"; // Guideline 데이터가 있으므로 워드 다운로드 버튼 표시

  // 탭 전환: 3단계로 이동 (guideline 데이터가 있을 때만)
  if (window.updateWorkflowProgress && guidelineData && guidelineData.guide_sub_questions) {
    window.updateWorkflowProgress(3);
  }

  // 3단계 탭에서는 문제 정보 숨김
  if (problemInfoStep3) {
    problemInfoStep3.style.display = "none";
  }

  // 3단계 탭에서는 하위문항만 표시 (AI 풀이과정은 숨김)
  const guidelineContainer = document.getElementById("guidelineContainer");
  const solutionPanel = guidelineContainer?.querySelector(".solution-panel");
  const splitViewToggle = document.getElementById("toggleGuidelineSolutionBtn");
  
  if (solutionPanel) {
    solutionPanel.style.display = "none";
  }
  if (splitViewToggle) {
    splitViewToggle.style.display = "none";
  }
  if (guidelineContainer) {
    guidelineContainer.style.gridTemplateColumns = "1fr";
  }

  // Guideline 하위 문항 표시
  updateGuidelineSubQuestions(guidelineData);

  // Guideline 뷰로 스크롤
  guidelineView.scrollIntoView({ behavior: "smooth", block: "start" });

  // 스크롤 위치를 약간 조정 (상단 여백 확보)
  setTimeout(() => {
    window.scrollBy(0, -20);
  }, 500);

  // MathJax로 LaTeX 수식 렌더링 (하위문항만)
  if (window.MathJax) {
    MathJax.typesetPromise([guidelineSubQuestionsContainer]).catch((err) => {
      console.error("MathJax 렌더링 오류:", err);
    });
  }
}

function updateGuidelineSubQuestions(guidelineData) {
  // Guideline 하위 문항 부분만 업데이트
  guidelineSubQuestionsContainer.innerHTML = "";
  const subQuestions = guidelineData.guide_sub_questions || guidelineData.sub_questions || [];

  // Guideline 데이터가 있으면 워드 다운로드 버튼 표시
  if (exportWordBtn) {
    exportWordBtn.style.display = "inline-block";
  }

  subQuestions.forEach((subQ, index) => {
    // 디버깅: explanation 및 정답 확인
    if (index === 0) {
      console.log(`[updateGuidelineSubQuestions] 첫 번째 하위 문항 데이터:`, {
        sub_question_id: subQ.sub_question_id,
        explanation: subQ.explanation,
        guide_sub_answer: subQ.guide_sub_answer,
        sub_answer: subQ.sub_answer,
        has_guide_sub_answer: !!subQ.guide_sub_answer,
        has_sub_answer: !!subQ.sub_answer,
        verification_result: subQ.verification_result,
      });
    }

    const subQCard = document.createElement("div");
    subQCard.className = "sub-question-card";
    subQCard.id = `guideline-sub-question-${subQ.sub_question_id}`;

    // 재생성 문항 존재 여부 확인 (re_sub_question이 있고 비어있지 않으면)
    const hasRegenerated = !!(subQ.re_sub_question && subQ.re_sub_question.trim().length > 0);

    // 편집 필드용: 재생성 문항이 존재하면 재생성 문항을, 없으면 원본 문항을 사용
    const editQuestion = hasRegenerated ? subQ.re_sub_question || "" : subQ.guide_sub_question || "";
    const editAnswer = hasRegenerated ? subQ.re_sub_answer || null : subQ.guide_sub_answer || subQ.sub_answer || null;

    // 원본 문항/정답
    const originalQuestion = subQ.guide_sub_question || "";
    const originalAnswer = subQ.guide_sub_answer || subQ.sub_answer || "";

    subQCard.innerHTML = `
              <div class="sub-question-header">
                  <span class="guideline-sub-question-id">${subQ.sub_question_id}</span>
                  <span class="sub-question-title">${subQ.step_name} - ${subQ.sub_skill_name}</span>
              </div>
              <!-- 원본 문항 및 재생성 문항 표시 -->
              <div style="margin-top: 15px;">
                ${
                  hasRegenerated
                    ? `
                <div style="padding: 12px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6; margin-bottom: 10px;">
                  <div style="font-size: 0.85em; color: #6c757d; margin-bottom: 8px; font-weight: 500;">원본 문항</div>
                  <div style="color: #212529; line-height: 1.6; font-size: 0.9em;">${originalQuestion || "(없음)"}</div>
                  ${
                    originalAnswer
                      ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #dee2e6; color: #495057; font-size: 0.9em;"><strong>정답:</strong> ${originalAnswer}</div>`
                      : ""
                  }
                </div>
                `
                    : `
                <div style="padding: 12px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 0.85em; color: #6c757d; font-weight: 500;">원본 문항</div>
                    <button
                      type="button"
                      class="guideline-edit-toggle-btn"
                      data-subq-id="${subQ.sub_question_id}"
                      style="background: var(--color-primary); color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 0.8em; cursor: pointer;"
                    >
                      편집
                    </button>
                  </div>
                  <div class="guideline-display-mode" data-subq-id="${subQ.sub_question_id}">
                    <div style="color: #212529; line-height: 1.6; font-size: 0.9em;">${originalQuestion || "(없음)"}</div>
                    ${
                      originalAnswer
                        ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #dee2e6; color: #495057; font-size: 0.9em;"><strong>정답:</strong> ${originalAnswer}</div>`
                        : ""
                    }
                  </div>
                  <div class="guideline-edit-mode" data-subq-id="${subQ.sub_question_id}" style="display: none;">
                    <div style="margin-bottom: 10px;">
                      <label style="display: block; font-weight: 600; color: #495057; margin-bottom: 6px; font-size: 0.85em;">문제</label>
                      <textarea
                        class="guideline-edit-question"
                        data-subq-id="${subQ.sub_question_id}"
                        rows="3"
                        placeholder="문제를 입력하세요"
                        style="width: 100%; padding: 10px; border: 1px solid #ced4da; border-radius: 4px; font-size: 0.9em; resize: vertical; font-family: inherit; line-height: 1.6; background: white;"
                      >${originalQuestion || ""}</textarea>
                    </div>
                    <div>
                      <label style="display: block; font-weight: 600; color: #495057; margin-bottom: 6px; font-size: 0.85em;">정답</label>
                      <input
                        type="text"
                        class="guideline-edit-answer"
                        data-subq-id="${subQ.sub_question_id}"
                        value="${originalAnswer || ""}"
                        placeholder="정답을 입력하세요"
                        style="width: 100%; padding: 10px; border: 1px solid #ced4da; border-radius: 4px; font-size: 0.9em; font-family: inherit; background: white;"
                      />
                    </div>
                  </div>
                </div>
                `
                }
                ${
                  hasRegenerated
                    ? `
                <div style="padding: 12px; background: #dbeafe; border-radius: 6px; border: 1px solid #dbeafe;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 0.85em; color: #6c757d; font-weight: 500;">재생성 문항</div>
                    <button
                      type="button"
                      class="guideline-edit-toggle-btn"
                      data-subq-id="${subQ.sub_question_id}"
                      style="background: var(--color-primary); color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 0.8em; cursor: pointer;"
                    >
                      편집
                    </button>
                  </div>
                  <div class="guideline-display-mode" data-subq-id="${subQ.sub_question_id}">
                    <div style="color: #212529; line-height: 1.6; font-size: 0.9em;">${subQ.re_sub_question || "(없음)"}</div>
                    ${
                      subQ.re_sub_answer
                        ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #60a5fa; color: #495057; font-size: 0.9em;"><strong>정답:</strong> ${subQ.re_sub_answer}</div>`
                        : ""
                    }
                  </div>
                  <div class="guideline-edit-mode" data-subq-id="${subQ.sub_question_id}" style="display: none;">
                    <div style="margin-bottom: 10px;">
                      <label style="display: block; font-weight: 600; color: #495057; margin-bottom: 6px; font-size: 0.85em;">문제</label>
                      <textarea
                        class="guideline-edit-question"
                        data-subq-id="${subQ.sub_question_id}"
                        rows="3"
                        placeholder="문제를 입력하세요"
                        style="width: 100%; padding: 10px; border: 1px solid #ced4da; border-radius: 4px; font-size: 0.9em; resize: vertical; font-family: inherit; line-height: 1.6; background: white;"
                      >${subQ.re_sub_question || ""}</textarea>
                    </div>
                    <div>
                      <label style="display: block; font-weight: 600; color: #495057; margin-bottom: 6px; font-size: 0.85em;">정답</label>
                      <input
                        type="text"
                        class="guideline-edit-answer"
                        data-subq-id="${subQ.sub_question_id}"
                        value="${subQ.re_sub_answer || ""}"
                        placeholder="정답을 입력하세요"
                        style="width: 100%; padding: 10px; border: 1px solid #ced4da; border-radius: 4px; font-size: 0.9em; font-family: inherit; background: white;"
                      />
                    </div>
                  </div>
                </div>
                `
                    : ""
                }
              </div>
              <!-- 재생성 방법 버튼들 -->
              <div style="margin-top: 12px;">
                <!-- 버튼들 (항상 한 줄에 배치) -->
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: nowrap;">
                  <!-- 1. 검증 결과 보기 -->
                  <button
                    type="button"
                    class="guideline-verification-toggle-btn"
                    data-subq-id="${subQ.sub_question_id}"
                    style="background: var(--color-text-secondary); color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 0.875rem; flex-shrink: 0;"
                    title="검증 결과 보기"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M9 11l3 3L22 4"></path>
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                    </svg>
                    <span>검증 결과 보기</span>
                  </button>
                  <!-- 2. 피드백 입력하기 -->
                  <div class="guideline-feedback-display-mode" data-subq-id="${subQ.sub_question_id}" style="display: flex; flex-direction: column; flex-shrink: 0;">
                    <button
                      type="button"
                      class="guideline-feedback-toggle-btn"
                      data-subq-id="${subQ.sub_question_id}"
                      style="background: var(--color-primary); color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 0.875rem;"
                      title="피드백 입력하기"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      </svg>
                      <span>피드백</span>
                    </button>
                    <div class="feedback-content" style="display: none;"></div>
                  </div>
                  <!-- 3. 재생성하기 (피드백 입력 모드일 때) -->
                  <button
                    type="button"
                    class="btn guideline-feedback-regenerate-btn"
                    data-subq-id="${subQ.sub_question_id}"
                    style="display: none; background: var(--color-primary); color: white; padding: 8px 12px; font-size: 0.875rem; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; align-items: center; gap: 6px; flex-shrink: 0; white-space: nowrap; width: auto;"
                    title="피드백 반영하여 재생성"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="23 4 23 10 17 10"></polyline>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    <span>재생성</span>
                  </button>
                  <!-- 3. 재생성하기 (일반 모드일 때) -->
                  <button
                    type="button"
                    class="btn guideline-single-regenerate-btn"
                    data-subq-id="${subQ.sub_question_id}"
                    style="background: var(--color-primary); color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 0.875rem; font-weight: 500; flex-shrink: 0; white-space: nowrap; width: auto;"
                    title="이 단계 재생성"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="23 4 23 10 17 10"></polyline>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    <span>재생성</span>
                  </button>
                </div>
                <!-- 피드백 입력 textarea (별도 줄에 배치) -->
                <div class="guideline-feedback-edit-mode" data-subq-id="${subQ.sub_question_id}" style="display: none; margin-top: 8px; padding: 12px; background: var(--color-bg-secondary); border-radius: 8px; border: 1px solid var(--color-border);">
                  <div style="display: flex; gap: 8px; align-items: flex-start;">
                    <textarea
                      class="guideline-user-feedback"
                      data-subq-id="${subQ.sub_question_id}"
                      rows="3"
                      placeholder="수정 요청사항을 입력하세요. "
                      style="flex: 1; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 0.875rem; resize: vertical; font-family: inherit; line-height: 1.5; transition: border-color 0.2s; background: white;"
                      onfocus="this.style.borderColor='var(--color-primary)'; this.style.outline='none'; this.style.boxShadow='0 0 0 3px rgba(96, 165, 250, 0.15)'"
                      onblur="this.style.borderColor='var(--color-border)'; this.style.boxShadow='none'"
                    ></textarea>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                      <button
                        type="button"
                        class="guideline-feedback-cancel-btn"
                        data-subq-id="${subQ.sub_question_id}"
                        style="background: var(--color-text-secondary); color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px;"
                        title="취소"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                      <button
                        type="button"
                        class="guideline-feedback-submit-btn"
                        data-subq-id="${subQ.sub_question_id}"
                        style="background: var(--color-primary); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 0.875rem; white-space: nowrap;"
                        title="피드백 입력"
                      >
                        입력
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div style="margin-top: 15px;">
                <div class="guideline-verification-results" data-subq-id="${subQ.sub_question_id}" style="display: none; margin-top: 12px;">
                  ${
                    hasRegenerated
                      ? `
                  <div style="margin-bottom: 15px;">
                    <div style="font-weight: 600; color: #495057; margin-bottom: 8px; font-size: 0.95em;">원본 문항 검증 결과</div>
                    ${formatVerificationResult(subQ.verification_result)}
                  </div>
                  <div>
                    <div style="font-weight: 600; color: #495057; margin-bottom: 8px; font-size: 0.95em;">재생성 문항 검증 결과</div>
                    ${formatVerificationResult(subQ.re_verification_result)}
                  </div>
                  `
                      : `
                  ${formatVerificationResult(subQ.verification_result)}
                  `
                  }
                </div>
              </div>
          `;
    guidelineSubQuestionsContainer.appendChild(subQCard);
  });

  // MathJax로 LaTeX 수식 렌더링 (하위 문항만)
  if (window.MathJax) {
    MathJax.typesetPromise([guidelineSubQuestionsContainer]).catch((err) => {
      console.error("MathJax 렌더링 오류:", err);
    });
  }
}

// 입력 영역 토글 버튼
toggleFormBtn.addEventListener("click", () => {
  formSection.classList.toggle("hidden");
  toggleFormBtn.textContent = formSection.classList.contains("hidden") ? "입력 영역 보기" : "입력 영역 숨기기";
});

// 모달 닫기
// 모달 관련 변수 직접 가져오기
const closeModalEl = document.getElementById("closeModal");
const considerationsModalEl = document.getElementById("considerationsModal");

if (closeModalEl) {
  closeModalEl.onclick = function () {
    if (considerationsModalEl) {
      considerationsModalEl.classList.remove("show");
    }
  };
}

if (window) {
  window.onclick = function (event) {
    if (event.target == considerationsModalEl) {
      considerationsModalEl.classList.remove("show");
    }
  };
}

// 아코디언 섹션 토글 함수
function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.classList.toggle("collapsed");
  }
}

// 전역 함수로 등록
window.toggleSection = toggleSection;

