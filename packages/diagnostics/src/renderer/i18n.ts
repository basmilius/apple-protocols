import { createInstance } from 'i18next';
import { CHARTS_NAMESPACE, CHARTS_RESOURCES } from '@adecore/charts';
import type { FormatSource } from '@adecore/ui/format';

export const i18n = createInstance();

await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {},
    interpolation: {escapeValue: false}
});

for (const [language, words] of Object.entries(CHARTS_RESOURCES)) {
    i18n.addResourceBundle(language, CHARTS_NAMESPACE, words);
}

export const formatSource: FormatSource = {
    language: () => i18n.resolvedLanguage ?? i18n.language,
    region: () => navigator.language,
    systemLocale: () => navigator.language,
    subscribe(onChange) {
        i18n.on('languageChanged', onChange);
        return () => { i18n.off('languageChanged', onChange); };
    }
};
