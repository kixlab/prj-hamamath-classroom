const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function getApiUrl(path: string): string {
  if (path.startsWith('/')) {
    return API_BASE_URL + path;
  }
  return API_BASE_URL + '/' + path;
}

interface CoTCreateData {
  problem_text: string;
  image_url?: string;
}

interface MatchSubjectAreaData {
  main_problem: string;
  main_answer: string;
  main_solution?: string | null;
  grade: string;
}

interface GenerateSubQuestionData {
  main_problem: string;
  main_answer: string;
  main_solution?: string | null;
  grade: string;
  cot_step: {
    step_id: string;
    sub_skill_id: string;
    step_name: string;
    step_name_en?: string;
    sub_skill_name: string;
    step_content: string;
    prompt_used?: string | null;
  };
  subject_area: string;
  considerations?: string[];
  previous_sub_questions?: any[];
}

interface VerifyAndRegenerateData {
  main_problem: string;
  main_answer: string;
  main_solution?: string | null;
  grade: string;
  cot_step: {
    step_id: string | number;
    sub_skill_id: string;
    step_name: string;
    step_name_en?: string;
    sub_skill_name: string;
    step_content: string;
    prompt_used?: string | null;
  };
  subject_area: string;
  considerations?: string[];
  sub_question: {
    guide_sub_question: string;
    guide_sub_answer: string;
    sub_question_id?: string;
    step_id?: string;
    sub_skill_id?: string;
    step_name?: string;
    sub_skill_name?: string;
  };
  previous_sub_questions?: any[];
  skip_regeneration?: boolean;
}

interface GenerateRubricPipelineData {
  main_problem: string;
  main_answer: string;
  grade: string;
  subject_area: string;
  sub_questions: any[];
  variant: 'with_error_types';
}

interface RegenerateRubricSingleData {
  main_problem: string;
  main_answer: string;
  grade: string;
  subject_area?: string;
  sub_question: any;
  current_rubric: Record<string, { score: number; description: string; criteria: string[] }>;
  feedback?: string | null;
  variant?: string;
}

interface ExportWordData {
  grade: string;
  subject_area?: string;
  sub_questions: Array<{
    question: string;
    answer: string;
    step_number: number;
    sub_question_number: number;
  }>;
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
  async getProblem(filename: string) {
    const response = await fetch(getApiUrl(`/api/v1/cot/refined/${filename}`));
    if (!response.ok) {
      throw new Error('문제 데이터를 가져올 수 없습니다.');
    }
    return response.json();
  },

  // CoT 생성
  async createCoT(data: CoTCreateData) {
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
  async matchSubjectArea(data: MatchSubjectAreaData) {
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
  async generateSingleSubQuestion(data: GenerateSubQuestionData) {
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
  async regenerateSingleSubQuestion(data: GenerateSubQuestionData) {
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
  async verifyAndRegenerate(data: VerifyAndRegenerateData) {
    const response = await fetch(getApiUrl('/api/v1/verifier/orchestrator/verify-and-regenerate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // 422 에러의 경우 상세 정보를 로그에 출력
      if (response.status === 422) {
        console.error('422 Validation Error - Full Response:', JSON.stringify(errorData, null, 2));
        console.error('Request Data:', JSON.stringify(data, null, 2));
      }
      // detail이 배열인 경우 (FastAPI validation errors)
      const errorMessage = Array.isArray((errorData as any).detail)
        ? (errorData as any).detail.map((err: any) => `${err.loc?.join('.')}: ${err.msg}`).join(', ')
        : (errorData as any).detail || JSON.stringify(errorData);
      throw new Error(errorMessage);
    }
    return response.json();
  },

  // 결과 저장
  async saveResult(data: any) {
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
  async getResult(problemId: string) {
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

  // 루브릭 파이프라인 생성 (simulation-based)
  async generateRubricPipeline(data: GenerateRubricPipelineData) {
    const response = await fetch(getApiUrl('/api/v1/rubric/pipeline'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = Array.isArray((errorData as any).detail)
        ? (errorData as any).detail.map((err: any) => `${err.loc?.join('.')}: ${err.msg}`).join(', ')
        : (errorData as any).detail || '루브릭 생성 중 오류가 발생했습니다.';
      throw new Error(errorMessage);
    }
    return response.json();
  },

  // 단일 루브릭 재생성 (with optional feedback)
  async regenerateRubricSingle(data: RegenerateRubricSingleData) {
    const response = await fetch(getApiUrl('/api/v1/rubric/regenerate-single'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = Array.isArray((errorData as any).detail)
        ? (errorData as any).detail.map((err: any) => `${err.loc?.join('.')}: ${err.msg}`).join(', ')
        : (errorData as any).detail || '루브릭 재생성 중 오류가 발생했습니다.';
      throw new Error(errorMessage);
    }
    return response.json();
  },

  // Word 파일 다운로드
  async exportWord(data: ExportWordData) {
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
