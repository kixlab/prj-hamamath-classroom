import { useState, ChangeEvent, FormEvent } from "react";
import { useApp } from "../../contexts/AppContext";
import { saveResult } from "../../hooks/useStorage";
import { api } from "../../services/api";
import { logUserEvent } from "../../services/eventLogger";
import { AdminModeModal } from "../AdminMode/AdminModeModal";
import styles from "./ProblemInput.module.css";
import example1Data from "../../../data/example1.json";
import example1Image from "../../../data/example1.png";
import example2Data from "../../../data/example2.json";
import example2Image from "../../../data/example2.png";

/** data/*.json 로컬 로드용 (문제 불러오기·폼 채우기) */
const dataJsonGlob = import.meta.glob<{ default: Record<string, unknown> }>("../../../data/*.json");

/** 드롭다운에 표시할 문제: example1, example2, num1~num5 만 */
const DROPDOWN_OPTIONS = ["num1.json", "num2.json", "num3.json", "num4.json", "num5.json"] as const;
const isNum1To5 = (v: string) => DROPDOWN_OPTIONS.includes(v as any);

/** _cot.json 형식(steps에 step_content만) → 앱 CoTData 형식 */
function normalizeCotFromFile(cot: Record<string, unknown>): Record<string, unknown> {
  const steps = cot.steps as Array<{ step_content?: string; step_number?: number; step_title?: string }> | undefined;
  if (!Array.isArray(steps)) return cot;
  return {
    ...cot,
    steps: steps.map((s, i) => ({
      step_number: s.step_number ?? i + 1,
      step_title: s.step_title ?? `단계 ${i + 1}`,
      step_content: s.step_content ?? "",
    })),
  };
}

/** _suqQ.json 형식(finalized_sub_questions, final_question/final_answer) → 앱 guidelineData 형식 */
function guidelineFromSubQFile(data: Record<string, unknown>, problemId: string): Record<string, unknown> {
  const fq = data.finalized_sub_questions as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(fq) || fq.length === 0) return { problem_id: problemId, grade: "", subject_area: "", guide_sub_questions: [] };
  const guide_sub_questions = fq.map((q: Record<string, unknown>) => ({
    sub_question_id: q.sub_question_id,
    step_id: q.step_id,
    sub_skill_id: q.sub_skill_id,
    step_name: q.step_name ?? "",
    sub_skill_name: q.sub_skill_name ?? "",
    guide_sub_question: q.guide_sub_question ?? q.final_question ?? "",
    guide_sub_answer: q.guide_sub_answer ?? q.final_answer ?? "",
  }));
  return {
    problem_id: problemId,
    grade: (data.grade as string) ?? "",
    subject_area: (data as any).subject_area ?? "",
    guide_sub_questions,
  };
}

const PROBLEM_SEQ_KEY = "hamamath_problem_seq";

/** 문제 ID를 입력하지 않았을 때 사용할 순차 번호 반환 (1, 2, 3, ...) */
function getNextProblemSeq(): string {
  try {
    const raw = localStorage.getItem(PROBLEM_SEQ_KEY);
    const next = (raw ? parseInt(raw, 10) : 0) + 1;
    if (!Number.isFinite(next)) {
      localStorage.setItem(PROBLEM_SEQ_KEY, "1");
      return "1";
    }
    localStorage.setItem(PROBLEM_SEQ_KEY, String(next));
    return String(next);
  } catch {
    return String(Date.now());
  }
}

interface ProblemInputProps {
  onSubmit?: (data: any) => void;
}

interface FormData {
  problem: string;
  answer: string;
  solution: string;
  grade: string;
  image: File | null;
  imagePreview: string | null;
  imageData: string | null;
  imgDescription: string;
}

