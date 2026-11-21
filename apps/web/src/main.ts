import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/inter'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import App from './App.vue'
import { router } from './router'
import { installErrorReporter } from './lib/errorReporter'
import './assets/main.css'

const app = createApp(App).use(createPinia()).use(router)
installErrorReporter(app, router)
app.mount('#app')
