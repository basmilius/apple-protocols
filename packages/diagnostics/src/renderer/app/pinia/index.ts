import { createPinia } from 'pinia';
import type { App, FunctionPlugin } from 'vue';

const pinia: FunctionPlugin = (app: App) => {
    app.use(createPinia());
};

export default pinia;
