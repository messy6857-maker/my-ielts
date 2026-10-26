# 词库维护

1. 编辑 vocabulary.txt；在本目录执行 python3 parser.py，生成 vocabulary.js。
2. 更新例句/同义词时使用仓库 scripts 中的维护脚本；相关缓存只供维护，不随网站发布。
3. 在仓库根目录执行 pnpm data:split，更新 src/data/vocabulary 的 22 章、45 个生成文件。
4. 执行 pnpm data:check、pnpm exec vitest run 和 pnpm typecheck。

运行页面加载的是按章节拆分的数据；vocabulary.js、wordSentences.ts、synonymMeanings.ts、synonymPos.ts 是生成来源，不能仅因未直接进入页面包就删除。原书音频和单词音频仍由 public 提供；chef 使用字典发音备用地址。
