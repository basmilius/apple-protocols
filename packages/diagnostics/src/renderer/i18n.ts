import { createInstance } from 'i18next';
import type { FormatSource } from '@basmilius/desktop-ui/format';

export const i18n = createInstance();

await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {},
    interpolation: {escapeValue: false}
});

export const formatSource: FormatSource = {
    language: () => i18n.resolvedLanguage ?? i18n.language,
    region: () => navigator.language,
    systemLocale: () => navigator.language,
    subscribe(onChange) {
        i18n.on('languageChanged', onChange);
        return () => { i18n.off('languageChanged', onChange); };
    }
};
