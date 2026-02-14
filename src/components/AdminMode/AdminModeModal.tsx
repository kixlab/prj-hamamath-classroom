import { useState, useCallback } from "react";
import { useApp } from "../../contexts/AppContext";
import type { CoTStep } from "../../types";
import styles from "./AdminModeModal.module.css";

/* 입력 형식: src/example/ 참고 (ex_problem_input, ex_cot, ex_subQ) */

const PLACEHOLDER_FULL = `{
  "problemId": "admin-1",
  "cotData": { "problem": "...", "answer": "...", "grade": "6학년", "steps": [{ "step_content": "..." }], "main_solution": "..." },
  "guidelineData": { "problem_id": "admin-1", "grade": "6학년", "subject_area": "수와 연산", "guide_sub_questions": [] },
  "rubrics": []
}`;

const PLACEHOLDER_COT = `{
  "problem": "문제 텍스트",
  "grade": "6학년",
  "answer": "정답",
  "main_solution": "모범답안...",
  "steps": [
    { "step_content": "단계 내용 1" },
    { "step_content": "단계 내용 2" }
  ]
}`;

const PLACEHOLDER_GUIDELINE = `{
  "main_problem": "본문 문제",
  "main_answer": "정답",
  "main_solution": "모범답안...",
  "grade": "6학년",
  "finalized_sub_questions": [
    {
      "sub_question_id": "1-1",
      "step_id": 1,
      "sub_skill_id": "1-1",
      "step_name": "문제 이해",
      "sub_skill_name": "핵심 정보 파악하기",
      "final_question": "하위 문항 텍스트",
      "final_answer": "하위 문항 정답"
    }
  ]
}`;

const PLACEHOLDER_RUBRIC = `[
  { "sub_question_id": "1-1", "levels": [{ "level": "상", "score": 2, "description": "..." }] }
]`;

/** ex_cot 형식(steps에 step_content만) → 앱 cotData 형식으로 정규화 */
function normalizeCotData(cot: any): any {
  if (!cot || !Array.isArray(cot.steps)) return cot;
  return {
    ...cot,
    steps: cot.steps.map((s: any, i: number) => ({
      step_number: s.step_number ?? i + 1,
      step_title: s.step_title ?? `단계 ${i + 1}`,
      step_content: s.step_content ?? "",
    })),
  };
}

/** ex_subQ 형식(finalized_sub_questions, final_question/final_answer) → 앱 guidelineData 형식 */
function normalizeGuidelineInput(data: any): any {
  const fq = data?.finalized_sub_questions;
  if (Array.isArray(fq) && fq.length > 0) {
    const guide_sub_questions = fq.map((q: any) => ({
      sub_question_id: q.sub_question_id,
      step_id: q.step_id,
      sub_skill_id: q.sub_skill_id,
      step_name: q.step_name ?? "",
      sub_skill_name: q.sub_skill_name ?? "",
      guide_sub_question: q.guide_sub_question ?? q.final_question ?? "",
      guide_sub_answer: q.guide_sub_answer ?? q.final_answer ?? "",
    }));
    return {
      problemId: data.problemId ?? undefined,
      guidelineData: {
        problem_id: data.guidelineData?.problem_id ?? data.problemId ?? "admin",
        grade: data.grade ?? data.guidelineData?.grade ?? "",
        subject_area: data.guidelineData?.subject_area ?? data.subject_area ?? "",
        guide_sub_questions,
      },
    };
  }
  return data;
}

/** ex_cot 형식(최상위 problem, steps, answer...) → { problemId, cotData } */
function normalizeCotInput(data: any): any {
  if (data?.problem != null && Array.isArray(data?.steps)) {
    return {
      problemId: data.problemId ?? "admin",
      cotData: normalizeCotData({
        problem: data.problem,
        answer: data.answer ?? "",
        grade: data.grade ?? "",
        main_solution: data.main_solution ?? null,
        steps: data.steps,
      }),
    };
  }
  if (data?.cotData) {
    return { ...data, cotData: normalizeCotData(data.cotData) };
  }
  return data;
}

