import { useApp } from '../../contexts/AppContext';
import styles from './Header.module.css';

interface HeaderProps {
  onNewProblem: () => void;
  onShowUserIdPage?: () => void;
}

export const Header = ({ onNewProblem, onShowUserIdPage }: HeaderProps) => {
  const { sidebarOpen, setSidebarOpen } = useApp();

  const handleHamburgerClick = () => {
    setSidebarOpen(!sidebarOpen);
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
      <button
        type="button"
        className={styles.titleBtn}
        onClick={onShowUserIdPage}
        aria-label="아이디 입력 페이지로 이동"
      >
        <h3 className={styles.title}>AI 기반 수학 사고 과정 진단</h3>
      </button>
      <button className={styles.newProblemBtn} onClick={onNewProblem}>
        문제 입력하기
      </button>
    </div>
  );
};
