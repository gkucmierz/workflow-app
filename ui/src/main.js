import './theme.js';
import { createApp, nextTick } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import NanoUI from '@gkucmierz/nano-ui';
import '@gkucmierz/nano-ui/style.css';
import './styles/main.css';

const app = createApp(App);
app.use(router);
app.use(NanoUI);

router.isReady().then(async () => {
  app.mount('#app');
  await nextTick();
  document.documentElement.classList.remove('preload');
});
