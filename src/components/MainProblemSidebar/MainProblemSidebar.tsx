import type { RefObject } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { formatAnswer, formatQuestion } from '../../utils/formatting';
import styles from './MainProblemSidebar.module.css';

export interface MainProblemSidebarProps {
  panelRef?: RefObject<HTMLDivElement | null>;
  problem?: string;
  answer?: string;
  imageData?: string | null;
  solution?: string | null;
  grade?: string;
  subjectArea?: string;
}

export const MainProblemSidebar = ({
  panelRef,
  problem,
  answer,
  imageData,
  solution,
  grade,
  subjectArea,
}: MainProblemSidebarProps) => {
  const { t } = useLocale();
  const mainProblem = problem?.trim() || '';
  const mainAnswer = answer?.trim() || '';
  const mainSolution = solution?.trim() || '';

  return (
    <aside className={styles.column} ref={panelRef}>
      <div className={styles.panel}>
        <h3 className={styles.title}>{t('app.mainProblem')}</h3>
        {imageData && (
          <div className={styles.imageWrap}>
            <img src={imageData} alt={t('app.problemImage')} className={styles.image} />
          </div>
        )}
        {mainProblem ? (
          <>
            <div className={styles.content}>{formatQuestion(mainProblem)}</div>
            {mainAnswer && (
              <div className={styles.answer}>
                <span className={styles.answerLabel}>{t('common.answerColon')}</span>{' '}
                <span dangerouslySetInnerHTML={{ __html: formatAnswer(mainAnswer) }} />
              </div>
            )}
            {mainSolution && (
              <div className={styles.solution}>
                <span className={styles.solutionLabel}>{t('app.modelAnswer')}</span>
                <div className={styles.solutionContent}>{mainSolution}</div>
              </div>
            )}
          </>
        ) : (
          !imageData && <p className={styles.empty}>{t('app.noProblemData')}</p>
        )}
        {(grade || subjectArea) && (
          <div className={styles.meta}>
            {grade && (
              <div>
                <span className={styles.metaLabel}>{t('app.gradeLabel')}</span> {grade}
              </div>
            )}
            {subjectArea && (
              <div>
                <span className={styles.metaLabel}>{t('app.subjectArea')}</span> {subjectArea}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
