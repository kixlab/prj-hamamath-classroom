import { useEffect, useRef, RefObject } from 'react';

let typesetChain: Promise<void> = Promise.resolve();

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

async function typesetElement(el: HTMLElement): Promise<void> {
  await waitForMathJax();
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

  if (!el.isConnected || !window.MathJax?.typesetPromise) return;

  if (window.MathJax.typesetClear) {
    window.MathJax.typesetClear([el]);
  }
  await window.MathJax.typesetPromise([el]);
  await new Promise((r) => setTimeout(r, 50));
  if (el.isConnected && window.MathJax.typesetPromise) {
    await window.MathJax.typesetPromise([el]);
  }
}

function enqueueTypeset(el: HTMLElement): void {
  typesetChain = typesetChain
    .then(() => typesetElement(el))
    .catch((err) => {
      console.error('MathJax 렌더링 오류:', err);
    });
}

export const useMathJax = (dependencies: unknown[] = []): RefObject<HTMLDivElement> => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    enqueueTypeset(el);
  }, dependencies);

  return containerRef;
};
