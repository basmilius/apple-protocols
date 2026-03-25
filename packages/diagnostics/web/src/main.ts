import { createApp } from 'vue';
import { fluxRegisterIcons } from '@flux-ui/components';
import '@flux-ui/components/css/index.scss';
import * as icons from './icons';
import App from './App.vue';
import './style.scss';

fluxRegisterIcons(icons);

createApp(App).mount('#app');
