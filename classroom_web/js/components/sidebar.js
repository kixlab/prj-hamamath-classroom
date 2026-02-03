// 사이드바 관련 기능
const hamburgerMenuBtn = document.getElementById("hamburgerMenuBtn");
const sidebar = document.getElementById("sidebar");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
const sidebarOverlay = document.getElementById("sidebarOverlay");

// 사이드바 열림/닫힘 상태에 따라 햄버거 버튼 표시/숨김 (전역 함수로 선언)
window.updateHamburgerButtonVisibility = function() {
  if (hamburgerMenuBtn && sidebar) {
    if (sidebar.classList.contains("open")) {
      hamburgerMenuBtn.style.display = "none";
    } else {
      hamburgerMenuBtn.style.display = "block";
    }
  }
};

if (hamburgerMenuBtn) {
  hamburgerMenuBtn.addEventListener("click", () => {
    sidebar.classList.add("open");
    sidebarOverlay.classList.add("show");
    updateHamburgerButtonVisibility();
  });
}

if (sidebarCloseBtn) {
  sidebarCloseBtn.addEventListener("click", () => {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
    updateHamburgerButtonVisibility();
  });
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("show");
    updateHamburgerButtonVisibility();
  });
}

// 초기 상태 설정
updateHamburgerButtonVisibility();
