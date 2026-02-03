import { useEffect, useRef } from 'react';

export const useMathJax = (dependencies = []) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (window.MathJax && containerRef.current) {
      window.MathJax.typesetPromise([containerRef.current]).catch((err) => {
        console.error('MathJax 렌더링 오류:', err);
      });
    }
  }, dependencies);

  return containerRef;
};
