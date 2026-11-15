<template>
    <span
        :class="[$style.logo, {[$style.logoHero]: variant === 'hero'}]"
        role="img"
        aria-label="CoreWire">
        <svg
            xmlns="http://www.w3.org/2000/svg"
            :class="$style.mark"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true">
            <circle
                cx="12"
                cy="12"
                r="2.75"
                fill="currentColor"/>
            <path
                stroke="currentColor"
                stroke-linecap="round"
                stroke-width="2"
                opacity="0.55"
                d="M8.11 8.11a5.5 5.5 0 0 0 0 7.78M15.89 8.11a5.5 5.5 0 0 1 0 7.78M5.28 5.28a9.5 9.5 0 0 0 0 13.44M18.72 5.28a9.5 9.5 0 0 1 0 13.44"/>
        </svg>
        <span :class="$style.word">CoreWire</span>
    </span>
</template>

<script
    lang="ts"
    setup>
    const {variant = 'nav'} = defineProps<{
        readonly variant?: 'nav' | 'hero';
    }>();
</script>

<style module>
    .logo {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: none;
        color: var(--vp-c-text-1);
    }

    .mark {
        width: 24px;
        height: 24px;
        color: var(--vp-c-brand-1);
    }

    .word {
        font-family: var(--vp-font-family-mono);
        font-size: 17px;
        font-weight: 600;
        letter-spacing: -0.02em;
    }

    .logoHero {
        gap: 14px;
        margin-bottom: 24px;
    }

    .logoHero .mark {
        width: 44px;
        height: 44px;
    }

    .logoHero .word {
        font-size: 36px;
    }
</style>
