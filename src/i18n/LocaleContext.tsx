import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  formatCategory,
  formatGrade,
  formatLevel,
  translations,
  type Locale,
  type TranslationKey,
} from './translations';

const LOCALE_STORAGE_KEY = 'hamamath_locale';

export type TranslateParams = Record<string, string | number>;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: TranslationKey, params?: TranslateParams) => string;
  formatLevel: (level: string) => string;
  formatGrade: (level: string) => string;
  formatCategory: (code: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
    template
  );
}

function readStoredLocale(): Locale {
  if (typeof localStorage === 'undefined') return 'ko';
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === 'en' ? 'en' : 'ko';
}

interface LocaleProviderProps {
  children: ReactNode;
}

export const LocaleProvider = ({ children }: LocaleProviderProps) => {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'ko' ? 'en' : 'ko');
  }, [locale, setLocale]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale === 'en' ? 'en' : 'ko';
    }
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey, params?: TranslateParams) => {
      const text = translations[locale][key] ?? translations.ko[key] ?? key;
      return interpolate(text, params);
    },
    [locale]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      toggleLocale,
      t,
      formatLevel: (level: string) => formatLevel(level, locale),
      formatGrade: (level: string) => formatGrade(level, locale),
      formatCategory: (code: string) => formatCategory(code, locale),
    }),
    [locale, setLocale, toggleLocale, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export const useLocale = (): LocaleContextValue => {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return ctx;
};
