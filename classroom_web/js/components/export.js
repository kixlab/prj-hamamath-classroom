// 학습지 워드 파일 다운로드 버튼 이벤트
if (exportWordBtn) {
  exportWordBtn.addEventListener("click", async () => {
    if (!currentCotData || !currentGuidelineData) {
      error.textContent = "다운로드할 Guideline 데이터가 없습니다. 먼저 3단계 Guideline 하위 문항을 생성해주세요.";
      error.classList.add("show");
      return;
    }

    exportWordBtn.disabled = true;
    exportWordBtn.textContent = "다운로드 중...";
    error.classList.remove("show");

    try {
      // 최종 버전의 문항 데이터 준비 (재생성 문항이 있으면 재생성 문항 사용, 없으면 원본 문항 사용)
      const finalSubQuestions = currentGuidelineData.guide_sub_questions.map((subQ) => {
        const hasRegenerated = subQ.re_sub_question && subQ.re_sub_question.trim().length > 0;
        return {
          sub_question_id: subQ.sub_question_id,
          step_id: subQ.step_id,
          sub_skill_id: subQ.sub_skill_id,
          step_name: subQ.step_name,
          sub_skill_name: subQ.sub_skill_name,
          guide_sub_question: hasRegenerated ? subQ.re_sub_question : subQ.guide_sub_question,
          guide_sub_answer: hasRegenerated ? (subQ.re_sub_answer || subQ.guide_sub_answer) : subQ.guide_sub_answer,
        };
      });

      const requestData = {
        main_problem: currentCotData.problem,
        main_answer: currentCotData.answer,
        main_solution: currentCotData.main_solution || null,
        grade: currentCotData.grade || "",
        subject_area: currentGuidelineData.subject_area || null,
        guide_sub_questions: finalSubQuestions,
      };

      const response = await fetch("/api/v1/guideline/export-word", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "워드 파일 생성 중 오류가 발생했습니다.");
      }

      // 워드 파일 다운로드
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const problemId = problemSelect.value ? problemSelect.value.replace(".json", "") : "individual";
      link.download = `학습지_${problemId}_${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      error.textContent = err.message;
      error.classList.add("show");
    } finally {
      exportWordBtn.disabled = false;
      exportWordBtn.textContent = "학습지 다운로드";
    }
  });
}
