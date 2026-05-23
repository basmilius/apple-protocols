import { fluxRegisterIcons } from '@flux-ui/components';
import type { FunctionPlugin } from 'vue';

import * as icons from './icons';

import '@flux-ui/components/css/index.scss';

const flux: FunctionPlugin = () => {
    fluxRegisterIcons(icons);
};

export default flux;

