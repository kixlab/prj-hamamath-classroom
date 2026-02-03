async function loadProblemList() {
  try {
    const response = await fetch(getApiUrl("/api/v1/cot/refined/list"));
    if (!response.ok) {
      console.error("문제 목록을 가져올 수 없습니다.");
      return;
    }
    const files = await response.json();

    // 드롭다운에 옵션 추가
    files.forEach((filename) => {
      const option = document.createElement("option");
      option.value = filename;
      option.textContent = filename.replace(".json", "");
      problemSelect.appendChild(option);
    });

    // UI 디자인 미리보기를 위한 dummy.csv 옵션 추가
    const dummyOption = document.createElement("option");
    dummyOption.value = "__dummy_from_csv__";
    dummyOption.textContent = "[디자인 미리보기] dummy.csv";
    problemSelect.appendChild(dummyOption);
  } catch (err) {
    console.error("문제 목록 로드 중 오류:", err);
  }
}

// 이미지 업로드 기능