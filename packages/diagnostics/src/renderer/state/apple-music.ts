import { create } from 'zustand';

type Credentials = {
    bearerToken: string;
    musicUserToken: string;
    storefront: string;
};

type AppleMusicState = Credentials & {
    storageError: string | null;
    update(values: Partial<Credentials>): void;
    clearTokens(): void;
};

const KEY = 'diagnostics.apple-music';
const DEFAULTS: Credentials = {bearerToken: '', musicUserToken: '', storefront: 'nl'};

function restore(): Credentials {
    try {
        const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
        return {
            bearerToken: typeof value?.bearerToken === 'string' ? value.bearerToken : '',
            musicUserToken: typeof value?.musicUserToken === 'string' ? value.musicUserToken : '',
            storefront: typeof value?.storefront === 'string' ? value.storefront : 'nl'
        };
    } catch {
        return {...DEFAULTS};
    }
}

export const useAppleMusic = create<AppleMusicState>((set, get) => ({
    ...restore(),
    storageError: null,
    update(values) {
        const current = get();
        const credentials: Credentials = {
            bearerToken: values.bearerToken ?? current.bearerToken,
            musicUserToken: values.musicUserToken ?? current.musicUserToken,
            storefront: values.storefront ?? current.storefront
        };
        let storageError: string | null = null;
        try {
            if (credentials.bearerToken || credentials.musicUserToken) {
                localStorage.setItem(KEY, JSON.stringify(credentials));
            } else {
                localStorage.removeItem(KEY);
            }
        } catch {
            storageError = 'Could not update local Apple Music storage.';
        }
        set({...credentials, storageError});
    },
    clearTokens() {
        get().update({bearerToken: '', musicUserToken: ''});
    }
}));
