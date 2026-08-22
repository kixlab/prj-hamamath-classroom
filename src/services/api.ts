import { getHistoryHeaders, getHistoryHeadersWithFallback, encodeUserIdForHeader, encodeForHeader } from "../hooks/useStorage";
import { splitQuestionAndAnswer } from "../utils/formatting";
import { loadWorksheetLogosBase64 } from "../utils/exportPdf";

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
  semester?: string;
  textbook_id?: string;
  use_textbook_rag?: boolean;
  auxiliary_material_ids?: string[];
  image_data?: string | null;
  /** 파이프라인 출력 언어. 기본 ko, 영어 en */
  language?: string;
}

interface MatchSubjectAreaData {
  main_problem: string;
  main_answer: string;
  main_solution?: string | null;
  grade: string;
  language?: string;
}

interface GenerateSubQuestionData {
  main_problem: string;
  main_answer: string;
  main_solution?: string | null;
  grade: string;
  semester?: string;
  textbook_id?: string;
  use_textbook_rag?: boolean;
  auxiliary_material_ids?: string[];
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
  language?: string;
}

interface CoTStepPayload {
  step_id: number;
  sub_skill_id: string;
  step_name: string;
  step_name_en: string;
  sub_skill_name: string;
  step_content: string;
  prompt_used?: string | null;
}

interface RegenerateCotStepData {
  main_problem: string;
  main_answer?: string | null;
  main_solution?: string | null;
  img_description?: string | null;
  image_data?: string | null;
  grade: string;
  target_step: CoTStepPayload;
  previous_steps: CoTStepPayload[];
  user_feedback: string;
  subject_area?: string | null;
  language?: string;
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
  /** Verifier 출력 언어. 기본 ko, 영어 en (백엔드: en/english/eng 허용) */
  language?: string;
}

interface GenerateRubricPipelineData {
  main_problem: string;
  main_answer: string;
  grade: string;
  subject_area: string;
  sub_questions: any[];
  variant: "with_error_types";
  language?: string;
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
  language?: string;
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

export interface TextbookRagConcept {
  id: string;
  page: number;
  unit?: string | null;
  definition: string;
  visual_description?: string | null;
  image_path?: string | null;
  keywords?: string[];
  score?: number | null;
}

export interface TextbookRagPreviewResult {
  query: string;
  textbook_id?: string | null;
  textbook_title?: string | null;
  semester_auto_selected: boolean;
  concepts: TextbookRagConcept[];
  context_text: string;
}

export interface AuxiliaryMaterialItem {
  id: string;
  grade: string;
  title: string;
  filename: string;
  content_type: string;
  chunk_count: number;
  created_at: string;
  has_embeddings: boolean;
}

export interface SubQuestionPromptPreviewResult {
  sub_question_id: string;
  step_name: string;
  sub_skill_name: string;
  system_prompt: string;
  user_prompt: string;
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
  async createCoT(data: CoTCreateData, userId?: string | null) {
    const uid = userId?.trim();
    const response = await fetch(getApiUrl("/api/v1/cot/"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(uid ? encodeUserIdForHeader(uid) : getHistoryHeadersWithFallback(userId)),
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "CoT 생성 중 오류가 발생했습니다.");
    }
    return response.json();
  },

