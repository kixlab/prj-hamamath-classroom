const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function getApiUrl(path) {
  if (path.startsWith('/')) {
    return API_BASE_URL + path;
  }
  return API_BASE_URL + '/' + path;
}

export const api = {
  // 문제 목록 조회
  async getProblemList() {
    const response = await fetch(getApiUrl('/api/v1/cot/refined/list'));
    if (!response.ok) {
      throw new Error('문제 목록을 가져올 수 없습니다.');
    }
    return response.json();
  },

  // 특정 문제 데이터 조회
  async getProblem(filename) {
    const response = await fetch(getApiUrl(`/api/v1/cot/refined/${filename}`));
    if (!response.ok) {
      throw new Error('문제 데이터를 가져올 수 없습니다.');
    }
    return response.json();
  },

  // CoT 생성
  async createCoT(data) {
    const response = await fetch(getApiUrl('/api/v1/cot/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'CoT 생성 중 오류가 발생했습니다.');
    }
    return response.json();
  },

  // 수학 영역 매칭
  async matchSubjectArea(data) {
    const response = await fetch(getApiUrl('/api/v1/achievement/match-subject-area'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || '수학 영역 매칭 중 오류가 발생했습니다.');
    }
    return response.json();
  },

  // 단일 하위 문항 생성
  async generateSingleSubQuestion(data) {
    const response = await fetch(getApiUrl('/api/v1/guideline/generate-single'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || '하위 문항 생성 중 오류가 발생했습니다.');
    }
    return response.json();
  },

  // 하위 문항 재생성
  async regenerateSingleSubQuestion(data) {
    const response = await fetch(getApiUrl('/api/v1/guideline/regenerate-single'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || '하위 문항 재생성 중 오류가 발생했습니다.');
    }
    return response.json();
  },

  // 검증 및 재생성
  async verifyAndRegenerate(data) {
    const response = await fetch(getApiUrl('/api/v1/verifier/orchestrator/verify-and-regenerate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || '검증 및 재생성 중 오류가 발생했습니다.');
    }
    return response.json();
  },

  // 결과 저장
  async saveResult(data) {
    const response = await fetch(getApiUrl('/api/v1/history/save'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('결과 저장 중 오류가 발생했습니다.');
    }
    return response.json();
  },

  // 결과 불러오기
  async getResult(problemId) {
    const response = await fetch(getApiUrl(`/api/v1/history/${encodeURIComponent(problemId)}`));
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error('결과를 불러오는 중 오류가 발생했습니다.');
    }
    return response.json();
  },

  // 더미 데이터 조회
  async getDummyData() {
    const response = await fetch(getApiUrl('/api/v1/history/dummy'));
    if (!response.ok) {
      throw new Error('더미 데이터를 가져올 수 없습니다.');
    }
    return response.json();
  },

  // Word 파일 다운로드
  async exportWord(data) {
    const response = await fetch(getApiUrl('/api/v1/guideline/export-word'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('워드 파일 생성 중 오류가 발생했습니다.');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `학습지_${data.grade}_${data.subject_area || '수학'}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};
