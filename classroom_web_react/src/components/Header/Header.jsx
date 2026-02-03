import styles from './Header.module.css';

export const Header = ({ onNewProblem }) => {
  return (
    <div className={styles.header}>
      <button className={styles.hamburgerMenuBtn} id="hamburgerMenuBtn">
        ☰
      </button>
      <h3 className={styles.title}>AI 기반 수학 사고 과정 진단</h3>
      <button className={styles.newProblemBtn} onClick={onNewProblem}>
        문제 입력하기
      </button>
    </div>
  );
};
