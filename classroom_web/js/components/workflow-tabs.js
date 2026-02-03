// 워크플로우 탭 전환 로직
// 기존 로직은 변경하지 않고, 탭 전환 기능만 추가

/**
 * 탭 전환 함수
 * @param {number} stepNumber - 전환할 단계 번호 (1-4)
 */
function switchWorkflowTab(stepNumber) {
  // 모든 탭 비활성화
  document.querySelectorAll('.workflow-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // 모든 패널 숨기기
  document.querySelectorAll('.workflow-panel').forEach(panel => {
    panel.classList.remove('active');
    panel.style.display = 'none';
  });
  
  // 선택된 탭 활성화
  const selectedTab = document.querySelector(`.workflow-tab[data-step="${stepNumber}"]`);
  if (selectedTab && !selectedTab.classList.contains('disabled')) {
    selectedTab.classList.add('active');
    
    // 해당 패널 표시
    const selectedPanel = document.querySelector(`.workflow-panel[data-step="${stepNumber}"]`);
    if (selectedPanel) {
      selectedPanel.style.display = 'block';
      selectedPanel.classList.add('active');
      
      // 스크롤을 탭 네비게이션으로 이동
      setTimeout(() => {
        selectedPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }
}

/**
 * 워크플로우 진행 상태 업데이트
 * @param {number} currentStep - 현재 진행 중인 단계 (1-4)
 */
function updateWorkflowProgress(currentStep) {
  // 모든 단계를 순회하며 상태 업데이트
  for (let i = 1; i <= 4; i++) {
    const tab = document.querySelector(`.workflow-tab[data-step="${i}"]`);
    const tabCheck = tab?.querySelector('.tab-check');
    
    if (i < currentStep) {
      // 완료된 단계
      tab?.classList.add('completed');
      tab?.classList.remove('active', 'disabled');
      if (tabCheck) tabCheck.style.display = 'inline-block';
    } else if (i === currentStep) {
      // 현재 진행 중인 단계
      tab?.classList.add('active');
      tab?.classList.remove('completed', 'disabled');
      if (tabCheck) tabCheck.style.display = 'none';
    } else {
      // 대기 중인 단계
      tab?.classList.add('disabled');
      tab?.classList.remove('active', 'completed');
      if (tabCheck) tabCheck.style.display = 'none';
    }
  }
  
  // 현재 단계로 자동 전환
  switchWorkflowTab(currentStep);
}

// 탭 클릭 이벤트 리스너
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.workflow-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const stepNumber = parseInt(tab.getAttribute('data-step'));
      if (!tab.classList.contains('disabled')) {
        switchWorkflowTab(stepNumber);
      }
    });
  });
  
  // 초기 상태: 1단계 활성화
  updateWorkflowProgress(1);
});

// 전역 함수로 export
window.switchWorkflowTab = switchWorkflowTab;
window.updateWorkflowProgress = updateWorkflowProgress;
