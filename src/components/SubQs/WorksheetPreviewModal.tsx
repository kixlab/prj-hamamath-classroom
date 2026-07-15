import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import {
  buildWorksheetSections,
  renderWorksheetPdfFromElements,
  typesetMathJax,
  worksheetFontFamily,
  WORKSHEET_BASE_STYLE,
  type WorksheetSections,
} from "../../utils/exportPdf";
import styles from "./WorksheetPreviewModal.module.css";

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

const SHEET_WIDTH = 794; // A4 폭 (px)

/**
 * 한 장(표지/본문/마무리)을 렌더하고 MathJax로 조판.
 *
 * 깜빡임 방지 핵심: React가 이 노드의 자식을 관리하지 않도록 dangerouslySetInnerHTML을 쓰지 않고,
 * useEffect에서 innerHTML을 '직접' 주입한 뒤 MathJax로 조판한다. 이렇게 하면 부모가 리렌더돼도
 * React가 MathJax 조판 결과를 raw LaTeX로 되돌리지 않는다.
 * 또한 조판이 끝날 때까지 visibility:hidden으로 두어 raw LaTeX가 잠깐도 보이지 않게 한다.
 */
const WorksheetSheet = memo(function WorksheetSheet({
  html,
  baseStyle,
  nodeRef,
}: {
  html: string;
  baseStyle: React.CSSProperties;
  nodeRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const localRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    let cancelled = false;
    el.innerHTML = html;
    el.style.visibility = "hidden"; // 조판 전 raw LaTeX 노출 방지
    typesetMathJax(el).finally(() => {
      if (!cancelled && localRef.current) localRef.current.style.visibility = "visible";
    });
    return () => {
      cancelled = true;
    };
  }, [html]);

  const setNode = useCallback(
    (node: HTMLDivElement | null) => {
      localRef.current = node;
      nodeRef.current = node;
    },
    [nodeRef],
  );

  // 자식 없음 → React가 내용을 절대 건드리지 않음 (innerHTML은 위 effect가 관리)
  return <div ref={setNode} className={styles.sheet} style={baseStyle} />;
});

/** 세 섹션(표지·본문·마무리)을 화면에 렌더한 뒤 PDF/Word 다운로드를 제공하는 미리보기 모달 */
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
  const [downloading, setDownloading] = useState<"pdf" | "word" | null>(null);
  const [scale, setScale] = useState(1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const finalRef = useRef<HTMLDivElement | null>(null);
  const coverWrapRef = useRef<HTMLDivElement>(null);
  const bodyWrapRef = useRef<HTMLDivElement>(null);
  const finalWrapRef = useRef<HTMLDivElement>(null);

  // 최신 입력값을 ref에 보관 (빌드는 모달 open 시 한 번만 하되, 그 시점의 값 사용)
  const latest = useRef({ cotData, subQuestionData, preferredVersion, problemId, locale });
  latest.current = { cotData, subQuestionData, preferredVersion, problemId, locale };

  // 섹션 HTML 생성 — 모달이 열릴 때 한 번만 (반복 setSections로 인한 깜빡임 방지)
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
    buildWorksheetSections(d.cotData as never, d.subQuestionData as never, d.preferredVersion, d.problemId, d.locale)
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
    // open이 바뀔 때만 재빌드 (열려있는 동안 입력은 바뀌지 않음)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const baseStyle = useMemo<React.CSSProperties>(
    () => ({ ...(WORKSHEET_BASE_STYLE as React.CSSProperties), fontFamily: worksheetFontFamily(locale) }),
    [locale],
  );

  // 모달 폭에 맞춰 A4 시트 축소 배율 계산
  useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const avail = scrollRef.current?.clientWidth ?? SHEET_WIDTH;
      setScale(Math.min(1, (avail - 8) / SHEET_WIDTH));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [open, sections]);

  // 스케일 적용: 축소된 시트가 레이아웃에서 실제 크기를 차지하도록 래퍼 크기 동기화
  useEffect(() => {
    if (!sections) return;
    const pairs: Array<[HTMLDivElement | null, HTMLDivElement | null]> = [
      [coverRef.current, coverWrapRef.current],
      [bodyRef.current, bodyWrapRef.current],
      [finalRef.current, finalWrapRef.current],
    ];
    const sync = () => {
      for (const [sheet, wrap] of pairs) {
        if (!sheet || !wrap) continue;
        wrap.style.width = `${SHEET_WIDTH * scale}px`;
        wrap.style.height = `${sheet.offsetHeight * scale}px`;
      }
    };
    sync();
    // MathJax 조판 등으로 시트 높이가 바뀌면 래퍼도 다시 동기화
    const observers = pairs
      .map(([sheet]) => sheet)
      .filter((s): s is HTMLDivElement => !!s)
      .map((sheet) => {
        const ro = new ResizeObserver(sync);
        ro.observe(sheet);
        return ro;
      });
    return () => observers.forEach((ro) => ro.disconnect());
  }, [sections, scale]);

  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleDownloadPdf = useCallback(async () => {
    if (!sections || !coverRef.current || !bodyRef.current || !finalRef.current) return;
    setDownloading("pdf");
    try {
      await renderWorksheetPdfFromElements(coverRef.current, bodyRef.current, finalRef.current, sections.filename);
    } catch (e) {
      alert((e as Error)?.message || t("subq.pdfExportError"));
    } finally {
      setDownloading(null);
    }
  }, [sections, t]);

  const handleDownloadWord = useCallback(async () => {
    setDownloading("word");
    try {
      await onDownloadWord();
    } finally {
      setDownloading(null);
    }
  }, [onDownloadWord]);

  if (!open) return null;

  const pageDefs = sections
    ? [
        { key: "cover", nodeRef: coverRef, wrapRef: coverWrapRef, html: sections.coverHtml, label: t("exportPreview.pageCover") },
        { key: "body", nodeRef: bodyRef, wrapRef: bodyWrapRef, html: sections.bodyHtml, label: t("exportPreview.pageBody") },
        { key: "final", nodeRef: finalRef, wrapRef: finalWrapRef, html: sections.finalHtml, label: t("exportPreview.pageFinal") },
      ]
    : [];

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>{t("exportPreview.title")}</div>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t("common.close")}>
            ✕
          </button>
        </div>

        <div className={styles.scroll} ref={scrollRef}>
          {building && <div className={styles.loading}>{t("common.loading")}</div>}
          {sections && (
            <div className={styles.pages}>
              {pageDefs.map((p) => (
                <div key={p.key} className={styles.pageBlock}>
                  <div className={styles.pageLabel}>{p.label}</div>
                  <div className={styles.sheetScale} ref={p.wrapRef}>
                    <div
                      className={styles.sheetScaleInner}
                      style={{ width: SHEET_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}
                    >
                      <WorksheetSheet html={p.html} baseStyle={baseStyle} nodeRef={p.nodeRef} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.hint}>{t("exportPreview.hint")}</span>
          <div className={styles.actions}>
            <button className={styles.secondaryBtn} onClick={onClose} disabled={downloading !== null}>
              {t("common.close")}
            </button>
            <button className={styles.wordBtn} onClick={handleDownloadWord} disabled={downloading !== null || !sections}>
              {downloading === "word" ? t("common.loading") : t("common.wordDownload")}
            </button>
            <button className={styles.pdfBtn} onClick={handleDownloadPdf} disabled={downloading !== null || !sections}>
              {downloading === "pdf" ? t("common.loading") : t("common.pdfDownload")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
