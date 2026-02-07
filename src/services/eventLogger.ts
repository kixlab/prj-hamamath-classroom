import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";

let currentUserId: string | null = null;
/** Firestore 컬렉션 ID용 (로그인한 아이디, `/` 등 불가 문자 치환) */
let collectionId: string | null = null;
let unsubscribe: (() => void) | null = null;

/** Firestore 컬렉션 ID에 쓸 수 있도록 문자 정제 */
function sanitizeCollectionId(userId: string): string {
  return userId.replace(/[/\\[\]#?]/g, "_").trim() || "anonymous";
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
