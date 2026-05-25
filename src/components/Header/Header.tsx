import { useApp } from '../../contexts/AppContext';
import { useLocale } from '../../i18n/LocaleContext';
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
  const { locale, toggleLocale, t } = useLocale();

  const handleHamburgerClick = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined' && window.confirm(t('header.logoutConfirm'))) {
      onShowUserIdPage?.();
    }
  };

  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <button
          className={styles.hamburgerMenuBtn}
          id="hamburgerMenuBtn"
          onClick={handleHamburgerClick}
          aria-label={t('header.openMenu')}
          style={{ display: sidebarOpen ? 'none' : 'block' }}
        >
          ☰
        </button>
        <button
          type="button"
          className={`${styles.langToggleBtn} ${locale === 'en' ? styles.langToggleBtnActive : ''}`}
          onClick={toggleLocale}
          aria-label={locale === 'ko' ? t('header.switchToEnglish') : t('header.switchToKorean')}
          title={locale === 'ko' ? t('header.switchToEnglish') : t('header.switchToKorean')}
        >
          <span className={styles.globeIcon} aria-hidden>
            🌐
          </span>
        </button>
      </div>
      <div className={styles.titleWrap}>
        <button
          type="button"
          className={styles.titleBtn}
          onClick={onShowUserIdPage}
          aria-label={t('header.goToLogin')}
        >
          <h3 className={styles.title}>{t('header.title')}</h3>
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
              {t('header.workflow')}
            </button>
            <button
              type="button"
              className={`${styles.modeBtn} ${
                mode === "diagnosis" ? styles.modeBtnActive : ""
              }`}
              onClick={onSelectDiagnosis}
            >
              {t('header.diagnosis')}
            </button>
          </div>
        ) : (
          <button className={styles.newProblemBtn} onClick={onNewProblem}>
            {t('header.newProblem')}
          </button>
        )}
        {userId && (
          <>
            <span className={styles.userIdLabel}>{userId}</span>
            <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
              {t('header.logout')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
