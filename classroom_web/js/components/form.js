// 폼 처리 및 이미지 업로드
const imageUpload = document.getElementById("imageUpload");
const imagePreview = document.getElementById("imagePreview");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const removeImageBtn = document.getElementById("removeImageBtn");

if (imageUpload) {
  imageUpload.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      // 파일 타입 확인
      if (!file.type.startsWith("image/")) {
        const errorEl = document.getElementById("error");
        if (errorEl) {
          errorEl.textContent = "이미지 파일만 업로드할 수 있습니다.";
          errorEl.classList.add("show");
        }
        imageUpload.value = "";
        return;
      }

      // 파일 크기 확인 (10MB 제한)
      if (file.size > 10 * 1024 * 1024) {
        const errorEl = document.getElementById("error");
        if (errorEl) {
          errorEl.textContent = "이미지 파일 크기는 10MB 이하여야 합니다.";
          errorEl.classList.add("show");
        }
        imageUpload.value = "";
        return;
      }

      // FileReader로 이미지 읽기
      const reader = new FileReader();
      reader.onload = (event) => {
        imagePreview.src = event.target.result;
        imagePreviewContainer.style.display = "block";
        const errorEl = document.getElementById("error");
        if (errorEl) errorEl.classList.remove("show");
      };
      reader.onerror = () => {
        const errorEl = document.getElementById("error");
        if (errorEl) {
          errorEl.textContent = "이미지 파일을 읽는 중 오류가 발생했습니다.";
          errorEl.classList.add("show");
        }
        imageUpload.value = "";
      };
      reader.readAsDataURL(file);
    }
  });
}

if (removeImageBtn) {
  removeImageBtn.addEventListener("click", () => {
    imageUpload.value = "";
    imagePreview.src = "";
    imagePreviewContainer.style.display = "none";
  });
}

