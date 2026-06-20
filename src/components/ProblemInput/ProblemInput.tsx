import { useState, useRef, ChangeEvent, FormEvent, ReactNode } from "react";
import { useApp } from "../../contexts/AppContext";
import { saveResult } from "../../hooks/useStorage";
import { api } from "../../services/api";
import { logUserEvent } from "../../services/eventLogger";
import { useLocale } from "../../i18n/LocaleContext";
import { getAppLanguage } from "../../i18n/translations";
import { formatAnswer, formatSolution, looksLikeMathContent } from "../../utils/formatting";
import { MathHtml } from "../MathHtml";
import styles from "./ProblemInput.module.css";

/** data/finalized_data/*.json 로컬 로드용 (문제 불러오기·폼 채우기) */
const dataJsonGlob = import.meta.glob<{ default: Record<string, unknown> }>("../../../data/finalized_data/*.json");

/** data/finalized_data 이미지 (JSON의 image_file 필드와 매칭) */
const dataImageGlob = import.meta.glob<string>("../../../data/finalized_data/*.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

function resolveLocalImageUrl(imageFile?: string | null): string | null {
  const name = imageFile?.trim();
  if (!name) return null;
  const entry = Object.entries(dataImageGlob).find(([path]) => path.endsWith(`/${name}`));
  return entry ? entry[1] : null;
}

/** 드롭다운 로컬 예시 문제 (file: data/finalized_data/ JSON, label: 표시 이름) */
const DROPDOWN_OPTIONS = [
  { file: "example4.json", label: "Grade 3" },
  { file: "example1.json", label: "Grade 4" },
  { file: "example2.json", label: "Grade 5" },
  { file: "example5.json", label: "Grade 6" },
  { file: "example3.json", label: "Grade 6 (Eng)" },
] as const;

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
  semester: string;
  image: File | null;
  imagePreview: string | null;
  imageData: string | null;
  imgDescription: string;
}

/** 예시 JSON의 "식 … 답 …" 형식이면 답 부분만 폼에 채움 */
function answerFromMainAnswer(mainAnswer: string): string {
  const trimmed = mainAnswer.trim();
  const match = trimmed.match(/^식\s*.+?\s*답\s*(.+)$/s);
  return match ? match[1].trim() : trimmed;
}

function patchFromMainAnswer(fields: { main_problem?: string; main_answer?: string; main_solution?: string; grade?: string; semester?: string }): Partial<FormData> {
  return {
    problem: fields.main_problem ?? "",
    answer: answerFromMainAnswer(fields.main_answer ?? ""),
    solution: fields.main_solution ?? "",
    grade: fields.grade ?? "",
    semester: fields.semester ?? "",
  };
}

interface InputPanelProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}

