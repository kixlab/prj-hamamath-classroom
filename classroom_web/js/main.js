// 메인 진입점 - 모든 모듈 로드 및 초기화

// 모달 관련
const closeModal = document.getElementById("closeModal");
const considerationsModal = document.getElementById("considerationsModal");
const considerationsList = document.getElementById("considerationsList");
const modalTitle = document.getElementById("modalTitle");

// 모달 닫기
if (closeModal) {
  closeModal.onclick = function () {
    considerationsModal.classList.remove("show");
  };
}

if (window) {
  window.onclick = function (event) {
    if (event.target == considerationsModal) {
      considerationsModal.classList.remove("show");
    }
  };
}

// 고려사항 모달 표시 함수
window.showConsiderations = function (area, considerations) {
  const areaNames = {
    수와연산: "수와 연산",
    변화와관계: "변화와 관계",
    도형과측정: "도형과 측정",
    자료와가능성: "자료와 가능성",
  };

  modalTitle.textContent = `${areaNames[area] || area} 영역 고려사항`;
  considerationsList.innerHTML = "";

  if (considerations && considerations.length > 0) {
    considerations.forEach((item, index) => {
      const li = document.createElement("li");
      li.textContent = item;
      considerationsList.appendChild(li);
    });
  } else {
    const li = document.createElement("li");
    li.textContent = "고려사항이 없습니다.";
    considerationsList.appendChild(li);
  }

  considerationsModal.classList.add("show");
};

// 아코디언 섹션 토글 함수
function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.classList.toggle("collapsed");
  }
}

// 전역 함수로 등록
window.toggleSection = toggleSection;

// 페이지 로드 시 문제 목록 로드
loadProblemList();
