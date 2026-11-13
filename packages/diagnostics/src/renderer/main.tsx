import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setWindowControlsSource, UIProvider } from '@adecore/ui';
import { setFormatSource } from '@adecore/ui/format';
import { windowControlsOf } from '@adecore/shell/bridge';
import { App } from '@/App';
import { formatSource, i18n } from '@/i18n';
import { startDevices } from '@/state/devices';
import { startTheme } from '@/state/theme';
import '@fontsource-variable/geist';
import '@fontsource-variable/jetbrains-mono';
import '@/styles.css';

/* The room for the traffic lights comes from the platform alone, so it also stays in fullscreen. */
const controls = windowControlsOf(navigator.userAgent.includes('Mac') ? 'darwin' : 'other');

setFormatSource(formatSource);
setWindowControlsSource({inset: () => controls.inset, subscribe: () => () => {}});
startTheme();
void startDevices();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <UIProvider i18n={i18n}>
            <App/>
        </UIProvider>
    </StrictMode>
);
