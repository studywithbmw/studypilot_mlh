import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../locales/en.json';
import ta from '../locales/ta.json';
import hi from '../locales/hi.json';

const savedLang = typeof window !== 'undefined' ? localStorage.getItem('studypilot_language') || 'en' : 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ta: { translation: ta },
      hi: { translation: hi },
    },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export function changeLanguage(lang: 'en' | 'ta' | 'hi') {
  i18n.changeLanguage(lang);
  if (typeof window !== 'undefined') {
    localStorage.setItem('studypilot_language', lang);
    document.documentElement.lang = lang;
  }
}

export default i18n;
