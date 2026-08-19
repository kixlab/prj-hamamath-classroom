import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./SurveyPanel.module.css";
import { useLocale } from "../../i18n/LocaleContext";
import { getAppLanguage } from "../../i18n/translations";
import { api } from "../../services/api";
import { compressImageDataUrl } from "../../utils/imageCompression";
import {
  MAX_SURVEY_SLOTS,
  OVERALL_SURVEY_SCOPE,
  SURVEY_ITEMS,
  SURVEY_OPEN_QUESTION,
  normalizeSurveyResponses,
  surveyKindOf,
  type SurveyRecord,
} from "../../utils/surveyItems";
import { SurveyPreviewModal } from "./SurveyPreviewModal";
import { SurveySummaryModal, type SurveySummaryRow } from "./SurveySummaryModal";

interface StudentInfo {
  id: string;
  name: string;
}

interface SurveyPanelProps {
  userId: string;
  isDemo: boolean;
  students: StudentInfo[];
  currentStudentId: string;
  currentStudentName: string;
  /** 진단 중인 문제 ID. 없으면 문제별 설문 비활성 */
  problemId: string | null;
  /** 문제 표시명 (별칭 반영) */
  problemLabel: string | null;
}

/** 학생 + 설문 대상 조합 키 */
function responseKey(studentId: string, scope: string): string {
  return `${studentId}::${scope}`;
}

function normalizeSlots(list: (string | null)[] | undefined | null): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: MAX_SURVEY_SLOTS }, () => null);
  (list ?? []).slice(0, MAX_SURVEY_SLOTS).forEach((value, i) => {
    out[i] = value || null;
  });
  return out;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

/**
 * 학생 설문 탭 — 교사는 종이만 올리고, 응답은 Vision LLM이 읽어 저장한다 (직접 입력란 없음).
 * - 전체(학생당 1회): 리커트 4문항 + 주관식이 든 전용 설문지 PDF를 뽑아 배포한다.
 * - 문제별: 학습지 맨 마지막 '느낀점' 페이지를 그대로 쓴다 (뽑을 설문지 없음).
 */
