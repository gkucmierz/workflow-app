import { ref, watch } from 'vue';
import enDict from './locales/en.json';
import plDict from './locales/pl.json';

const savedLang = localStorage.getItem('appLang');
export const currentLang = ref(savedLang && ['en', 'pl'].includes(savedLang) ? savedLang : 'en');

watch(currentLang, (newLang) => {
  localStorage.setItem('appLang', newLang);
});

export const setLang = (lang) => {
  if (['en', 'pl'].includes(lang)) {
    currentLang.value = lang;
  }
};

export const toggleLang = () => {
  setLang(currentLang.value === 'en' ? 'pl' : 'en');
};

// Minimalistic i18n dictionaries
const dict = {
  en: enDict,
  pl: plDict
};

export const t = (path, params = {}) => {
  const keys = path.split('.');
  let current = dict[currentLang.value];

  for (const key of keys) {
    if (current && current[key] !== undefined) {
      current = current[key];
    } else {
      // Fallback to English if missing in target language
      let fb = dict['en'];
      for (const fbKey of keys) {
        if (fb && fb[fbKey] !== undefined) {
          fb = fb[fbKey];
        } else {
          return path; // Return key if not found anywhere
        }
      }
      current = fb;
      break;
    }
  }

  let text = current;
  if (typeof text !== 'string') return path;

  // Replace params e.g. {count}
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    for (const [key, value] of Object.entries(params)) {
      text = text.replace(new RegExp(`{${key}}`, 'g'), value !== undefined && value !== null ? value : '');
    }
  }

  return text;
};
