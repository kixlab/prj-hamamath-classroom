async function regenerateSubQuestionOnly(subqId, triggerBtn) {
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
    btn.textContent = "재생성 중...";
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

    // 재생성된 문항(2안)이 있는지 확인
    const hasRegenerated = targetSubQ.re_sub_question || targetSubQ.re_sub_answer;
    
    if (!hasRegenerated) {
      error.textContent = "재생성할 문항이 없습니다. 먼저 하위문항을 생성해주세요.";
      error.classList.add("show");
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
      return;
    }

    // 2안(re_sub_question/re_sub_answer)을 원본으로 사용하여 3안 생성
    const originalSubQuestion = {
      ...targetSubQ,
      guide_sub_question: targetSubQ.re_sub_question || targetSubQ.guide_sub_question,
      guide_sub_answer: targetSubQ.re_sub_answer || targetSubQ.guide_sub_answer || null,
      re_sub_question: null,  // 재생성 시 원본으로 사용하기 위해 초기화
      re_sub_answer: null,
    };

    // previous_sub_questions: 현재 subQ 이전 단계만 사용
    const previousSubQuestions = subQuestions
      .filter((q) => q.sub_question_id !== subqId)
      .map((q) => q);
    
    // 1. 2안에 대한 verifier 실행 (re_verification_result 생성)
    if (btn) {
      btn.textContent = "verifier 실행 중...";
    }
    
    const verifyRequestBody = {
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
      sub_question: originalSubQuestion,
      previous_sub_questions: previousSubQuestions,
      skip_regeneration: true,  // 재생성 건너뛰고 검증만 수행
    };
    
    const verifyResp = await fetch("/api/v1/verifier/orchestrator/verify-and-regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(verifyRequestBody),
    });
    
    if (!verifyResp.ok) {
      const errData = await verifyResp.json().catch(() => ({}));
      const msg = errData.detail || `HTTP ${verifyResp.status}`;
      throw new Error(`verifier 실행 중 오류가 발생했습니다: ${msg}`);
    }
    
    const verifyData = await verifyResp.json();
    const verificationResults = verifyData.verification_results || {};
    
    // verifier 결과를 파싱하여 verification_feedbacks와 failing_verifiers 생성
    const verifierNames = {
      stage_elicitation: "Stage Elicitation",
      context_alignment: "Context Alignment",
      answer_validity: "Answer Validity",
      prompt_validity: "Prompt Validity",
    };
    
    let verificationFeedbacks = [];
    let failingVerifiers = [];
    const allFeedbacks = [];
    
    for (const [key, result] of Object.entries(verificationResults)) {
      const verifierName = verifierNames[key] || key;
      const scoreStr = result.score !== null ? result.score : "N/A";
      const evalSummary = result.evaluation_summary || "";
      const improveSuggestions = result.improvement_suggestions || "";
      
      let feedbackText = "";
      if (evalSummary || improveSuggestions) {
        feedbackText = `[${verifierName}] 점수: ${scoreStr}\n[평가 요약]\n${evalSummary}\n[개선 제안]\n${improveSuggestions}`;
      } else {
        feedbackText = `[${verifierName}] 점수: ${scoreStr}, ${result.feedback || ""}`;
      }
      allFeedbacks.push(feedbackText);
      
      // 5점 미만이면 실패한 verifier로 간주
      if (result.score !== null && result.score < 5) {
        failingVerifiers.push(key);
        verificationFeedbacks.push(feedbackText);
      }
    }
    
    // 실패한 verifier가 없으면 모든 verifier 결과를 피드백으로 사용
    if (failingVerifiers.length === 0) {
      verificationFeedbacks = allFeedbacks;
      failingVerifiers.push("stage_elicitation", "context_alignment", "answer_validity", "prompt_validity");
    }
    
    // 사용자가 입력한 피드백 추가
    const userFeedbackEl = document.querySelector(`.guideline-user-feedback[data-subq-id="${subqId}"]`);
    if (userFeedbackEl && userFeedbackEl.value.trim()) {
      verificationFeedbacks.push(`[사용자 피드백] ${userFeedbackEl.value.trim()}`);
    }

    // 2. verifier 결과를 바탕으로 3안 생성 (재생성 API 호출)
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

    // 3. 3안 생성 완료 - re_sub_question/re_sub_answer에 3안 저장
    const newSubQ = {
      ...targetSubQ,
      ...regeneratedSubQ,
      guide_sub_question: targetSubQ.guide_sub_question,  // 원본 문항(1안) 유지
      guide_sub_answer: targetSubQ.guide_sub_answer,  // 원본 문항(1안) 유지
      // re_sub_question/re_sub_answer는 3안으로 업데이트됨
    };
    
    // 2안에 대한 verifier 결과를 re_verification_result에 저장
    if (allFeedbacks.length > 0) {
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
      btn.textContent = "재생성 완료";
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 1200);
    }
  } catch (err) {
    console.error("하위 문항 재생성 오류:", err);
    error.textContent = err.message || String(err);
    error.classList.add("show");
    if (btn && originalText) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

// 편집 버튼 토글 이벤트
function updateGuidelineProgress(currentStep, totalSteps, stepOrder) {
  const progressContainer = document.getElementById("guidelineProgressContainer");
  const progressText = document.getElementById("guidelineProgressText");
  const progressSteps = document.getElementById("guidelineProgressSteps");

  if (!progressContainer || !progressText || !progressSteps) return;

  // 3단계 탭으로 자동 전환 (progress가 표시될 때)
  if (window.switchWorkflowTab && currentStep > 0) {
    window.switchWorkflowTab(3);
  }

  // 진행 상황 표시
  progressContainer.style.display = "block";
  progressText.textContent = `${currentStep}/${totalSteps} 완료`;

  // 각 단계별 상태 표시
  progressSteps.innerHTML = "";
  for (let i = 0; i < totalSteps; i++) {
    const stepId = stepOrder[i];
    const isCompleted = i < currentStep;
    const isCurrent = i === currentStep - 1;

    const stepElement = document.createElement("div");
    stepElement.style.cssText = `
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.85em;
      font-weight: 600;
      min-width: 50px;
      text-align: center;
      transition: all 0.3s;
      ${
        isCompleted
          ? "background: var(--color-success); color: white;"
          : isCurrent
          ? "background: var(--color-primary); color: white;"
          : "background: var(--color-bg-secondary); color: var(--color-text-muted);"
      }
    `;
    stepElement.textContent = stepId;
    progressSteps.appendChild(stepElement);
  }
}

// Guideline 하위 문항 생성 버튼 이벤트 (순차 처리)
if (generateGuidelineBtn) {
  generateGuidelineBtn.addEventListener("click", async () => {
    // 탭 전환: 3단계로 이동
    if (window.switchWorkflowTab) {
      window.switchWorkflowTab(3);
    }
    
    if (!currentCotData) {
      error.textContent = "CoT 결과가 없습니다. 먼저 문제를 풀어주세요.";
      error.classList.add("show");
      return;
    }

    // CoT 단계가 8개인지 확인
    if (!currentCotData.steps || currentCotData.steps.length !== 8) {
      error.textContent = "CoT 단계가 완성되지 않았습니다. 8개의 단계가 필요합니다.";
      error.classList.add("show");
      return;
    }

    generateGuidelineBtn.disabled = true;
    generateGuidelineBtn.textContent = "수학 영역 매칭 중...";
    loading.classList.add("show");
    error.classList.remove("show");

    try {
      // main_solution은 form에서 가져오기
      const mainSolution = document.getElementById("solution").value || null;

      // 1단계: achievement API로 수학 영역 매칭
      const achievementRequestData = {
        main_problem: currentCotData.problem,
        main_answer: currentCotData.answer,
        main_solution: mainSolution,
        grade: currentCotData.grade,
      };

      generateGuidelineBtn.textContent = "수학 영역 매칭 중...";
      const achievementResponse = await fetch("/api/v1/achievement/match-subject-area", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(achievementRequestData),
      });

      if (!achievementResponse.ok) {
        const errorData = await achievementResponse.json();
        throw new Error(errorData.detail || "수학 영역 매칭 중 오류가 발생했습니다.");
      }

      const achievementData = await achievementResponse.json();
      const matchedSubjectArea = achievementData.subject_area || currentCotData.subject_area;
      const considerations = currentCotData.considerations || [];

      // 2단계: 순차적으로 각 단계 처리 (1-1 ~ 4-2)
      const guideSubQuestions = [];
      const stepOrder = ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"];

      // 진행 상황 초기화
      updateGuidelineProgress(0, stepOrder.length, stepOrder);

      for (let i = 0; i < currentCotData.steps.length; i++) {
        const cotStep = currentCotData.steps[i];
        const stepId = stepOrder[i];

        // 2-1. Guideline으로 하위 문항 생성 (이전 단계들 반영)
        generateGuidelineBtn.textContent = `${stepId} 단계 생성 중...`;
        const previousSubQuestions = guideSubQuestions.slice(); // 현재까지 생성된 문항들 (누적식)

        const guidelineRequestData = {
          main_problem: currentCotData.problem,
          main_answer: currentCotData.answer,
          main_solution: mainSolution,
          grade: currentCotData.grade,
          cot_step: cotStep,
          subject_area: matchedSubjectArea,
          considerations: considerations,
          previous_sub_questions: previousSubQuestions, // 이전 단계들의 question과 answer 반영
        };

        const guidelineResponse = await fetch("/api/v1/guideline/generate-single", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(guidelineRequestData),
        });

        if (!guidelineResponse.ok) {
          const errorData = await guidelineResponse.json();
          throw new Error(`${stepId} 단계 생성 실패: ${errorData.detail || "하위 문항 생성 중 오류가 발생했습니다."}`);
        }

        let subQuestion = (await guidelineResponse.json()).sub_question;

        // 2-2. verifier 실행 (원본 문항에 대해, 자동 재생성 포함하여 2안 생성)
        generateGuidelineBtn.textContent = `${stepId} 단계 verifier 실행 중...`;
        
        const verifyRequestBody = {
          main_problem: currentCotData.problem,
          main_answer: currentCotData.answer,
          main_solution: mainSolution,
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
          subject_area: matchedSubjectArea,
          considerations: considerations,
          sub_question: subQuestion,
          previous_sub_questions: guideSubQuestions.slice(),
          skip_regeneration: false,  // 자동 재생성 수행하여 2안 생성
        };

        const verifyResp = await fetch("/api/v1/verifier/orchestrator/verify-and-regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(verifyRequestBody),
        });

        if (!verifyResp.ok) {
          const errData = await verifyResp.json().catch(() => ({}));
          console.warn(`${stepId} 단계 verifier 실행 실패: ${errData.detail || "verifier 실행 중 오류 발생"}`);
          // verifier 실패 시 원본 문항 사용
        } else {
          const verifyData = await verifyResp.json();
          const verifiedSubQ = verifyData.sub_question || subQuestion;
          const verificationResults = verifyData.verification_results || {};
          
          // verifier 결과를 verification_result에 저장
          if (verificationResults && Object.keys(verificationResults).length > 0) {
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
            verifiedSubQ.verification_result = allFeedbacks.join("\n");
          }
          
          // verifier가 자동으로 재생성한 경우 re_sub_question/re_sub_answer가 설정됨 (2안)
          subQuestion = verifiedSubQ;
          
          generateGuidelineBtn.textContent = `${stepId} 단계 완료`;
        }

        // 생성된 하위 문항 추가
        guideSubQuestions.push(subQuestion);

        // 진행 상황 업데이트
        updateGuidelineProgress(i + 1, stepOrder.length, stepOrder);

        // 진행 상황 화면 업데이트 (부분 업데이트)
        const partialGuidelineData = {
          main_problem: currentCotData.problem,
          main_answer: currentCotData.answer,
          grade: currentCotData.grade,
          subject_area: matchedSubjectArea,
          guide_sub_questions: guideSubQuestions,
        };
        currentGuidelineData = partialGuidelineData;

        // 문제 정보 업데이트 (수학 영역 매칭 결과 표시)
        updateProblemInfo(currentCotData, matchedSubjectArea);

        // 3단계 탭으로 즉시 전환 (1-1 단계부터 결과 확인 가능)
        if (window.switchWorkflowTab) {
          window.switchWorkflowTab(3);
        }

        // 화면 업데이트
        displayGuidelineComparison(currentCotData, partialGuidelineData);
      }

      // 모든 단계 완료
      const finalGuidelineData = {
        main_problem: currentCotData.problem,
        main_answer: currentCotData.answer,
        grade: currentCotData.grade,
        subject_area: matchedSubjectArea,
        guide_sub_questions: guideSubQuestions,
      };
      currentGuidelineData = finalGuidelineData;
      lastGuidelineDataBeforeVerifyFix = null; // 새로 생성 시 비교용 원본 초기화

      // 최종 진행 상황 업데이트 (모두 완료)
      updateGuidelineProgress(stepOrder.length, stepOrder.length, stepOrder);

      // 결과 저장
      const problemId = problemSelect.value ? problemSelect.value.replace(".json", "") : `manual_${Date.now()}`;
      saveResult(problemId, currentCotData, currentSubQData, finalGuidelineData);

      // 최종 화면 업데이트
      displayGuidelineComparison(currentCotData, finalGuidelineData);

      generateGuidelineBtn.textContent = "3단계: Guideline 하위 문항 생성 완료";
    } catch (err) {
      error.textContent = err.message;
      error.classList.add("show");
      generateGuidelineBtn.textContent = "3단계: Guideline 하위 문항 생성하기";
      // 에러 발생 시 진행 상황 숨기기
      const progressContainer = document.getElementById("guidelineProgressContainer");
      if (progressContainer) {
        progressContainer.style.display = "none";
      }
    } finally {
      generateGuidelineBtn.disabled = false;
      loading.classList.remove("show");
    }
  });
}

