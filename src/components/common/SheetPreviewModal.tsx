import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import {
  renderSheetsPdfFromElements,
  sheetFontFamily,
  SHEET_BASE_STYLE,
  typesetMathJax,
  type SheetPage,
} from "../../utils/pdfSheet";
import styles from "./SheetPreviewModal.module.css";

const SHEET_WIDTH = 794; // A4 폭 (px)

/**
 * 한 장을 렌더하고 MathJax로 조판.
 *
 * 깜빡임 방지 핵심: React가 이 노드의 자식을 관리하지 않도록 dangerouslySetInnerHTML을 쓰지 않고,
 * useEffect에서 innerHTML을 '직접' 주입한 뒤 MathJax로 조판한다. 이렇게 하면 부모가 리렌더돼도
 * React가 MathJax 조판 결과를 raw LaTeX로 되돌리지 않는다.
 * 또한 조판이 끝날 때까지 visibility:hidden으로 두어 raw LaTeX가 잠깐도 보이지 않게 한다.
 */
const Sheet = memo(function Sheet({
  html,
  baseStyle,
  onNode,
}: {
  html: string;
  baseStyle: React.CSSProperties;
  onNode: (node: HTMLDivElement | null) => void;
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
      onNode(node);
    },
    [onNode],
  );

  // 자식 없음 → React가 내용을 절대 건드리지 않음 (innerHTML은 위 effect가 관리)
  return <div ref={setNode} className={styles.sheet} style={baseStyle} />;
});

/** 미리보기 푸터에 넣는 옵션 체크박스 (예: "모범답안 포함") */
export function SheetPreviewToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.optionToggle}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

interface Props {
  open: boolean;
  /** 모달 제목 */
  title: string;
  /** 하단 안내 문구 */
  hint: string;
  /** 표시할 시트들. null이면 아직 생성 중/생성 실패 */
  pages: SheetPage[] | null;
  /** 섹션 생성 중 여부 */
  building: boolean;
  /** 저장 파일명 */
  filename: string;
  onClose: () => void;
  /** 선택: Word 다운로드 버튼 (제공하면 표시) */
  onDownloadWord?: () => Promise<void> | void;
  /** 선택: 푸터 왼쪽에 끼워 넣을 옵션 컨트롤 (예: "모범답안 포함" 체크박스) */
  controls?: ReactNode;
}

/**
 * A4 시트들을 화면에 렌더한 뒤 PDF(및 선택적으로 Word) 다운로드를 제공하는 공용 미리보기 모달.
 * 학습지·루브릭 등 시트 기반 내보내기가 모두 이 모달을 쓴다.
 */
export function SheetPreviewModal({
  open,
  title,
  hint,
  pages,
  building,
  filename,
  onClose,
  onDownloadWord,
  controls,
}: Props) {
  const { t, locale } = useLocale();
  const [downloading, setDownloading] = useState<"pdf" | "word" | null>(null);
  const [scale, setScale] = useState(1);

  const scrollRef = useRef<HTMLDivElement>(null);
  /** page.key → 시트 DOM 노드 (캡처 대상) */
  const sheetNodes = useRef(new Map<string, HTMLDivElement>());
  /** page.key → 스케일 래퍼 (축소된 시트가 레이아웃 크기를 차지하도록) */
  const wrapNodes = useRef(new Map<string, HTMLDivElement>());

  const baseStyle = useMemo<React.CSSProperties>(
    () => ({ ...(SHEET_BASE_STYLE as React.CSSProperties), fontFamily: sheetFontFamily(locale) }),
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
  }, [open, pages]);

  // 스케일 적용: 축소된 시트가 레이아웃에서 실제 크기를 차지하도록 래퍼 크기 동기화
  useEffect(() => {
    if (!pages) return;
    const sync = () => {
      for (const page of pages) {
        const sheet = sheetNodes.current.get(page.key);
        const wrap = wrapNodes.current.get(page.key);
        if (!sheet || !wrap) continue;
        wrap.style.width = `${SHEET_WIDTH * scale}px`;
        wrap.style.height = `${sheet.offsetHeight * scale}px`;
      }
    };
    sync();
    // MathJax 조판 등으로 시트 높이가 바뀌면 래퍼도 다시 동기화
    const observers = pages
      .map((page) => sheetNodes.current.get(page.key))
      .filter((s): s is HTMLDivElement => !!s)
      .map((sheet) => {
        const ro = new ResizeObserver(sync);
        ro.observe(sheet);
        return ro;
      });
    return () => observers.forEach((ro) => ro.disconnect());
  }, [pages, scale]);

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
    if (!pages) return;
    const sheets = pages
      .map((page) => {
        const el = sheetNodes.current.get(page.key);
        return el ? { el, fit: page.fit } : null;
      })
      .filter((s): s is { el: HTMLDivElement; fit: SheetPage["fit"] } => s !== null);
    if (sheets.length !== pages.length) return; // 아직 마운트되지 않은 시트가 있으면 대기

    setDownloading("pdf");
    try {
      await renderSheetsPdfFromElements(sheets, filename);
    } catch (e) {
      alert((e as Error)?.message || t("subq.pdfExportError"));
    } finally {
      setDownloading(null);
    }
  }, [pages, filename, t]);

  const handleDownloadWord = useCallback(async () => {
    if (!onDownloadWord) return;
    setDownloading("word");
    try {
      await onDownloadWord();
    } finally {
      setDownloading(null);
    }
  }, [onDownloadWord]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>{title}</div>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t("common.close")}>
            ✕
          </button>
        </div>

        <div className={styles.scroll} ref={scrollRef}>
          {building && <div className={styles.loading}>{t("common.loading")}</div>}
          {!building && pages && (
            <div className={styles.pages}>
              {pages.map((page) => (
                <div key={page.key} className={styles.pageBlock}>
                  <div className={styles.pageLabel}>{page.label}</div>
                  <div
                    className={styles.sheetScale}
                    ref={(node) => {
                      if (node) wrapNodes.current.set(page.key, node);
                      else wrapNodes.current.delete(page.key);
                    }}
                  >
                    <div
                      className={styles.sheetScaleInner}
                      style={{ width: SHEET_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}
                    >
                      <Sheet
                        html={page.html}
                        baseStyle={baseStyle}
                        onNode={(node) => {
                          if (node) sheetNodes.current.set(page.key, node);
                          else sheetNodes.current.delete(page.key);
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {controls}
            <span className={styles.hint}>{hint}</span>
          </div>
          <div className={styles.actions}>
            <button className={styles.secondaryBtn} onClick={onClose} disabled={downloading !== null}>
              {t("common.close")}
            </button>
            {onDownloadWord && (
              <button
                className={styles.wordBtn}
                onClick={handleDownloadWord}
                disabled={downloading !== null || !pages || building}
              >
                {downloading === "word" ? t("common.loading") : t("common.wordDownload")}
              </button>
            )}
            <button
              className={styles.pdfBtn}
              onClick={handleDownloadPdf}
              disabled={downloading !== null || !pages || building}
            >
              {downloading === "pdf" ? t("common.loading") : t("common.pdfDownload")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
