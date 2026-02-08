import { getDoc, doc } from "firebase/firestore";
import { db } from "../../firebase";

const CONFIG_COLLECTION = "config";
const ACCESS_DOC_ID = "access";
const FIELD_ALLOWED_IDS = "allowedIds";

/** Firestore config/access 문서의 allowedIds 배열을 반환. 없으면 빈 배열 */
export async function getAllowedUserIds(): Promise<string[]> {
  const ref = doc(db, CONFIG_COLLECTION, ACCESS_DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return [];
  const data = snap.data();
  const ids = data[FIELD_ALLOWED_IDS];
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean);
}

/** 입력한 아이디가 허용 목록에 있는지 확인 */
export async function isUserIdAllowed(userId: string): Promise<boolean> {
  const allowed = await getAllowedUserIds();
  const trimmed = userId.trim();
  return allowed.some((id) => id === trimmed);
}
