// 풀이 과정 패널 토글 기능
const toggleComparisonSolutionBtn = document.getElementById("toggleComparisonSolutionBtn");
const comparisonContainer = document.getElementById("comparisonContainer");

function toggleComparisonSolution() {
  if (comparisonContainer) {
    comparisonContainer.classList.toggle("hide-solution");
  }
}

if (toggleComparisonSolutionBtn && comparisonContainer) {
  toggleComparisonSolutionBtn.addEventListener("click", toggleComparisonSolution);
}

const toggleGuidelineSolutionBtn = document.getElementById("toggleGuidelineSolutionBtn");
const guidelineContainer = document.getElementById("guidelineContainer");

function toggleGuidelineSolution() {
  if (guidelineContainer) {
    guidelineContainer.classList.toggle("hide-solution");
  }
}

if (toggleGuidelineSolutionBtn && guidelineContainer) {
  toggleGuidelineSolutionBtn.addEventListener("click", toggleGuidelineSolution);
}
