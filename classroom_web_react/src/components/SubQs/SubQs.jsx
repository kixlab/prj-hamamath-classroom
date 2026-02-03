import { useState, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import { api } from '../../services/api';
import { useMathJax } from '../../hooks/useMathJax';
import { formatQuestion, formatAnswer, formatVerificationResult } from '../../utils/formatting';
import styles from './SubQs.module.css';

export const SubQs = () => {
  const {
    currentCotData,
    currentGuidelineData,
    setCurrentGuidelineData,
    setLoading,
    setError,
    loading,
    error
  } = useApp();
  
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    currentStep: '',
  });
  // 원본 문항 / 재생성 문항 각각에 대한 편집 상태
  const [editingOriginalStates, setEditingOriginalStates] = useState({});
  const [editingRegeneratedStates, setEditingRegeneratedStates] = useState({});
  const [feedbackStates, setFeedbackStates] = useState({});
  const [verificationStates, setVerificationStates] = useState({});
  const containerRef = useMathJax([currentGuidelineData?.guide_sub_questions]);

  // 최종 문항/정답 계산 (원본 + 재생성 + 편집/피드백 결과 반영)
  const getFinalQA = (subQ) => {
    const originalQ = (subQ.guide_sub_question || '').trim();
    const originalA = (subQ.guide_sub_answer || '').trim();
    const reQ = (subQ.re_sub_question || '').trim();
    const reA = (subQ.re_sub_answer || '').trim();

    // 1. 원본/재생성 둘 다 있으면 재생성 우선
    // 2. 피드백/재생성/편집 결과는 이미 re_* 또는 guide_* 에 반영되어 있다고 가정
    const finalQuestion = reQ || originalQ;
    const finalAnswer = reQ ? reA || originalA : originalA;

    return {
      finalQuestion,
      finalAnswer,
    };
  };

  // 전체 문제에 대한 최종 문항/정답을 한 번에 JSON으로 다운로드
  const handleFinalizeAll = () => {
    if (!currentGuidelineData || !currentGuidelineData.guide_sub_questions) {
      return;
    }

    const finalized = currentGuidelineData.guide_sub_questions.map((subQ) => {
      const { finalQuestion, finalAnswer } = getFinalQA(subQ);
      return {
        sub_question_id: subQ.sub_question_id,
        step_id: subQ.step_id,
        sub_skill_id: subQ.sub_skill_id,
        step_name: subQ.step_name,
        sub_skill_name: subQ.sub_skill_name,
        final_question: finalQuestion,
        final_answer: finalAnswer,
      };
    });

    const data = {
      main_problem: currentCotData?.problem ?? null,
      main_answer: currentCotData?.answer ?? null,
      main_solution: currentCotData?.main_solution ?? null,
      grade: currentCotData?.grade ?? null,
      finalized_sub_questions: finalized,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finalized_sub_questions.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 각 단계의 verifier + 재생성은 백그라운드에서 처리
  const runBackgroundVerify = async ({
    cotStep,
    subQuestion,
    matchedSubjectArea,
    considerations,
    previousSubQuestions,
  }) => {
    try {
      const verifyResponse = await api.verifyAndRegenerate({
        main_problem: currentCotData.problem,
        main_answer: currentCotData.answer,
        main_solution: currentCotData.main_solution || null,
        grade: currentCotData.grade,
        cot_step: {
          step_id: cotStep.step_id,
          sub_skill_id: cotStep.sub_skill_id,
          step_name: cotStep.step_name,
          step_name_en: cotStep.step_name_en || '',
          sub_skill_name: cotStep.sub_skill_name,
          step_content: cotStep.step_content,
          prompt_used: cotStep.prompt_used || null,
        },
        subject_area: matchedSubjectArea,
        considerations: considerations,
        sub_question: subQuestion,
        previous_sub_questions: previousSubQuestions,
        skip_regeneration: false,
      });

      let enrichedSubQuestion = { ...subQuestion };

      if (verifyResponse.was_regenerated) {
        const verificationResults = verifyResponse.verification_results || {};
        const verifierNames = {
          stage_elicitation: 'Stage Elicitation',
          context_alignment: 'Context Alignment',
          answer_validity: 'Answer Validity',
          prompt_validity: 'Prompt Validity',
        };

        const allFeedbacks = [];
        for (const [key, result] of Object.entries(verificationResults)) {
          const verifierName = verifierNames[key] || key;
          const scoreStr = result.score !== null ? result.score : 'N/A';
          const evalSummary = result.evaluation_summary || '';
          const improveSuggestions = result.improvement_suggestions || '';
          if (evalSummary || improveSuggestions) {
            allFeedbacks.push(
              `[${verifierName}] 점수: ${scoreStr}\n[평가 요약]\n${evalSummary}\n[개선 제안]\n${improveSuggestions}`
            );
          } else {
            allFeedbacks.push(
              `[${verifierName}] 점수: ${scoreStr}, ${result.feedback || ''}`
            );
          }
        }

        enrichedSubQuestion = {
          ...enrichedSubQuestion,
          re_sub_question: verifyResponse.sub_question.re_sub_question,
          re_sub_answer: verifyResponse.sub_question.re_sub_answer,
          re_verification_result: allFeedbacks.join('\n'),
          verification_result: formatVerificationResult(
            Object.entries(verificationResults)
              .map(([key, result]) => {
                const verifierName = verifierNames[key] || key;
                const scoreStr = result.score !== null ? result.score : 'N/A';
                const evalSummary = result.evaluation_summary || '';
                const improveSuggestions = result.improvement_suggestions || '';
                if (evalSummary || improveSuggestions) {
                  return `[${verifierName}] 점수: ${scoreStr}\n[평가 요약]\n${evalSummary}\n[개선 제안]\n${improveSuggestions}`;
                }
                return `[${verifierName}] 점수: ${scoreStr}, ${result.feedback || ''}`;
              })
              .join('\n')
          ),
        };
      } else {
        // 재생성되지 않은 경우에도 검증 결과 저장
        const verificationResults = verifyResponse.verification_results || {};
        const verifierNames = {
          stage_elicitation: 'Stage Elicitation',
          context_alignment: 'Context Alignment',
          answer_validity: 'Answer Validity',
          prompt_validity: 'Prompt Validity',
        };

        const allFeedbacks = [];
        for (const [key, result] of Object.entries(verificationResults)) {
          const verifierName = verifierNames[key] || key;
          const scoreStr = result.score !== null ? result.score : 'N/A';
          const evalSummary = result.evaluation_summary || '';
          const improveSuggestions = result.improvement_suggestions || '';
          if (evalSummary || improveSuggestions) {
            allFeedbacks.push(
              `[${verifierName}] 점수: ${scoreStr}\n[평가 요약]\n${evalSummary}\n[개선 제안]\n${improveSuggestions}`
            );
          } else {
            allFeedbacks.push(
              `[${verifierName}] 점수: ${scoreStr}, ${result.feedback || ''}`
            );
          }
        }
        enrichedSubQuestion.verification_result = allFeedbacks.join('\n');
      }

      // 해당 sub_question만 상태에 merge
      setCurrentGuidelineData((prev) => {
        if (!prev || !prev.guide_sub_questions) return prev;
        const subQuestions = prev.guide_sub_questions;
        const idx = subQuestions.findIndex(
          (q) => q.sub_question_id === enrichedSubQuestion.sub_question_id
        );
        if (idx === -1) return prev;

        const updatedSubQuestions = [...subQuestions];
        updatedSubQuestions[idx] = {
          ...updatedSubQuestions[idx],
          ...enrichedSubQuestion,
        };

        return {
          ...prev,
          guide_sub_questions: updatedSubQuestions,
        };
      });
    } catch (err) {
      // 백그라운드 오류는 콘솔에만 남기고 UI는 유지
      console.error('하위문항 검증/재생성 중 오류:', err);
    }
  };

  const generateGuideline = async () => {
    if (!currentCotData || !currentCotData.steps) {
      setError('CoT 데이터가 없습니다.');
      return;
    }

    setLoading(true);
    setError(null);
    setProgress({ current: 0, total: 8, currentStep: '초기화 중...' });

    try {
      // 1단계: 수학 영역 매칭
      setProgress({ current: 0, total: 8, currentStep: '수학 영역 매칭 중...' });
      const achievementData = await api.matchSubjectArea({
        main_problem: currentCotData.problem,
        main_answer: currentCotData.answer,
        main_solution: currentCotData.main_solution || null,
        grade: currentCotData.grade,
      });

      const matchedSubjectArea = achievementData.subject_area || currentCotData.subject_area;
      const considerations = currentCotData.considerations || [];

      // 2단계: 각 단계별로 순차 처리 (1-1 ~ 4-2)
      const guideSubQuestions = [];
      const stepOrder = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];

      for (let i = 0; i < currentCotData.steps.length; i++) {
        const cotStep = currentCotData.steps[i];
        const stepId = stepOrder[i];
        
        setProgress({ 
          current: i + 1, 
          total: 8, 
          currentStep: `${stepId} 단계 처리 중...` 
        });

        // 1단계: 하위 문항(원본)만 생성
        const guidelineResponse = await api.generateSingleSubQuestion({
          main_problem: currentCotData.problem,
          main_answer: currentCotData.answer,
          main_solution: currentCotData.main_solution || null,
          grade: currentCotData.grade,
          cot_step: {
            step_id: cotStep.step_id,
            sub_skill_id: cotStep.sub_skill_id,
            step_name: cotStep.step_name,
            step_name_en: cotStep.step_name_en || '',
            sub_skill_name: cotStep.sub_skill_name,
            step_content: cotStep.step_content,
            prompt_used: cotStep.prompt_used || null,
          },
          subject_area: matchedSubjectArea,
          considerations: considerations,
          previous_sub_questions: guideSubQuestions.slice(),
        });

        const subQuestion = guidelineResponse.sub_question;
        const previousSubQuestions = guideSubQuestions.slice();

        // 원본 문항은 즉시 누적해서 화면에 표시
        guideSubQuestions.push(subQuestion);

        // 각 단계가 끝날 때마다 즉시 화면에 반영
        const guidelineData = {
          main_problem: currentCotData.problem,
          main_answer: currentCotData.answer,
          main_solution: currentCotData.main_solution || null,
          grade: currentCotData.grade,
          subject_area: matchedSubjectArea,
          guide_sub_questions: [...guideSubQuestions],
        };

        setCurrentGuidelineData(guidelineData);

        // 검증 + 재생성은 백그라운드에서 병렬로 처리
        runBackgroundVerify({
          cotStep,
          subQuestion,
          matchedSubjectArea,
          considerations,
          previousSubQuestions,
        });
      }

      setProgress({ current: 8, total: 8, currentStep: '완료' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 원본 편집 저장: guide_sub_question / guide_sub_answer 업데이트
  const handleSaveOriginalEdit = (subqId) => {
    const questionEl = document.querySelector(
      `textarea[data-subq-id="${subqId}"][data-type="original-question"]`
    );
    const answerEl = document.querySelector(
      `input[data-subq-id="${subqId}"][data-type="original-answer"]`
    );

    const newQuestion = (questionEl?.value ?? '').trim();
    const newAnswer = (answerEl?.value ?? '').trim();

    setCurrentGuidelineData((prev) => {
      if (!prev || !prev.guide_sub_questions) return prev;
      const updated = prev.guide_sub_questions.map((q) =>
        q.sub_question_id === subqId
          ? {
              ...q,
              guide_sub_question: newQuestion,
              guide_sub_answer: newAnswer,
            }
          : q
      );
      return {
        ...prev,
        guide_sub_questions: updated,
      };
    });

    setEditingOriginalStates((prev) => ({
      ...prev,
      [subqId]: false,
    }));
  };

  // 재생성 편집 저장: re_sub_question / re_sub_answer 업데이트
  const handleSaveRegeneratedEdit = (subqId) => {
    const questionEl = document.querySelector(
      `textarea[data-subq-id="${subqId}"][data-type="regenerated-question"]`
    );
    const answerEl = document.querySelector(
      `input[data-subq-id="${subqId}"][data-type="regenerated-answer"]`
    );

    const newQuestion = (questionEl?.value ?? '').trim();
    const newAnswer = (answerEl?.value ?? '').trim();

    setCurrentGuidelineData((prev) => {
      if (!prev || !prev.guide_sub_questions) return prev;
      const updated = prev.guide_sub_questions.map((q) =>
        q.sub_question_id === subqId
          ? {
              ...q,
              re_sub_question: newQuestion,
              re_sub_answer: newAnswer,
            }
          : q
      );
      return {
        ...prev,
        guide_sub_questions: updated,
      };
    });

    setEditingRegeneratedStates((prev) => ({
      ...prev,
      [subqId]: false,
    }));
  };

  const toggleOriginalEdit = (subqId) => {
    setEditingOriginalStates(prev => ({
      ...prev,
      [subqId]: !prev[subqId]
    }));
  };

  const toggleRegeneratedEdit = (subqId) => {
    setEditingRegeneratedStates(prev => ({
      ...prev,
      [subqId]: !prev[subqId]
    }));
  };

  const toggleFeedback = (subqId) => {
    setFeedbackStates(prev => ({
      ...prev,
      [subqId]: !prev[subqId]
    }));
  };

  const toggleVerification = (subqId) => {
    setVerificationStates(prev => ({
      ...prev,
      [subqId]: !prev[subqId]
    }));
  };

  const handleRegenerateSingle = async (subqId) => {
    if (!currentCotData || !currentGuidelineData) return;

    const subQuestions = currentGuidelineData.guide_sub_questions || [];
    const targetSubQ = subQuestions.find(q => q.sub_question_id === subqId);
    if (!targetSubQ) return;

    const cotSteps = currentCotData.steps || [];
    // sub_question_id (예: '1-1')와 sub_skill_id가 일치하는 step 찾기
    let cotStep = cotSteps.find(s => s.sub_skill_id === subqId);
    if (!cotStep) {
      // 매칭 실패 시 인덱스로 찾기
      const stepOrder = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
      const index = stepOrder.indexOf(subqId);
      if (index >= 0 && index < cotSteps.length) {
        cotStep = cotSteps[index];
      } else {
        setError(`CoT 단계를 찾을 수 없습니다: ${subqId}`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const verifyResponse = await api.verifyAndRegenerate({
        main_problem: currentCotData.problem,
        main_answer: currentCotData.answer,
        main_solution: currentCotData.main_solution || null,
        grade: currentCotData.grade,
        cot_step: {
          step_id: cotStep.step_id,
          sub_skill_id: cotStep.sub_skill_id,
          step_name: cotStep.step_name,
          step_name_en: cotStep.step_name_en || '',
          sub_skill_name: cotStep.sub_skill_name,
          step_content: cotStep.step_content,
          prompt_used: cotStep.prompt_used || null,
        },
        subject_area: currentGuidelineData.subject_area,
        considerations: currentCotData.considerations || [],
        sub_question: targetSubQ,
        previous_sub_questions: subQuestions.filter(q => q.sub_question_id !== subqId),
        skip_regeneration: false,
      });

      // 업데이트된 하위문항으로 교체
      const updatedSubQuestions = subQuestions.map(q => 
        q.sub_question_id === subqId ? verifyResponse.sub_question : q
      );

      setCurrentGuidelineData({
        ...currentGuidelineData,
        guide_sub_questions: updatedSubQuestions
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedbackRegenerate = async (subqId, userFeedback) => {
    if (!currentCotData || !currentGuidelineData) return;

    const subQuestions = currentGuidelineData.guide_sub_questions || [];
    const targetSubQ = subQuestions.find(q => q.sub_question_id === subqId);
    if (!targetSubQ) return;

    const cotSteps = currentCotData.steps || [];
    // sub_question_id (예: '1-1')와 sub_skill_id가 일치하는 step 찾기
    let cotStep = cotSteps.find(s => s.sub_skill_id === subqId);
    if (!cotStep) {
      // 매칭 실패 시 인덱스로 찾기
      const stepOrder = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
      const index = stepOrder.indexOf(subqId);
      if (index >= 0 && index < cotSteps.length) {
        cotStep = cotSteps[index];
      } else {
        setError(`CoT 단계를 찾을 수 없습니다: ${subqId}`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const regenerateResponse = await api.regenerateSingleSubQuestion({
        main_problem: currentCotData.problem,
        main_answer: currentCotData.answer,
        main_solution: currentCotData.main_solution || null,
        grade: currentCotData.grade,
        cot_step: {
          step_id: cotStep.step_id,
          sub_skill_id: cotStep.sub_skill_id,
          step_name: cotStep.step_name,
          step_name_en: cotStep.step_name_en || '',
          sub_skill_name: cotStep.sub_skill_name,
          step_content: cotStep.step_content,
          prompt_used: cotStep.prompt_used || null,
        },
        subject_area: currentGuidelineData.subject_area,
        considerations: currentCotData.considerations || [],
        previous_sub_questions: subQuestions.filter(q => q.sub_question_id !== subqId),
        original_sub_question: targetSubQ,
        verification_feedbacks: [`[사용자 피드백] ${userFeedback}`],
        failing_verifiers: ['stage_elicitation', 'context_alignment', 'answer_validity', 'prompt_validity'],
      });

      // 업데이트된 하위문항으로 교체
      const updatedSubQuestions = subQuestions.map(q => 
        q.sub_question_id === subqId ? regenerateResponse.sub_question : q
      );

      setCurrentGuidelineData({
        ...currentGuidelineData,
        guide_sub_questions: updatedSubQuestions
      });

      // 피드백 입력 모드 닫기
      setFeedbackStates(prev => ({
        ...prev,
        [subqId]: false
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!currentGuidelineData || !currentGuidelineData.guide_sub_questions) {
    return (
      <div className={styles.guidelineContainer}>
        {loading && (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <div>로딩 중...</div>
            {progress.total > 0 && (
              <div className={styles.progress}>
                {progress.currentStep} ({progress.current}/{progress.total})
              </div>
            )}
          </div>
        )}
        {error && <div className={styles.error}>{error}</div>}
        {!loading && !error && (
          <div className={styles.emptyState}>
            <p>하위문항이 생성되지 않았습니다.</p>
            <button className={styles.generateButton} onClick={generateGuideline}>
              하위문항 생성하기
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.guidelineContainer} ref={containerRef}>
      {loading && (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <div>로딩 중...</div>
          {progress.total > 0 && (
            <div className={styles.progress}>
              {progress.currentStep} ({progress.current}/{progress.total})
            </div>
          )}
        </div>
      )}
      {error && <div className={styles.error}>{error}</div>}
      
      <div className={styles.guidelineSubQuestions}>
        {currentGuidelineData.guide_sub_questions.map((subQ) => {
          const hasRegenerated = !!(subQ.re_sub_question && subQ.re_sub_question.trim().length > 0);
          const isOriginalEditing = editingOriginalStates[subQ.sub_question_id];
          const isRegeneratedEditing = editingRegeneratedStates[subQ.sub_question_id];
          const isFeedbackOpen = feedbackStates[subQ.sub_question_id];
          const isVerificationOpen = verificationStates[subQ.sub_question_id];
          
          const originalQuestion = subQ.guide_sub_question || '';
          const originalAnswer = subQ.guide_sub_answer || subQ.sub_answer || '';
          const regeneratedQuestion = subQ.re_sub_question || '';
          const regeneratedAnswer = subQ.re_sub_answer || '';

          return (
            <div key={subQ.sub_question_id} className={styles.subQuestionCard}>
              <div className={styles.subQuestionHeader}>
                <span className={styles.subQuestionId}>{subQ.sub_question_id}</span>
                <span className={styles.subQuestionTitle}>
                  {subQ.step_name} - {subQ.sub_skill_name}
                </span>
              </div>

              <div className={styles.questionSection}>
                {hasRegenerated ? (
                  <>
                    <div className={styles.originalQuestionBox}>
                      <div className={styles.questionLabelRow}>
                        <div className={styles.questionLabel}>원본 문항</div>
                        {!isOriginalEditing && (
                          <button 
                            className={styles.editToggleBtn}
                            onClick={() => toggleOriginalEdit(subQ.sub_question_id)}
                          >
                            편집
                          </button>
                        )}
                      </div>
                      {isOriginalEditing ? (
                        <div className={styles.editMode}>
                          <textarea
                            className={styles.editTextarea}
                            defaultValue={originalQuestion}
                            rows={3}
                            data-subq-id={subQ.sub_question_id}
                            data-type="original-question"
                          />
                          <input
                            type="text"
                            className={styles.editInput}
                            defaultValue={originalAnswer}
                            placeholder="정답을 입력하세요"
                            data-subq-id={subQ.sub_question_id}
                            data-type="original-answer"
                          />
                          <div className={styles.editActions}>
                            <button
                              className={styles.cancelBtn}
                              onClick={() => toggleOriginalEdit(subQ.sub_question_id)}
                            >
                              취소
                            </button>
                            <button
                              className={styles.saveBtn}
                              onClick={() => handleSaveOriginalEdit(subQ.sub_question_id)}
                            >
                              저장
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.displayMode}>
                          <div className={styles.questionContent}>
                            {formatQuestion(originalQuestion)}
                          </div>
                          {originalAnswer && (
                            <div className={styles.answerContent}>
                              <strong>정답:</strong> {formatAnswer(originalAnswer)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={styles.regeneratedQuestionBox}>
                      <div className={styles.questionLabelRow}>
                        <div className={styles.questionLabel}>재생성 문항</div>
                        {!isRegeneratedEditing && (
                          <button 
                            className={styles.editToggleBtn}
                            onClick={() => toggleRegeneratedEdit(subQ.sub_question_id)}
                          >
                            편집
                          </button>
                        )}
                      </div>
                      {isRegeneratedEditing ? (
                        <div className={styles.editMode}>
                          <textarea
                            className={styles.editTextarea}
                            defaultValue={regeneratedQuestion}
                            rows={3}
                            data-subq-id={subQ.sub_question_id}
                            data-type="regenerated-question"
                          />
                          <input
                            type="text"
                            className={styles.editInput}
                            defaultValue={regeneratedAnswer}
                            placeholder="정답을 입력하세요"
                            data-subq-id={subQ.sub_question_id}
                            data-type="regenerated-answer"
                          />
                          <div className={styles.editActions}>
                            <button
                              className={styles.cancelBtn}
                              onClick={() => toggleRegeneratedEdit(subQ.sub_question_id)}
                            >
                              취소
                            </button>
                            <button
                              className={styles.saveBtn}
                              onClick={() => handleSaveRegeneratedEdit(subQ.sub_question_id)}
                            >
                              저장
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.displayMode}>
                          <div className={styles.questionContent}>
                            {formatQuestion(regeneratedQuestion)}
                          </div>
                          {regeneratedAnswer && (
                            <div className={styles.answerContent}>
                              <strong>정답:</strong> {formatAnswer(regeneratedAnswer)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className={styles.originalQuestionBox}>
                    <div className={styles.questionLabelRow}>
                      <div className={styles.questionLabel}>원본 문항</div>
                      {!isOriginalEditing && (
                        <button 
                          className={styles.editToggleBtn}
                          onClick={() => toggleOriginalEdit(subQ.sub_question_id)}
                        >
                          편집
                        </button>
                      )}
                    </div>
                    {isOriginalEditing ? (
                      <div className={styles.editMode}>
                        <textarea
                          className={styles.editTextarea}
                          defaultValue={originalQuestion}
                          rows={3}
                          data-subq-id={subQ.sub_question_id}
                          data-type="original-question"
                        />
                        <input
                          type="text"
                          className={styles.editInput}
                          defaultValue={originalAnswer}
                          placeholder="정답을 입력하세요"
                          data-subq-id={subQ.sub_question_id}
                          data-type="original-answer"
                        />
                        <div className={styles.editActions}>
                          <button
                            className={styles.cancelBtn}
                            onClick={() => toggleOriginalEdit(subQ.sub_question_id)}
                          >
                            취소
                          </button>
                          <button
                            className={styles.saveBtn}
                            onClick={() => handleSaveOriginalEdit(subQ.sub_question_id)}
                          >
                            저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.displayMode}>
                        <div className={styles.questionContent}>
                          {formatQuestion(originalQuestion)}
                        </div>
                        {originalAnswer && (
                          <div className={styles.answerContent}>
                            <strong>정답:</strong> {formatAnswer(originalAnswer)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.actionButtons}>
                <button
                  className={styles.actionBtn}
                  onClick={() => toggleVerification(subQ.sub_question_id)}
                >
                  <span>🔍</span>
                  <span>검증 결과 보기</span>
                </button>
                <button
                  className={styles.actionBtn}
                  onClick={() => toggleFeedback(subQ.sub_question_id)}
                >
                  <span>💬</span>
                  <span>피드백</span>
                </button>
                {isFeedbackOpen && (
                  <button
                    className={styles.regenerateBtn}
                    onClick={() => {
                      const feedbackText = document.querySelector(`.feedback-textarea-${subQ.sub_question_id}`)?.value || '';
                      if (feedbackText.trim()) {
                        handleFeedbackRegenerate(subQ.sub_question_id, feedbackText);
                      }
                    }}
                  >
                    <span>🔄</span>
                    <span>재생성</span>
                  </button>
                )}
                {!isFeedbackOpen && (
                  <button
                    className={styles.regenerateBtn}
                    onClick={() => handleRegenerateSingle(subQ.sub_question_id)}
                  >
                    <span>🔄</span>
                    <span>재생성</span>
                  </button>
                )}
              </div>

              {isFeedbackOpen && (
                <div className={styles.feedbackInput}>
                  <textarea
                    className={`${styles.feedbackTextarea} feedback-textarea-${subQ.sub_question_id}`}
                    rows={3}
                    placeholder="수정 요청사항을 입력하세요."
                  />
                  <div className={styles.feedbackActions}>
                    <button 
                      className={styles.cancelBtn}
                      onClick={() => toggleFeedback(subQ.sub_question_id)}
                    >
                      취소
                    </button>
                    <button 
                      className={styles.submitBtn}
                      onClick={() => {
                        const feedbackText = document.querySelector(`.feedback-textarea-${subQ.sub_question_id}`)?.value || '';
                        if (feedbackText.trim()) {
                          handleFeedbackRegenerate(subQ.sub_question_id, feedbackText);
                        }
                      }}
                    >
                      입력
                    </button>
                  </div>
                </div>
              )}

              {isVerificationOpen && (
                <div className={styles.verificationResult}>
                  {hasRegenerated && (
                    <div className={styles.verificationSection}>
                      <div className={styles.verificationTitle}>원본 문항 검증 결과</div>
                      <div 
                        dangerouslySetInnerHTML={{ 
                          __html: formatVerificationResult(subQ.verification_result) 
                        }}
                      />
                    </div>
                  )}
                  {hasRegenerated && (
                    <div className={styles.verificationSection}>
                      <div className={styles.verificationTitle}>재생성 문항 검증 결과</div>
                      <div 
                        dangerouslySetInnerHTML={{ 
                          __html: formatVerificationResult(subQ.re_verification_result) 
                        }}
                      />
                    </div>
                  )}
                  {!hasRegenerated && (
                    <div 
                      dangerouslySetInnerHTML={{ 
                        __html: formatVerificationResult(subQ.verification_result) 
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.finalizeRow}>
        <button
          className={styles.finalizeBtn}
          onClick={handleFinalizeAll}
        >
          문제 확정하기 (JSON 다운로드)
        </button>
      </div>
    </div>
  );
};
