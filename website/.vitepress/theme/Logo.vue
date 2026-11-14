<template>
    <span
        :class="[$style.logo, { [$style.logoHero]: variant === 'hero' }]"
        role="img"
        aria-label="corewire">
        <svg
            xmlns="http://www.w3.org/2000/svg"
            :class="$style.mark"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true">
            <rect
                x="1"
                y="1"
                width="22"
                height="22"
                rx="6"
                fill="currentColor"/>
            <path
                stroke="var(--vp-c-bg)"
                stroke-linecap="round"
                stroke-width="2"
                d="M6 12h3l2-4 2 8 2-4h3"/>
        </svg>
        <span :class="$style.word">corewire</span>
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
