/**
 * 업로드 전 이미지 압축 (413 Payload Too Large 방지).
 * data URL을 받아 리사이즈·JPEG 품질 조정 후 data URL 반환.
 */

const DEFAULT_MAX_DIMENSION = 1200;
const DEFAULT_MAX_SIZE_KB = 450;
const MIN_QUALITY = 0.5;

function getDataUrlSizeKb(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return 0;
  return (base64.length * 3) / 4 / 1024;
}

/**
 * 이미지 data URL을 압축합니다.
 * - 긴 변을 maxDimension 이하로 리사이즈
 * - JPEG 품질로 인코딩 (품질은 목표 크기 이하가 되도록 자동 조정)
 * @param dataUrl data URL (image/png, image/jpeg 등)
 * @param maxSizeKb 목표 최대 크기(KB). 기본 450KB (JSON 포함 시에도 일반 서버 한도 내)
 * @param maxDimension 긴 변 최대 픽셀. 기본 1200
 */
export function compressImageDataUrl(
  dataUrl: string,
  maxSizeKb: number = DEFAULT_MAX_SIZE_KB,
  maxDimension: number = DEFAULT_MAX_DIMENSION
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w <= 0 || h <= 0) {
          resolve(dataUrl);
          return;
        }
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
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        let quality = 0.88;
        let result = canvas.toDataURL("image/jpeg", quality);
        while (getDataUrlSizeKb(result) > maxSizeKb && quality > MIN_QUALITY) {
          quality -= 0.12;
          if (quality < MIN_QUALITY) quality = MIN_QUALITY;
          result = canvas.toDataURL("image/jpeg", quality);
          if (quality <= MIN_QUALITY) break;
        }
        resolve(result);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("이미지를 불러올 수 없습니다."));
    img.src = dataUrl;
  });
}