type MainTab = "json" | "form";
type JsonSubTab = "full" | "cot" | "guideline" | "rubric";
type FormSubTab = "cot" | "subq" | "rubric";

interface StepRow {
  step_number: number;
  step_title: string;
  step_content: string;
}

interface SubQRow {
  sub_question_id: string;
  question: string;
  answer: string;
  step_number: number;
  sub_question_number: number;
}

const defaultStep = (n: number): StepRow => ({
  step_number: n,
  step_title: "",
  step_content: "",
});

const defaultSubQ = (n: number): SubQRow => ({
  sub_question_id: `sq-${n}`,
  question: "",
  answer: "",
  step_number: 1,
  sub_question_number: n,
});

interface AdminModeModalProps {
  onClose: () => void;
}

export function AdminModeModal({ onClose }: AdminModeModalProps) {
  const {
    setCurrentProblemId,
    setCurrentCotData,
    setCurrentSubQData,
    setCurrentGuidelineData,
    setCurrentRubrics,
    setFinalizedGuidelineForRubric,
    setPreferredVersion,
    setCurrentStep,
    setError,
  } = useApp();

  const [mainTab, setMainTab] = useState<MainTab>("json");
  const [jsonSubTab, setJsonSubTab] = useState<JsonSubTab>("full");
  const [formSubTab, setFormSubTab] = useState<FormSubTab>("cot");
  const [jsonInput, setJsonInput] = useState("");
  const [jsonCot, setJsonCot] = useState("");
  const [jsonGuideline, setJsonGuideline] = useState("");
  const [jsonRubrics, setJsonRubrics] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // 폼 상태 (안전한 기본값으로 빈 화면 방지)
  const [problemId, setProblemId] = useState("");
  const [problem, setProblem] = useState("");
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState("");
  const [mainSolution, setMainSolution] = useState("");
  const [steps, setSteps] = useState<StepRow[]>([defaultStep(1)]);
  const [guidelineProblemId, setGuidelineProblemId] = useState("");
  const [guidelineGrade, setGuidelineGrade] = useState("");
  const [subjectArea, setSubjectArea] = useState("");
  const [subQs, setSubQs] = useState<SubQRow[]>([defaultSubQ(1)]);
  const [rubricsJson, setRubricsJson] = useState("");

  const applyData = useCallback(
    (data: Record<string, any>) => {
      if (data.problemId != null) setCurrentProblemId(String(data.problemId));
      if (data.cotData != null) setCurrentCotData(data.cotData);
      if (data.subQData != null) setCurrentSubQData(data.subQData);
      if (data.guidelineData != null) setCurrentGuidelineData(data.guidelineData);
      if (data.currentGuidelineData != null) setCurrentGuidelineData(data.currentGuidelineData);
      if (data.rubrics != null) setCurrentRubrics(Array.isArray(data.rubrics) ? data.rubrics : null);
      if (data.finalizedGuidelineForRubric != null) setFinalizedGuidelineForRubric(data.finalizedGuidelineForRubric);
      if (data.preferredVersion != null && typeof setPreferredVersion === "function") setPreferredVersion(data.preferredVersion);

      if (data.rubrics != null && Array.isArray(data.rubrics) && data.rubrics.length > 0) {
        setCurrentStep(4);
      } else if (data.guidelineData != null || data.finalizedGuidelineForRubric != null) {
        setCurrentStep(3);
      } else if (data.cotData != null) {
        setCurrentStep(2);
      }
      setError(null);
      onClose();
    },
    [
      onClose,
      setCurrentProblemId,
      setCurrentCotData,
      setCurrentSubQData,
      setCurrentGuidelineData,
      setCurrentRubrics,
      setFinalizedGuidelineForRubric,
      setPreferredVersion,
      setCurrentStep,
      setError,
    ]
  );

  const handleApplyJson = useCallback(() => {
    setParseError(null);
    let data: Record<string, any> = {};
    try {
      if (jsonSubTab === "full") {
        const raw = jsonInput.trim() || "{}";
        data = JSON.parse(raw);
        if (data.cotData) data.cotData = normalizeCotData(data.cotData);
        if (data.finalized_sub_questions) {
          const norm = normalizeGuidelineInput(data);
          if (norm.guidelineData) data.guidelineData = norm.guidelineData;
        }
      } else if (jsonSubTab === "cot") {
        const raw = jsonCot.trim() || "{}";
        data = normalizeCotInput(JSON.parse(raw));
      } else if (jsonSubTab === "guideline") {
        const raw = jsonGuideline.trim() || "{}";
        data = normalizeGuidelineInput(JSON.parse(raw));
      } else {
        const raw = jsonRubrics.trim();
        if (!raw) {
          setParseError("루브릭 JSON을 입력하세요.");
          return;
        }
        const parsed = JSON.parse(raw);
        data = Array.isArray(parsed) ? { rubrics: parsed } : { rubrics: parsed?.rubrics ?? null };
      }
    } catch (e: unknown) {
      setParseError(e instanceof Error ? e.message : "JSON 형식이 올바르지 않습니다.");
      return;
    }
    try {
      applyData(data);
    } catch (e: unknown) {
      setParseError(e instanceof Error ? e.message : "적용 중 오류가 발생했습니다.");
    }
  }, [jsonSubTab, jsonInput, jsonCot, jsonGuideline, jsonRubrics, applyData]);

  const handleApplyForm = useCallback(() => {
    setFormError(null);
    const pid = problemId.trim() || "admin-form";
    const hasCot = problem.trim() !== "" || answer.trim() !== "" || steps.some((s) => s.step_title.trim() !== "" || s.step_content.trim() !== "");
    const hasGuideline =
      guidelineProblemId.trim() !== "" ||
      guidelineGrade.trim() !== "" ||
      subjectArea.trim() !== "" ||
      subQs.some((q) => q.question.trim() !== "" || q.answer.trim() !== "");

    const cotData = hasCot
      ? {
          problem: problem.trim() || "(문제 없음)",
          answer: answer.trim() || "",
          grade: grade.trim() || "",
          main_solution: mainSolution.trim() || null,
          steps: steps
            .filter((s) => s.step_title.trim() !== "" || s.step_content.trim() !== "")
            .map((s, i) => ({
              step_number: i + 1,
              step_title: s.step_title.trim() || `단계 ${i + 1}`,
              step_content: s.step_content.trim() || "",
            })) as CoTStep[],
        }
      : null;

    const guideSubQuestions = subQs
      .filter((q) => q.question.trim() !== "" || q.answer.trim() !== "")
      .map((q) => ({
        sub_question_id: q.sub_question_id.trim() || `sq-${q.sub_question_number}`,
        guide_sub_question: q.question.trim(),
        guide_sub_answer: q.answer.trim(),
        step_number: q.step_number,
        sub_question_number: q.sub_question_number,
        step_name: "",
        sub_skill_name: "",
      }));

    const guidelineData =
      hasGuideline || guideSubQuestions.length > 0
        ? {
            problem_id: guidelineProblemId.trim() || pid,
            grade: guidelineGrade.trim() || grade.trim() || "",
            subject_area: subjectArea.trim() || "",
            guide_sub_questions: guideSubQuestions,
          }
        : null;

    let rubrics: any[] | null = null;
    const rRaw = rubricsJson.trim();
    if (rRaw) {
      try {
        const parsed = JSON.parse(rRaw);
        rubrics = Array.isArray(parsed) ? parsed : null;
      } catch {
        setFormError("루브릭은 JSON 배열 형식이어야 합니다.");
        return;
      }
    }

    try {
      setCurrentProblemId(pid);
      if (cotData) setCurrentCotData(cotData);
      else setCurrentCotData(null);
      setCurrentSubQData(null);
      if (guidelineData) {
        setCurrentGuidelineData(guidelineData as any);
        setFinalizedGuidelineForRubric(guidelineData);
      } else {
        setCurrentGuidelineData(null);
        setFinalizedGuidelineForRubric(null);
      }
      setCurrentRubrics(rubrics);
      if (rubrics != null && rubrics.length > 0) setCurrentStep(4);
      else if (guidelineData) setCurrentStep(3);
      else if (cotData) setCurrentStep(2);
      else setCurrentStep(1);
      setError(null);
      onClose();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "적용 중 오류가 발생했습니다.");
    }
  }, [
    problemId,
    problem,
    answer,
    grade,
    mainSolution,
    steps,
    guidelineProblemId,
    guidelineGrade,
    subjectArea,
    subQs,
    rubricsJson,
    onClose,
    setCurrentProblemId,
    setCurrentCotData,
    setCurrentSubQData,
    setCurrentGuidelineData,
    setCurrentRubrics,
    setFinalizedGuidelineForRubric,
    setCurrentStep,
    setError,
  ]);

  const addStep = () => setSteps((prev) => [...prev, defaultStep(prev.length + 1)]);
  const removeStep = (i: number) => setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  const updateStep = (i: number, field: keyof StepRow, value: string | number) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));

  const addSubQ = () => setSubQs((prev) => [...prev, defaultSubQ(prev.length + 1)]);
  const removeSubQ = (i: number) => setSubQs((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  const updateSubQ = (i: number, field: keyof SubQRow, value: string | number) =>
    setSubQs((prev) => prev.map((q, idx) => (idx === i ? { ...q, [field]: value } : q)));

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="관리자 모드">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>관리자 모드</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className={styles.tabRow}>
          <button
            type="button"
            className={mainTab === "json" ? styles.tabActive : styles.tab}
            onClick={() => { setMainTab("json"); setParseError(null); setFormError(null); }}
          >
            JSON 입력
          </button>
          <button
            type="button"
            className={mainTab === "form" ? styles.tabActive : styles.tab}
            onClick={() => { setMainTab("form"); setParseError(null); setFormError(null); }}
          >
            폼 입력
          </button>
        </div>

        {mainTab === "json" && (
          <>
            <div className={styles.formSubTabs}>
              <button
                type="button"
                className={jsonSubTab === "full" ? styles.formSubTabActive : styles.formSubTab}
                onClick={() => { setJsonSubTab("full"); setParseError(null); }}
              >
                전체
              </button>
              <button
                type="button"
                className={jsonSubTab === "cot" ? styles.formSubTabActive : styles.formSubTab}
                onClick={() => { setJsonSubTab("cot"); setParseError(null); }}
              >
                문제·CoT
              </button>
              <button
                type="button"
                className={jsonSubTab === "guideline" ? styles.formSubTabActive : styles.formSubTab}
                onClick={() => { setJsonSubTab("guideline"); setParseError(null); }}
              >
                가이드라인
              </button>
              <button
                type="button"
                className={jsonSubTab === "rubric" ? styles.formSubTabActive : styles.formSubTab}
                onClick={() => { setJsonSubTab("rubric"); setParseError(null); }}
              >
                루브릭
              </button>
            </div>
            <p className={styles.hint}>
              {jsonSubTab === "full" && "형식: problemId, cotData, guidelineData, rubrics. cotData.steps는 ex_cot처럼 step_content만 있어도 됨. guidelineData는 ex_subQ의 finalized_sub_questions 형식도 지원."}
              {jsonSubTab === "cot" && "형식: ex_cot.json — problem, grade, answer, main_solution, steps: [{ step_content }]. problemId·cotData 래핑도 가능."}
              {jsonSubTab === "guideline" && "형식: ex_subQ.json — main_problem, main_answer, grade, finalized_sub_questions: [{ sub_question_id, step_id, final_question, final_answer, ... }]."}
              {jsonSubTab === "rubric" && "루브릭 JSON 배열 또는 { rubrics: [] }"}
            </p>
            <div className={styles.body}>
              {jsonSubTab === "full" && (
                <textarea
                  className={styles.textarea}
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder={PLACEHOLDER_FULL}
                  spellCheck={false}
                  rows={14}
                />
              )}
              {jsonSubTab === "cot" && (
                <textarea
                  className={styles.textarea}
                  value={jsonCot}
                  onChange={(e) => setJsonCot(e.target.value)}
                  placeholder={PLACEHOLDER_COT}
                  spellCheck={false}
                  rows={14}
                />
              )}
              {jsonSubTab === "guideline" && (
                <textarea
                  className={styles.textarea}
                  value={jsonGuideline}
                  onChange={(e) => setJsonGuideline(e.target.value)}
                  placeholder={PLACEHOLDER_GUIDELINE}
                  spellCheck={false}
                  rows={14}
                />
              )}
              {jsonSubTab === "rubric" && (
                <textarea
                  className={styles.textarea}
                  value={jsonRubrics}
                  onChange={(e) => setJsonRubrics(e.target.value)}
                  placeholder={PLACEHOLDER_RUBRIC}
                  spellCheck={false}
                  rows={14}
                />
              )}
              {parseError && <div className={styles.parseError}>{parseError}</div>}
            </div>
          </>
        )}

        {mainTab === "form" && (
          <>
            <div className={styles.formSubTabs}>
              <button
                type="button"
                className={formSubTab === "cot" ? styles.formSubTabActive : styles.formSubTab}
                onClick={() => setFormSubTab("cot")}
              >
                문제·CoT
              </button>
              <button
                type="button"
                className={formSubTab === "subq" ? styles.formSubTabActive : styles.formSubTab}
                onClick={() => setFormSubTab("subq")}
              >
                하위문항
              </button>
              <button
                type="button"
                className={formSubTab === "rubric" ? styles.formSubTabActive : styles.formSubTab}
                onClick={() => setFormSubTab("rubric")}
              >
                루브릭
              </button>
            </div>
            <div className={styles.body}>
              <div className={styles.field}>
                <label>문제 ID</label>
                <input type="text" value={problemId} onChange={(e) => setProblemId(e.target.value)} placeholder="예: admin-1 (저장·사이드바 표시용)" className={styles.input} />
              </div>
              {formSubTab === "cot" && (
                <div className={styles.formPanel}>
                  <div className={styles.field}>
                    <label>문제</label>
                    <textarea value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="문제 텍스트" className={styles.input} rows={3} spellCheck={false} />
                  </div>
                  <div className={styles.field}>
                    <label>정답</label>
                    <input type="text" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="정답" className={styles.input} />
                  </div>
                  <div className={styles.field}>
                    <label>학년</label>
                    <input type="text" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="예: 3학년" className={styles.input} />
                  </div>
                  <div className={styles.field}>
                    <label>모범답안</label>
                    <textarea value={mainSolution} onChange={(e) => setMainSolution(e.target.value)} placeholder="모범답안 (선택)" className={styles.input} rows={2} />
                  </div>
                  <div className={styles.field}>
                    <label>CoT 단계</label>
                    {(steps || []).map((s, i) => (
                      <div key={i} className={styles.stepRow}>
                        <span className={styles.stepNum}>{s.step_number}</span>
                        <input
                          type="text"
                          value={s.step_title}
                          onChange={(e) => updateStep(i, "step_title", e.target.value)}
                          placeholder="단계 제목"
                          className={styles.input}
                        />
                        <textarea
                          value={s.step_content}
                          onChange={(e) => updateStep(i, "step_content", e.target.value)}
                          placeholder="단계 내용"
                          className={styles.input}
                          rows={2}
                        />
                        <button type="button" className={styles.smallBtn} onClick={() => removeStep(i)} aria-label="단계 삭제">
                          삭제
                        </button>
                      </div>
                    ))}
                    <button type="button" className={styles.addBtn} onClick={addStep}>
                      + 단계 추가
                    </button>
                  </div>
                </div>
              )}
              {formSubTab === "subq" && (
                <div className={styles.formPanel}>
                  <div className={styles.field}>
                    <label>가이드라인 문제 ID</label>
                    <input type="text" value={guidelineProblemId} onChange={(e) => setGuidelineProblemId(e.target.value)} placeholder="문제 ID와 맞추면 됨" className={styles.input} />
                  </div>
                  <div className={styles.field}>
                    <label>학년</label>
                    <input type="text" value={guidelineGrade} onChange={(e) => setGuidelineGrade(e.target.value)} placeholder="예: 3학년" className={styles.input} />
                  </div>
                  <div className={styles.field}>
                    <label>수학 영역</label>
                    <input type="text" value={subjectArea} onChange={(e) => setSubjectArea(e.target.value)} placeholder="예: 수와 연산" className={styles.input} />
                  </div>
                  <div className={styles.field}>
                    <label>하위문항</label>
                    {(subQs || []).map((q, i) => (
                      <div key={i} className={styles.subQRow}>
                        <input
                          type="text"
                          value={q.sub_question_id}
                          onChange={(e) => updateSubQ(i, "sub_question_id", e.target.value)}
                          placeholder="문항 ID (예: 1-1)"
                          className={styles.input}
                        />
                        <input
                          type="number"
                          value={q.step_number}
                          onChange={(e) => updateSubQ(i, "step_number", parseInt(e.target.value, 10) || 1)}
                          placeholder="단계"
                          className={styles.inputNum}
                        />
                        <input
                          type="number"
                          value={q.sub_question_number}
                          onChange={(e) => updateSubQ(i, "sub_question_number", parseInt(e.target.value, 10) || 1)}
                          placeholder="번호"
                          className={styles.inputNum}
                        />
                        <textarea
                          value={q.question}
                          onChange={(e) => updateSubQ(i, "question", e.target.value)}
                          placeholder="하위 문항"
                          className={styles.input}
                          rows={2}
                        />
                        <textarea
                          value={q.answer}
                          onChange={(e) => updateSubQ(i, "answer", e.target.value)}
                          placeholder="정답"
                          className={styles.input}
                          rows={2}
                        />
                        <button type="button" className={styles.smallBtn} onClick={() => removeSubQ(i)} aria-label="삭제">
                          삭제
                        </button>
                      </div>
                    ))}
                    <button type="button" className={styles.addBtn} onClick={addSubQ}>
                      + 하위문항 추가
                    </button>
                  </div>
                </div>
              )}
              {formSubTab === "rubric" && (
                <div className={styles.formPanel}>
                  <div className={styles.field}>
                    <label>루브릭 (JSON 배열, 선택)</label>
                    <textarea
                      value={rubricsJson}
                      onChange={(e) => setRubricsJson(e.target.value)}
                      placeholder='[{"sub_question_id":"1-1","levels":[...]}]'
                      className={styles.textarea}
                      rows={10}
                      spellCheck={false}
                    />
                  </div>
                </div>
              )}
              {(formError != null && formError !== "") && <div className={styles.parseError}>{formError}</div>}
            </div>
          </>
        )}

        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            닫기
          </button>
          {mainTab === "json" ? (
            <button type="button" className={styles.applyBtn} onClick={handleApplyJson}>
              적용 후 화면에 반영
            </button>
          ) : (
            <button type="button" className={styles.applyBtn} onClick={handleApplyForm}>
              적용 후 화면에 반영
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
