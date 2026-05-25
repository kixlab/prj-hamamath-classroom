import { useState, FormEvent } from "react";
import { isUserIdAllowed } from "../../services/accessControl";
import { useLocale } from "../../i18n/LocaleContext";
import styles from "./UserIdPage.module.css";

export const USER_ID_STORAGE_KEY = "hamamath_user_id";

interface UserIdPageProps {
  onSuccess: (userId: string) => void;
}

export const UserIdPage = ({ onSuccess }: UserIdPageProps) => {
  const { t } = useLocale();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(t('login.emptyId'));
      return;
    }
    setError("");
    setChecking(true);
    try {
      const allowed = await isUserIdAllowed(trimmed);
      if (allowed) {
        onSuccess(trimmed);
      } else {
        setError(t('login.notAllowed'));
      }
    } catch (err) {
      console.error("허용 목록 확인 실패:", err);
      setError(t('login.checkError'));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('login.title')}</h1>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label htmlFor="user-id" className={styles.label}>
            {t('login.label')}
          </label>
          <input
            id="user-id"
            type="text"
            className={styles.input}
            placeholder={t('login.placeholder')}
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
            {checking ? t('login.checking') : t('login.enter')}
          </button>
        </form>
      </div>
    </div>
  );
};
