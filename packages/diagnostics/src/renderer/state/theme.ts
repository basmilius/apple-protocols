import { create } from 'zustand';
import { invoke } from '@/client';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'diagnostics.theme';

/** Match the current `--bg` to prevent a different color flashing during resize. */
const BACKGROUND: Record<ResolvedTheme, string> = {
    light: '#f4f4f5',
    dark: '#0d0d10'
};

type ThemeState = {
    preference: ThemePreference;
    resolved: ResolvedTheme;
    setPreference(preference: ThemePreference): void;
};

const systemQuery = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)');

const resolve = (preference: ThemePreference): ResolvedTheme => {
    if (preference === 'system') {
        return systemQuery().matches ? 'dark' : 'light';
    }

    return preference;
};

const stored = (): ThemePreference => {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
};

const apply = (preference: ThemePreference, resolved: ResolvedTheme): void => {
    document.documentElement.dataset.theme = resolved;
    void invoke('app:theme', {resolved, followsSystem: preference === 'system', background: BACKGROUND[resolved]});
};

export const useTheme = create<ThemeState>(set => ({
    preference: stored(),
    resolved: resolve(stored()),
    setPreference(preference) {
        const resolved = resolve(preference);
        localStorage.setItem(KEY, preference);
        apply(preference, resolved);
        set({preference, resolved});
    }
}));

/** Puts the theme on `<html>` and keeps it there while the OS switches under a `system` preference. */
export function startTheme(): void {
    const {preference, resolved} = useTheme.getState();
    apply(preference, resolved);

    systemQuery().addEventListener('change', () => {
        const current = useTheme.getState();

        if (current.preference !== 'system') {
            return;
        }

        const next = resolve('system');
        apply('system', next);
        useTheme.setState({resolved: next});
    });
}
