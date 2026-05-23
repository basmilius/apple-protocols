<template>
    <div :class="$style.clickWheelContainer">
        <div :class="$style.clickWheelDpad">
            <button
                type="button"
                :class="[$style.clickWheelControlBtn, $style.clickWheelBtnUp]"
                :disabled="isDisabled"
                title="Up"
                @click="$emit('up')">
                <FluxIcon name="angle-up"/>
            </button>

            <button
                type="button"
                :class="[$style.clickWheelControlBtn, $style.clickWheelBtnLeft]"
                :disabled="isDisabled"
                title="Left"
                @click="$emit('left')">
                <FluxIcon name="angle-left"/>
            </button>

            <button
                type="button"
                :class="[$style.clickWheelControlBtn, $style.clickWheelBtnSelect]"
                :disabled="isDisabled"
                title="Select"
                @click="$emit('select')">
                <FluxIcon name="circle"/>
            </button>

            <button
                type="button"
                :class="[$style.clickWheelControlBtn, $style.clickWheelBtnRight]"
                :disabled="isDisabled"
                title="Right"
                @click="$emit('right')">
                <FluxIcon name="angle-right"/>
            </button>

            <button
                type="button"
                :class="[$style.clickWheelControlBtn, $style.clickWheelBtnDown]"
                :disabled="isDisabled"
                title="Down"
                @click="$emit('down')">
                <FluxIcon name="angle-down"/>
            </button>
        </div>
    </div>
</template>

<script
    lang="ts"
    setup>
    import { FluxIcon } from '@flux-ui/components';

    defineProps<{
        readonly isDisabled?: boolean;
    }>();

    defineEmits<{
        up: [];
        down: [];
        left: [];
        right: [];
        select: [];
    }>();
</script>

<style
    lang="scss"
    module>
    .clickWheelContainer {
        display: flex;
        flex-flow: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
    }

    .clickWheelDpad {
        position: relative;
        width: 180px;
        height: 180px;
        flex-shrink: 0;
    }

    .clickWheelControlBtn {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        background: var(--gray-200);
        border: none;
        border-radius: 50%;
        cursor: pointer;
        color: var(--foreground-prominent);
        transition: background 120ms ease, opacity 120ms ease, color 120ms ease;

        &:hover:not(:disabled) {
            background: var(--gray-300);
        }

        &:active:not(:disabled) {
            opacity: 0.5;
        }

        &:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }
    }

    .clickWheelBtnUp,
    .clickWheelBtnLeft,
    .clickWheelBtnRight,
    .clickWheelBtnDown {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        font-size: 18px;
        -webkit-mask: radial-gradient(circle, transparent 40px, black 40px);
        mask: radial-gradient(circle, transparent 40px, black 40px);
    }

    .clickWheelBtnUp {
        clip-path: polygon(50% calc(50% - 3px), 3px 0%, calc(100% - 3px) 0%);
        align-items: flex-start;
        justify-content: center;
        padding-top: 18px;
    }

    .clickWheelBtnRight {
        clip-path: polygon(calc(50% + 3px) 50%, 100% 3px, 100% calc(100% - 3px));
        align-items: center;
        justify-content: flex-end;
        padding-right: 18px;
    }

    .clickWheelBtnDown {
        clip-path: polygon(50% calc(50% + 3px), calc(100% - 3px) 100%, 3px 100%);
        align-items: flex-end;
        justify-content: center;
        padding-bottom: 18px;
    }

    .clickWheelBtnLeft {
        clip-path: polygon(calc(50% - 3px) 50%, 0% calc(100% - 3px), 0% 3px);
        align-items: center;
        justify-content: flex-start;
        padding-left: 18px;
    }

    .clickWheelBtnSelect {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 72px;
        height: 72px;
        transform: translate(-50%, -50%);
        z-index: 1;
    }
</style>