// 전체 단계 재생성 버튼 이벤트 (CoT 풀이 과정은 그대로 두고 Guideline 하위 문항만 재생성)
const regenerateGuidelineBtnElement = document.getElementById("regenerateGuidelineBtn");
if (regenerateGuidelineBtnElement) {
  regenerateGuidelineBtnElement.addEventListener("click", async () => {
    if (!currentCotData) {
      error.textContent = "CoT 결과가 없습니다. 먼저 문제를 풀어주세요.";
      error.classList.add("show");
      return;
    }

    if (!currentGuidelineData || !currentGuidelineData.guide_sub_questions || currentGuidelineData.guide_sub_questions.length !== 8) {
      error.textContent = "재생성할 Guideline 하위 문항이 없습니다. 먼저 3단계: Guideline 하위 문항을 생성해주세요.";
      error.classList.add("show");
      return;
    }

    // CoT 단계가 8개인지 확인
    if (!currentCotData.steps || currentCotData.steps.length !== 8) {
      error.textContent = "CoT 단계가 완성되지 않았습니다. 8개의 단계가 필요합니다.";
      error.classList.add("show");
      return;
    }

    regenerateGuidelineBtnElement.disabled = true;
    regenerateGuidelineBtnElement.textContent = "전체 단계 재생성 중...";
    loading.classList.add("show");
    error.classList.remove("show");

    try {
      // main_solution은 form에서 가져오기
      const mainSolution = document.getElementById("solution").value || null;

      const matchedSubjectArea = currentGuidelineData.subject_area;
      const considerations = currentCotData.considerations || [];

      // 순차적으로 각 단계 재생성 (1-1 ~ 4-2)
      const guideSubQuestions = [];
      const stepOrder = ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"];

      // 진행 상황 초기화
      updateGuidelineProgress(0, stepOrder.length, stepOrder);

      for (let i = 0; i < currentCotData.steps.length; i++) {
        const cotStep = currentCotData.steps[i];
        const stepId = stepOrder[i];
        const existingSubQ = currentGuidelineData.guide_sub_questions[i];

        // 마지막 verifier 결과 가져오기 (re_verification_result 우선, 없으면 verification_result)
        const hasRegenerated = existingSubQ.re_sub_question || existingSubQ.re_sub_answer;
        const lastVerificationResult = hasRegenerated
          ? (existingSubQ.re_verification_result || existingSubQ.verification_result || "")
          : (existingSubQ.verification_result || "");

        if (!lastVerificationResult) {
          console.warn(`${stepId} 단계: verifier 결과가 없어 재생성을 건너뜁니다.`);
          guideSubQuestions.push(existingSubQ);
          updateGuidelineProgress(i + 1, stepOrder.length, stepOrder);
          continue;
        }

        // verifier 결과를 파싱하여 피드백과 실패한 verifier 추출
        const verificationFeedbacks = [];
        const failingVerifiers = [];
        
        const verifierBlocks = lastVerificationResult.split(/\[(Stage Elicitation|Context Alignment|Answer Validity|Prompt Validity)\]/);
        for (let j = 1; j < verifierBlocks.length; j += 2) {
          const verifierName = verifierBlocks[j];
          const verifierContent = verifierBlocks[j + 1] || "";
          
          const scoreMatch = verifierContent.match(/점수:\s*([0-9.]+|N\/A)/);
          const score = scoreMatch ? (scoreMatch[1] === "N/A" ? null : parseFloat(scoreMatch[1])) : null;
          
          if (score === null || score < 5) {
            const verifierKey = {
              "Stage Elicitation": "stage_elicitation",
              "Context Alignment": "context_alignment",
              "Answer Validity": "answer_validity",
              "Prompt Validity": "prompt_validity"
            }[verifierName];
            
            if (verifierKey) {
              failingVerifiers.push(verifierKey);
              verificationFeedbacks.push(`[${verifierName}] ${verifierContent.trim()}`);
            }
          }
        }

        if (failingVerifiers.length === 0) {
          verificationFeedbacks.push(lastVerificationResult);
          failingVerifiers.push("stage_elicitation", "context_alignment", "answer_validity", "prompt_validity");
        }

        // 사용자가 입력한 피드백 추가
        const userFeedbackEl = document.querySelector(`.guideline-user-feedback[data-subq-id="${stepId}"]`);
        if (userFeedbackEl && userFeedbackEl.value.trim()) {
          verificationFeedbacks.push(`[사용자 피드백] ${userFeedbackEl.value.trim()}`);
        }

        // 원본 문항 결정: 재생성된 문항이 있으면 재생성된 문항을 원본으로 사용
        const originalSubQuestion = hasRegenerated
          ? {
              ...existingSubQ,
              guide_sub_question: existingSubQ.re_sub_question || existingSubQ.guide_sub_question,
              guide_sub_answer: existingSubQ.re_sub_answer || existingSubQ.guide_sub_answer,
              re_sub_question: null,
              re_sub_answer: null,
            }
          : existingSubQ;

        const previousSubQuestions = guideSubQuestions.slice();

        // 1. 재생성 API 호출
        regenerateGuidelineBtnElement.textContent = `${stepId} 단계 재생성 중...`;
        const regenerateRequestBody = {
          main_problem: currentCotData.problem,
          main_answer: currentCotData.answer,
          main_solution: mainSolution,
          grade: currentCotData.grade,
          cot_step: cotStep,
          subject_area: matchedSubjectArea,
          considerations: considerations,
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
          const errorData = await regenerateResp.json().catch(() => ({}));
          throw new Error(`${stepId} 단계 재생성 실패: ${errorData.detail || "재생성 중 오류가 발생했습니다."}`);
        }

        const regenerateData = await regenerateResp.json();
        let regeneratedSubQ = regenerateData.sub_question;

        // 2. 재생성된 문항으로 verifier 실행
        regenerateGuidelineBtnElement.textContent = `${stepId} 단계 검증 중...`;
        const verifyRequestBody = {
          main_problem: currentCotData.problem,
          main_answer: currentCotData.answer,
          main_solution: mainSolution,
          grade: currentCotData.grade,
          cot_step: cotStep,
          subject_area: matchedSubjectArea,
          considerations: considerations,
          sub_question: {
            ...regeneratedSubQ,
            guide_sub_question: regeneratedSubQ.re_sub_question || regeneratedSubQ.guide_sub_question,
            guide_sub_answer: regeneratedSubQ.re_sub_answer || regeneratedSubQ.guide_sub_answer,
          },
          previous_sub_questions: previousSubQuestions,
          skip_regeneration: true,  // 재생성된 문항이 이미 있으므로 재생성 건너뛰기
        };

        const verifyResp = await fetch("/api/v1/verifier/orchestrator/verify-and-regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(verifyRequestBody),
        });

        if (!verifyResp.ok) {
          const errorData = await verifyResp.json().catch(() => ({}));
          console.warn(`${stepId} 단계 검증 실패: ${errorData.detail || "검증 중 오류 발생"}`);
          regeneratedSubQ.verification_result = "검증 중 오류가 발생했습니다.";
        } else {
          const verifyData = await verifyResp.json();
          regeneratedSubQ = verifyData.sub_question;
          const verificationResults = verifyData.verification_results || {};

          // 검증 결과 통합
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

          regeneratedSubQ.re_verification_result = allFeedbacks.join("\n");
          regeneratedSubQ.verification_result = existingSubQ.verification_result || "";  // 원본 검증 결과 유지
        }

        // 원본 문항은 유지하고, 재생성된 문항만 업데이트
        regeneratedSubQ.guide_sub_question = originalSubQuestion.guide_sub_question;
        regeneratedSubQ.guide_sub_answer = originalSubQuestion.guide_sub_answer;

        guideSubQuestions.push(regeneratedSubQ);

        // 진행 상황 업데이트
        updateGuidelineProgress(i + 1, stepOrder.length, stepOrder);

        // 부분 업데이트
        const partialGuidelineData = {
          main_problem: currentCotData.problem,
          main_answer: currentCotData.answer,
          grade: currentCotData.grade,
          subject_area: matchedSubjectArea,
          guide_sub_questions: guideSubQuestions,
        };
        currentGuidelineData = partialGuidelineData;

        // 3단계 탭으로 즉시 전환 (각 단계 완료 시 결과 확인 가능)
        if (window.switchWorkflowTab) {
          window.switchWorkflowTab(3);
        }

        // 화면 업데이트
        displayGuidelineComparison(currentCotData, partialGuidelineData);
      }

      // 모든 단계 완료
      const finalGuidelineData = {
        main_problem: currentCotData.problem,
        main_answer: currentCotData.answer,
        grade: currentCotData.grade,
        subject_area: matchedSubjectArea,
        guide_sub_questions: guideSubQuestions,
      };
      currentGuidelineData = finalGuidelineData;

      // 최종 진행 상황 업데이트
      updateGuidelineProgress(stepOrder.length, stepOrder.length, stepOrder);

      // 결과 저장
      const problemId = problemSelect.value ? problemSelect.value.replace(".json", "") : `manual_${Date.now()}`;
      saveResult(problemId, currentCotData, currentSubQData, finalGuidelineData);

      // 최종 화면 업데이트
      displayGuidelineComparison(currentCotData, finalGuidelineData);

      regenerateGuidelineBtnElement.textContent = "전체 단계 재생성 완료";
    } catch (err) {
      error.textContent = err.message;
      error.classList.add("show");
      regenerateGuidelineBtnElement.textContent = "전체 단계 재생성";
      const progressContainer = document.getElementById("guidelineProgressContainer");
      if (progressContainer) {
        progressContainer.style.display = "none";
      }
    } finally {
      regenerateGuidelineBtnElement.disabled = false;
      loading.classList.remove("show");
    }
  });
}

// 정답 포맷팅 함수: 여러 식이 공백으로 구분되어 있을 때 줄바꿈으로 변환