function InputPanel({ icon, title, children, className }: InputPanelProps) {
  return (
    <section className={`${styles.panel} ${className ?? ""}`}>
      <header className={styles.panelHeader}>
        <span className={styles.panelIcon}>{icon}</span>
        <h3 className={styles.panelTitle}>{title}</h3>
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

interface LatexAwareFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  required?: boolean;
  fieldClassName?: string;
  formatHtml?: (text: string) => string;
}

function LatexAwareField({
  id,
  value,
  onChange,
  placeholder,
  multiline = false,
  required = false,
  fieldClassName,
  formatHtml = formatAnswer,
}: LatexAwareFieldProps) {
  if (looksLikeMathContent(value)) {
    return (
      <>
        <MathHtml
          className={`${styles.mathPreview} ${styles.mathPreviewOnly}`}
          html={formatHtml(value)}
        />
        {required ? (
          <input
            type="text"
            id={id}
            value={value}
            readOnly
            required
            tabIndex={-1}
            aria-hidden
            className={styles.mathSourceHidden}
          />
        ) : null}
      </>
    );
  }

  if (multiline) {
    return (
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className={`${fieldClassName ?? ""} tex2jax_ignore`.trim()}
      />
    );
  }

  return (
    <input
      type="text"
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      className={`${fieldClassName ?? ""} tex2jax_ignore`.trim()}
    />
  );
}

const IconProblem = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M14 2v6h6M8 13h8M8 17h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconAnswer = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconSolution = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconImage = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="8.5" cy="10.5" r="1.5" fill="currentColor" />
    <path d="M21 16l-5-5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ProblemInput = ({ onSubmit }: ProblemInputProps) => {
  const { userId, setCurrentCotData, setCurrentGuidelineData, setCurrentStep, setLoading, setError, setCurrentProblemId } = useApp();
  const { t, locale } = useLocale();
  const [problemList, setProblemList] = useState<string[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<string>("");
  /** 직접 입력하기 선택 시 사용자가 입력하는 문제 ID (예: filename.json) */
  const [customProblemId, setCustomProblemId] = useState<string>("");
  const [formData, setFormData] = useState<FormData>({
    problem: "",
    answer: "",
    solution: "",
    grade: "",
    semester: "",
    image: null,
    imagePreview: null,
    imageData: null,
    imgDescription: "",
  });
  const imageInputRef = useRef<HTMLInputElement>(null);

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
    if (!filename) return;

    // data/finalized_data/ 폴더의 로컬 JSON
    const dataKey = Object.keys(dataJsonGlob).find((k) => k.endsWith(filename));
    if (dataKey) {
      try {
        const mod = await dataJsonGlob[dataKey]();
        const data = mod.default as Record<string, unknown>;
        const imageUrl = resolveLocalImageUrl(typeof data.image_file === "string" ? data.image_file : null);
        setFormData((prev) => ({
          ...prev,
          ...patchFromMainAnswer({
            main_problem: String(data.main_problem ?? ""),
            main_answer: String(data.main_answer ?? ""),
            main_solution: String(data.main_solution ?? ""),
            grade: String(data.grade ?? ""),
            semester: typeof data.semester === "string" ? data.semester : "",
          }),
          imagePreview: imageUrl,
          imageData: imageUrl,
        }));
        if (imageUrl) {
          urlToBase64(imageUrl)
            .then((dataUrl) => {
              setFormData((prev) => (prev.imagePreview === imageUrl ? { ...prev, imagePreview: dataUrl, imageData: dataUrl } : prev));
            })
            .catch((err) => console.warn("로컬 이미지 base64 변환 실패:", err));
        }
      } catch (err) {
        console.error("로컬 문제 데이터 로드 중 오류:", err);
      }
      return;
    }

    try {
      const data = await api.getProblem(filename);
      setFormData((prev) => ({
        ...prev,
        ...patchFromMainAnswer({
          main_problem: data.problem || "",
          main_answer: data.answer || "",
          main_solution: data.main_solution || "",
          grade: data.grade || "",
          semester: typeof data.semester === "string" ? data.semester : "",
        }),
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

      const semester = formData.semester.trim();
      const requestData = {
        main_problem: formData.problem,
        main_answer: formData.answer.trim(),
        main_solution: formData.solution || null,
        grade: formData.grade,
        ...(semester ? { semester } : {}),
        image_data: imageData,
        language: getAppLanguage(locale),
      };

      const result = await api.createCoT(requestData);
      const { semester: _apiSemester, ...resultWithoutSemester } = result as { semester?: string };
      const cotDataWithExtras = {
        ...resultWithoutSemester,
        img_description: formData.imgDescription,
        image_data: imageData ?? formData.imageData,
        main_solution: formData.solution,
        ...(semester ? { semester } : {}),
      };

      const problemId = selectedProblem || customProblemId.trim() || getNextProblemSeq();

      logUserEvent("problem_input", {
        problem_id: problemId,
        problem: formData.problem,
        answer: formData.answer.trim(),
        solution: formData.solution || null,
        grade: formData.grade,
        semester: semester || null,
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
      saveResult(problemId, cotDataWithExtras, null, null, null, null, userId);
      onSubmit?.(cotDataWithExtras);
    } catch (err: any) {
      setError(err.message || t("common.errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !!(formData.problem.trim() && formData.answer.trim());

  return (
    <div className={styles.page}>
      <form onSubmit={handleSubmit} className={styles.shell}>
        <div className={styles.topBar}>
          <div className={styles.topField}>
            <label htmlFor="problemSelect" className={styles.topLabel}>
              {t("problemInput.problemId")}
            </label>
            <div className={styles.topIdControls}>
              <select
                id="problemSelect"
                value={selectedProblem}
                onChange={(e) => {
                  setSelectedProblem(e.target.value);
                  handleProblemSelect(e.target.value);
                }}
                className={styles.select}
              >
                <option value="">{t("problemInput.customEntry")}</option>
                {problemList.map((file) => (
                  <option key={file} value={file}>
                    {file.replace(".json", "")}
                  </option>
                ))}
                {DROPDOWN_OPTIONS.map(({ file, label }) => (
                  <option key={file} value={file}>
                    {label}
                  </option>
                ))}
              </select>
              {selectedProblem === "" && (
                <input
                  type="text"
                  id="customProblemId"
                  value={customProblemId}
                  onChange={(e) => setCustomProblemId(e.target.value)}
                  placeholder={t("problemInput.customIdPlaceholder")}
                  className={styles.input}
                  aria-label={t("problemInput.customIdAria")}
                />
              )}
            </div>
          </div>

          <div className={`${styles.topField} ${styles.topFieldGrade}`}>
            <label htmlFor="grade" className={styles.topLabel}>
              {t("problemInput.grade")}
            </label>
            <input
              type="text"
              id="grade"
              value={formData.grade}
              onChange={(e) => setFormData((prev) => ({ ...prev, grade: e.target.value }))}
              placeholder={t("problemInput.gradePlaceholder")}
              className={styles.input}
            />
          </div>

          <div className={`${styles.topField} ${styles.topFieldSemester}`}>
            <label htmlFor="semester" className={styles.topLabel}>
              {t("problemInput.semester")}
            </label>
            <input
              type="text"
              id="semester"
              value={formData.semester}
              onChange={(e) => setFormData((prev) => ({ ...prev, semester: e.target.value }))}
              placeholder={t("problemInput.semesterPlaceholder")}
              className={styles.input}
            />
          </div>

          <div className={styles.topActions}>
            <button type="submit" className={styles.generateBtn} disabled={!canSubmit}>
              {t("problemInput.generate")}
            </button>
          </div>
        </div>

        <div className={styles.contentGrid}>
          <div className={styles.imageCol}>
            <InputPanel icon={<IconImage />} title={t("problemInput.imageUpload")} className={styles.panelImage}>
              <input ref={imageInputRef} type="file" id="imageUpload" accept="image/*" onChange={handleImageUpload} className={styles.fileInputHidden} />
              <div className={styles.imagePreviewBox}>
                {formData.imagePreview ? (
                  <img src={formData.imagePreview} alt={t("problemInput.imagePreview")} className={styles.imagePreviewImg} />
                ) : (
                  <span className={styles.imagePlaceholder}>{t("problemInput.imagePlaceholder")}</span>
                )}
              </div>
              <div className={styles.imageActions}>
                <button type="button" className={styles.uploadBtn} onClick={() => imageInputRef.current?.click()}>
                  <svg viewBox="0 0 24 24" aria-hidden className={styles.uploadIcon}>
                    <path d="M12 16V4M12 4l-4 4M12 4l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  {t("problemInput.upload")}
                </button>
                <button type="button" className={styles.removeImageBtn} onClick={handleRemoveImage} disabled={!formData.imagePreview}>
                  {t("problemInput.removeImage")}
                </button>
              </div>
            </InputPanel>
          </div>

          <div className={styles.fieldsCol}>
            <InputPanel icon={<IconProblem />} title={t("problemInput.problem")} className={styles.panelProblem}>
              <LatexAwareField
                id="problem"
                value={formData.problem}
                onChange={(problem) => setFormData((prev) => ({ ...prev, problem }))}
                placeholder={t("problemInput.problemPlaceholder")}
                multiline
                required
                fieldClassName={`${styles.textarea} ${styles.textareaFill}`}
              />
            </InputPanel>

            <InputPanel icon={<IconSolution />} title={t("problemInput.solution")} className={styles.panelSolution}>
              <LatexAwareField
                id="solution"
                value={formData.solution}
                onChange={(solution) => setFormData((prev) => ({ ...prev, solution }))}
                placeholder={t("problemInput.solutionPlaceholder")}
                multiline
                fieldClassName={`${styles.textarea} ${styles.textareaFill}`}
                formatHtml={formatSolution}
              />
            </InputPanel>

            <InputPanel icon={<IconAnswer />} title={t("problemInput.answer")} className={styles.panelAnswer}>
              <LatexAwareField
                id="answer"
                value={formData.answer}
                onChange={(answer) => setFormData((prev) => ({ ...prev, answer }))}
                placeholder={t("problemInput.answerPlaceholder")}
                fieldClassName={styles.input}
              />
            </InputPanel>
          </div>
        </div>
      </form>
    </div>
  );
};
