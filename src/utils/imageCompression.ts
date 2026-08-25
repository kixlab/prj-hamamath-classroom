/**
 * 업로드 전 이미지 압축 (413 Payload Too Large 방지).
 * data URL을 받아 리사이즈·JPEG 품질 조정 후 data URL 반환.
 */

import { IMAGE_TARGET_WIRE_KB, wireSizeBytes } from "./uploadLimits";

const DEFAULT_MAX_DIMENSION = 1200;
const MIN_DIMENSION = 700;
const MIN_QUALITY = 0.5;
const START_QUALITY = 0.88;
const QUALITY_STEP = 0.12;

/** 전송될 크기(KB) — base64 문자열 길이 기준이라 디코딩 후 바이트보다 약 33% 크다 */
function getWireSizeKb(dataUrl: string): number {
  return wireSizeBytes(dataUrl) / 1024;
}

/** 긴 변을 maxDimension 이하로 맞춰 JPEG로 인코딩 */
function renderToDataUrl(
  img: HTMLImageElement,
  maxDimension: number,
  quality: number
): string | null {
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w > maxDimension || h > maxDimension) {
    if (w >= h) {
      h = Math.round((h * maxDimension) / w);
      w = maxDimension;
    } else {
      w = Math.round((w * maxDimension) / h);
      h = maxDimension;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * 이미지 data URL을 압축합니다.
 * - 긴 변을 maxDimension 이하로 리사이즈
 * - 목표 크기 이하가 될 때까지 JPEG 품질을 낮춤
 * - 품질 하한에서도 목표를 못 맞추면 해상도를 더 줄여 재시도
 * @param dataUrl data URL (image/png, image/jpeg 등)
 * @param maxSizeKb 목표 최대 전송 크기(KB, base64 기준). 기본 600KB
 * @param maxDimension 긴 변 최대 픽셀. 기본 1200
 */
export function compressImageDataUrl(
  dataUrl: string,
  maxSizeKb: number = IMAGE_TARGET_WIRE_KB,
  maxDimension: number = DEFAULT_MAX_DIMENSION
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
          resolve(dataUrl);
          return;
        }

        let dimension = maxDimension;
        let result: string | null = null;

        while (dimension >= MIN_DIMENSION) {
          let quality = START_QUALITY;
          const first = renderToDataUrl(img, dimension, quality);
          if (!first) {
            resolve(dataUrl);
            return;
          }
          result = first;
          while (getWireSizeKb(result) > maxSizeKb && quality > MIN_QUALITY) {
            quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP);
            result = renderToDataUrl(img, dimension, quality) ?? result;
          }
          if (getWireSizeKb(result) <= maxSizeKb) break;
          dimension = Math.round(dimension * 0.8);
        }

        resolve(result ?? dataUrl);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("이미지를 불러올 수 없습니다."));
    img.src = dataUrl;
  });
}