// 문제 선택 시 자동 입력
if (problemSelect) {
  problemSelect.addEventListener("change", async (e) => {
    const filename = e.target.value;
    if (!filename) {
      // "직접 입력하기" 선택 시 모든 텍스트 input 필드 초기화
      document.getElementById("problem").value = "";
      document.getElementById("answer").value = "";
      document.getElementById("solution").value = "";
      document.getElementById("imgDescription").value = "";
      document.getElementById("grade").value = "3";
      document.getElementById("imageGroup").style.display = "none";
      document.getElementById("problemImage").src = "";
      const inputCheckIcon = document.getElementById("inputCheckIcon");
      if (inputCheckIcon) inputCheckIcon.style.display = "none";
      document.getElementById("imgDescriptionGroup").style.display = "none";
      // 업로드한 이미지도 초기화
      if (imageUpload) imageUpload.value = "";
      if (imagePreview) imagePreview.src = "";
      if (imagePreviewContainer) imagePreviewContainer.style.display = "none";
      // currentCotData 초기화 (이전 문제의 이미지가 남지 않도록)
      currentCotData = null;
      currentGuidelineData = null;
      currentSubQData = null;
      return;
    }

    // dummy.csv 기반 더미 데이터 선택 시: 백엔드에서 미리 파싱한 JSON 사용
    if (filename === "__dummy_from_csv__") {
      try {
        const resp = await fetch("/api/v1/history/dummy");
        if (!resp.ok) {
          const errorEl = document.getElementById("error");
          if (errorEl) {
            errorEl.textContent = "더미 데이터를 가져올 수 없습니다.";
            errorEl.classList.add("show");
          }
          return;
        }

        const dummy = await resp.json();
        const cotData = dummy.cotData || {};
        const guidelineData = dummy.guidelineData || {};

        // 입력 필드에 자동 입력
        document.getElementById("problem").value = cotData.problem || "";
        document.getElementById("answer").value = cotData.answer || "";
        document.getElementById("solution").value = cotData.solution || "";
        document.getElementById("grade").value = cotData.grade || "3";

        // 이미지/설명은 더미에서 사용하지 않음
        document.getElementById("imageGroup").style.display = "none";
        document.getElementById("problemImage").src = "";
        const inputCheckIcon = document.getElementById("inputCheckIcon");
        if (inputCheckIcon) inputCheckIcon.style.display = "none";

        // 현재 실행 중인 CoT/Guideline 데이터로 설정
        currentCotData = cotData;
        currentGuidelineData = guidelineData;
        currentSubQData = null;

        // 바로 Guideline 비교 뷰로 표시 (CoT + 하위 문항 한 번에 미리보기)
        // displayGuidelineComparison이 전역 함수로 정의되어 있는지 확인
        if (typeof displayGuidelineComparison === "function") {
          displayGuidelineComparison(cotData, guidelineData);
        } else if (typeof window.displayGuidelineComparison === "function") {
          window.displayGuidelineComparison(cotData, guidelineData);
        } else {
          console.error("displayGuidelineComparison 함수를 찾을 수 없습니다.");
          const errorEl = document.getElementById("error");
          if (errorEl) {
            errorEl.textContent = "화면 표시 함수를 찾을 수 없습니다. 페이지를 새로고침해주세요.";
            errorEl.classList.add("show");
          }
        }
      } catch (err) {
        const errorEl = document.getElementById("error");
        if (errorEl) {
          errorEl.textContent = `더미 데이터 로드 중 오류: ${err.message}`;
          errorEl.classList.add("show");
        }
      }
      return;
    }

    try {
      const response = await fetch(`/api/v1/cot/refined/${filename}`);
      if (!response.ok) {
        const errorEl = document.getElementById("error");
        if (errorEl) {
          errorEl.textContent = "문제 데이터를 가져올 수 없습니다.";
          errorEl.classList.add("show");
        }
        return;
      }

      const data = await response.json();

      // 입력 필드에 자동 입력 (LaTeX 이스케이프 처리)
      const unescapeLatex = (text) => {
        if (!text) return "";
        // JSON에서 가져온 이스케이프된 백슬래시를 실제 백슬래시로 변환
        return text.replace(/\\\\/g, "\\");
      };

      document.getElementById("problem").value = unescapeLatex(data.main_problem) || "";
      document.getElementById("answer").value = unescapeLatex(data.main_answer) || "";
      document.getElementById("solution").value = unescapeLatex(data.main_solution) || "";
      document.getElementById("grade").value = data.grade || "3";

      // 이미지가 있는 경우 표시 (모든 문제)
      const imageGroup = document.getElementById("imageGroup");
      const problemImage = document.getElementById("problemImage");
      const inputCheckIcon2 = document.getElementById("inputCheckIcon");
      if (data.has_image && data.image_data) {
        problemImage.src = data.image_data;
        imageGroup.style.display = "block";

        // input으로 사용되는 문제인지 체크 아이콘 표시
        if (data.is_input_required) {
          inputCheckIcon2.style.display = "inline";
        } else {
          inputCheckIcon2.style.display = "none";
        }
      } else {
        imageGroup.style.display = "none";
        problemImage.src = "";
        inputCheckIcon2.style.display = "none";
      }

      // currentCotData 초기화 (새 문제 선택 시 이전 문제의 데이터가 남지 않도록)
      currentCotData = null;
      currentGuidelineData = null;
      currentSubQData = null;
    } catch (err) {
      if (error) {
        error.textContent = `문제 데이터 로드 중 오류: ${err.message}`;
        error.classList.add("show");
      }
    }
  });
}

