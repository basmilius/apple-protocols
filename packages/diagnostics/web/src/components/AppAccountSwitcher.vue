<template>
    <div class="sidebar-section">
        <div class="section-header">
            <FluxSegmentedControl
                v-model="tab"
                is-fill
                :items="[
                    {label: 'Apps'},
                    {label: 'Accounts'}
                ]"
                style="width: 100%"/>
        </div>

        <div class="switcher-body">
            <template v-if="loading">
                <div class="empty-state">
                    <FluxSpinner/>
                </div>
            </template>

            <template v-else-if="tab === 0">
                <div
                    v-if="apps.length > 0"
                    class="switcher-list">
                    <button
                        v-for="app in apps"
                        :key="app.bundleId"
                        class="switcher-item"
                        @click="launchApp(app.bundleId)">
                        <span class="switcher-item-name">{{ app.name }}</span>
                        <span class="switcher-item-meta">{{ app.bundleId }}</span>
                    </button>
                </div>

                <div
                    v-else
                    class="empty-state">
                    No apps found
                </div>
            </template>

            <template v-else>
                <div
                    v-if="accounts.length > 0"
                    class="switcher-list">
                    <button
                        v-for="account in accounts"
                        :key="account.accountId"
                        class="switcher-item"
                        @click="switchAccount(account.accountId)">
                        <span class="switcher-item-name">{{ account.name }}</span>
                    </button>
                </div>

                <div
                    v-else
                    class="empty-state">
                    No accounts found
                </div>
            </template>
        </div>
    </div>
</template>

<script
    setup
    lang="ts">
    import { ref, watch } from 'vue';
    import { FluxButtonGroup, FluxSecondaryButton, FluxSegmentedControl, FluxSpinner, showSnackbar } from '@flux-ui/components';

    type LaunchableApp = {
        bundleId: string;
        name: string;
    };

    type UserAccount = {
        accountId: string;
        name: string;
    };

    const props = defineProps<{
        companionLinkConnected: boolean;
        sendCommand: (cmd: string, arg?: string) => Promise<any>;
    }>();

    const tab = ref<number>(0);
    const apps = ref<LaunchableApp[]>([]);
    const accounts = ref<UserAccount[]>([]);
    const loading = ref(false);

    const fetchData = async () => {
        if (!props.companionLinkConnected) {
            apps.value = [];
            accounts.value = [];
            return;
        }

        loading.value = true;

        try {
            const [appsResult, accountsResult] = await Promise.all([
                props.sendCommand('apps'),
                props.sendCommand('users')
            ]);

            apps.value = Array.isArray(appsResult) ? appsResult.sort((a: LaunchableApp, b: LaunchableApp) => a.name.localeCompare(b.name)) : [];
            accounts.value = Array.isArray(accountsResult) ? accountsResult.sort((a: UserAccount, b: UserAccount) => a.name.localeCompare(b.name)) : [];
        } finally {
            loading.value = false;
        }
    };

    const launchApp = async (bundleId: string) => {
        await props.sendCommand('launch', bundleId);

        showSnackbar({
            color: 'success',
            icon: 'rocket-launch',
            message: `Launching ${apps.value.find(a => a.bundleId === bundleId)?.name ?? bundleId}`,
            duration: 3000
        });
    };

    const switchAccount = async (accountId: string) => {
        await props.sendCommand('switchuser', accountId);

        showSnackbar({
            color: 'success',
            icon: 'user',
            message: `Switched to ${accounts.value.find(a => a.accountId === accountId)?.name ?? accountId}`,
            duration: 3000
        });
    };

    watch(() => props.companionLinkConnected, (connected) => {
        if (connected) {
            fetchData();
        } else {
            apps.value = [];
            accounts.value = [];
        }
    }, {immediate: true});
</script>
