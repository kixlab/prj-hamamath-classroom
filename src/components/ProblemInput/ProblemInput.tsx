import { useState, useRef, ChangeEvent, FormEvent, ReactNode, useEffect } from "react";
import { useApp } from "../../contexts/AppContext";
import type { CoTData } from "../../types";
import { saveResult, fetchHistoryListForUser, loadResult } from "../../hooks/useStorage";
import { api } from "../../services/api";
import { logUserEvent } from "../../services/eventLogger";
import { useLocale } from "../../i18n/LocaleContext";
import { getAppLanguage } from "../../i18n/translations";
import { formatAnswer, formatSolution } from "../../utils/formatting";
import { resolveSemester } from "../../utils/textbook";
import { MathHtml } from "../MathHtml";
import { demoDelay, DEMO_COT_LOADING_MS } from "../../demo/demoDelay";
import { buildDemoCotFromProblemInput, loadDemoSavedWorkflow } from "../../demo/demoWorkspace";
import { loadMirroredTestResult } from "../../demo/demoMirror";
import { getDemoSourceUserId } from "../../demo/demoAccount";
import { PROBLEM_DROPDOWN_OPTIONS, getProblemDisplayLabel } from "../../utils/problemIdAlias";
import { resolveAuxUploadGrade, parseAuxMaterialGradeKey, AUX_GRADE_COMMON } from "../../utils/auxiliaryMaterial";
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
const DROPDOWN_OPTIONS = PROBLEM_DROPDOWN_OPTIONS;

const DEMO_PROBLEM_SEQ_KEY = "hamamath_problem_seq";

/** 데모 전용: 로컬 순번. 일반 계정은 서버(Firebase)에서 할당 */
function getDemoNextProblemSeq(): string {
  try {
    const raw = localStorage.getItem(DEMO_PROBLEM_SEQ_KEY);
    const next = (raw ? parseInt(raw, 10) : 0) + 1;
    if (!Number.isFinite(next)) {
      localStorage.setItem(DEMO_PROBLEM_SEQ_KEY, "1");
      return "1";
    }
    localStorage.setItem(DEMO_PROBLEM_SEQ_KEY, String(next));
    return String(next);
  } catch {
    return String(Date.now());
  }
}

async function allocateProblemId(
  selectedProblem: string,
  customProblemId: string,
  userId: string | null | undefined,
  isDemo: boolean,
): Promise<string> {
  if (selectedProblem.trim()) return selectedProblem.trim();
  if (customProblemId.trim()) return customProblemId.trim();
  if (isDemo) return getDemoNextProblemSeq();
  return String(await api.getNextProblemSeq(userId));
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

const INITIAL_FORM_DATA: FormData = {
  problem: "",
  answer: "",
  solution: "",
  grade: "",
  semester: "",
  image: null,
  imagePreview: null,
  imageData: null,
  imgDescription: "",
};

function formDataFromCot(cot: CoTData): Partial<FormData> {
  const c = cot as CoTData & {
    main_problem?: string;
    main_answer?: string;
    img_description?: string;
  };
  return {
    problem: c.problem ?? c.problem_text ?? c.main_problem ?? "",
    answer: c.answer ?? c.final_answer ?? answerFromMainAnswer(c.main_answer ?? ""),
    solution: c.main_solution ?? "",
    grade: c.grade ?? "",
    semester: c.semester ?? "",
    imagePreview: c.image_data ?? null,
    imageData: c.image_data ?? null,
    imgDescription: c.img_description ?? "",
  };
}

function resolveProblemIdSelection(problemId: string): { selectedProblem: string; customProblemId: string } {
  const dropdownMatch = DROPDOWN_OPTIONS.find(({ file }) => file === problemId);
  if (dropdownMatch) {
    return { selectedProblem: dropdownMatch.file, customProblemId: "" };
  }
  if (problemId.endsWith(".json")) {
    return { selectedProblem: problemId, customProblemId: "" };
  }
  return { selectedProblem: "", customProblemId: problemId };
}

interface InputPanelProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
  required?: boolean;
}

