import { useApp } from '../../contexts/AppContext';
import styles from './Header.module.css';

interface HeaderProps {
  onNewProblem: () => void;
  onShowUserIdPage?: () => void;
  userId?: string | null;
}

export const Header = ({ onNewProblem, onShowUserIdPage, userId }: HeaderProps) => {
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
        <button className={styles.newProblemBtn} onClick={onNewProblem}>
          문제 입력하기
        </button>
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
