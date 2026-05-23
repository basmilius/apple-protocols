import { createApp } from 'vue';
import flux from '@renderer/app/flux';
import pinia from '@renderer/app/pinia';
import router from '@renderer/app/router';
import App from './App.vue';

createApp(App)
    .use(flux)
    .use(pinia)
    .use(router)
    .mount('#app');