export const SurveyPanel = ({
  userId,
  isDemo,
  students,
  currentStudentId,
  currentStudentName,
  problemId,
  problemLabel,
}: SurveyPanelProps) => {
  const { t, locale } = useLocale();
  const [scopeMode, setScopeMode] = useState<"overall" | "problem">("overall");
  const [records, setRecords] = useState<Record<string, SurveyRecord>>({});
  const [savedAt, setSavedAt] = useState<Record<string, string>>({});
  const [scans, setScans] = useState<Record<string, (string | null)[]>>({});
  const [scanLoading, setScanLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 문제 선택이 풀리면 문제별 설문에 머무를 수 없다
  useEffect(() => {
    if (!problemId && scopeMode === "problem") setScopeMode("overall");
  }, [problemId, scopeMode]);

  const scopeKey = scopeMode === "problem" && problemId ? problemId : OVERALL_SURVEY_SCOPE;
  const kind = surveyKindOf(scopeKey);
  const key = responseKey(currentStudentId, scopeKey);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  // 저장된 설문 응답 전체 로드
  useEffect(() => {
    if (isDemo || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const items = await api.listSurveyResponses(userId);
        if (cancelled) return;
        const byKey: Record<string, SurveyRecord> = {};
        const times: Record<string, string> = {};
        for (const item of items) {
          const k = responseKey(item.student_id, item.scope || OVERALL_SURVEY_SCOPE);
          byKey[k] = {
            responses: normalizeSurveyResponses(item.responses),
            reflection: item.reflection ?? "",
          };
          if (item.updated_at) times[k] = item.updated_at;
        }
        setRecords(byKey);
        setSavedAt(times);
      } catch (e) {
        if (!cancelled) console.warn("설문 응답 로드 실패:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isDemo]);

  // 현재 학생·설문 대상의 스캔 이미지 로드
  useEffect(() => {
    if (isDemo || !userId || !currentStudentId) return;
    let cancelled = false;
    setScanLoading(true);
    (async () => {
      try {
        const slots = await api.getSurveyScans(currentStudentId, currentStudentName, scopeKey, userId);
        if (!cancelled) setScans((prev) => ({ ...prev, [key]: normalizeSlots(slots) }));
      } catch (e) {
        if (!cancelled) console.warn("설문지 이미지 로드 실패:", e);
      } finally {
        if (!cancelled) setScanLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // currentStudentName은 저장 경로 표기용이라 의존성에서 뺌
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isDemo, currentStudentId, scopeKey, key]);

  const record = records[key] ?? null;
  const currentScans = scans[key] ?? normalizeSlots(null);
  const hasScan = currentScans.some(Boolean);
  const reflection = (record?.reflection ?? "").trim();
  const hasScores = !!record && SURVEY_ITEMS.some((item) => record.responses[item.id] !== null);
  const hasResult = hasScores || !!reflection;

  /** 빈 슬롯부터 순서대로 채움 */
  const handleUploadImages = async (files: File[]) => {
    if (files.length === 0 || !currentStudentId) return;
    if (isDemo) {
      showNotice(t("survey.demoReadOnly"));
      return;
    }
    const free: number[] = [];
    currentScans.forEach((value, i) => {
      if (!value) free.push(i + 1);
    });
    if (free.length === 0) {
      alert(t("survey.slotsFull", { max: MAX_SURVEY_SLOTS }));
      return;
    }
    setUploading(true);
    try {
      for (let i = 0; i < Math.min(files.length, free.length); i++) {
        const raw = await readFileAsDataUrl(files[i]);
        let dataUrl = raw;
        try {
          dataUrl = await compressImageDataUrl(raw);
        } catch (e) {
          console.warn("이미지 압축 실패, 원본으로 전송:", e);
        }
        await api.uploadSurveyScan(currentStudentId, currentStudentName, scopeKey, free[i], dataUrl, userId);
      }
      const slots = await api.getSurveyScans(currentStudentId, currentStudentName, scopeKey, userId);
      setScans((prev) => ({ ...prev, [key]: normalizeSlots(slots) }));
      if (files.length > free.length) alert(t("survey.slotsFull", { max: MAX_SURVEY_SLOTS }));
    } catch (e: any) {
      alert(e?.message ?? t("survey.uploadFail"));
    } finally {
      setUploading(false);
    }
  };

  const handleUploadPdf = async (file: File) => {
    if (!currentStudentId) return;
    if (isDemo) {
      showNotice(t("survey.demoReadOnly"));
      return;
    }
    if (hasScan && !window.confirm(t("survey.pdfReplaceConfirm"))) return;
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = await api.uploadSurveyScanPdf(currentStudentId, currentStudentName, scopeKey, dataUrl, userId);
      const slots = await api.getSurveyScans(currentStudentId, currentStudentName, scopeKey, userId);
      setScans((prev) => ({ ...prev, [key]: normalizeSlots(slots) }));
      if (result.skippedPages > 0) alert(t("survey.pdfSkipped", { n: result.skippedPages }));
    } catch (e: any) {
      alert(e?.message ?? t("survey.uploadFail"));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteScan = async (slot: number) => {
    if (!currentStudentId || !window.confirm(t("survey.deleteScanConfirm"))) return;
    const previous = currentScans;
    const next = [...currentScans];
    next[slot - 1] = null;
    setScans((prev) => ({ ...prev, [key]: next }));
    if (isDemo) return;
    try {
      await api.deleteSurveyScan(currentStudentId, currentStudentName, scopeKey, slot, userId);
    } catch (e: any) {
      setScans((prev) => ({ ...prev, [key]: previous }));
      alert(e?.message ?? t("survey.uploadFail"));
    }
  };

  /** 올린 종이를 Vision LLM으로 읽어 바로 저장 (교사 입력 없음) */
  const handleRecognize = async () => {
    if (isDemo) {
      showNotice(t("survey.demoReadOnly"));
      return;
    }
    const images = currentScans.filter((u): u is string => !!u?.trim());
    if (images.length === 0) {
      alert(t("survey.recognizeNeedImage"));
      return;
    }
    setRecognizing(true);
    try {
      const result = await api.recognizeSurvey(
        {
          images,
          mode: kind === "overall" ? "survey" : "reflection",
          items:
            kind === "overall"
              ? SURVEY_ITEMS.map((item, i) => ({
                  id: item.id,
                  question: item.question[locale] ?? item.question.ko,
                  item_number: i + 1,
                }))
              : [],
          open_question: kind === "overall" ? SURVEY_OPEN_QUESTION[locale] ?? SURVEY_OPEN_QUESTION.ko : undefined,
          language: getAppLanguage(locale),
        },
        userId,
      );
      const nextRecord: SurveyRecord = {
        responses: kind === "overall" ? normalizeSurveyResponses(result.responses) : normalizeSurveyResponses({}),
        reflection: (result.reflection ?? "").trim(),
      };
      const found =
        !!nextRecord.reflection || SURVEY_ITEMS.some((item) => nextRecord.responses[item.id] !== null);
      if (!found) {
        showNotice(kind === "overall" ? t("survey.recognizeEmpty") : t("survey.recognizeReflectionEmpty"));
        return;
      }
      const saved = await api.saveSurveyResponse(
        {
          student_id: currentStudentId,
          student_name: currentStudentName,
          scope: scopeKey,
          responses: kind === "overall" ? nextRecord.responses : {},
          reflection: nextRecord.reflection,
        },
        userId,
      );
      setRecords((prev) => ({ ...prev, [key]: nextRecord }));
      setSavedAt((prev) => ({ ...prev, [key]: saved.updated_at }));
      showNotice(t("survey.recognizeSaved"));
    } catch (e: any) {
      alert(e?.message ?? t("survey.recognizeFail"));
    } finally {
      setRecognizing(false);
    }
  };

  const handleDeleteResult = async () => {
    if (!currentStudentId || !window.confirm(t("survey.deleteResultConfirm"))) return;
    const previous = records[key];
    setRecords((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (isDemo) return;
    try {
      await api.deleteSurveyResponse(currentStudentId, scopeKey, userId);
      setSavedAt((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (e: any) {
      if (previous) setRecords((prev) => ({ ...prev, [key]: previous }));
      alert(e?.message ?? t("survey.deleteResultFail"));
    }
  };

  const openQuestion = SURVEY_OPEN_QUESTION[locale] ?? SURVEY_OPEN_QUESTION.ko;

  const summaryRows = useMemo<SurveySummaryRow[]>(
    () =>
      students.map((s) => ({
        studentId: s.id,
        studentName: s.name,
        record: records[responseKey(s.id, scopeKey)] ?? null,
      })),
    [students, records, scopeKey],
  );

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <div className={styles.scopeGroup} role="group" aria-label={t("survey.scopeLabel")}>
          <span className={styles.scopeLabel}>{t("survey.scopeLabel")}</span>
          <button
            type="button"
            className={`${styles.scopeBtn} ${scopeMode === "overall" ? styles.scopeBtnActive : ""}`}
            onClick={() => setScopeMode("overall")}
          >
            {t("survey.scopeOverall")}
          </button>
          <button
            type="button"
            className={`${styles.scopeBtn} ${scopeMode === "problem" ? styles.scopeBtnActive : ""}`}
            onClick={() => problemId && setScopeMode("problem")}
            disabled={!problemId}
            title={problemId ? undefined : t("survey.scopeProblemDisabled")}
          >
            {t("survey.scopeProblem")}
          </button>
        </div>
        <button type="button" className={styles.summaryOpenBtn} onClick={() => setSummaryOpen(true)}>
          {t("survey.summaryOpen")}
        </button>
      </div>

      {/* 전체 설문은 전용 설문지를 뽑고, 문제별은 학습지 마지막 장을 그대로 쓴다 */}
      {kind === "overall" ? (
        <section className={styles.sheetCard}>
          <div className={styles.sheetCardText}>
            <h3 className={styles.sheetCardTitle}>{t("survey.sheetCardTitle")}</h3>
            <p className={styles.sheetCardDesc}>{t("survey.sheetCardDesc")}</p>
          </div>
          <button type="button" className={styles.sheetDownloadBtn} onClick={() => setPreviewOpen(true)}>
            <svg className={styles.sheetDownloadIcon} viewBox="0 0 24 24" aria-hidden>
              <path
                d="M12 4v10m0 0 4-4m-4 4-4-4M5 18h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t("survey.downloadSheet")}
          </button>
        </section>
      ) : (
        <section className={`${styles.sheetCard} ${styles.sheetCardNote}`}>
          <div className={styles.sheetCardText}>
            <h3 className={styles.sheetCardTitle}>
              {t("survey.problemSheetTitle", { label: problemLabel ?? problemId ?? "" })}
            </h3>
          </div>
        </section>
      )}

      {notice && <div className={styles.notice}>{notice}</div>}

      {!currentStudentId ? (
        <p className={styles.empty}>{t("survey.selectStudentFirst")}</p>
      ) : (
        <>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h3 className={styles.cardTitle}>
                {kind === "overall" ? t("survey.uploadTitle") : t("survey.uploadTitleProblem")}
              </h3>
              <span className={styles.savedAt}>{t("survey.responseTitle", { name: currentStudentName })}</span>
            </div>
            <p className={styles.hint}>{kind === "overall" ? t("survey.uploadHint") : t("survey.uploadHintProblem")}</p>

            <div className={styles.uploadActions}>
              <label className={`${styles.uploadBtn} ${uploading ? styles.btnDisabled : ""}`}>
                {hasScan ? t("survey.addImages") : t("survey.uploadImages")}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading}
                  className={styles.fileInput}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
                    e.target.value = "";
                    if (files.length > 0) void handleUploadImages(files);
                  }}
                />
              </label>
              <label className={`${styles.uploadBtn} ${uploading ? styles.btnDisabled : ""}`}>
                {uploading ? t("survey.uploading") : t("survey.uploadPdf")}
                <input
                  type="file"
                  accept="application/pdf"
                  disabled={uploading}
                  className={styles.fileInput}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    if (file) void handleUploadPdf(file);
                  }}
                />
              </label>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleRecognize}
                disabled={recognizing || uploading || !hasScan}
              >
                {recognizing ? t("survey.recognizing") : t("survey.recognize")}
              </button>
            </div>

            {scanLoading ? (
              <p className={styles.hint}>{t("common.loading")}</p>
            ) : (
              hasScan && (
                <div className={styles.scanGrid}>
                  {currentScans.map((src, i) =>
                    src ? (
                      <div key={i} className={styles.scanItem}>
                        <button type="button" className={styles.scanThumbBtn} onClick={() => setZoomImage(src)}>
                          <img src={src} alt={`${t("survey.uploadTitle")} ${i + 1}`} className={styles.scanThumb} />
                        </button>
                        <button
                          type="button"
                          className={styles.scanDeleteBtn}
                          onClick={() => handleDeleteScan(i + 1)}
                          aria-label={t("diagnosis.remove")}
                        >
                          ×
                        </button>
                      </div>
                    ) : null,
                  )}
                </div>
              )
            )}
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h3 className={styles.cardTitle}>{t("survey.recognizedTitle")}</h3>
              <div className={styles.cardHeadRight}>
                {savedAt[key] && <span className={styles.savedAt}>{t("survey.savedAt", { time: savedAt[key] })}</span>}
                {hasResult && (
                  <button type="button" className={styles.linkBtn} onClick={handleDeleteResult}>
                    {t("survey.deleteResult")}
                  </button>
                )}
              </div>
            </div>

            {!hasResult ? (
              <p className={styles.hint}>{t("survey.recognizedNone")}</p>
            ) : (
              <>
                {kind === "overall" && (
                  <ul className={styles.resultList}>
                    {SURVEY_ITEMS.map((item, i) => (
                      <li key={item.id} className={styles.resultRow}>
                        <span className={styles.resultIndex}>{i + 1}</span>
                        <span className={styles.resultQuestion}>
                          <span className={styles.itemConstruct}>{item.construct[locale] ?? item.construct.ko}</span>
                          {item.question[locale] ?? item.question.ko}
                        </span>
                        <span
                          className={`${styles.resultScore} ${
                            record?.responses[item.id] === null ? styles.resultScoreEmpty : ""
                          }`}
                        >
                          {record?.responses[item.id] ?? "–"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className={`${styles.resultReflection} ${kind === "problem" ? styles.resultReflectionOnly : ""}`}>
                  <div className={styles.resultReflectionLabel}>
                    {kind === "overall" ? openQuestion : t("survey.reflectionLabel")}
                  </div>
                  <p className={styles.resultReflectionText}>{reflection || "–"}</p>
                </div>
              </>
            )}
          </section>

        </>
      )}

      {zoomImage && (
        <div className={styles.zoomOverlay} onClick={() => setZoomImage(null)}>
          <img src={zoomImage} alt="" className={styles.zoomImage} />
        </div>
      )}

      <SurveyPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} />

      <SurveySummaryModal
        open={summaryOpen}
        kind={kind}
        scopeLabel={kind === "overall" ? t("survey.scopeOverall") : problemLabel ?? problemId ?? ""}
        rows={summaryRows}
        onClose={() => setSummaryOpen(false)}
      />
    </div>
  );
};
