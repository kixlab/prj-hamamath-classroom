import { useApp } from '../../contexts/AppContext';
import styles from './Header.module.css';

interface HeaderProps {
  onNewProblem: () => void;
  onShowUserIdPage?: () => void;
  userId?: string | null;
  mode?: "workflow" | "diagnosis";
  onSelectWorkflow?: () => void;
  onSelectDiagnosis?: () => void;
}

export const Header = ({
  onNewProblem,
  onShowUserIdPage,
  userId,
  mode,
  onSelectWorkflow,
  onSelectDiagnosis,
}: HeaderProps) => {
  const { sidebarOpen, setSidebarOpen } = useApp();

  const handleHamburgerClick = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined' && window.confirm('로그아웃 하시겠습니까?')) {
      onShowUserIdPage?.();
    }
  };

  return (
    <div className={styles.header}>
      <button
        className={styles.hamburgerMenuBtn}
        id="hamburgerMenuBtn"
        onClick={handleHamburgerClick}
        aria-label="메뉴 열기"
        style={{ display: sidebarOpen ? 'none' : 'block' }}
      >
        ☰
      </button>
      <div className={styles.titleWrap}>
        <button
          type="button"
          className={styles.titleBtn}
          onClick={onShowUserIdPage}
          aria-label="아이디 입력 페이지로 이동"
        >
          <h3 className={styles.title}>AI 기반 수학 사고 과정 진단</h3>
        </button>
      </div>
      <div className={styles.headerRight}>
        {mode && onSelectWorkflow && onSelectDiagnosis ? (
          <div className={styles.modeToggle}>
            <button
              type="button"
              className={`${styles.modeBtn} ${
                mode === "workflow" ? styles.modeBtnActive : ""
              }`}
              onClick={onSelectWorkflow}
            >
              문항 생성
            </button>
            <button
              type="button"
              className={`${styles.modeBtn} ${
                mode === "diagnosis" ? styles.modeBtnActive : ""
              }`}
              onClick={onSelectDiagnosis}
            >
              학생 진단
            </button>
          </div>
        ) : (
          <button className={styles.newProblemBtn} onClick={onNewProblem}>
            문제 입력하기
          </button>
        )}
        {userId && (
          <>
            <span className={styles.userIdLabel}>{userId}</span>
            <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
              로그아웃
            </button>
          </>
        )}
      </div>
    </div>
  );
};
