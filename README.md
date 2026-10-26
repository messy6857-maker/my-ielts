<p><br></p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/salvation_lies_within_IELTS_dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="public/salvation_lies_within_IELTS_light.svg">
  <img alt="Slogan: Salvation lies within IELTS" src="public/salvation_lies_within_IELTS_light.svg">
</picture>

<p><br></p>
<p><br></p>
<h1 align='center'>
  My <span>IELTS™</span>
</h1>

<h2>在线地址 <a href="https://messy6857-maker.github.io/my-ielts/#/">https://messy6857-maker.github.io/my-ielts/</a></h2>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/screenshot/screenshot-home-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="public/screenshot/screenshot-home-light.png">
  <img alt="Home" src="public/screenshot/screenshot-home-light.png">
</picture>


## 概述

雅思备考资料，包含词汇、语法、听说读写最出名的一些内容

- [x] 词汇练习模式

## 规划栏目

### 词汇

> 2026-03 增加打字练习模式，感谢 [@Tommy1109255](https://github.com/Tommy1109255)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/screenshot/typing-vocabulary-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="public/screenshot/typing-vocabulary-light.png">
  <img alt="Vocabulary" src="public/screenshot/typing-vocabulary-light.png">
</picture>

雅思词汇真经（刘洪波橙色的那本）

- 雅思核心词汇
- 逻辑词群记忆法
- 原书音频

词列表

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/screenshot/screenshot-vocabulary-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="public/screenshot/screenshot-vocabulary-light.png">
  <img alt="Vocabulary" src="public/screenshot/screenshot-vocabulary-light.png">
</picture>

练习模式

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/screenshot/screenshot-vocabulary-training-mode-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="public/screenshot/screenshot-vocabulary-training-mode-light.png">
  <img alt="Vocabulary Training Mode" src="public/screenshot/screenshot-vocabulary-training-mode-light.png">
</picture>

### 语法

新东方雅思语法

- 视频
- 讲义
- 思维导图

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/screenshot/screenshot-grammar-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="public/screenshot/screenshot-grammar-light.png">
  <img alt="Grammar" src="public/screenshot/screenshot-grammar-light.png">
</picture>

### 听力

了解雅思听力，以及考试中的一些基本原则、技巧

- 基本概念和应试技巧
- 听力 179 考点词
- [WIP] 雅思听力王语料库

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/screenshot/screenshot-listening-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="public/screenshot/screenshot-listening-light.png">
  <img alt="Listening" src="public/screenshot/screenshot-listening-light.png">
</picture>

### 口语

Part 1 / Part 2 / Part 3 题目练习、录音回放与语音转写；登录并配置 AI 后可使用文字评分。

### 阅读

- 538 考点词同义替换

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/screenshot/screenshot-reading-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="public/screenshot/screenshot-reading-light.png">
  <img alt="Reading" src="public/screenshot/screenshot-reading-light.png">
</picture>


### 写作

写作相关内容，从基础开始

- 顾家北手把手教你雅思写作 V6.0 —— 100 句翻译练习

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/screenshot/screenshot-writing-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="public/screenshot/screenshot-writing-light.png">
  <img alt="Writing" src="public/screenshot/screenshot-writing-light.png">
</picture>

## 开发

本项目使用

- [Vitesse Lite](https://github.com/antfu/vitesse-lite) 作为模板开发
- 样式部分参照了 [Flowbite](https://github.com/themesberg/flowbite) & [Flowbite Admin Dashboard](https://flowbite-admin-dashboard.vercel.app)

所以需要对 Vue3、TailWindCSS 有一定的了解才能二次开发

```bash
# 安装依赖
pnpm i

# 开发模式
pnpm run dev

# 构建
pnpm run build
```

## 禁止将本项目用于任何商业目的！！！


## 数据维护与部署

开发环境：Node.js 24.22.x、pnpm 11.25.0。

- 修改词库后执行 `pnpm data:split`，提交生成文件；CI 使用 `pnpm data:check` 校验。
- 验证：`pnpm exec vitest run`、`pnpm typecheck`、`pnpm lint`。
- 整章词汇音频直接从仓库原文件流式播放，不重复放入 Pages 发布目录；单词和模考音频仍随网站发布。
- 网站构建：`pnpm build`；资源整理已纳入 Vite 构建插件，直接运行 `vite build` 也会执行。默认须使用完整 public，校验全部运行时引用的音频、题图、明暗语法图和讲义，包括不打包的 22 个整章音频。
- Android 构建：`pnpm build:android` 后执行 `npx cap sync android`；音频从已部署站点加载，不复制进 APK，题图和讲义保留。
- GitHub Pages 使用 gh-pages 根目录，必须一起发布 dist 中的页面、JS、样式和 public 资源。
- 音频切分标签移至 maintenance/audio-tags，仅供素材维护，不参与发布。
- 采用 Git tree 复用媒体 blob 的流程须显式提供 `PUBLIC_ASSET_INDEX=/绝对路径/media-index.json pnpm build`，清单格式为 `{ "treeSha": "40位Git树SHA", "files": { "favicon.png": { "sha": "40位blobSHA", "size": 1077 } } }`，包含所有运行时资源。清单须从已核对的 Git tree 生成；本地已有文件会核对 blob 哈希与大小，缺引用会阻止构建。旧 `MEDIA_FROM_GIT_TREE=1` 不再跳过校验。发布器仍须复用清单对应的媒体 blob，不能仅上传源码副本的 dist。

旧 /ielts 地址会跳转到现用听力页面。复习计划、模块进度、已掌握和打卡按条目合并；错词按原子批次保存，时间不回退，支持正负次数修正（最少为 1，清空用删除）。支持 Web Locks 的浏览器每 128 个批次自动生成检查点并回收已合并日志；不支持时保留日志以保证并发安全。日计数按词 ID 去重，定期清理超过两天宽限期的旧分量。备份和同步输出合并后的结果，保持旧格式兼容。

听力语料库目前仅有第 2 章资料，第 3、4 章显示待补充状态；搜索涵盖英美拼写和中文释义，发音使用在线词典。Android 语法图使用 APK 包内资源。