// 폼 제출 처리
const formElement = document.getElementById("cotForm");
if (formElement) {
  formElement.addEventListener("submit", async (e) => {
    e.preventDefault();

    const problemSelectEl = document.getElementById("problemSelect");
    const selectedId = problemSelectEl ? problemSelectEl.value : "";

    // dummy.csv 선택 시에는 실제 생성 API를 호출하지 않고,
    // 이미 로드된 더미 데이터를 그대로 사용하도록 함.
    if (selectedId === "__dummy_from_csv__") {
      // 이미 change 핸들러에서 화면에 표시되므로 여기서는 아무 것도 하지 않음
      const errorEl = document.getElementById("error");
      if (errorEl) {
        errorEl.textContent = "더미 데이터 모드입니다. 실제 생성을 원하시면 다른 문제 ID를 선택하세요.";
        errorEl.classList.add("show");
      }
      return;
    }

    // UI 초기화
    if (submitBtn) submitBtn.disabled = true;
    const submitBtnFromSidebar = document.getElementById("submitBtnFromSidebar");
    if (submitBtnFromSidebar) submitBtnFromSidebar.disabled = true;
    if (loading) loading.classList.add("show");
    if (error) error.classList.remove("show");
    if (resultSection) resultSection.classList.remove("show");

  const imgDescription = document.getElementById("imgDescription").value || null;

  // 특정 문제만 img_description을 input으로 포함
  const problemId = document.getElementById("problemSelect").value?.replace(".json", "") || "";
  const INPUT_REQUIRED_IDS = ["S3_초등_4_011844", "S3_초등_5_004697", "S3_초등_5_004828", "S3_초등_5_004448", "S3_초등_5_004851", "S3_초등_5_004778", "S3_초등_5_004696", "S3_초등_6_005256", "S3_초등_6_005258", "S3_초등_6_005749", "S3_초등_6_005943"];
  const isInputRequired = INPUT_REQUIRED_IDS.includes(problemId);

  // 이미지 데이터 가져오기
  let imageData = null;
  // 1. 사용자가 직접 업로드한 이미지 우선 확인
  const imagePreview = document.getElementById("imagePreview");
  if (imagePreview && imagePreview.src && imagePreview.src.startsWith("data:image")) {
    imageData = imagePreview.src;
  }
  // 2. 특정 문제의 이미지 확인 (input이 필요한 문제인 경우)
  else if (isInputRequired) {
    const problemImage = document.getElementById("problemImage");
    if (problemImage && problemImage.src && problemImage.src.startsWith("data:image")) {
      imageData = problemImage.src;
    }
  }

  // 필수 필드 검증
  const problem = document.getElementById("problem").value.trim();
  const grade = document.getElementById("grade").value;
  
  if (!problem) {
    const errorEl = document.getElementById("error");
    if (errorEl) {
      errorEl.textContent = "문제를 입력해주세요.";
      errorEl.classList.add("show");
    }
    if (submitBtn) submitBtn.disabled = false;
    if (submitBtnFromSidebar) submitBtnFromSidebar.disabled = false;
    if (loading) loading.classList.remove("show");
    return;
  }
  
  if (!grade) {
    const errorEl = document.getElementById("error");
    if (errorEl) {
      errorEl.textContent = "학년을 선택해주세요.";
      errorEl.classList.add("show");
    }
    if (submitBtn) submitBtn.disabled = false;
    if (submitBtnFromSidebar) submitBtnFromSidebar.disabled = false;
    if (loading) loading.classList.remove("show");
    return;
  }

  const formData = {
    main_problem: problem,
    main_answer: document.getElementById("answer").value.trim() || null,
    main_solution: document.getElementById("solution").value.trim() || null,
    grade: grade,
    img_description: isInputRequired ? imgDescription : null,
    image_data: imageData,
  };

  try {
    const response = await fetch("/api/v1/cot/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "문제 풀이 중 오류가 발생했습니다.");
    }

    const data = await response.json();
    // img_description, image_data, main_solution을 currentCotData에 저장
    const imgDescription = document.getElementById("imgDescription").value || null;
    const mainSolution = document.getElementById("solution").value || null;
    const imageData = formData.image_data || null;
    currentCotData = { ...data, img_description: imgDescription, image_data: imageData, main_solution: mainSolution };

    // 결과 저장
    const problemId = problemSelect.value ? problemSelect.value.replace(".json", "") : `manual_${Date.now()}`;
    saveResult(problemId, currentCotData, null, null);

    displayResult(data);
  } catch (err) {
    if (error) {
      error.textContent = err.message;
      error.classList.add("show");
    } else {
      console.error("문제 풀이 중 오류:", err);
      alert(`오류가 발생했습니다: ${err.message}`);
    }
  } finally {
    const activeSubmitBtn = submitBtn || submitBtnFromSidebar;
    if (activeSubmitBtn) activeSubmitBtn.disabled = false;
    if (loading) loading.classList.remove("show");
  }
  });
}

// 입력 영역 토글 버튼
if (toggleFormBtn && formSection) {
  toggleFormBtn.addEventListener("click", () => {
    formSection.classList.toggle("hidden");
    toggleFormBtn.textContent = formSection.classList.contains("hidden") ? "입력 영역 보기" : "입력 영역 숨기기";
  });
}
