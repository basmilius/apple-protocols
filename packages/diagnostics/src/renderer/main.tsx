import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { UIProvider } from '@basmilius/desktop-ui';
import { App } from '@/App';
import { formatSource, i18n } from '@/i18n';
import { startShortcuts } from '@/shell/shortcuts';
import { startDevices } from '@/state/devices';
import { startTheme } from '@/state/theme';
import '@/styles.css';

startTheme();
startShortcuts();
void startDevices();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <UIProvider i18n={i18n} formatSource={formatSource}>
            <App/>
        </UIProvider>
    </StrictMode>
);
