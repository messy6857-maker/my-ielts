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
  routes: [
    ...routes,
    // 各词库的卡片自测已合并到“学新词”，旧地址跳过去
    // 词汇表的单词自测：到期复习去“复习到期的词”，其余去“学新词”
    {
      path: '/vocabulary/flashcard',
      redirect: to => to.query.review === 'due'
        ? { path: '/study/review', query: {} }
        : {
            path: '/study/learn',
            query: { deck: 'vocabulary' },
          },
    },
    { path: '/reading/flashcard', redirect: '/study/learn?deck=reading538' },
    { path: '/listening/flashcard', redirect: '/study/learn?deck=listening179' },
    { path: '/listening/corpus-flashcard', redirect: '/study/learn?deck=corpus' },
  ],
  // Hash 模式下切换路由浏览器不自动回顶：前进/新开回顶，后退恢复保存的位置（B1）。
  scrollBehavior(to, from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})
app.use(router)
app.mount('#app')
