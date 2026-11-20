import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/inter'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import App from './App.vue'
import { router } from './router'
import './assets/main.css'

createApp(App).use(createPinia()).use(router).mount('#app')
