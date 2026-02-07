import { useEffect, useRef, RefObject } from 'react';

// MathJax가 로드될 때까지 기다리는 함수
const waitForMathJax = (): Promise<void> => {
  return new Promise((resolve) => {
    if (window.MathJax && window.MathJax.typesetPromise) {
      resolve();
    } else {
      const checkInterval = setInterval(() => {
        if (window.MathJax && window.MathJax.typesetPromise) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // 최대 10초 대기
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 10000);
    }
  });
};

export const useMathJax = (dependencies: unknown[] = []): RefObject<HTMLDivElement> => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderMath = async () => {
      if (!containerRef.current) return;

      await waitForMathJax();

      // DOM 반영 + React 커밋 대기 후 수식 렌더링 (동적 콘텐츠에서 $ ... $ 인식 보장)
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      await new Promise((r) => setTimeout(r, 100));

      const el = containerRef.current;
      if (!el || !window.MathJax?.typesetPromise) return;
      try {
        await window.MathJax.typesetPromise([el]);
        // 동적 삽입 직후 한 번 놓치는 경우 대비 한 번 더 시도
        await new Promise((r) => setTimeout(r, 50));
        if (window.MathJax.typesetPromise) await window.MathJax.typesetPromise([el]);
      } catch (err) {
        console.error('MathJax 렌더링 오류:', err);
      }
    };

    renderMath();
  }, dependencies);

  return containerRef;
};
