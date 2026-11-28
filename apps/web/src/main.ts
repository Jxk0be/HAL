import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/inter'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/chakra-petch/500.css'
import '@fontsource/chakra-petch/600.css'
import '@fontsource/chakra-petch/700.css'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
import App from './App.vue'
import { router } from './router'
import { installErrorReporter } from './lib/errorReporter'
import { vReveal } from './directives/reveal'
import './assets/main.css'

const app = createApp(App).use(createPinia()).use(router)
app.directive('reveal', vReveal)
installErrorReporter(app, router)
app.mount('#app')
