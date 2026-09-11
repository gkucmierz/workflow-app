import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import NanoUI from '@gkucmierz/nano-ui';
import '@gkucmierz/nano-ui/style.css';
import './styles/main.css';

createApp(App).use(router).use(NanoUI).mount('#app');
