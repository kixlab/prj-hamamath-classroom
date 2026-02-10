import { getHistoryHeaders } from "../hooks/useStorage";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export function getApiUrl(path: string): string {
  if (path.startsWith("/")) {
    return API_BASE_URL + path;
  }
  return API_BASE_URL + "/" + path;
}

interface CoTCreateData {
  main_problem: string;
  main_answer: string;
  main_solution?: string | null;
  grade: string;
  image_data?: string | null;
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
  variant: "with_error_types";
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
    const response = await fetch(getApiUrl("/api/v1/cot/refined/list"));
    if (!response.ok) {
      throw new Error("문제 목록을 가져올 수 없습니다.");
    }
    return response.json();
  },

  // 특정 문제 데이터 조회
  async getProblem(filename: string) {
    const response = await fetch(getApiUrl(`/api/v1/cot/refined/${filename}`));
    if (!response.ok) {
      throw new Error("문제 데이터를 가져올 수 없습니다.");
    }
    return response.json();
  },

  // CoT 생성
  async createCoT(data: CoTCreateData) {
    const response = await fetch(getApiUrl("/api/v1/cot/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "CoT 생성 중 오류가 발생했습니다.");
    }
    return response.json();
  },

  // 수학 영역 매칭
  async matchSubjectArea(data: MatchSubjectAreaData) {
    const response = await fetch(getApiUrl("/api/v1/achievement/match-subject-area"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "수학 영역 매칭 중 오류가 발생했습니다.");
    }
    return response.json();
  },

  // 단일 하위 문항 생성
  async generateSingleSubQuestion(data: GenerateSubQuestionData) {
    const response = await fetch(getApiUrl("/api/v1/guideline/generate-single"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "하위 문항 생성 중 오류가 발생했습니다.");
    }
    return response.json();
  },

  // 하위 문항 재생성
  async regenerateSingleSubQuestion(data: GenerateSubQuestionData) {
    const response = await fetch(getApiUrl("/api/v1/guideline/regenerate-single"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "하위 문항 재생성 중 오류가 발생했습니다.");
    }
    return response.json();
  },

  // 검증 및 재생성
  async verifyAndRegenerate(data: VerifyAndRegenerateData) {
    const response = await fetch(getApiUrl("/api/v1/verifier/orchestrator/verify-and-regenerate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // 422 에러의 경우 상세 정보를 로그에 출력
      if (response.status === 422) {
        console.error("422 Validation Error - Full Response:", JSON.stringify(errorData, null, 2));
        console.error("Request Data:", JSON.stringify(data, null, 2));
      }
      // detail이 배열인 경우 (FastAPI validation errors)
      const errorMessage = Array.isArray((errorData as any).detail)
        ? (errorData as any).detail.map((err: any) => `${err.loc?.join(".")}: ${err.msg}`).join(", ")
        : (errorData as any).detail || JSON.stringify(errorData);
      throw new Error(errorMessage);
    }
    return response.json();
  },

  // 결과 저장
  async saveResult(data: any) {
    const response = await fetch(getApiUrl("/api/v1/history/save"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getHistoryHeaders() },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error("결과 저장 중 오류가 발생했습니다.");
    }
    return response.json();
  },

  /**
   * 학생 진단용: 학생 답안 저장
   * payload 예시:
   * {
   *   problem_id: string;
   *   user_id: string;        // 교사/연구 참여자 ID (X-User-Id와 동일하게 사용)
   *   student_id: string;     // 화면에서 선택한 학생 ID
   *   answers: { [sub_question_id: string]: string };
   * }
   */
  async saveStudentAnswers(payload: {
    problem_id: string;
    user_id: string;
    student_id: string;
    answers: Record<string, string>;
  }) {
    const response = await fetch(getApiUrl("/api/v1/student-answers/save"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getHistoryHeaders() },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail || "학생 답안을 저장하는 중 오류가 발생했습니다."
      );
    }
    return response.json();
  },

  // 결과 불러오기
  async getResult(problemId: string) {
    const response = await fetch(getApiUrl(`/api/v1/history/${encodeURIComponent(problemId)}`), {
      headers: getHistoryHeaders(),
    });
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error("결과를 불러오는 중 오류가 발생했습니다.");
    }
    return response.json();
  },

  /** 관리자: 사용자 ID 목록 (X-User-Id가 관리자일 때만) */
  async getAdminUsers(): Promise<{ user_ids: string[] }> {
    const response = await fetch(getApiUrl("/api/v1/admin/users"), {
      headers: getHistoryHeaders(),
    });
    if (!response.ok) {
      if (response.status === 403) throw new Error("관리자만 조회할 수 있습니다.");
      throw new Error("사용자 목록을 불러올 수 없습니다.");
    }
    return response.json();
  },

  /** 관리자: 지정한 유저의 저장 결과 목록 */
  async getHistoryListForUser(viewUserId: string): Promise<any[]> {
    const response = await fetch(getApiUrl("/api/v1/history/list"), {
      headers: { ...getHistoryHeaders(), "X-Admin-View-User": viewUserId },
    });
    if (!response.ok) throw new Error("저장 결과 목록을 불러올 수 없습니다.");
    return response.json();
  },

  /** 현재 로그인한 사용자 자신의 저장 결과 목록 */
  async getMyHistoryList(): Promise<any[]> {
    const response = await fetch(getApiUrl("/api/v1/history/list"), {
      headers: getHistoryHeaders(),
    });
    if (!response.ok) throw new Error("저장 결과 목록을 불러올 수 없습니다.");
    return response.json();
  },

  /** 관리자: 지정한 유저의 저장 결과 상세 (하위문항·루브릭 포함) */
  async getResultForUser(problemId: string, viewUserId: string): Promise<any> {
    const response = await fetch(
      getApiUrl(`/api/v1/history/${encodeURIComponent(problemId)}`),
      { headers: { ...getHistoryHeaders(), "X-Admin-View-User": viewUserId } }
    );
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error("저장 결과를 불러올 수 없습니다.");
    }
    return response.json();
  },

  // 학생 진단: 학생 답안 상/중/하 채점
  async diagnoseStudentAnswer(payload: {
    problem_id: string;
    sub_question_id: string;
    question: string;
    correct_answer?: string | null;
    rubric: any;
    student_answer: string;
  }): Promise<{ level: "상" | "중" | "하"; reason: string }> {
    const response = await fetch(getApiUrl("/api/v1/diagnosis/grade-answer"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getHistoryHeaders() },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail || "학생 진단 중 오류가 발생했습니다."
      );
    }
    return response.json();
  },

  // 루브릭 파이프라인 생성 (simulation-based)
  async generateRubricPipeline(data: GenerateRubricPipelineData) {
    const response = await fetch(getApiUrl("/api/v1/rubric/pipeline"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = Array.isArray((errorData as any).detail)
        ? (errorData as any).detail.map((err: any) => `${err.loc?.join(".")}: ${err.msg}`).join(", ")
        : (errorData as any).detail || "루브릭 생성 중 오류가 발생했습니다.";
      throw new Error(errorMessage);
    }
    return response.json();
  },

  // 단일 루브릭 재생성 (with optional feedback)
  async regenerateRubricSingle(data: RegenerateRubricSingleData) {
    const response = await fetch(getApiUrl("/api/v1/rubric/regenerate-single"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = Array.isArray((errorData as any).detail)
        ? (errorData as any).detail.map((err: any) => `${err.loc?.join(".")}: ${err.msg}`).join(", ")
        : (errorData as any).detail || "루브릭 재생성 중 오류가 발생했습니다.";
      throw new Error(errorMessage);
    }
    return response.json();
  },

  // Word 파일 다운로드 (간단 스키마)
  async exportWord(data: ExportWordData) {
    const response = await fetch(getApiUrl("/api/v1/word-export/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error("워드 파일 생성 중 오류가 발생했습니다.");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `학습지_${data.grade}_${data.subject_area || "수학"}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  /**
   * 확정된 문제(사용자가 원본/재생성 중 선택한 버전)를 Word로 다운로드
   */
  async exportWordFromGuideline(
    cotData: { problem?: string; answer?: string; main_solution?: string; grade?: string },
    guidelineData: {
      subject_area?: string;
      guide_sub_questions?: Array<{
        sub_question_id: string;
        step_id: string | number;
        sub_skill_id: string;
        step_name: string;
        sub_skill_name: string;
        guide_sub_question: string;
        guide_sub_answer?: string;
        re_sub_question?: string;
        re_sub_answer?: string;
      }>;
    },
    preferredVersion: Record<string, "original" | "regenerated">,
    problemId: string | null,
  ) {
    const finalSubQuestions = (guidelineData.guide_sub_questions || []).map((subQ) => {
      const originalQ = (subQ.guide_sub_question || "").trim();
      const originalA = (subQ.guide_sub_answer || "").trim();
      const reQ = (subQ.re_sub_question || "").trim();
      const reA = (subQ.re_sub_answer || "").trim();
      const chosen = preferredVersion[subQ.sub_question_id];
      const useRegenerated = chosen === "regenerated" && reQ;
      return {
        sub_question_id: subQ.sub_question_id,
        step_id: subQ.step_id,
        sub_skill_id: subQ.sub_skill_id,
        step_name: subQ.step_name,
        sub_skill_name: subQ.sub_skill_name,
        guide_sub_question: useRegenerated ? reQ : originalQ,
        guide_sub_answer: useRegenerated ? reA || originalA : originalA,
        re_sub_question: subQ.re_sub_question ?? null,
        re_sub_answer: subQ.re_sub_answer ?? null,
      };
    });
    const requestData = {
      main_problem: cotData.problem || "",
      main_answer: cotData.answer || "",
      main_solution: cotData.main_solution || null,
      grade: cotData.grade || "",
      subject_area: guidelineData.subject_area || null,
      guide_sub_questions: finalSubQuestions,
    };
    const response = await fetch(getApiUrl("/api/v1/word-export/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestData),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as { detail?: string }).detail || "워드 파일 생성 중 오류가 발생했습니다.");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeProblemId = problemId && typeof problemId === "string" ? problemId.replace(/[/\\:*?"<>|\n\r]+/g, "_").trim() : "";
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = safeProblemId ? `학습지_${safeProblemId}_${dateStr}.docx` : `학습지_${cotData.grade || "수학"}_${dateStr}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};
