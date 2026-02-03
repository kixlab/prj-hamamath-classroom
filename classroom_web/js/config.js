// API 베이스 URL 설정
// 환경 변수나 설정에 따라 동적으로 변경 가능
const API_BASE_URL = window.API_BASE_URL || ""; // 빈 문자열이면 상대 경로 사용

// API 엔드포인트 헬퍼 함수
function getApiUrl(path) {
  // path가 이미 /로 시작하면 그대로 사용
  if (path.startsWith("/")) {
    return API_BASE_URL + path;
  }
  return API_BASE_URL + "/" + path;
}

let currentProblemId = null;
let currentCotData = null;
let currentSubQData = null;
let currentGuidelineData = null;
// verifier 수정 전에 원본 Guideline 데이터를 보관 (원본 vs 재생성 비교용)
let lastGuidelineDataBeforeVerifyFix = null;

// 저장된 결과 관리
const STORAGE_KEY = "hamamath_saved_results";
const MAX_SAVED_RESULTS = 50; // 최대 저장 개수 제한
const LAST_PROBLEM_KEY = "hamamath_last_problem_id"; // 마지막으로 작업한 문제 ID