  // CoT 단계 하나만 피드백 반영해 재생성
  async regenerateCotStep(data: RegenerateCotStepData) {
    const response = await fetch(getApiUrl("/api/v1/cot/step/regenerate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "단계 재생성 중 오류가 발생했습니다.");
    }
    return response.json() as Promise<{
      step: CoTStepPayload;
      previous_content: string;
    }>;
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
  async generateSingleSubQuestion(data: GenerateSubQuestionData, userId?: string | null) {
    const uid = userId?.trim();
    const response = await fetch(getApiUrl("/api/v1/sub-question/generate-single"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(uid ? encodeUserIdForHeader(uid) : getHistoryHeadersWithFallback(userId)),
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "하위 문항 생성 중 오류가 발생했습니다.");
    }
    return response.json();
  },

  // 하위 문항 재생성
  async regenerateSingleSubQuestion(data: GenerateSubQuestionData, userId?: string | null) {
    const uid = userId?.trim();
    const response = await fetch(getApiUrl("/api/v1/sub-question/regenerate-single"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(uid ? encodeUserIdForHeader(uid) : getHistoryHeadersWithFallback(userId)),
      },
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
   *   user_id: string;         // 교사/연구 참여자 ID (X-User-Id와 동일하게 사용)
   *   student_id: string;      // 화면에서 선택한 학생 ID
   *   student_name?: string;   // 학생 표시 이름 (선택)
   *   answers: { [sub_question_id: string]: string };
   * }
   */
  async saveStudentAnswers(payload: {
    problem_id: string;
    user_id: string;
    student_id: string;
    student_name?: string;
    answers: Record<string, string>;
  }) {
    const response = await fetch(getApiUrl("/api/v1/student-answers/save"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getHistoryHeadersWithFallback(payload.user_id) },
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

  /** 학생 목록 조회 (다른 브라우저에서 왼쪽 패널 복원용). 404면 빈 목록 반환 */
  async getStudentList(userId?: string | null): Promise<{ students: Array<{ id: string; name: string }>; seq?: number }> {
    const response = await fetch(getApiUrl("/api/v1/student-list"), {
      headers: getHistoryHeadersWithFallback(userId),
    });
    if (response.status === 404) return { students: [], seq: 0 };
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail || "학생 목록을 불러오는 중 오류가 발생했습니다."
      );
    }
    return response.json();
  },

  /** 사용자별 문제 ID 순번 할당 (Firebase user_prefs) */
  async getNextProblemSeq(userId?: string | null): Promise<number> {
    const response = await fetch(getApiUrl("/api/v1/user-prefs/next-problem-seq"), {
      method: "POST",
      headers: getHistoryHeadersWithFallback(userId),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail || "문제 번호를 할당하는 중 오류가 발생했습니다."
      );
    }
    const data = (await response.json()) as { next_seq?: number };
    return data.next_seq ?? 1;
  },

  /** 마지막 작업 문제 ID 저장 */
  async updateUserPrefs(lastProblemId: string, userId?: string | null): Promise<void> {
    const response = await fetch(getApiUrl("/api/v1/user-prefs"), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getHistoryHeadersWithFallback(userId) },
      body: JSON.stringify({ last_problem_id: lastProblemId }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail || "사용자 설정 저장 중 오류가 발생했습니다."
      );
    }
  },

  /** 학생 진단 UI 상태 조회 (Firestore workspace) */
  async getDiagnosisWorkspace(userId?: string | null): Promise<{
    can_diagnose: Record<string, Record<string, boolean>>;
    current_student_id: string | null;
    selected_problem_id: string | null;
    student_problem_summaries: Record<string, Record<string, unknown>>;
  }> {
    const response = await fetch(getApiUrl("/api/v1/diagnosis/workspace"), {
      headers: getHistoryHeadersWithFallback(userId),
    });
    if (response.status === 404) {
      return {
        can_diagnose: {},
        current_student_id: null,
        selected_problem_id: null,
        student_problem_summaries: {},
      };
    }
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail || "진단 상태를 불러오는 중 오류가 발생했습니다."
      );
    }
    return response.json();
  },