export const ProblemInput = ({ onSubmit }: ProblemInputProps) => {
  const { setCurrentCotData, setCurrentGuidelineData, setCurrentStep, setLoading, setError, setCurrentProblemId } = useApp();
  const [problemList, setProblemList] = useState<string[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<string>("");
  /** 직접 입력하기 선택 시 사용자가 입력하는 문제 ID (예: filename.json) */
  const [customProblemId, setCustomProblemId] = useState<string>("");
  const [formData, setFormData] = useState<FormData>({
    problem: "",
    answer: "",
    solution: "",
    grade: "",
    image: null,
    imagePreview: null,
    imageData: null,
    imgDescription: "",
  });
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [loadLocalLoading, setLoadLocalLoading] = useState(false);

  /** num1~5 중 하나 선택 시 "문제 불러오기" 버튼 활성화 */
  const canLoadLocal = !!(selectedProblem && isNum1To5(selectedProblem));

  /** 문제 불러오기: 파이프라인 없이 로컬 _cot.json + _suqQ.json 로드 후 2·3단계 탭 채움 */
  const handleLoadLocal = async () => {
    if (!canLoadLocal) return;
    const base = selectedProblem!.replace(/\.json$/i, "");
    const cotKey = Object.keys(dataJsonGlob).find((k) => k.endsWith(`${base}_cot.json`));
    const subQKey = Object.keys(dataJsonGlob).find((k) => k.endsWith(`${base}_suqQ.json`));
    if (!cotKey || !subQKey) {
      setError(`해당 문제의 ${base}_cot.json 또는 ${base}_suqQ.json 파일이 data/에 없습니다.`);
      return;
    }
    setLoadLocalLoading(true);
    setError(null);
    try {
      const [cotMod, subQMod] = await Promise.all([dataJsonGlob[cotKey](), dataJsonGlob[subQKey]()]);
      const cotRaw = (cotMod as any).default as Record<string, unknown>;
      const subQRaw = (subQMod as any).default as Record<string, unknown>;
      const cotData = normalizeCotFromFile(cotRaw) as any;
      const guidelineData = guidelineFromSubQFile(subQRaw, base + ".json") as any;
      const problemId = selectedProblem || base + ".json";
      setCurrentProblemId(problemId);
      setCurrentGuidelineData(null as any);
      setCurrentCotData(cotData);
      setCurrentGuidelineData(guidelineData);
      setCurrentStep(3);
      saveResult(problemId, cotData, null, guidelineData, null, null);
    } catch (err: any) {
      setError(err?.message ?? "로컬 문제 불러오기 실패");
    } finally {
      setLoadLocalLoading(false);
    }
  };

  /** 이미지 URL을 base64 data URL로 변환 (API는 base64만 허용) */
  const urlToBase64 = (url: string): Promise<string> =>
    fetch(url)
      .then((r) => r.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          }),
      );

  const handleProblemSelect = async (filename: string) => {
    if (!filename || filename === "__example1_json__" || filename === "__example2_json__") {
      if (filename === "__example1_json__") {
        const data = example1Data as { main_problem?: string; main_answer?: string; main_solution?: string; grade?: string };
        setFormData((prev) => ({
          ...prev,
          problem: data.main_problem || "",
          answer: data.main_answer || "",
          solution: data.main_solution || "",
          grade: data.grade || "",
          imagePreview: example1Image,
          imageData: example1Image,
        }));
        urlToBase64(example1Image)
          .then((dataUrl) => {
            setFormData((prev) => (prev.imagePreview === example1Image ? { ...prev, imagePreview: dataUrl, imageData: dataUrl } : prev));
          })
          .catch((err) => console.warn("예시 이미지 base64 변환 실패:", err));
      } else if (filename === "__example2_json__") {
        const data = example2Data as { main_problem?: string; main_answer?: string; main_solution?: string; grade?: string };
        setFormData((prev) => ({
          ...prev,
          problem: data.main_problem || "",
          answer: data.main_answer || "",
          solution: data.main_solution || "",
          grade: data.grade || "",
          imagePreview: example2Image,
          imageData: example2Image,
        }));
        urlToBase64(example2Image)
          .then((dataUrl) => {
            setFormData((prev) => (prev.imagePreview === example2Image ? { ...prev, imagePreview: dataUrl, imageData: dataUrl } : prev));
          })
          .catch((err) => console.warn("예시 이미지 base64 변환 실패:", err));
      }
      return;
    }

    // data/ 폴더의 로컬 JSON (num1, num2 등)
    const dataKey = Object.keys(dataJsonGlob).find((k) => k.endsWith(filename));
    if (dataKey) {
      try {
        const mod = await dataJsonGlob[dataKey]();
        const data = mod.default as Record<string, unknown>;
        setFormData((prev) => ({
          ...prev,
          problem: String(data.main_problem ?? ""),
          answer: String(data.main_answer ?? ""),
          solution: String(data.main_solution ?? ""),
          grade: String(data.grade ?? ""),
          imagePreview: null,
          imageData: null,
        }));
      } catch (err) {
        console.error("로컬 문제 데이터 로드 중 오류:", err);
      }
      return;
    }

    try {
      const data = await api.getProblem(filename);
      setFormData((prev) => ({
        ...prev,
        problem: data.problem || "",
        answer: data.answer || "",
        solution: data.main_solution || "",
        grade: data.grade || "",
        imageData: data.image_data || null,
        imagePreview: data.image_data || null,
      }));
    } catch (err) {
      console.error("문제 데이터 로드 중 오류:", err);
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFormData((prev) => ({
          ...prev,
          image: file,
          imagePreview: base64String,
          imageData: base64String,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setFormData((prev) => ({
      ...prev,
      image: null,
      imagePreview: null,
      imageData: null,
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setCurrentStep(2);

    try {
      let imageData = formData.imageData || null;
      if (imageData && (imageData.startsWith("http") || imageData.startsWith("/"))) {
        try {
          imageData = await urlToBase64(imageData);
        } catch (err) {
          console.warn("이미지 base64 변환 실패, 이미지 없이 전송:", err);
          imageData = null;
        }
      }

      const requestData = {
        main_problem: formData.problem,
        main_answer: formData.answer,
        main_solution: formData.solution || null,
        grade: formData.grade,
        image_data: imageData,
      };

      const result = await api.createCoT(requestData);
      const cotDataWithExtras = {
        ...result,
        img_description: formData.imgDescription,
        image_data: imageData ?? formData.imageData,
        main_solution: formData.solution,
      };

      const problemId =
        selectedProblem === "__example1_json__" ? "example1.json" : selectedProblem === "__example2_json__" ? "example2.json" : selectedProblem || customProblemId.trim() || getNextProblemSeq();

      logUserEvent("problem_input", {
        problem_id: problemId,
        problem: formData.problem,
        answer: formData.answer,
        solution: formData.solution || null,
        grade: formData.grade,
        hasImage: !!formData.imageData,
        imgDescription: formData.imgDescription || null,
      });
      logUserEvent("cot_output", {
        problem_id: problemId,
        problem: result.problem,
        answer: result.answer,
        grade: result.grade,
        main_solution: result.main_solution ?? (formData.solution || null),
        stepsCount: result.steps?.length ?? 0,
        steps: result.steps?.map((s: any) => ({
          step_number: s.step_number,
          step_title: s.step_title,
          step_content: s.step_content,
        })),
      });
      setCurrentProblemId(problemId);
      setCurrentGuidelineData(null as any);
      setCurrentCotData(cotDataWithExtras);
      saveResult(problemId, cotDataWithExtras, null, null, null, null);
      onSubmit?.(cotDataWithExtras);
    } catch (err: any) {
      setError(err.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.problemInput}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label htmlFor="problemSelect">문제 ID</label>
          <div className={styles.problemIdRow}>
            <select
              id="problemSelect"
              value={selectedProblem}
              onChange={(e) => {
                setSelectedProblem(e.target.value);
                handleProblemSelect(e.target.value);
              }}
              className={styles.select}
            >
              <option value="">직접 입력하기</option>
              {problemList.map((file) => (
                <option key={file} value={file}>
                  {file.replace(".json", "")}
                </option>
              ))}
              <option value="__example1_json__">example1.json</option>
              <option value="__example2_json__">example2.json</option>
              {DROPDOWN_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            {selectedProblem === "" && (
              <input
                type="text"
                id="customProblemId"
                value={customProblemId}
                onChange={(e) => setCustomProblemId(e.target.value)}
                placeholder="문제 ID 입력 (예: 초3 1번)"
                className={styles.input}
                aria-label="직접 입력 문제 ID"
              />
            )}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="problem">문제</label>
          <textarea
            id="problem"
            value={formData.problem}
            onChange={(e) => setFormData((prev) => ({ ...prev, problem: e.target.value }))}
            required
            placeholder="수학 문제를 입력하세요"
            className={styles.textarea}
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="answer">정답</label>
          <input
            type="text"
            id="answer"
            value={formData.answer}
            onChange={(e) => setFormData((prev) => ({ ...prev, answer: e.target.value }))}
            placeholder="정답을 입력하세요"
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="solution">모범답안</label>
          <textarea
            id="solution"
            value={formData.solution}
            onChange={(e) => setFormData((prev) => ({ ...prev, solution: e.target.value }))}
            placeholder="모범답안을 입력하세요"
            className={styles.textarea}
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="grade">학년</label>
          <input type="text" id="grade" value={formData.grade} onChange={(e) => setFormData((prev) => ({ ...prev, grade: e.target.value }))} placeholder="예: 3학년" className={styles.input} />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="imageUpload">문제 이미지 업로드</label>
          <input type="file" id="imageUpload" accept="image/*" onChange={handleImageUpload} className={styles.fileInput} />
          {formData.imagePreview && (
            <div className={styles.imagePreview}>
              <img src={formData.imagePreview} alt="이미지 미리보기" />
              <button type="button" onClick={handleRemoveImage} className={styles.removeImageBtn}>
                이미지 제거
              </button>
            </div>
          )}
        </div>

        <div className={styles.buttonRow}>
          <button type="submit" className={styles.submitBtn} disabled={!formData.problem || !formData.answer}>
            문제 풀이하기
          </button>
          <button
            type="button"
            className={styles.loadLocalBtn}
            onClick={handleLoadLocal}
            disabled={!canLoadLocal || loadLocalLoading}
            title={canLoadLocal ? "선택한 문제의 _cot.json, _suqQ.json을 로드해 2·3단계를 채웁니다" : "이 문제에는 해당 로컬 파일이 없습니다"}
          >
            {loadLocalLoading ? "불러오는 중…" : "문제 불러오기"}
          </button>
          {/* 어떤 아이디로 로그인하든 항상 표시 */}
          <button type="button" className={styles.adminModeBtn} onClick={() => setAdminModalOpen(true)}>
            관리자 모드
          </button>
        </div>
      </form>
      {adminModalOpen && <AdminModeModal onClose={() => setAdminModalOpen(false)} />}
    </div>
  );
};
