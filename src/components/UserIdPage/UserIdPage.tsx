import { useState, FormEvent } from "react";
import { isUserIdAllowed } from "../../services/accessControl";
import styles from "./UserIdPage.module.css";

export const USER_ID_STORAGE_KEY = "hamamath_user_id";

interface UserIdPageProps {
  onSuccess: (userId: string) => void;
}

export const UserIdPage = ({ onSuccess }: UserIdPageProps) => {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("아이디를 입력해 주세요.");
      return;
    }
    setError("");
    setChecking(true);
    try {
      const allowed = await isUserIdAllowed(trimmed);
      if (allowed) {
        onSuccess(trimmed);
      } else {
        setError("허용된 사용자가 아닙니다. 관리자에게 문의하세요.");
      }
    } catch (err) {
      console.error("허용 목록 확인 실패:", err);
      setError("접속 권한 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>아이디를 입력해 주세요</h1>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label htmlFor="user-id" className={styles.label}>
            아이디
          </label>
          <input
            id="user-id"
            type="text"
            className={styles.input}
            placeholder="아이디 입력"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            autoFocus
            autoComplete="username"
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.submitBtn} disabled={!value.trim() || checking}>
            {checking ? "확인 중..." : "입장"}
          </button>
        </form>
      </div>
    </div>
  );
};
