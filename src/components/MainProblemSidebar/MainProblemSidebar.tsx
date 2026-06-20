import { useLocale } from '../../i18n/LocaleContext';
import { formatAnswer, formatQuestionHtml, formatSolution } from '../../utils/formatting';
import { MathHtml } from '../MathHtml';
import styles from './MainProblemSidebar.module.css';

export interface MainProblemSidebarProps {
  problem?: string;
  answer?: string;
  imageData?: string | null;
  solution?: string | null;
  grade?: string;
  semester?: string;
  subjectArea?: string;
}

export const MainProblemSidebar = ({
  problem,
  answer,
  imageData,
  solution,
  grade,
  semester,
  subjectArea,
}: MainProblemSidebarProps) => {
  const { t } = useLocale();
  const mainProblem = problem?.trim() || '';
  const mainAnswer = answer?.trim() || '';
  const mainSolution = solution?.trim() || '';

  return (
    <aside className={styles.column}>
      <div className={styles.panel}>
        <h3 className={styles.title}>{t('app.mainProblem')}</h3>
        {imageData && (
          <div className={styles.imageWrap}>
            <img src={imageData} alt={t('app.problemImage')} className={styles.image} />
          </div>
        )}
        {mainProblem ? (
          <>
            <MathHtml className={styles.content} html={formatQuestionHtml(mainProblem)} />
            {mainAnswer && (
              <div className={styles.answer}>
                <span className={styles.answerLabel}>{t('common.answerColon')}</span>{' '}
                <MathHtml className={styles.answerValue} html={formatAnswer(mainAnswer)} />
              </div>
            )}
            {mainSolution && (
              <div className={styles.solution}>
                <span className={styles.solutionLabel}>{t('app.modelAnswer')}</span>
                <MathHtml className={styles.solutionContent} html={formatSolution(mainSolution)} />
              </div>
            )}
          </>
        ) : (
          !imageData && <p className={styles.empty}>{t('app.noProblemData')}</p>
        )}
        {(grade || semester || subjectArea) && (
          <div className={styles.meta}>
            {grade && (
              <div>
                <span className={styles.metaLabel}>{t('app.gradeLabel')}</span> {grade}
              </div>
            )}
            {semester && (
              <div>
                <span className={styles.metaLabel}>{t('app.semesterLabel')}</span> {semester}
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
