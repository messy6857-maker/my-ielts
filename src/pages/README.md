# 页面与路由

页面路由由 vite-plugin-pages 按文件生成，网站使用 Hash 路由。大写开头的 Vue 文件是子组件，不生成独立页面。

- vocabulary：章节拼写、打字与自测；章节资料从 src/data/vocabulary 按需加载。
- listening / reading：考点词、自测与每日阅读。
- mock：剑桥模考；registry 按试卷和听力/阅读种类加载数据。
- writing：翻译练习和按页签加载的大小作文。
- speaking：口语题目、录音和转写。
- ielts：旧链接兼容重定向，不再维护独立词库。

账号切换由 App 的路由 key 和数据组合函数共同隔离。资源路径使用 useAudio 中的解析函数，兼容 GitHub Pages 子路径和 Android。
