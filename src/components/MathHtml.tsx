import { useMathJax } from "../hooks/useMathJax";

interface MathHtmlProps {
  html: string;
  className?: string;
}

/** innerHTML + MathJax 렌더링 (문항·정답 등 LaTeX 포함 텍스트) */
export function MathHtml({ html, className }: MathHtmlProps) {
  const ref = useMathJax([html]);
  if (!html) {
    return <div className={className} />;
  }
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
