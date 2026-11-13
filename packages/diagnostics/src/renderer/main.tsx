import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { UIProvider } from '@adecore/ui';
import { setFormatSource } from '@adecore/ui/format';
import { App } from '@/App';
import { formatSource, i18n } from '@/i18n';
import { startShortcuts } from '@/shell/shortcuts';
import { startDevices } from '@/state/devices';
import { startTheme } from '@/state/theme';
import '@/styles.css';

setFormatSource(formatSource);
startTheme();
startShortcuts();
void startDevices();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <UIProvider i18n={i18n}>
            <App/>
        </UIProvider>
    </StrictMode>
);
