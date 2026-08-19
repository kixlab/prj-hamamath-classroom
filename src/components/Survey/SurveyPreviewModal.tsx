import { useEffect, useState } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import { buildSurveySections, type SurveySheetSections } from "../../utils/exportSurveyPdf";
import { SheetPreviewModal } from "../common/SheetPreviewModal";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 학생용 5점 리커트 설문지 미리보기 + PDF 다운로드 */
export function SurveyPreviewModal({ open, onClose }: Props) {
  const { t, locale } = useLocale();
  const [sections, setSections] = useState<SurveySheetSections | null>(null);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    if (!open) {
      setSections(null);
      return;
    }
    let cancelled = false;
    setBuilding(true);
    buildSurveySections(locale)
      .then((s) => {
        if (!cancelled) setSections(s);
      })
      .catch(() => {
        if (!cancelled) setSections(null);
      })
      .finally(() => {
        if (!cancelled) setBuilding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, locale]);

  return (
    <SheetPreviewModal
      open={open}
      title={t("survey.previewTitle")}
      hint={t("survey.previewHint")}
      pages={sections?.pages ?? null}
      building={building}
      filename={sections?.filename ?? "survey.pdf"}
      onClose={onClose}
    />
  );
}
