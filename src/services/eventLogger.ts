import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";

const MAX_STRING = 6000; // Firestore 문서 크기 제한 대비

let currentUserId: string | null = null;
let collectionId: string | null = null;
let unsubscribe: (() => void) | null = null;

function sanitizeCollectionId(userId: string): string {
  return userId.replace(/[/\\[\]#?]/g, "_").trim() || "anonymous";
}

/** payload 내 문자열/중첩 객체 정제 (문자열 길이 제한) */
function sanitizePayload(obj: unknown): unknown {
  if (obj == null) return obj;
  if (typeof obj === "string") return obj.length > MAX_STRING ? obj.slice(0, MAX_STRING) + "…" : obj;
  if (Array.isArray(obj)) return obj.map(sanitizePayload).slice(0, 500);
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (Object.keys(out).length >= 100) break;
      out[k] = sanitizePayload(v);
    }
    return out;
  }
  return obj;
}

function getTargetInfo(el: EventTarget | null): Record<string, unknown> {
  if (!el || !(el instanceof Element)) return {};
  const tag = el.tagName?.toLowerCase() || "";
  const id = el.id || undefined;
  const className = el.className && typeof el.className === "string" ? el.className.slice(0, 150) : undefined;
  const dataAttrs: Record<string, string> = {};
  if (el instanceof Element) {
    for (const a of el.attributes) {
      if (a.name.startsWith("data-")) dataAttrs[a.name] = a.value.slice(0, 100);
    }
  }
  const textContent =
    typeof el.textContent === "string" ? el.textContent.replace(/\s+/g, " ").trim().slice(0, 200) : undefined;
  const role = el.getAttribute?.("role") ?? undefined;
  const ariaLabel = el.getAttribute?.("aria-label") ?? undefined;
  return {
    tag,
    id,
    className,
    ...(Object.keys(dataAttrs).length ? { data: dataAttrs } : {}),
    ...(textContent ? { text: textContent } : {}),
    ...(role ? { role } : {}),
    ...(ariaLabel ? { ariaLabel } : {}),
  };
}

function handleClick(e: MouseEvent) {
  if (!collectionId || !db) return;
  const target = getTargetInfo(e.target);
  const doc = {
    userId: currentUserId,
    timestamp: serverTimestamp(),
    eventType: "click",
    pathname: window.location.pathname || "/",
    target,
    clientX: e.clientX,
    clientY: e.clientY,
  };
  const col = collection(db, collectionId);
  addDoc(col, doc).catch((err) => console.warn("[eventLogger] Firestore write failed:", err));
}

/**
 * 유저 스터디용: 모든 클릭을 Firestore에 기록합니다.
 * 컬렉션 이름 = 로그인한 아이디 (예: doh, user01). userId가 설정된 뒤에 한 번만 호출하세요.
 */
export function initEventLogger(userId: string) {
  if (unsubscribe) return;
  currentUserId = userId;
  collectionId = sanitizeCollectionId(userId);
  document.addEventListener("click", handleClick, true);
  unsubscribe = () => {
    document.removeEventListener("click", handleClick, true);
    currentUserId = null;
    collectionId = null;
    unsubscribe = null;
  };
}

export function stopEventLogger() {
  if (unsubscribe) {
    unsubscribe();
  }
}

/**
 * 유저 스터디용: 사용자 입력, LLM 출력, 수정/피드백/선택 등 이벤트를 Firestore에 기록합니다.
 * initEventLogger(userId) 호출 후 사용하세요. 같은 컬렉션(아이디)에 eventType + payload로 저장됩니다.
 */
export function logUserEvent(eventType: string, payload?: Record<string, unknown>) {
  if (!collectionId || !db) return;
  const doc = {
    userId: currentUserId,
    timestamp: serverTimestamp(),
    eventType,
    pathname: window.location.pathname || "/",
    ...(payload ? sanitizePayload(payload) as Record<string, unknown> : {}),
  };
  const col = collection(db, collectionId);
  addDoc(col, doc).catch((err) => console.warn("[eventLogger] logUserEvent failed:", err));
}
