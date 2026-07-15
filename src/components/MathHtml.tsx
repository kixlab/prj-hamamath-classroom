import { useMathHtml } from "../hooks/useMathJax";

interface MathHtmlProps {
  html: string;
  className?: string;
}

/**
 * LaTeX 포함 텍스트를 MathJax로 렌더 (문항·정답 등).
 *
 * innerHTML을 직접 주입하는 useMathHtml을 사용해 React가 노드 내용을 관리하지 않게 한다.
 * → 리렌더/탭 이동/문항 추가 시 조판된 수식이 raw LaTeX로 되돌아가며 깜빡이는 문제를 방지.
 */
export function MathHtml({ html, className }: MathHtmlProps) {
  const ref = useMathHtml(html || "");
  return <div ref={ref} className={className} />;
}
