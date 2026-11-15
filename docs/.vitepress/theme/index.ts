import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import HomePackages from './HomePackages.vue';
import Logo from './Logo.vue';
import './style.css';

export default {
    extends: DefaultTheme,
    Layout() {
        return h(DefaultTheme.Layout, null, {
            'nav-bar-title-before': () => h(Logo),
            'home-hero-info-before': () => h(Logo, {variant: 'hero'})
        });
    },
    enhanceApp({app}) {
        app.component('HomePackages', HomePackages);
    }
} satisfies Theme;
