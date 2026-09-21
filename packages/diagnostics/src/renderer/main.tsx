import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { startShortcuts } from '@/shell/shortcuts';
import { startDevices } from '@/state/devices';
import { startTheme } from '@/state/theme';
import { startInputModality } from '@/ui';
import '@/styles.css';

startTheme();
startInputModality();
startShortcuts();
void startDevices();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App/>
    </StrictMode>
);
