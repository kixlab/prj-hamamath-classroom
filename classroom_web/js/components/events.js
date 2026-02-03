// 이벤트 핸들러들

// verifier 실행 함수
async function runVerifierForSubQuestion(subqId, triggerBtn) {
  if (!subqId || !currentGuidelineData || !currentCotData) return;

  const editedQuestionEl = document.querySelector(`.guideline-edit-question[data-subq-id="${subqId}"]`);
  const editedAnswerEl = document.querySelector(`.guideline-edit-answer[data-subq-id="${subqId}"]`);
  if (!editedQuestionEl || !editedAnswerEl) return;

  const editedQuestion = editedQuestionEl.value.trim();
  const editedAnswer = editedAnswerEl.value.trim();

  if (!editedQuestion) {
    error.textContent = "수정한 문항 내용이 비어 있습니다.";
    error.classList.add("show");
    return;
  }

  const btn = triggerBtn;
  const originalText = btn ? btn.textContent : null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "verifier 실행 중...";
  }

  try {
    const subQuestions = currentGuidelineData.guide_sub_questions || [];
    const targetSubQ = subQuestions.find((q) => q.sub_question_id === subqId);
    if (!targetSubQ) {
      throw new Error(`sub_question_id=${subqId} 를 Guideline 데이터에서 찾을 수 없습니다.`);
    }

    // 대응하는 CoT 단계 찾기 (sub_skill_id 기준)
    const cotSteps = currentCotData.steps || [];
    const cotStep = cotSteps.find((s) => s.sub_skill_id === subqId);
    if (!cotStep) {
      throw new Error(`sub_question_id=${subqId} 에 해당하는 CoT 단계가 없습니다.`);
    }

    // 수정된 내용을 반영한 GuidelineSubQuestion 형태 구성
    const updatedSubQuestion = {
      ...targetSubQ,
      guide_sub_question: editedQuestion,
      guide_sub_answer: editedAnswer || null,
      re_sub_question: null,
      re_sub_answer: null,
    };

    // previous_sub_questions: 현재 subQ 이전 단계만 사용
    const previousSubQuestions = subQuestions
      .filter((q) => q.sub_question_id !== subqId)
      .map((q) => q);

    const requestBody = {
      main_problem: currentCotData.problem,
      main_answer: currentCotData.answer,
      main_solution: currentCotData.main_solution || null,
      grade: String(currentCotData.grade || ""),
      cot_step: {
        step_id: cotStep.step_id,
        sub_skill_id: cotStep.sub_skill_id,
        step_name: cotStep.step_name,
        step_name_en: cotStep.step_name_en,
        sub_skill_name: cotStep.sub_skill_name,
        step_content: cotStep.step_content,
        prompt_used: cotStep.prompt_used || null,
      },
      subject_area: currentGuidelineData.subject_area || null,
      considerations: currentCotData.considerations || [],
      sub_question: updatedSubQuestion,
      previous_sub_questions: previousSubQuestions,
    };

    const resp = await fetch("/api/v1/verifier/orchestrator/verify-and-regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const msg = errData.detail || `HTTP ${resp.status}`;
      throw new Error(`verifier 실행 중 오류가 발생했습니다: ${msg}`);
    }

    const data = await resp.json();
    const newSubQ = data.sub_question || updatedSubQuestion;
    const verificationResults = data.verification_results || {};

    // 재생성된 경우 re_verification_result 설정
    if (data.was_regenerated && verificationResults) {
      const allFeedbacks = [];
      const verifierNames = {
        stage_elicitation: "Stage Elicitation",
        context_alignment: "Context Alignment",
        answer_validity: "Answer Validity",
        prompt_validity: "Prompt Validity",
      };

      for (const [key, result] of Object.entries(verificationResults)) {
        const verifierName = verifierNames[key] || key;
        const scoreStr = result.score !== null ? result.score : "N/A";
        const evalSummary = result.evaluation_summary || "";
        const improveSuggestions = result.improvement_suggestions || "";
        if (evalSummary || improveSuggestions) {
          allFeedbacks.push(`[${verifierName}] 점수: ${scoreStr}\n[평가 요약]\n${evalSummary}\n[개선 제안]\n${improveSuggestions}`);
        } else {
          allFeedbacks.push(`[${verifierName}] 점수: ${scoreStr}, ${result.feedback || ""}`);
        }
      }
      newSubQ.re_verification_result = allFeedbacks.join("\n");
    }

    // currentGuidelineData 갱신
    const idx = subQuestions.findIndex((q) => q.sub_question_id === subqId);
    if (idx >= 0) {
      currentGuidelineData.guide_sub_questions[idx] = newSubQ;
    }

    // 저장된 결과(localStorage)도 최신 Guideline으로 업데이트
    if (currentProblemId && currentCotData) {
      saveResult(currentProblemId, currentCotData, currentSubQData, currentGuidelineData);
    }

    // 카드도 다시 렌더링 (전체 Guideline 영역 갱신)
    updateGuidelineSubQuestions(currentGuidelineData);

    if (btn && originalText) {
      btn.textContent = "verifier 실행 완료";
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 1200);
    }
  } catch (err) {
    console.error("수정된 하위 문항 verifier 실행 오류:", err);
    error.textContent = err.message || String(err);
    error.classList.add("show");
    if (btn && originalText) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

// 편집 버튼 토글 이벤트
document.addEventListener("click", (e) => {
  const editToggleBtn = e.target.closest(".guideline-edit-toggle-btn");
  if (editToggleBtn) {
    const subqId = editToggleBtn.getAttribute("data-subq-id");
    if (!subqId) return;
    
    const displayMode = document.querySelector(`.guideline-display-mode[data-subq-id="${subqId}"]`);
    const editMode = document.querySelector(`.guideline-edit-mode[data-subq-id="${subqId}"]`);
    
    if (displayMode && editMode) {
      const isEditing = editMode.style.display !== "none";
      
      if (isEditing) {
        // 편집 모드 -> 읽기 모드로 전환
        editMode.style.display = "none";
        displayMode.style.display = "block";
        editToggleBtn.textContent = "편집";
        
        // 편집된 내용을 읽기 모드에 반영
        const editedQuestion = document.querySelector(`.guideline-edit-question[data-subq-id="${subqId}"]`).value;
        const editedAnswer = document.querySelector(`.guideline-edit-answer[data-subq-id="${subqId}"]`).value;
        
        const questionDiv = displayMode.querySelector("div:first-child");
        const answerDiv = displayMode.querySelector("div:last-child");
        
        if (questionDiv) {
          questionDiv.textContent = editedQuestion || "(없음)";
        }
        
        if (answerDiv && editedAnswer) {
          answerDiv.innerHTML = `<strong>정답:</strong> ${editedAnswer}`;
        } else if (answerDiv && !editedAnswer) {
          answerDiv.remove();
        } else if (!answerDiv && editedAnswer) {
          const newAnswerDiv = document.createElement("div");
          newAnswerDiv.style.cssText = "padding-top: 8px; border-top: 1px solid #dee2e6; color: #495057; font-size: 0.9em;";
          newAnswerDiv.innerHTML = `<strong>정답:</strong> ${editedAnswer}`;
          displayMode.appendChild(newAnswerDiv);
        }
      } else {
        // 읽기 모드 -> 편집 모드로 전환
        displayMode.style.display = "none";
        editMode.style.display = "block";
        editToggleBtn.textContent = "취소";
      }
    }
  }
});

// 검증 결과 토글 이벤트 (단순히 결과 표시/숨김만)
document.addEventListener("click", (e) => {
  const verificationToggleBtn = e.target.closest(".guideline-verification-toggle-btn");
  if (verificationToggleBtn) {
    const subqId = verificationToggleBtn.getAttribute("data-subq-id");
    if (!subqId) return;
    
    const verificationResults = document.querySelector(`.guideline-verification-results[data-subq-id="${subqId}"]`);
    
    if (verificationResults) {
      const isVisible = verificationResults.style.display !== "none";
      
      if (isVisible) {
        verificationResults.style.display = "none";
        const span = verificationToggleBtn.querySelector("span");
        if (span) span.textContent = "검증";
      } else {
        verificationResults.style.display = "block";
        const span = verificationToggleBtn.querySelector("span");
        if (span) span.textContent = "검증";
      }
    }
  }
});

// 재생성 피드백 편집 버튼 토글 이벤트
document.addEventListener("click", (e) => {
  const feedbackToggleBtn = e.target.closest(".guideline-feedback-toggle-btn");
  if (feedbackToggleBtn) {
    const subqId = feedbackToggleBtn.getAttribute("data-subq-id");
    if (!subqId) return;
    
    const displayMode = document.querySelector(`.guideline-feedback-display-mode[data-subq-id="${subqId}"]`);
    const editMode = document.querySelector(`.guideline-feedback-edit-mode[data-subq-id="${subqId}"]`);
    
    if (displayMode && editMode) {
      const isEditing = editMode.style.display !== "none";
      
      const feedbackRegenerateBtn = document.querySelector(`.guideline-feedback-regenerate-btn[data-subq-id="${subqId}"]`);
      const singleRegenerateBtn = document.querySelector(`.guideline-single-regenerate-btn[data-subq-id="${subqId}"]`);
      
      if (isEditing) {
        // 편집 모드 -> 읽기 모드로 전환
        editMode.style.display = "none";
        displayMode.style.display = "flex";
        
        // 버튼 스타일 복원
        feedbackToggleBtn.style.background = "var(--color-primary)";
        feedbackToggleBtn.style.opacity = "1";
        feedbackToggleBtn.style.boxShadow = "none";
        
        // 재생성 버튼 전환
        if (feedbackRegenerateBtn) feedbackRegenerateBtn.style.display = "none";
        if (singleRegenerateBtn) singleRegenerateBtn.style.display = "flex";
        
        // 편집된 내용을 읽기 모드에 반영
        const feedbackTextarea = document.querySelector(`.guideline-user-feedback[data-subq-id="${subqId}"]`);
        const feedbackValue = feedbackTextarea ? feedbackTextarea.value.trim() : "";
        
        // 피드백 내용을 별도 div에 표시 (버튼은 유지)
        const feedbackContent = displayMode.querySelector(".feedback-content");
        if (feedbackContent) {
          if (feedbackValue) {
            feedbackContent.innerHTML = `<div style="padding: 10px; background: white; border-radius: 4px; border: 1px solid #dee2e6; margin-top: 8px;"><div style="color: #495057; line-height: 1.6; font-size: 0.9em; white-space: pre-wrap;">${feedbackValue}</div></div>`;
            feedbackContent.style.display = "block";
          } else {
            feedbackContent.style.display = "none";
          }
        }
      } else {
        // 읽기 모드 -> 편집 모드로 전환
        // displayMode는 숨기지 않고 버튼만 유지
        displayMode.style.display = "flex";
        editMode.style.display = "block";
        
        // 버튼 스타일 변경 (활성화 상태 표시)
        feedbackToggleBtn.style.background = "var(--color-primary)";
        feedbackToggleBtn.style.opacity = "0.8";
        feedbackToggleBtn.style.boxShadow = "0 2px 4px rgba(96, 165, 250, 0.3)";
        
        // 피드백 내용 숨기기
        const feedbackContent = displayMode.querySelector(".feedback-content");
        if (feedbackContent) feedbackContent.style.display = "none";
        
        // 재생성 버튼 전환
        if (feedbackRegenerateBtn) feedbackRegenerateBtn.style.display = "flex";
        if (singleRegenerateBtn) singleRegenerateBtn.style.display = "none";
        
        // 기존 피드백 값을 textarea에 설정
        const feedbackTextarea = document.querySelector(`.guideline-user-feedback[data-subq-id="${subqId}"]`);
        if (feedbackTextarea) {
          // feedback-content에서 피드백 내용 가져오기
          const feedbackContent = displayMode.querySelector(".feedback-content");
          if (feedbackContent && feedbackContent.textContent.trim()) {
            const feedbackText = feedbackContent.textContent.trim();
            if (feedbackText && !feedbackText.includes("피드백이 입력되지 않았습니다")) {
              feedbackTextarea.value = feedbackText;
            } else {
              feedbackTextarea.value = "";
            }
          } else {
            feedbackTextarea.value = "";
          }
        }
      }
    }
  }
});

// 피드백 취소 버튼 이벤트
document.addEventListener("click", (e) => {
  const feedbackCancelBtn = e.target.closest(".guideline-feedback-cancel-btn");
  if (feedbackCancelBtn) {
    const subqId = feedbackCancelBtn.getAttribute("data-subq-id");
    if (!subqId) return;
    
    const displayMode = document.querySelector(`.guideline-feedback-display-mode[data-subq-id="${subqId}"]`);
    const editMode = document.querySelector(`.guideline-feedback-edit-mode[data-subq-id="${subqId}"]`);
    const feedbackToggleBtn = document.querySelector(`.guideline-feedback-toggle-btn[data-subq-id="${subqId}"]`);
    const feedbackTextarea = document.querySelector(`.guideline-user-feedback[data-subq-id="${subqId}"]`);
    const feedbackRegenerateBtn = document.querySelector(`.guideline-feedback-regenerate-btn[data-subq-id="${subqId}"]`);
    const singleRegenerateBtn = document.querySelector(`.guideline-single-regenerate-btn[data-subq-id="${subqId}"]`);
    
    if (!displayMode || !editMode || !feedbackToggleBtn) return;
    
    // textarea 초기화
    if (feedbackTextarea) feedbackTextarea.value = "";
    
    // 편집 모드 닫기
    editMode.style.display = "none";
    displayMode.style.display = "flex";
    
    // 버튼 스타일 복원
    feedbackToggleBtn.style.background = "var(--color-primary)";
    feedbackToggleBtn.style.opacity = "1";
    feedbackToggleBtn.style.boxShadow = "none";
    
    // 재생성 버튼 전환
    if (feedbackRegenerateBtn) feedbackRegenerateBtn.style.display = "none";
    if (singleRegenerateBtn) singleRegenerateBtn.style.display = "flex";
  }
});

// 피드백 입력 버튼 이벤트
document.addEventListener("click", (e) => {
  const feedbackSubmitBtn = e.target.closest(".guideline-feedback-submit-btn");
  if (feedbackSubmitBtn) {
    const subqId = feedbackSubmitBtn.getAttribute("data-subq-id");
    if (!subqId) return;
    
    const feedbackTextarea = document.querySelector(`.guideline-user-feedback[data-subq-id="${subqId}"]`);
    const displayMode = document.querySelector(`.guideline-feedback-display-mode[data-subq-id="${subqId}"]`);
    const editMode = document.querySelector(`.guideline-feedback-edit-mode[data-subq-id="${subqId}"]`);
    const feedbackToggleBtn = document.querySelector(`.guideline-feedback-toggle-btn[data-subq-id="${subqId}"]`);
    const feedbackRegenerateBtn = document.querySelector(`.guideline-feedback-regenerate-btn[data-subq-id="${subqId}"]`);
    const singleRegenerateBtn = document.querySelector(`.guideline-single-regenerate-btn[data-subq-id="${subqId}"]`);
    
    if (!feedbackTextarea || !displayMode || !editMode) return;
    
    const feedbackValue = feedbackTextarea.value.trim();
    
    if (!feedbackValue) {
      error.textContent = "피드백을 입력해주세요.";
      error.classList.add("show");
      return;
    }
    
    // 피드백을 읽기 모드에 표시 (버튼은 유지)
    const feedbackContent = displayMode.querySelector(".feedback-content");
    if (feedbackContent) {
      feedbackContent.innerHTML = `<div style="padding: 10px; background: white; border-radius: 4px; border: 1px solid #dee2e6; margin-top: 8px;"><div style="color: #495057; line-height: 1.6; font-size: 0.9em; white-space: pre-wrap;">${feedbackValue}</div></div>`;
      feedbackContent.style.display = "block";
    }
    
    // 편집 모드를 읽기 모드로 전환
    editMode.style.display = "none";
    displayMode.style.display = "flex";
    if (feedbackToggleBtn) {
      const span = feedbackToggleBtn.querySelector("span");
      if (span) span.textContent = "피드백";
    }
    
    // 재생성 버튼 전환
    if (feedbackRegenerateBtn) feedbackRegenerateBtn.style.display = "flex";
    if (singleRegenerateBtn) singleRegenerateBtn.style.display = "none";
    
    error.classList.remove("show");
  }
});

// Guideline 하위 문항 카드에서 "이 단계 재생성" 버튼 동작
document.addEventListener("click", async (e) => {
  const subqBtn = e.target.closest(".guideline-single-regenerate-btn");
  if (!subqBtn) return;
  error.classList.remove("show");

  const subqId = subqBtn.getAttribute("data-subq-id");
  if (!subqId) return;
  await regenerateSubQuestionOnly(subqId, subqBtn);
});

// 피드백 기반 재생성 버튼 동작
document.addEventListener("click", async (e) => {
  const feedbackRegenerateBtn = e.target.closest(".guideline-feedback-regenerate-btn");
  if (!feedbackRegenerateBtn) return;
  error.classList.remove("show");

  const subqId = feedbackRegenerateBtn.getAttribute("data-subq-id");
  if (!subqId) return;

  // 피드백 확인
  const userFeedbackEl = document.querySelector(`.guideline-user-feedback[data-subq-id="${subqId}"]`);
  if (!userFeedbackEl || !userFeedbackEl.value.trim()) {
    error.textContent = "피드백을 입력해주세요.";
    error.classList.add("show");
    return;
  }

  const btn = feedbackRegenerateBtn;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "재생성 중...";

  try {
    const subQuestions = currentGuidelineData.guide_sub_questions || [];
    const targetSubQ = subQuestions.find((q) => q.sub_question_id === subqId);
    if (!targetSubQ) {
      throw new Error(`sub_question_id=${subqId} 를 Guideline 데이터에서 찾을 수 없습니다.`);
    }

    const cotSteps = currentCotData.steps || [];
    const cotStep = cotSteps.find((s) => s.sub_skill_id === subqId);
    if (!cotStep) {
      throw new Error(`sub_question_id=${subqId} 에 해당하는 CoT 단계가 없습니다.`);
    }

    const hasRegenerated = targetSubQ.re_sub_question || targetSubQ.re_sub_answer;
    const editedQuestionEl = document.querySelector(`.guideline-edit-question[data-subq-id="${subqId}"]`);
    const editedAnswerEl = document.querySelector(`.guideline-edit-answer[data-subq-id="${subqId}"]`);
    const editedQuestion = editedQuestionEl ? editedQuestionEl.value.trim() : (hasRegenerated ? targetSubQ.re_sub_question : targetSubQ.guide_sub_question);
    const editedAnswer = editedAnswerEl ? editedAnswerEl.value.trim() : (hasRegenerated ? targetSubQ.re_sub_answer : targetSubQ.guide_sub_answer);

    const originalSubQuestion = hasRegenerated
      ? {
          ...targetSubQ,
          guide_sub_question: targetSubQ.re_sub_question || editedQuestion,
          guide_sub_answer: targetSubQ.re_sub_answer || editedAnswer || null,
          re_sub_question: null,
          re_sub_answer: null,
        }
      : {
          ...targetSubQ,
          guide_sub_question: editedQuestion,
          guide_sub_answer: editedAnswer || null,
        };

    const previousSubQuestions = subQuestions
      .filter((q) => q.sub_question_id !== subqId)
      .map((q) => q);

    // 사용자 피드백을 verification_feedbacks로 사용
    const userFeedback = userFeedbackEl.value.trim();
    const verificationFeedbacks = [`[사용자 피드백] ${userFeedback}`];
    const failingVerifiers = ["stage_elicitation", "context_alignment", "answer_validity", "prompt_validity"];

    const regenerateRequestBody = {
      main_problem: currentCotData.problem,
      main_answer: currentCotData.answer,
      main_solution: currentCotData.main_solution || null,
      grade: String(currentCotData.grade || ""),
      cot_step: {
        step_id: cotStep.step_id,
        sub_skill_id: cotStep.sub_skill_id,
        step_name: cotStep.step_name,
        step_name_en: cotStep.step_name_en,
        sub_skill_name: cotStep.sub_skill_name,
        step_content: cotStep.step_content,
        prompt_used: cotStep.prompt_used || null,
      },
      subject_area: currentGuidelineData.subject_area || null,
      considerations: currentCotData.considerations || [],
      previous_sub_questions: previousSubQuestions,
      original_sub_question: originalSubQuestion,
      verification_feedbacks: verificationFeedbacks,
      failing_verifiers: failingVerifiers,
    };

    const regenerateResp = await fetch("/api/v1/guideline/regenerate-single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(regenerateRequestBody),
    });

    if (!regenerateResp.ok) {
      const errData = await regenerateResp.json().catch(() => ({}));
      const msg = errData.detail || `HTTP ${regenerateResp.status}`;
      throw new Error(`재생성 중 오류가 발생했습니다: ${msg}`);
    }

    const regenerateData = await regenerateResp.json();
    const regeneratedSubQ = regenerateData.sub_question;

    // 결과 업데이트 (사용자 피드백만 반영, verifier 결과는 사용하지 않음)
    const newSubQ = {
      ...targetSubQ,
      ...regeneratedSubQ,
      guide_sub_question: originalSubQuestion.guide_sub_question,
      guide_sub_answer: originalSubQuestion.guide_sub_answer,
    };

    const updatedSubQuestions = subQuestions.map((q) =>
      q.sub_question_id === subqId ? newSubQ : q
    );
    currentGuidelineData.guide_sub_questions = updatedSubQuestions;

    // 저장된 결과(localStorage)도 최신 Guideline으로 업데이트
    if (currentProblemId && currentCotData) {
      saveResult(currentProblemId, currentCotData, currentSubQData, currentGuidelineData);
    }

    // 화면 갱신
    updateGuidelineSubQuestions(currentGuidelineData);

    // 피드백을 읽기 모드에 반영
    const feedbackDisplayMode = document.querySelector(`.guideline-feedback-display-mode[data-subq-id="${subqId}"]`);
    if (feedbackDisplayMode && userFeedback) {
      feedbackDisplayMode.innerHTML = `<div style="padding: 10px; background: white; border-radius: 4px; border: 1px solid #dee2e6;"><div style="color: #495057; line-height: 1.6; font-size: 0.9em; white-space: pre-wrap;">${userFeedback}</div></div>`;
    }

    // 편집 모드를 읽기 모드로 전환
    const feedbackEditMode = document.querySelector(`.guideline-feedback-edit-mode[data-subq-id="${subqId}"]`);
    const feedbackToggleBtn = document.querySelector(`.guideline-feedback-toggle-btn[data-subq-id="${subqId}"]`);
    const feedbackRegenerateBtn = document.querySelector(`.guideline-feedback-regenerate-btn[data-subq-id="${subqId}"]`);
    const singleRegenerateBtn = document.querySelector(`.guideline-single-regenerate-btn[data-subq-id="${subqId}"]`);
    if (feedbackEditMode && feedbackDisplayMode && feedbackToggleBtn) {
      feedbackEditMode.style.display = "none";
      feedbackDisplayMode.style.display = "flex";
      feedbackToggleBtn.textContent = "피드백";
      
      // 재생성 버튼 전환
      if (feedbackRegenerateBtn) feedbackRegenerateBtn.style.display = "none";
      if (singleRegenerateBtn) singleRegenerateBtn.style.display = "flex";
    }

    btn.textContent = "재생성 완료";
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = originalText;
    }, 2000);
  } catch (err) {
    console.error("피드백 기반 재생성 오류:", err);
    error.textContent = err.message;
    error.classList.add("show");
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

// 헤더의 "문제 입력하기" 버튼 이벤트
document.addEventListener("DOMContentLoaded", () => {
  const newProblemBtn = document.getElementById("newProblemBtn");
  if (newProblemBtn) {
    newProblemBtn.addEventListener("click", () => {
      // 현재 작업 내용 자동 저장 (currentCotData가 있는 경우)
      if (typeof currentCotData !== "undefined" && currentCotData && typeof currentProblemId !== "undefined" && currentProblemId) {
        if (typeof window.saveCurrentResult === "function") {
          window.saveCurrentResult();
        }
      }
      
      // 첫 번째 탭으로 이동
      if (typeof window.switchWorkflowTab === "function") {
        window.switchWorkflowTab(1);
      }
      
      // 워크플로우 진행 상태 초기화
      if (typeof window.updateWorkflowProgress === "function") {
        window.updateWorkflowProgress(1);
      }
      
      // 폼 초기화
      const form = document.getElementById("cotForm");
      if (form) {
        form.reset();
      }
      
      // 이미지 초기화
      const imagePreview = document.getElementById("imagePreview");
      const imagePreviewContainer = document.getElementById("imagePreviewContainer");
      const removeImageBtn = document.getElementById("removeImageBtn");
      if (imagePreview) imagePreview.src = "";
      if (imagePreviewContainer) imagePreviewContainer.style.display = "none";
      if (removeImageBtn) removeImageBtn.style.display = "none";
      
      // 결과 섹션 숨기기
      const resultSection = document.getElementById("resultSection");
      if (resultSection) {
        resultSection.style.display = "none";
        resultSection.classList.remove("show");
      }
      
      // 전역 변수 초기화
      if (typeof currentProblemId !== "undefined") currentProblemId = null;
      if (typeof currentCotData !== "undefined") currentCotData = null;
      if (typeof currentSubQData !== "undefined") currentSubQData = null;
      if (typeof currentGuidelineData !== "undefined") currentGuidelineData = null;
      
      // 문제 입력 필드로 스크롤
      const formSection = document.getElementById("formSection");
      if (formSection) {
        setTimeout(() => {
          formSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    });
  }
});

// 사이드바의 "문제 입력하기" 버튼 이벤트
const submitBtnFromSidebar = document.getElementById("submitBtnFromSidebar");
if (submitBtnFromSidebar) {
  submitBtnFromSidebar.addEventListener("click", () => {
    // 사이드바 닫기
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebarOverlay");
    if (sidebar) {
      sidebar.classList.remove("open");
      if (sidebarOverlay) sidebarOverlay.classList.remove("show");
      // updateHamburgerButtonVisibility는 sidebar.js에서 전역으로 선언되어야 함
      if (typeof updateHamburgerButtonVisibility === "function") {
        updateHamburgerButtonVisibility();
      }
    }
    // form submit 트리거
    const formElement = document.getElementById("cotForm");
    if (formElement) {
      formElement.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  });
}

// 모든 결과 초기화 버튼 이벤트
const clearAllResultsBtn = document.getElementById("clearAllResultsBtn");
if (clearAllResultsBtn) {
  clearAllResultsBtn.addEventListener("click", () => {
    if (typeof clearAllResults === "function") {
      clearAllResults();
    } else {
      console.error("clearAllResults 함수를 찾을 수 없습니다.");
    }
  });
}
