import { useEffect, useRef, useState } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import {
  buildRubricSections,
  type RubricExportMeta,
  type RubricItemExport,
  type RubricSections,
} from "../../utils/exportRubricPdf";
import { SheetPreviewModal, SheetPreviewToggle } from "../common/SheetPreviewModal";

interface Props {
  open: boolean;
  rubrics: RubricItemExport[];
  meta: RubricExportMeta;
  onClose: () => void;
}

/** 완성된 루브릭을 A4 미리보기로 보여주고 PDF로 내려받게 하는 모달 */
export function RubricPreviewModal({ open, rubrics, meta, onClose }: Props) {
  const { t, locale, formatLevel } = useLocale();
  const [sections, setSections] = useState<RubricSections | null>(null);
  const [building, setBuilding] = useState(false);
  const [includeExamples, setIncludeExamples] = useState(true);

  // 빌드 시점의 값을 쓰기 위해 ref에 보관 (열려 있는 동안 루브릭은 바뀌지 않음)
  const latest = useRef({ rubrics, meta, locale, formatLevel });
  latest.current = { rubrics, meta, locale, formatLevel };

  useEffect(() => {
    if (!open) {
      setSections(null);
      return;
    }
    const d = latest.current;
    if (!d.rubrics.length) {
      setSections(null);
      return;
    }
    let cancelled = false;
    setBuilding(true);
    buildRubricSections(d.rubrics, d.meta, d.locale, { includeExamples }, d.formatLevel)
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
    // open/includeExamples가 바뀔 때만 재빌드
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, includeExamples]);

  return (
    <SheetPreviewModal
      open={open}
      title={t("exportRubric.previewTitle")}
      hint={t("exportRubric.previewHint")}
      pages={sections?.pages ?? null}
      building={building}
      filename={sections?.filename ?? "rubric.pdf"}
      onClose={onClose}
      controls={
        <SheetPreviewToggle
          label={t("exportRubric.includeExamples")}
          checked={includeExamples}
          disabled={building}
          onChange={setIncludeExamples}
        />
      }
    />
  );
}
