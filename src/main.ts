import routes from 'virtual:generated-pages'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'

import '@unocss/reset/tailwind.css'
import './styles/main.css'
import 'uno.css'

const app = createApp(App)
const router = createRouter({
  // 改成 Hash 模式
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
  // Hash 模式下切换路由浏览器不自动回顶：前进/新开回顶，后退恢复保存的位置（B1）。
  scrollBehavior(to, from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})
app.use(router)
app.mount('#app')
