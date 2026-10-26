# 公共组件

TheHeader / TheFooter 提供导航与页面框架；KeywordFlashcard 为听力、阅读共用的自测卡片。页面专用组件放在对应页面目录内。

组件由 unplugin-vue-components 按需注册，组件类型声明由构建自动生成。图标使用 UnoCSS 的 Iconify 图标类。新增公共组件前应检查是否可复用现有业务组件；回归测试放在 test，不保留模板演示组件和演示测试。
