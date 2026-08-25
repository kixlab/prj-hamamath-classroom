/**
 * 업로드 크기 한도.
 * 파일을 multipart가 아니라 base64 data URL로 JSON에 담아 보내므로,
 * 실제 전송량은 원본 파일 크기보다 약 33% 크다. 모든 한도는 전송량 기준으로 잡는다.
 */

/** nginx client_max_body_size와 맞물린 값 — 서버 설정을 바꾸면 여기도 같이 바꿀 것 (현재 20M) */
const SERVER_BODY_LIMIT_BYTES = 20 * 1024 * 1024;

/** base64 인코딩 후 크기 배율 (4/3) */
const BASE64_OVERHEAD = 4 / 3;

/** PDF 원본 파일 크기 상한 — 인코딩 후에도 서버 한도 안에 들도록 여유를 둠 */
export const MAX_PDF_FILE_BYTES = Math.floor((SERVER_BODY_LIMIT_BYTES * 0.9) / BASE64_OVERHEAD);

/** 이미지 1장의 전송 크기 목표(KB, base64 문자열 기준) */
export const IMAGE_TARGET_WIRE_KB = 600;

/** data URL이 실제로 전송될 바이트 수 — base64 문자열 길이 그 자체 */
export function wireSizeBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1];
  return base64 ? base64.length : 0;
}

/** 바이트를 "13.5MB" 형태로 */
export function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
