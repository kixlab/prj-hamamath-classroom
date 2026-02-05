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

      if (window.MathJax && window.MathJax.typesetPromise && containerRef.current) {
        try {
          await window.MathJax.typesetPromise([containerRef.current]);
        } catch (err) {
          console.error('MathJax 렌더링 오류:', err);
        }
      }
    };

    renderMath();
  }, dependencies);

  return containerRef;
};