  /** 학생 진단 UI 상태 저장 */
  async saveDiagnosisWorkspace(payload: {
    user_id: string;
    can_diagnose: Record<string, Record<string, boolean>>;
    current_student_id?: string | null;
    selected_problem_id?: string | null;
    student_problem_summaries: Record<string, Record<string, unknown>>;
  }): Promise<void> {
    const response = await fetch(getApiUrl("/api/v1/diagnosis/workspace"), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getHistoryHeadersWithFallback(payload.user_id) },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail || "진단 상태를 저장하는 중 오류가 발생했습니다."
      );
    }
  },

  /** 학생 목록 저장 (다른 브라우저에서 복원용). userIdForHeader 있으면 헤더 폴백으로 사용 */
  async saveStudentList(students: Array<{ id: string; name: string }>, userIdForHeader?: string, seq?: number): Promise<void> {
    const body: { students: Array<{ id: string; name: string }>; seq?: number } = { students };
    if (typeof seq === "number") body.seq = seq;
    const response = await fetch(getApiUrl("/api/v1/student-list"), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getHistoryHeadersWithFallback(userIdForHeader) },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail || "학생 목록을 저장하는 중 오류가 발생했습니다."
      );
    }
  },

  /** 저장된 학생 답안 목록 (problem_id, student_id별 최신) — 로그인 아이디별 Firestore/서버 복원용 */
  async getStudentAnswersList(userId?: string | null): Promise<{
    items: Array<{ problem_id: string; student_id: string; student_name?: string; answers: Record<string, string> }>;
  }> {
    const response = await fetch(getApiUrl("/api/v1/student-answers/list"), {
      headers: getHistoryHeadersWithFallback(userId),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail || "저장된 학생 답안 목록을 불러오는 중 오류가 발생했습니다."
      );
    }
    return response.json();
  },

  /** 동일 로그인 id·문제·학생에 해당하는 저장 답안 1건 조회 (없으면 null) */
  async getStudentAnswers(
    problemId: string,
    studentId: string,
    userId?: string | null,
  ): Promise<{ problem_id: string; student_id: string; answers: Record<string, string> } | null> {
    const params = new URLSearchParams({ problem_id: problemId, student_id: studentId });
    const response = await fetch(getApiUrl(`/api/v1/student-answers/get?${params}`), {
      headers: getHistoryHeadersWithFallback(userId),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail || "저장된 학생 답안을 불러오는 중 오류가 발생했습니다."
      );
    }
    return response.json();
  },

  /** 진단 결과 전체 저장 (다른 기기/브라우저에서 복원용)
   * results: { [studentId]: { [problemId]: { [subQuestionId]: { level, reason } } } }
   */
  async saveDiagnosisResults(payload: {
    user_id: string;
    results: Record<string, Record<string, Record<string, { level: string; reason: string }>>>;
  }) {
    const response = await fetch(getApiUrl("/api/v1/diagnosis/results"), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getHistoryHeadersWithFallback(payload.user_id) },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail || "진단 결과를 저장하는 중 오류가 발생했습니다."
      );
    }
    return response.json();
  },

  /** 저장된 진단 결과 조회 (본인) — 다른 브라우저 복원용. userId 있으면 헤더 폴백으로 사용 */
  async getDiagnosisResults(userId?: string): Promise<{
    results: Record<string, Record<string, Record<string, { level: string; reason: string }>>>;
  }> {
    const response = await fetch(getApiUrl("/api/v1/diagnosis/results"), {
      headers: getHistoryHeadersWithFallback(userId),
    });
    if (response.status === 404) return { results: {} };
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail || "진단 결과를 불러오는 중 오류가 발생했습니다."
      );
    }
    return response.json();
  },

  /** 진단 리포트 저장 (학생별) — 다른 브라우저에서 바로 표시용 */
  async saveDiagnosisReport(payload: {
    user_id: string;
    student_id: string;
    report: {
      problem_rows: Array<{
        problem_id: string;
        step_count: number;
        high_count: number;
        mid_count: number;
        low_count: number;
        average_level: "상" | "중" | "하" | "-";
      }>;
      step_rows: Array<{
        display_code: string;
        problem_count: number;
        score_100?: number;
        final_level: string;
        feedback_summary?: string | null;
      }>;
    };
  }) {
    const response = await fetch(getApiUrl("/api/v1/diagnosis/report"), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getHistoryHeadersWithFallback(payload.user_id) },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail || "진단 리포트를 저장하는 중 오류가 발생했습니다."
      );
    }
    return response.json();
  },

  /** 저장된 진단 리포트 조회 (학생별). userId 있으면 헤더 폴백으로 사용 */
  async getDiagnosisReport(
    studentId: string,
    userId?: string
  ): Promise<{
    problem_rows: Array<{
      problem_id: string;
      step_count: number;
      high_count: number;
      mid_count: number;
      low_count: number;
      average_level: "상" | "중" | "하" | "-";
    }>;
    step_rows: Array<{
      display_code: string;
      problem_count: number;
      score_100?: number;
      final_level: string;
      feedback_summary?: string | null;
    }>;
  } | null> {
    const params = new URLSearchParams({ student_id: studentId });
    const response = await fetch(getApiUrl(`/api/v1/diagnosis/report?${params}`), {
      headers: getHistoryHeadersWithFallback(userId),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail || "진단 리포트를 불러오는 중 오류가 발생했습니다."
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
    const { value, encoding } = encodeForHeader(viewUserId);
    const headers: Record<string, string> = { ...getHistoryHeaders(), "X-Admin-View-User": value };
    if (encoding) headers["X-Admin-View-User-Encoding"] = encoding;
    const response = await fetch(getApiUrl("/api/v1/history/list"), { headers });
    if (!response.ok) throw new Error("저장 결과 목록을 불러올 수 없습니다.");
    return response.json();
  },

  /** 현재 로그인한 사용자 자신의 저장 결과 목록 (사이드바 등에서 사용). userId를 넘기면 해당 ID만 조회. */
  async getMyHistoryList(userId?: string): Promise<any[]> {
    const url = getApiUrl("/api/v1/history/list");
    const headers: Record<string, string> = userId?.trim()
      ? encodeUserIdForHeader(userId)
      : getHistoryHeaders();
    let response: Response;
    try {
      response = await fetch(url, {
        credentials: "include",
        headers,
      });
    } catch (err: any) {
      const reason = err?.message || String(err);
      throw new Error(`저장 결과 목록을 불러올 수 없습니다. (${reason}). API 주소 확인: ${url || "비어 있음"}`);
    }
    if (!response.ok) {
      const status = response.status;
      const body = await response.text();
      const detail = body ? body.slice(0, 100) : response.statusText;
      throw new Error(`저장 결과 목록을 불러올 수 없습니다. (HTTP ${status}${detail ? `: ${detail}` : ""})`);
    }
    return response.json();
  },

  /** 관리자: 지정한 유저의 저장 결과 상세 (하위문항·루브릭 포함) */
  async getResultForUser(problemId: string, viewUserId: string): Promise<any> {
    const { value, encoding } = encodeForHeader(viewUserId);
    const headers: Record<string, string> = { ...getHistoryHeaders(), "X-Admin-View-User": value };
    if (encoding) headers["X-Admin-View-User-Encoding"] = encoding;
    const response = await fetch(
      getApiUrl(`/api/v1/history/${encodeURIComponent(problemId)}`),
      { headers }
    );
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error("저장 결과를 불러올 수 없습니다.");
    }
    return response.json();
  },

  /**
   * 문제 이미지에서 발문 텍스트 추출 (Vision).
   * image는 data URL / base64 / 업로드된 이미지 URL 모두 가능.
   * 읽을 발문이 없으면 problem이 빈 문자열로 온다.
   */
  async extractProblemTextFromImage(
    image: string,
    language: string,
    userId?: string | null,
  ): Promise<{ problem: string }> {
    const response = await fetch(getApiUrl("/api/v1/problem-images/extract-text"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getHistoryHeadersWithFallback(userId),
      },
      body: JSON.stringify({ image, language }),
    });
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      let detail = "";
      try {
        detail = (JSON.parse(bodyText) as { detail?: string }).detail || "";
      } catch {
        detail = bodyText.slice(0, 200).trim();
      }
      throw new Error(
        detail
          ? `${detail} (HTTP ${response.status})`
          : `이미지에서 문제를 읽지 못했습니다. (HTTP ${response.status})`,
      );
    }
    return response.json();
  },

  /** 손글씨 이미지에서 하위문항별 답안 인식 (Vision). 결과는 편집 가능하도록 프론트에서 입력칸에 채움 */
  async recognizeHandwrittenAnswers(
    payload: {
      images: string[];
      sub_questions: Array<{
        sub_question_id: string;
        display_code?: string;
        question?: string;
        item_number?: number;
      }>;
      language?: string;
    },
    userId?: string | null
  ): Promise<{ answers: Record<string, string> }> {
    const response = await fetch(getApiUrl("/api/v1/handwritten/recognize"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getHistoryHeadersWithFallback(userId),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      // detail이 없는 응답(프록시 오류·핸들러 밖 예외 등)도 원인을 알 수 있게 상태코드와 본문 일부를 남긴다
      const bodyText = await response.text().catch(() => "");
      let detail = "";
      try {
        detail = (JSON.parse(bodyText) as { detail?: string }).detail || "";
      } catch {
        detail = bodyText.slice(0, 200).trim();
      }
      throw new Error(
        detail
          ? `${detail} (HTTP ${response.status})`
          : `손글씨 답안 인식에 실패했습니다. (HTTP ${response.status})`
      );
    }
    return response.json();
  },

  /** 손글씨 이미지 업로드 (해당 학생·문제, slot 1..MAX_HANDWRITTEN_SLOTS). image는 data URL 또는 base64 문자열. */
  async uploadHandwritten(
    studentId: string,
    studentName: string,
    problemId: string,
    slot: number,
    imageDataUrl: string,
    userId?: string | null
  ): Promise<{ status: string; slot: number }> {
    const response = await fetch(getApiUrl("/api/v1/handwritten/upload"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getHistoryHeadersWithFallback(userId),
      },
      body: JSON.stringify({
        student_id: studentId,
        student_name: studentName,
        problem_id: problemId,
        slot,
        image: imageDataUrl,
      }),
    });
    if (!response.ok) {
      if (response.status === 413) {
        throw new Error(
          "이미지가 너무 커서 서버에서 거부되었습니다. 더 작은 이미지를 선택하거나, 해상도를 낮춘 뒤 다시 시도해 주세요."
        );
      }
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || "이미지 업로드에 실패했습니다.");
    }
    return response.json();
  },

  /**
   * 손글씨 이미지 조회 (해당 학생·문제). 슬롯 순서대로의 data URL 배열을 반환한다.
   * 서버가 아직 배열(slots)을 안 주는 구버전이면 slot1/slot2에서 복원한다.
   * 404면 빈 배열.
   */
  async getHandwritten(
    studentId: string,
    studentName: string,
    problemId: string,
    userId?: string | null
  ): Promise<(string | null)[]> {
    const params = new URLSearchParams({
      student_id: studentId,
      student_name: studentName,
      problem_id: problemId,
    });
    const response = await fetch(getApiUrl(`/api/v1/handwritten?${params}`), {
      headers: getHistoryHeadersWithFallback(userId),
    });
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error("이미지 조회에 실패했습니다.");
    }
    const data = (await response.json()) as {
      slots?: (string | null)[];
      slot1?: string | null;
      slot2?: string | null;
    };
    if (Array.isArray(data.slots)) return data.slots;
    return [data.slot1 ?? null, data.slot2 ?? null];
  },

  /**
   * PDF 답안지 업로드 — 서버가 페이지별 이미지로 쪼개 슬롯에 채운다.
   * 슬롯 수를 넘는 페이지는 저장되지 않고 skippedPages로 알려 준다.
   */
  async uploadHandwrittenPdf(
    studentId: string,
    studentName: string,
    problemId: string,
    pdfDataUrl: string,
    userId?: string | null
  ): Promise<{ savedSlots: number[]; pageCount: number; skippedPages: number }> {
    const response = await fetch(getApiUrl("/api/v1/handwritten/upload-pdf"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getHistoryHeadersWithFallback(userId),
      },
      body: JSON.stringify({
        student_id: studentId,
        student_name: studentName,
        problem_id: problemId,
        pdf: pdfDataUrl,
        start_slot: 1,
      }),
    });
    if (!response.ok) {
      if (response.status === 413) {
        throw new Error("PDF가 너무 커서 서버에서 거부되었습니다. 페이지 수를 줄이거나 해상도를 낮춰 주세요.");
      }
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || "PDF 업로드에 실패했습니다.");
    }
    const data = (await response.json()) as {
      saved_slots?: number[];
      page_count?: number;
      skipped_pages?: number;
    };
    return {
      savedSlots: data.saved_slots ?? [],
      pageCount: data.page_count ?? 0,
      skippedPages: data.skipped_pages ?? 0,
    };
  },

  /** 손글씨 이미지 삭제 (해당 학생·문제, slot 1 또는 2) */
  async deleteHandwritten(
    studentId: string,
    studentName: string,
    problemId: string,
    slot: number,
    userId?: string | null
  ): Promise<{ status: string; deleted: boolean }> {
    const params = new URLSearchParams({
      student_id: studentId,
      student_name: studentName,
      problem_id: problemId,
      slot: String(slot),
    });
    const response = await fetch(getApiUrl(`/api/v1/handwritten?${params}`), {
      method: "DELETE",
      headers: getHistoryHeadersWithFallback(userId),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || "이미지 삭제에 실패했습니다.");
    }
    return response.json();
  },

  /** 문제 ID 변경: 서버의 학생 답안·진단 결과를 old_problem_id → new_problem_id 로 이전 */
  async renameProblemId(
    oldProblemId: string,
    newProblemId: string,
    userId?: string | null
  ): Promise<{ status: string; migrated_student_answers: number; migrated_diagnosis_students: number }> {
    const response = await fetch(getApiUrl("/api/v1/history/migrate-problem-id"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getHistoryHeadersWithFallback(userId),
      },
      body: JSON.stringify({
        old_problem_id: oldProblemId,
        new_problem_id: newProblemId,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || "문제 ID 이전 중 오류가 발생했습니다.");
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
    language?: string;
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

  /** 학생 진단 리포트(문제별/단계별 요약) 생성 */
  async generateStudentDiagnosisReport(payload: {
    student_id: string;
    problem_summaries: Array<{
      problem_id: string;
      levels_by_display_code: Record<string, "상" | "중" | "하">;
      feedback_by_display_code?: Record<string, string>;
    }>;
    language?: string;
  }): Promise<{
    problem_rows: Array<{
      problem_id: string;
      step_count: number;
      high_count: number;
      mid_count: number;
      low_count: number;
      average_level: "상" | "중" | "하" | "-";
    }>;
    step_rows: Array<{
      display_code: string;
      problem_count: number;
      score_100?: number;
      final_level: string;
      feedback_summary?: string | null;
    }>;
  }> {
    const response = await fetch(getApiUrl("/api/v1/reports/student-diagnosis"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getHistoryHeaders() },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { detail?: string }).detail ||
          "학생 진단 리포트를 생성하는 중 오류가 발생했습니다."
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
  async exportWordFromSubQuestion(
    cotData: { problem?: string; answer?: string; main_solution?: string; grade?: string; image_data?: string | null },
    subQuestionData: {
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
    const finalSubQuestions = (subQuestionData.guide_sub_questions || []).map((subQ) => {
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
        ...(() => {
          const { question, answer } = splitQuestionAndAnswer(
            useRegenerated ? reQ : originalQ,
            useRegenerated ? reA || originalA : originalA,
          );
          return { guide_sub_question: question, guide_sub_answer: answer };
        })(),
        re_sub_question: subQ.re_sub_question ?? null,
        re_sub_answer: subQ.re_sub_answer ?? null,
      };
    });
    // 프론트 번들의 로고(단일 소스)를 함께 전송 → 서버가 그대로 삽입 (없으면 서버 assets 폴백)
    const logos = await loadWorksheetLogosBase64();
    const requestData = {
      main_problem: cotData.problem || "",
      main_answer: cotData.answer || "",
      main_solution: cotData.main_solution || null,
      grade: cotData.grade || "",
      subject_area: subQuestionData.subject_area || null,
      problem_id: problemId || null,
      image_data: cotData.image_data || null,
      kaist_logo_base64: logos.kaist,
      kixlab_logo_base64: logos.kixlab,
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

  /** 교과서 RAG가 하위문항 생성에 주입할 컨텍스트 미리보기 */
  async previewTextbookRag(data: {
    main_problem: string;
    grade: string;
    subject_area?: string | null;
    sub_skill_name?: string | null;
    semester?: string | null;
    textbook_id?: string | null;
    top_k?: number;
  }): Promise<TextbookRagPreviewResult> {
    const body: Record<string, unknown> = {
      main_problem: data.main_problem,
      grade: data.grade,
      top_k: data.top_k ?? 3,
    };
    if (data.subject_area?.trim()) body.subject_area = data.subject_area.trim();
    if (data.sub_skill_name?.trim()) body.sub_skill_name = data.sub_skill_name.trim();
    if (data.semester?.trim()) body.semester = data.semester.trim();
    if (data.textbook_id?.trim()) body.textbook_id = data.textbook_id.trim();

    const response = await fetch(getApiUrl("/api/v1/textbook-rag/preview"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as { detail?: string }).detail || "교과서 RAG 조회 중 오류가 발생했습니다.");
    }
    return response.json();
  },

  /** 하위 문항 생성 프롬프트 미리보기 (LLM 호출 없음) */
  async previewSubQuestionPrompt(data: {
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
    subject_area?: string | null;
    considerations?: string[];
    previous_sub_questions?: unknown[];
    semester?: string | null;
    use_textbook_rag?: boolean;
    auxiliary_material_ids?: string[];
    language?: string;
    image_data?: string | null;
  }, userId?: string | null): Promise<SubQuestionPromptPreviewResult> {
    const body: Record<string, unknown> = {
      main_problem: data.main_problem,
      main_answer: data.main_answer,
      grade: data.grade,
      cot_step: data.cot_step,
      use_textbook_rag: data.use_textbook_rag ?? true,
    };
    if (data.main_solution) body.main_solution = data.main_solution;
    if (data.subject_area?.trim()) body.subject_area = data.subject_area.trim();
    if (data.considerations?.length) body.considerations = data.considerations;
    if (data.previous_sub_questions?.length) body.previous_sub_questions = data.previous_sub_questions;
    if (data.semester?.trim()) body.semester = data.semester.trim();
    if (data.language) body.language = data.language;
    if (data.image_data) body.image_data = data.image_data;
    if (data.auxiliary_material_ids?.length) body.auxiliary_material_ids = data.auxiliary_material_ids;

    const response = await fetch(getApiUrl("/api/v1/sub-question/preview-prompt"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(userId?.trim()
          ? encodeUserIdForHeader(userId.trim())
          : getHistoryHeadersWithFallback(userId)),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as { detail?: string }).detail || "프롬프트 미리보기 중 오류가 발생했습니다.");
    }
    return response.json();
  },

  /** 참고 자료(RAG) 목록 — 로그인 사용자별로만 조회 */
  async listAuxiliaryMaterials(
    grade?: string | null,
    userId?: string | null,
  ): Promise<{ items: AuxiliaryMaterialItem[] }> {
    const uid = userId?.trim();
    if (!uid) {
      throw new Error("로그인이 필요합니다. 참고 자료는 아이디별로 관리됩니다.");
    }
    const params = new URLSearchParams();
    if (grade?.trim()) params.set("grade", grade.trim());
    const qs = params.toString();
    const response = await fetch(getApiUrl(`/api/v1/auxiliary-materials${qs ? `?${qs}` : ""}`), {
      headers: encodeUserIdForHeader(uid),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as { detail?: string }).detail || "참고 자료 목록을 불러오지 못했습니다.");
    }
    return response.json();
  },

  /** 참고 자료(RAG) 업로드 — multipart (최대 200MB). 로그인 사용자 폴더에만 저장 */
  async uploadAuxiliaryMaterial(
    payload: {
      file: File;
      grade?: string;
      title?: string;
    },
    userId?: string | null,
  ): Promise<{ item: AuxiliaryMaterialItem }> {
    const uid = userId?.trim();
    if (!uid) {
      throw new Error("로그인이 필요합니다. 참고 자료는 아이디별로 관리됩니다.");
    }
    const maxBytes = 200 * 1024 * 1024;
    if (payload.file.size > maxBytes) {
      throw new Error("파일이 너무 큽니다. 최대 200MB까지 업로드할 수 있습니다.");
    }

    const form = new FormData();
    form.append("file", payload.file, payload.file.name);
    if (payload.grade?.trim()) form.append("grade", payload.grade.trim());
    if (payload.title?.trim()) form.append("title", payload.title.trim());

    const response = await fetch(getApiUrl("/api/v1/auxiliary-materials/upload"), {
      method: "POST",
      headers: {
        // Content-Type은 FormData가 boundary 포함해 자동 설정
        ...encodeUserIdForHeader(uid),
      },
      body: form,
    });
    if (!response.ok) {
      if (response.status === 413) {
        throw new Error(
          "파일이 너무 커서 서버에서 거부되었습니다. 최대 200MB까지 업로드할 수 있습니다.",
        );
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as { detail?: string }).detail || "참고 자료 업로드에 실패했습니다.");
    }
    return response.json();
  },

  /**
   * 문제 이미지 업로드 — Firebase Storage에 저장하고 서빙 URL을 받는다.
   * cot_data.image_data에는 base64 대신 이 URL을 넣어 Firestore 1MiB 한도를 피한다.
   */
  async uploadProblemImage(
    file: File,
    userId?: string | null,
  ): Promise<{ url: string; storage_path: string; filename: string; size: number; content_type: string }> {
    const uid = userId?.trim();
    if (!uid) {
      throw new Error("로그인이 필요합니다.");
    }
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error("이미지가 너무 큽니다. 최대 10MB까지 업로드할 수 있습니다.");
    }

    const form = new FormData();
    form.append("file", file, file.name);

    const response = await fetch(getApiUrl("/api/v1/problem-images/upload"), {
      method: "POST",
      headers: {
        // Content-Type은 FormData가 boundary 포함해 자동 설정
        ...encodeUserIdForHeader(uid),
      },
      body: form,
    });
    if (!response.ok) {
      if (response.status === 413) {
        throw new Error("이미지가 너무 커서 서버에서 거부되었습니다. 최대 10MB.");
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as { detail?: string }).detail || "이미지 업로드에 실패했습니다.");
    }
    return response.json();
  },

  /** 참고 자료(RAG) 삭제 — 본인 자료만 */
  async deleteAuxiliaryMaterial(materialId: string, userId?: string | null): Promise<void> {
    const uid = userId?.trim();
    if (!uid) {
      throw new Error("로그인이 필요합니다. 참고 자료는 아이디별로 관리됩니다.");
    }
    const response = await fetch(getApiUrl(`/api/v1/auxiliary-materials/${encodeURIComponent(materialId)}`), {
      method: "DELETE",
      headers: encodeUserIdForHeader(uid),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as { detail?: string }).detail || "참고 자료 삭제에 실패했습니다.");
    }
  },

  // ── 학생 설문 (5점 리커트) ──────────────────────────────────────────────
  // scope: OVERALL_SURVEY_SCOPE("__overall__") = 학생당 1회 설문, 그 외에는 problem_id별 설문

  /** 해당 교사가 저장한 설문 응답 전체 목록 */
  async listSurveyResponses(userId?: string | null): Promise<SurveyResponseItem[]> {
    const response = await fetch(getApiUrl("/api/v1/survey/list"), {
      headers: getHistoryHeadersWithFallback(userId),
    });
    if (!response.ok) {
      throw new Error("설문 응답을 불러오지 못했습니다.");
    }
    const data = (await response.json()) as { items?: SurveyResponseItem[] };
    return Array.isArray(data.items) ? data.items : [];
  },

  /** 설문 응답 1건 저장 (student_id + scope 당 1건, 덮어쓰기) */
  async saveSurveyResponse(
    payload: {
      student_id: string;
      student_name?: string | null;
      scope: string;
      /** 리커트 응답. 문제별 설문은 빈 객체 */
      responses: Record<string, number | null>;
      /** 주관식·느낀점 자유 서술 */
      reflection?: string;
    },
    userId?: string | null,
  ): Promise<{ status: string; updated_at: string }> {
    const response = await fetch(getApiUrl("/api/v1/survey/save"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getHistoryHeadersWithFallback(userId),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || "설문 응답 저장에 실패했습니다.");
    }
    return response.json();
  },

  /** 설문 응답 1건 삭제 */
  async deleteSurveyResponse(studentId: string, scope: string, userId?: string | null): Promise<void> {
    const params = new URLSearchParams({ student_id: studentId, scope });
    const response = await fetch(getApiUrl(`/api/v1/survey?${params}`), {
      method: "DELETE",
      headers: getHistoryHeadersWithFallback(userId),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || "설문 응답 삭제에 실패했습니다.");
    }
  },

  /**
   * 스캔한 종이에서 응답을 Vision LLM으로 읽어 온다.
   * mode "survey" = 리커트 1~5 + 주관식, "reflection" = 학습지 마지막 느낀점 페이지의 자유 서술만
   */
  async recognizeSurvey(
    payload: {
      images: string[];
      mode?: "survey" | "reflection";
      items: Array<{ id: string; question: string; item_number?: number }>;
      open_question?: string;
      language?: string;
    },
    userId?: string | null,
  ): Promise<{ responses: Record<string, number | null>; reflection: string }> {
    const response = await fetch(getApiUrl("/api/v1/survey/recognize"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getHistoryHeadersWithFallback(userId),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      let detail = "";
      try {
        detail = (JSON.parse(bodyText) as { detail?: string }).detail || "";
      } catch {
        detail = bodyText.slice(0, 200).trim();
      }
      throw new Error(
        detail ? `${detail} (HTTP ${response.status})` : `설문지 인식에 실패했습니다. (HTTP ${response.status})`,
      );
    }
    const data = (await response.json()) as {
      responses?: Record<string, number | null>;
      reflection?: string;
    };
    return { responses: data.responses ?? {}, reflection: data.reflection ?? "" };
  },

  /** 설문지 스캔 이미지 업로드 (slot은 1부터) */
  async uploadSurveyScan(
    studentId: string,
    studentName: string,
    scope: string,
    slot: number,
    imageDataUrl: string,
    userId?: string | null,
  ): Promise<{ status: string; slot: number }> {
    const response = await fetch(getApiUrl("/api/v1/survey/scan/upload"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getHistoryHeadersWithFallback(userId),
      },
      body: JSON.stringify({
        student_id: studentId,
        student_name: studentName,
        scope,
        slot,
        image: imageDataUrl,
      }),
    });
    if (!response.ok) {
      if (response.status === 413) {
        throw new Error("이미지가 너무 커서 서버에서 거부되었습니다. 해상도를 낮춘 뒤 다시 시도해 주세요.");
      }
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || "설문지 업로드에 실패했습니다.");
    }
    return response.json();
  },

  /** 설문지 PDF 업로드 — 서버가 페이지별 이미지로 쪼개 슬롯에 채운다 */
  async uploadSurveyScanPdf(
    studentId: string,
    studentName: string,
    scope: string,
    pdfDataUrl: string,
    userId?: string | null,
  ): Promise<{ savedSlots: number[]; pageCount: number; skippedPages: number }> {
    const response = await fetch(getApiUrl("/api/v1/survey/scan/upload-pdf"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getHistoryHeadersWithFallback(userId),
      },
      body: JSON.stringify({
        student_id: studentId,
        student_name: studentName,
        scope,
        pdf: pdfDataUrl,
      }),
    });
    if (!response.ok) {
      if (response.status === 413) {
        throw new Error("PDF가 너무 커서 서버에서 거부되었습니다. 페이지 수를 줄이거나 해상도를 낮춰 주세요.");
      }
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || "PDF 업로드에 실패했습니다.");
    }
    const data = (await response.json()) as {
      saved_slots?: number[];
      page_count?: number;
      skipped_pages?: number;
    };
    return {
      savedSlots: data.saved_slots ?? [],
      pageCount: data.page_count ?? 0,
      skippedPages: data.skipped_pages ?? 0,
    };
  },

  /** 설문지 스캔 이미지 조회 — 슬롯 순서의 data URL 배열 */
  async getSurveyScans(
    studentId: string,
    studentName: string,
    scope: string,
    userId?: string | null,
  ): Promise<(string | null)[]> {
    const params = new URLSearchParams({
      student_id: studentId,
      student_name: studentName,
      scope,
    });
    const response = await fetch(getApiUrl(`/api/v1/survey/scan?${params}`), {
      headers: getHistoryHeadersWithFallback(userId),
    });
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error("설문지 이미지를 불러오지 못했습니다.");
    }
    const data = (await response.json()) as { slots?: (string | null)[] };
    return Array.isArray(data.slots) ? data.slots : [];
  },

  /** 설문지 스캔 이미지 삭제 */
  async deleteSurveyScan(
    studentId: string,
    studentName: string,
    scope: string,
    slot: number,
    userId?: string | null,
  ): Promise<void> {
    const params = new URLSearchParams({
      student_id: studentId,
      student_name: studentName,
      scope,
      slot: String(slot),
    });
    const response = await fetch(getApiUrl(`/api/v1/survey/scan?${params}`), {
      method: "DELETE",
      headers: getHistoryHeadersWithFallback(userId),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || "설문지 이미지 삭제에 실패했습니다.");
    }
  },
};

/** 서버에 저장된 설문 응답 1건 (student_id + scope 당 1건) */
export interface SurveyResponseItem {
  student_id: string;
  student_name?: string | null;
  /** "__overall__" 이면 학생당 1회 설문, 그 외에는 problem_id */
  scope: string;
  responses: Record<string, number | null>;
  /** 주관식·느낀점 자유 서술 */
  reflection?: string;
  updated_at?: string;
}