function InputPanel({ icon, title, children, className, headerAction, required = false }: InputPanelProps) {
  return (
    <section className={`${styles.panel} ${className ?? ""}`}>
      <header className={styles.panelHeader}>
        <span className={styles.panelIcon}>{icon}</span>
        <h3 className={styles.panelTitle}>
          {title}
          {required ? <span className={styles.requiredMark} aria-hidden="true"> *</span> : null}
        </h3>
        {headerAction ? <div className={styles.panelHeaderAction}>{headerAction}</div> : null}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

interface LatexPanelProps {
  icon: ReactNode;
  title: string;
  className?: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  required?: boolean;
  fieldClassName?: string;
  formatHtml?: (text: string) => string;
}

// 문제·모범답안·정답 패널: 헤더 우측에 [편집/저장] 버튼, 본문은 (미리보기 ↔ 편집) 전환
function LatexPanel({
  icon,
  title,
  className,
  id,
  value,
  onChange,
  placeholder,
  multiline = false,
  required = false,
  fieldClassName,
  formatHtml = formatAnswer,
}: LatexPanelProps) {
  const { t } = useLocale();
  // 내용이 있으면 미리보기로 시작(편집은 버튼으로), 비어 있으면 바로 입력 가능하게 편집으로 시작
  const [editing, setEditing] = useState(() => !(value && value.trim()));
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  // 편집 모드 진입 시 자동 포커스 + 커서를 끝으로
  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {
      /* input[type=text]가 아니면 무시 */
    }
  }, [editing]);

  const commonProps = {
    id,
    value,
    required,
    placeholder,
    onChange: (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => onChange(e.target.value),
    // 내용이 있을 때만 미리보기로 전환 (빈 필드는 계속 입력 가능하게)
    onBlur: () => {
      if (value && value.trim()) setEditing(false);
    },
    className: `${fieldClassName ?? ""} tex2jax_ignore`.trim(),
  };

  const field = multiline ? (
    <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} {...commonProps} />
  ) : (
    <input ref={inputRef as React.RefObject<HTMLInputElement>} type="text" {...commonProps} />
  );

  const editButton = (
    <button
      type="button"
      className={`${styles.editBtn} ${styles.editBtnPrimary}`}
      onMouseDown={(e) => e.preventDefault()} // 버튼 클릭 시 필드 blur 방지
      onClick={() => setEditing(!editing)}
    >
      {editing ? t("common.save") : t("common.edit")}
    </button>
  );

  return (
    <InputPanel icon={icon} title={title} className={className} headerAction={editButton} required={required}>
      {editing ? (
        field
      ) : (
        <>
          <MathHtml className={`${styles.mathPreview} ${styles.mathPreviewOnly}`} html={formatHtml(value)} />
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
      )}
    </InputPanel>
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
  const {
    userId,
    currentCotData,
    currentProblemId,
    isDemoMode,
    setCurrentCotData,
    setCurrentSubQData,
    setCurrentSubQuestionData,
    setCurrentStep,
    setLoading,
    setError,
    setCurrentProblemId,
    setFinalizedSubQuestionForRubric,
    setCurrentRubrics,
    setPreferredVersion,
    requestedExampleFile,
    setRequestedExampleFile,
    selectedAuxiliaryMaterialIds,
    setSelectedAuxiliaryMaterialIds,
    auxMaterials,
    setAuxMaterials,
  } = useApp();
  const { t, locale } = useLocale();
  const [problemList, setProblemList] = useState<string[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<string>("");
  /** 직접 입력하기 선택 시 사용자가 입력하는 문제 ID (예: filename.json) */
  const [customProblemId, setCustomProblemId] = useState<string>("");
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const auxInputRef = useRef<HTMLInputElement>(null);
  const hydratedProblemIdRef = useRef<string | null>(null);
  const [auxUploading, setAuxUploading] = useState(false);
  const [auxError, setAuxError] = useState<string | null>(null);
  /** 참고 자료 입력 방식: 기존 라이브러리에서 선택 vs 새 파일 직접 업로드 */
  const [auxMode, setAuxMode] = useState<"select" | "upload">("select");

  useEffect(() => {
    if (!currentProblemId && !currentCotData) {
      hydratedProblemIdRef.current = null;
      setFormData(INITIAL_FORM_DATA);
      setSelectedProblem("");
      setCustomProblemId("");
      return;
    }
    if (!currentCotData || !currentProblemId) return;
    if (hydratedProblemIdRef.current === currentProblemId) return;
    hydratedProblemIdRef.current = currentProblemId;

    setFormData((prev) => ({
      ...prev,
      ...formDataFromCot(currentCotData),
      image: null,
    }));

    // 계정 저장 문제면 드롭다운에서 그대로 선택 상태로 표시
    if (problemList.includes(currentProblemId)) {
      setSelectedProblem(currentProblemId);
      setCustomProblemId("");
    } else {
      const { selectedProblem: nextSelected, customProblemId: nextCustom } = resolveProblemIdSelection(currentProblemId);
      setSelectedProblem(nextSelected);
      setCustomProblemId(nextCustom);
    }
  }, [currentCotData, currentProblemId, problemList]);

  /** 로그인한 계정이 저장한 문제 목록을 드롭다운에 채운다. Sidebar와 동일하게 서버를 진실 소스로 사용. */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let ids: string[] = [];
        if (isDemoMode) {
          // 데모: 서버가 없으므로 미러 소스 계정의 병합 목록 사용
          const sourceUserId = getDemoSourceUserId();
          if (sourceUserId?.trim()) {
            const list = await fetchHistoryListForUser(sourceUserId);
            ids = list.map((item) => item.problemId);
          }
        } else if (userId?.trim()) {
          // 실계정: 서버(Firestore)만 조회 — 어느 브라우저·기기에서든 Sidebar와 동일하게 표시
          const data = await api.getMyHistoryList(userId);
          ids = (Array.isArray(data) ? data : [])
            .map((item: any) => (item.problem_id ?? item.problemId ?? "").trim())
            .filter(Boolean);
        }
        if (!cancelled) setProblemList(ids);
      } catch (err) {
        console.warn("저장 문제 목록 조회 실패:", err);
        if (!cancelled) setProblemList([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, isDemoMode]);

  // 참고 자료 목록 로드는 AppProvider가 계정 변경 시 수행 (사이드바와 공유). 여기선 공유 목록을 그대로 사용.


  const handleAuxUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (isDemoMode) {
      setAuxError(t("problemInput.auxDemoNote"));
      return;
    }
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setAuxError(t("problemInput.auxPdfOnly"));
      return;
    }
    const uploadGrade = resolveAuxUploadGrade(formData.grade);
    setAuxUploading(true);
    setAuxError(null);
    try {
      const result = await api.uploadAuxiliaryMaterial(
        {
          file,
          grade: uploadGrade === "common" ? "" : uploadGrade,
          title: file.name.replace(/\.[^.]+$/, ""),
        },
        userId,
      );
      const item = result.item;
      setAuxMaterials((prev) => [item, ...prev.filter((m) => m.id !== item.id)]);
      // 방금 업로드한 자료만 자동 활성화
      if (!selectedAuxiliaryMaterialIds.includes(item.id)) {
        setSelectedAuxiliaryMaterialIds([...selectedAuxiliaryMaterialIds, item.id]);
      }
      // 업로드 후 선택 목록으로 전환 → 방금 올린 자료가 체크된 상태로 보이게
      setAuxMode("select");
    } catch (err: any) {
      setAuxError(err?.message || t("problemInput.auxUploadFail"));
    } finally {
      setAuxUploading(false);
    }
  };

  // 참고 자료 삭제는 사이드바 '학습 자료' 라이브러리에서 관리 (문제화면에서는 선택/업로드만)

  /** 드롭다운에서 계정 저장 문제를 고르면 해당 워크플로우를 불러온다(사이드바 클릭과 동일). */
  const handleLoadSaved = async (problemId: string) => {
    try {
      if (isDemoMode) {
        await loadDemoSavedWorkflow(problemId, {
          setCurrentProblemId,
          setCurrentCotData,
          setCurrentSubQData,
          setCurrentSubQuestionData,
          setFinalizedSubQuestionForRubric,
          setCurrentRubrics,
          setPreferredVersion: setPreferredVersion ?? (() => {}),
          setCurrentStep,
          setLoading,
          setError,
        });
        return;
      }
      const result = await loadResult(problemId);
      if (!result) return;
      setCurrentProblemId(result.problemId || problemId);
      setCurrentCotData(result.cotData);
      setCurrentSubQData(result.subQData ?? null);
      setCurrentSubQuestionData(result.subQuestionData ?? (null as any));
      if (setPreferredVersion) setPreferredVersion(result.preferredVersion || {});
      if (setCurrentRubrics) setCurrentRubrics(result.rubrics ?? null);
      if (result.subQuestionData && result.cotData) {
        setCurrentStep(3);
      } else if (result.cotData) {
        setCurrentStep(2);
      }
    } catch (err) {
      console.error("저장 결과 불러오기 오류:", err);
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

  // 사이드바에서 예제를 클릭하면(공유 시그널) 해당 예제를 이 화면에 로드한다.
  useEffect(() => {
    if (!requestedExampleFile) return;
    setSelectedProblem(requestedExampleFile);
    setCustomProblemId("");
    handleProblemSelect(requestedExampleFile);
    setRequestedExampleFile?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedExampleFile]);

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
    if (isDemoMode) {
      setLoading(true);
      setError(null);
      setCurrentStep(2);
      try {
        await demoDelay(DEMO_COT_LOADING_MS);
        const problemId = await allocateProblemId(selectedProblem, customProblemId, userId, true);
        const mirrored = await loadMirroredTestResult(problemId);
        const cotData =
          mirrored?.cotData ??
          buildDemoCotFromProblemInput({
            problem: formData.problem,
            answer: formData.answer,
            solution: formData.solution,
            grade: formData.grade,
            semester: formData.semester.trim() || undefined,
            imageData: formData.imageData,
            problemId,
          });
        setCurrentProblemId(problemId);
        setPreferredVersion?.(mirrored?.preferredVersion ?? {});
        setCurrentSubQuestionData(null as any);
        setFinalizedSubQuestionForRubric(null);
        setCurrentRubrics(null);
        setCurrentCotData(cotData);
        onSubmit?.(cotData);
      } finally {
        setLoading(false);
      }
      return;
    }
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

      const semester = resolveSemester(formData.grade, formData.semester.trim() || undefined);
      const requestData = {
        main_problem: formData.problem,
        main_answer: formData.answer.trim(),
        main_solution: formData.solution || null,
        grade: formData.grade,
        ...(semester ? { semester } : {}),
        use_textbook_rag: true,
        ...(selectedAuxiliaryMaterialIds.length
          ? { auxiliary_material_ids: selectedAuxiliaryMaterialIds }
          : {}),
        image_data: imageData,
        language: getAppLanguage(locale),
      };

      const result = (await api.createCoT(requestData, userId)) as CoTData;
      const cotDataWithExtras: CoTData & {
        img_description: string;
        auxiliary_material_ids?: string[];
      } = {
        ...result,
        img_description: formData.imgDescription,
        image_data: imageData ?? formData.imageData,
        main_solution: formData.solution,
        ...(semester ? { semester } : {}),
        ...(selectedAuxiliaryMaterialIds.length
          ? { auxiliary_material_ids: selectedAuxiliaryMaterialIds }
          : {}),
      };

      const problemId = await allocateProblemId(selectedProblem, customProblemId, userId, false);

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
      setCurrentSubQuestionData(null as any);
      setCurrentCotData(cotDataWithExtras);
      saveResult(problemId, cotDataWithExtras, null, null, null, null, userId);
      onSubmit?.(cotDataWithExtras);
    } catch (err: any) {
      setError(err.message || t("common.errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !!(
    formData.problem.trim()
    && formData.answer.trim()
    && formData.grade.trim()
    && formData.semester.trim()
  );

  // 현재 문제 학년의 참고 자료만 표시 (+ 공통 자료는 항상). 학년 미입력 시 전체 표시.
  const currentAuxGradeKey = resolveAuxUploadGrade(formData.grade);
  const visibleAuxMaterials =
    currentAuxGradeKey === AUX_GRADE_COMMON
      ? auxMaterials
      : auxMaterials.filter((m) => {
          const key = parseAuxMaterialGradeKey(m.grade);
          return key === currentAuxGradeKey || key === AUX_GRADE_COMMON;
        });
  // 드롭다운(아직 선택 안 된 현재 학년 자료) / 선택됨 목록(전체에서 선택된 것)
  const auxMaterialsToAdd = visibleAuxMaterials.filter((m) => !selectedAuxiliaryMaterialIds.includes(m.id));
  const selectedAuxMaterials = auxMaterials.filter((m) => selectedAuxiliaryMaterialIds.includes(m.id));

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
                  const value = e.target.value;
                  setSelectedProblem(value);
                  if (!value) {
                    // 직접 입력하기 — 이전 예제/저장 문제 내용을 비워 빈 폼에서 새로 작성 가능하게
                    hydratedProblemIdRef.current = null;
                    setFormData(INITIAL_FORM_DATA);
                    setCustomProblemId("");
                    if (imageInputRef.current) imageInputRef.current.value = "";
                    return;
                  }
                  if (problemList.includes(value)) {
                    handleLoadSaved(value); // 계정 저장 문제 → 워크플로우 로드
                  } else {
                    handleProblemSelect(value); // 예제 → 폼 채우기
                  }
                }}
                className={styles.select}
              >
                <option value="">{t("problemInput.customEntry")}</option>
                {problemList.length > 0 && (
                  <optgroup label={locale === "en" ? "My saved problems" : "내 저장 문제"}>
                    {problemList.map((pid) => (
                      <option key={pid} value={pid}>
                        {getProblemDisplayLabel(pid)}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label={locale === "en" ? "Examples" : "예제"}>
                  {DROPDOWN_OPTIONS.map(({ file, label }) => (
                    <option key={file} value={file}>
                      {label}
                    </option>
                  ))}
                </optgroup>
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
              <span className={styles.requiredMark} aria-hidden="true"> *</span>
            </label>
            <input
              type="text"
              id="grade"
              value={formData.grade}
              onChange={(e) => setFormData((prev) => ({ ...prev, grade: e.target.value }))}
              placeholder={t("problemInput.gradePlaceholder")}
              className={styles.input}
              required
            />
          </div>

          <div className={`${styles.topField} ${styles.topFieldSemester}`}>
            <label htmlFor="semester" className={styles.topLabel}>
              {t("problemInput.semester")}
              <span className={styles.requiredMark} aria-hidden="true"> *</span>
            </label>
            <input
              type="text"
              id="semester"
              value={formData.semester}
              onChange={(e) => setFormData((prev) => ({ ...prev, semester: e.target.value }))}
              placeholder={t("problemInput.semesterPlaceholder")}
              className={styles.input}
              required
            />
          </div>

          <div className={styles.topActions}>
            <button type="submit" className={styles.generateBtn} disabled={!canSubmit}>
              {t("problemInput.generate")}
            </button>
          </div>
        </div>

        <section className={styles.auxPanel} aria-label={t("problemInput.auxTitle")}>
          <div className={styles.auxHeader}>
            <div className={styles.auxTitleBlock}>
              <h3 className={styles.auxTitle}>{t("problemInput.auxTitle")}</h3>
              <p className={styles.auxHint}>{t("problemInput.auxHint")}</p>
            </div>
          </div>

          {isDemoMode && <p className={styles.auxNote}>{t("problemInput.auxDemoNote")}</p>}
          {auxError && <p className={styles.auxError}>{auxError}</p>}

          {!isDemoMode && (
            <>
              {/* 입력 방식 토글 + 활성 컨트롤(드롭다운/업로드)을 한 줄에 배치 */}
              <div className={styles.auxControlRow}>
                <div className={styles.auxModeTabs} role="tablist" aria-label={t("problemInput.auxTitle")}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={auxMode === "select"}
                    className={`${styles.auxModeTab} ${auxMode === "select" ? styles.auxModeTabActive : ""}`}
                    onClick={() => setAuxMode("select")}
                  >
                    {locale === "en" ? "Select existing" : "기존 자료 선택"}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={auxMode === "upload"}
                    className={`${styles.auxModeTab} ${auxMode === "upload" ? styles.auxModeTabActive : ""}`}
                    onClick={() => setAuxMode("upload")}
                  >
                    {locale === "en" ? "Upload new" : "직접 업로드"}
                  </button>
                </div>

                {auxMode === "select" ? (
                  <select
                    className={styles.auxSelectDropdown}
                    value=""
                    disabled={visibleAuxMaterials.length === 0}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id && !selectedAuxiliaryMaterialIds.includes(id)) {
                        setSelectedAuxiliaryMaterialIds([...selectedAuxiliaryMaterialIds, id]);
                      }
                    }}
                  >
                    <option value="">
                      {visibleAuxMaterials.length === 0
                        ? locale === "en"
                          ? "No materials for this grade"
                          : "이 학년 자료 없음"
                        : auxMaterialsToAdd.length > 0
                          ? locale === "en"
                            ? "Select a material…"
                            : "자료를 선택하세요…"
                          : locale === "en"
                            ? "All materials added"
                            : "모든 자료가 추가됨"}
                    </option>
                    {auxMaterialsToAdd.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title || m.filename}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      ref={auxInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className={styles.fileInputHidden}
                      onChange={handleAuxUpload}
                    />
                    <button
                      type="button"
                      className={styles.auxUploadBtn}
                      disabled={auxUploading}
                      onClick={() => auxInputRef.current?.click()}
                    >
                      {auxUploading
                        ? t("problemInput.auxUploading")
                        : locale === "en"
                          ? "Choose PDF file"
                          : "PDF 파일 선택"}
                    </button>
                  </>
                )}
              </div>

              {/* 기존 자료 선택 모드: 선택된 자료 목록 (아래 전체 폭) */}
              {auxMode === "select" && selectedAuxMaterials.length > 0 && (
                <ul className={styles.auxSelectedList}>
                  {selectedAuxMaterials.map((m) => (
                    <li key={m.id} className={styles.auxSelectedRow}>
                      <span className={styles.auxSelectedTitle} title={m.filename}>
                        {m.title || m.filename}
                      </span>
                      <button
                        type="button"
                        className={styles.auxSelectedRemove}
                        onClick={() =>
                          setSelectedAuxiliaryMaterialIds(
                            selectedAuxiliaryMaterialIds.filter((id) => id !== m.id),
                          )
                        }
                      >
                        {locale === "en" ? "Remove" : "제거"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* 직접 업로드 모드: 저장 학년 안내 */}
              {auxMode === "upload" && (
                <p className={styles.auxUploadHint}>
                  {locale === "en"
                    ? `Saved under grade: ${formData.grade.trim() || "Common"}`
                    : `저장 학년: ${formData.grade.trim() || "공통"}`}
                </p>
              )}
            </>
          )}
        </section>

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
            <LatexPanel
              icon={<IconProblem />}
              title={t("problemInput.problem")}
              className={styles.panelProblem}
              id="problem"
              value={formData.problem}
              onChange={(problem) => setFormData((prev) => ({ ...prev, problem }))}
              placeholder={t("problemInput.problemPlaceholder")}
              multiline
              required
              fieldClassName={`${styles.textarea} ${styles.textareaFill}`}
            />

            <LatexPanel
              icon={<IconSolution />}
              title={t("problemInput.solution")}
              className={styles.panelSolution}
              id="solution"
              value={formData.solution}
              onChange={(solution) => setFormData((prev) => ({ ...prev, solution }))}
              placeholder={t("problemInput.solutionPlaceholder")}
              multiline
              fieldClassName={`${styles.textarea} ${styles.textareaFill}`}
              formatHtml={formatSolution}
            />

            <LatexPanel
              icon={<IconAnswer />}
              title={t("problemInput.answer")}
              className={styles.panelAnswer}
              id="answer"
              value={formData.answer}
              onChange={(answer) => setFormData((prev) => ({ ...prev, answer }))}
              placeholder={t("problemInput.answerPlaceholder")}
              required
              fieldClassName={styles.input}
            />
          </div>
        </div>
      </form>
    </div>
  );
};
