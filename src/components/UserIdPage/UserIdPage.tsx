import { useState, FormEvent } from 'react';
import styles from './UserIdPage.module.css';

export const USER_ID_STORAGE_KEY = 'hamamath_user_id';

interface UserIdPageProps {
  onSuccess: (userId: string) => void;
}

export const UserIdPage = ({ onSuccess }: UserIdPageProps) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError('아이디를 입력해 주세요.');
      return;
    }
    setError('');
    onSuccess(trimmed);
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
              setError('');
            }}
            autoFocus
            autoComplete="username"
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.submitBtn} disabled={!value.trim()}>
            입장
          </button>
        </form>
      </div>
    </div>
  );
};
