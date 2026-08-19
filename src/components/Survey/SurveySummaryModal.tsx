import { useEffect } from "react";
import styles from "./SurveySummaryModal.module.css";
import { useLocale } from "../../i18n/LocaleContext";
import { SURVEY_ITEMS, surveyAverage, type SurveyRecord } from "../../utils/surveyItems";

export interface SurveySummaryRow {
  studentId: string;
  studentName: string;
  record: SurveyRecord | null;
}

interface Props {
  open: boolean;
  /** overall이면 리커트 점수·평균까지, problem이면 느낀점만 보여 준다 */
  kind: "overall" | "problem";
  /** 어떤 설문 대상의 현황인지 (전체 / 문제명) */
  scopeLabel: string;
  rows: SurveySummaryRow[];
  onClose: () => void;
}

/** 반 전체 설문 현황 — 학생 한 명 작업 영역과 층위가 달라 별도 화면으로 뺐다 */
export function SurveySummaryModal({ open, kind, scopeLabel, rows, onClose }: Props) {
  const { t, locale } = useLocale();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasAny = rows.some((row) => row.record);

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <h3 className={styles.title}>{t("survey.summaryTitle")}</h3>
            <span className={styles.scopeChip}>{scopeLabel}</span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t("common.close")}>
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {!hasAny ? (
            <p className={styles.empty}>{t("survey.summaryEmpty")}</p>
          ) : (
            <table className={styles.summaryTable}>
              <thead>
                <tr>
                  <th>{t("survey.summaryStudent")}</th>
                  {kind === "overall" &&
                    SURVEY_ITEMS.map((item, i) => (
                      <th key={item.id} title={item.question[locale] ?? item.question.ko}>
                        {i + 1}
                      </th>
                    ))}
                  {kind === "overall" && <th>{t("survey.summaryAverage")}</th>}
                  <th className={styles.summaryReflectionCol}>
                    {kind === "overall" ? t("survey.openQuestionLabel") : t("survey.summaryReflection")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const text = (row.record?.reflection ?? "").trim();
                  const average = row.record ? surveyAverage(row.record.responses) : null;
                  return (
                    <tr key={row.studentId}>
                      <td className={styles.summaryName}>{row.studentName}</td>
                      {kind === "overall" &&
                        SURVEY_ITEMS.map((item) => <td key={item.id}>{row.record?.responses[item.id] ?? "–"}</td>)}
                      {kind === "overall" && (
                        <td className={styles.summaryAverage}>{average === null ? "–" : average.toFixed(2)}</td>
                      )}
                      <td className={styles.summaryReflection} title={text || undefined}>
                        {text ? (kind === "overall" ? t("survey.summaryHasText") : text) : "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
