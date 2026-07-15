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

function enqueueTypeset(el: HTMLElement, onDone?: () => void): void {
  typesetChain = typesetChain
    .then(() => typesetElement(el))
    .catch((err) => {
      console.error('MathJax 렌더링 오류:', err);
    })
    .finally(() => {
      if (onDone) onDone();
    });
}

export const useMathJax = (dependencies: unknown[] = []): RefObject<HTMLDivElement | null> => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    enqueueTypeset(el);
  }, dependencies);

  return containerRef;
};

/**
 * LaTeX 포함 HTML을 '깜빡임 없이' 렌더하는 훅.
 *
 * React가 노드의 자식을 관리하지 않도록(dangerouslySetInnerHTML 미사용) innerHTML을 직접 주입하고
 * MathJax로 조판한다. 따라서 부모 리렌더가 MathJax 조판 결과를 raw LaTeX로 되돌리지 못한다.
 * 조판이 끝날 때까지 visibility:hidden으로 두어 raw LaTeX가 잠깐도 보이지 않게 하며,
 * 안전 타임아웃으로 MathJax 지연/실패 시에도 내용이 영영 숨지 않도록 한다.
 */
export const useMathHtml = (html: string): RefObject<HTMLDivElement | null> => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.innerHTML = html || '';
    if (!html) {
      el.style.visibility = '';
      return;
    }

    el.style.visibility = 'hidden';
    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      if (ref.current) ref.current.style.visibility = '';
    };
    enqueueTypeset(el, reveal);
    // MathJax 지연/실패 대비 안전 장치 (내용이 영영 숨는 것 방지)
    const safety = setTimeout(reveal, 4000);

    return () => {
      done = true;
      clearTimeout(safety);
    };
  }, [html]);

  return ref;
};
