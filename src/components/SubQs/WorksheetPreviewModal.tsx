import { useEffect, useRef, useState } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import { buildWorksheetSections, type WorksheetSections } from "../../utils/exportPdf";
import { SheetPreviewModal, SheetPreviewToggle } from "../common/SheetPreviewModal";

interface CotDataLike {
  problem?: string;
  answer?: string;
  main_solution?: string;
  grade?: string;
  image_data?: string | null;
}

interface SubQuestionDataLike {
  subject_area?: string;
  guide_sub_questions?: Array<Record<string, unknown>>;
}

interface Props {
  open: boolean;
  cotData: CotDataLike | null;
  subQuestionData: SubQuestionDataLike | null;
  preferredVersion: Record<string, "original" | "regenerated">;
  problemId: string | null;
  onClose: () => void;
  /** Word 다운로드 (SubQs의 기존 핸들러 재사용) */
  onDownloadWord: () => Promise<void> | void;
}

/**
 * 학습지(문제 + 8개 하위문항) 미리보기.
 * "모범답안 포함"을 켜면 답안 기입란 대신 모범답안이 채워진 교사용 학습지가 만들어진다.
 */
export function WorksheetPreviewModal({
  open,
  cotData,
  subQuestionData,
  preferredVersion,
  problemId,
  onClose,
  onDownloadWord,
}: Props) {
  const { t, locale } = useLocale();
  const [sections, setSections] = useState<WorksheetSections | null>(null);
  const [building, setBuilding] = useState(false);
  const [includeAnswers, setIncludeAnswers] = useState(false);

  // 최신 입력값을 ref에 보관 (빌드는 모달 open/옵션 변경 시에만 하되, 그 시점의 값 사용)
  const latest = useRef({ cotData, subQuestionData, preferredVersion, problemId, locale });
  latest.current = { cotData, subQuestionData, preferredVersion, problemId, locale };

  // 모달을 닫으면 옵션을 기본값으로 되돌린다 (다음에 열 때 학생용부터)
  useEffect(() => {
    if (!open) setIncludeAnswers(false);
  }, [open]);

  // 섹션 HTML 생성 — 모달이 열릴 때와 "모범답안 포함"을 토글할 때만 (반복 setSections로 인한 깜빡임 방지)
  useEffect(() => {
    if (!open) {
      setSections(null);
      return;
    }
    const d = latest.current;
    if (!d.cotData || !d.subQuestionData) {
      setSections(null);
      return;
    }
    let cancelled = false;
    setBuilding(true);
    buildWorksheetSections(d.cotData as never, d.subQuestionData as never, d.preferredVersion, d.problemId, d.locale, {
      includeAnswers,
    })
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
    // open/includeAnswers가 바뀔 때만 재빌드 (열려있는 동안 나머지 입력은 바뀌지 않음)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, includeAnswers]);

  return (
    <SheetPreviewModal
      open={open}
      title={t("exportPreview.title")}
      hint={t("exportPreview.hint")}
      pages={sections?.pages ?? null}
      building={building}
      filename={sections?.filename ?? "worksheet.pdf"}
      onClose={onClose}
      // Word 내보내기는 서버에서 학생용 학습지만 만든다 — 모범답안 포함 시에는 숨긴다
      onDownloadWord={includeAnswers ? undefined : onDownloadWord}
      controls={
        <SheetPreviewToggle
          label={t("exportPreview.includeAnswers")}
          checked={includeAnswers}
          disabled={building}
          onChange={setIncludeAnswers}
        />
      }
    />
  );
}
