import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useLocale } from '../../i18n/LocaleContext';
import type { Locale } from '../../i18n/translations';
import { getSwitchableAccountIds, isDemoUserId } from '../../demo/demoAccount';
import styles from './Header.module.css';

interface HeaderProps {
  onNewProblem: () => void;
  onShowUserIdPage?: () => void;
  onSwitchAccount?: (targetUserId: string) => void;
  userId?: string | null;
  mode?: 'workflow' | 'diagnosis';
  onSelectWorkflow?: () => void;
  onSelectDiagnosis?: () => void;
}

function userInitial(userId: string): string {
  const ch = userId.trim().charAt(0);
  return ch ? ch.toUpperCase() : '?';
}

const ModeWorkflowIcon = () => (
  <svg className={`${styles.modeIcon} ${styles.modeIconSparkles}`} viewBox="0 0 24 24" aria-hidden>
    <path
      d="M12 4.2 13.15 8.2 17.2 9.35 13.15 10.5 12 14.5 10.85 10.5 6.8 9.35 10.85 8.2 12 4.2z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    />
    <path
      d="M17.8 12.8 18.55 14.75 20.5 15.5 18.55 16.25 17.8 18.2 17.05 16.25 15.1 15.5 17.05 14.75 17.8 12.8z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    />
    <path
      d="M6.2 15.8 6.75 17.2 8.15 17.75 6.75 18.3 6.2 19.7 5.65 18.3 4.25 17.75 5.65 17.2 6.2 15.8z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    />
  </svg>
);

const ModeDiagnosisIcon = () => (
  <svg className={styles.modeIcon} viewBox="0 0 24 24" aria-hidden>
    <path
      d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Header = ({
  onNewProblem,
  onShowUserIdPage,
  onSwitchAccount,
  userId,
  mode,
  onSelectWorkflow,
  onSelectDiagnosis,
}: HeaderProps) => {
  const { sidebarOpen, setSidebarOpen, isDemoMode } = useApp();
  const { locale, setLocale, t } = useLocale();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const switchableAccountIds = userId ? getSwitchableAccountIds(userId) : [];

  const accountLabel = (accountId: string) =>
    isDemoUserId(accountId) ? t('header.demoAccount') : accountId;

  const handleSwitchAccount = (targetUserId: string) => {
    if (!onSwitchAccount || targetUserId === userId) return;
    setAccountOpen(false);
    onSwitchAccount(targetUserId);
  };

  const handleHamburgerClick = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleGoHome = () => {
    if (mode === 'diagnosis' && onSelectWorkflow) {
      onSelectWorkflow();
    } else {
      onNewProblem();
    }
  };

  const handleLogout = () => {
    setAccountOpen(false);
    if (typeof window !== 'undefined' && window.confirm(t('header.logoutConfirm'))) {
      onShowUserIdPage?.();
    }
  };

  const handleLocaleChange = (next: Locale) => {
    setLocale(next);
  };

  const closeAccountMenu = useCallback(() => setAccountOpen(false), []);

  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        closeAccountMenu();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAccountMenu();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountOpen, closeAccountMenu]);

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <button
          type="button"
          className={styles.iconBtn}
          id="hamburgerMenuBtn"
          onClick={handleHamburgerClick}
          aria-label={t('header.openMenu')}
          aria-expanded={sidebarOpen}
          style={{ visibility: sidebarOpen ? 'hidden' : 'visible' }}
        >
          <svg className={styles.iconSvg} viewBox="0 0 24 24" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.brandBtn}
          onClick={handleGoHome}
          aria-label={t('header.goHome')}
        >
          <span className={styles.brandTitle}>{t('header.titleShort')}</span>
        </button>
      </div>

      <div className={styles.headerCenter}>
        {mode && onSelectWorkflow && onSelectDiagnosis ? (
          <div className={styles.modeToggle} role="tablist" aria-label={t('header.workflow')}>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'workflow'}
              className={`${styles.modeBtn} ${mode === 'workflow' ? styles.modeBtnActive : ''}`}
              onClick={onSelectWorkflow}
            >
              <ModeWorkflowIcon />
              <span className={styles.modeBtnLabel}>{t('header.workflow')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'diagnosis'}
              className={`${styles.modeBtn} ${mode === 'diagnosis' ? styles.modeBtnActive : ''}`}
              onClick={onSelectDiagnosis}
            >
              <ModeDiagnosisIcon />
              <span className={styles.modeBtnLabel}>{t('header.diagnosis')}</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className={styles.headerRight}>
        {userId ? (
          <div className={styles.accountWrap} ref={accountRef}>
            <button
              type="button"
              className={styles.accountBtn}
              onClick={() => setAccountOpen((o) => !o)}
              aria-label={t('header.accountMenu')}
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              aria-controls={menuId}
            >
              <span className={styles.accountAvatar} aria-hidden>
                {userInitial(userId)}
              </span>
              <span className={styles.accountId}>
                {isDemoMode ? t('header.demoAccount') : userId}
              </span>
              <svg className={styles.accountChevron} viewBox="0 0 24 24" aria-hidden>
                <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            {accountOpen && (
              <div id={menuId} className={styles.accountMenu} role="menu">
                {onSwitchAccount && switchableAccountIds.length > 1 ? (
                  <div className={styles.accountMenuSection}>
                    <span className={styles.accountMenuLabel}>{t('header.switchAccount')}</span>
                    <div className={styles.accountSwitchList}>
                      {switchableAccountIds.map((accountId) => {
                        const isActive = accountId === userId;
                        return (
                          <button
                            key={accountId}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isActive}
                            className={`${styles.accountSwitchBtn} ${isActive ? styles.accountSwitchBtnActive : ''}`}
                            onClick={() => handleSwitchAccount(accountId)}
                            disabled={isActive}
                          >
                            <span className={styles.accountSwitchLabel}>{accountLabel(accountId)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <div className={styles.accountMenuSection}>
                  <span className={styles.accountMenuLabel}>{t('header.language')}</span>
                  <div className={styles.langToggle} role="group">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={locale === 'ko'}
                      className={`${styles.langBtn} ${locale === 'ko' ? styles.langBtnActive : ''}`}
                      onClick={() => handleLocaleChange('ko')}
                    >
                      KO
                    </button>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={locale === 'en'}
                      className={`${styles.langBtn} ${locale === 'en' ? styles.langBtnActive : ''}`}
                      onClick={() => handleLocaleChange('en')}
                    >
                      EN
                    </button>
                  </div>
                </div>
                <div className={styles.accountMenuDivider} role="separator" />
                <button type="button" className={styles.accountMenuLogout} role="menuitem" onClick={handleLogout}>
                  {t('header.logout')}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </header>
  );
};
