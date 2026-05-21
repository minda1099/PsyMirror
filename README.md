# PsyMirror · 心镜

> 一个纯静态的中文心理测评网站，收录 9 份经典量表，支持可选的 AI 深度解读。

无后端、无构建、无依赖 —— 一份 HTML、一些 JS 模块、一组 JSON 量表，就能跑起来。

线上：把仓库部署到任意静态托管（GitHub Pages / Vercel / Netlify / Cloudflare Pages）即可。

## 收录量表

| 分类 | 量表 | 题量 | 用时 |
| --- | --- | ---: | ---: |
| 人格特质 | MBTI 性格类型 (简版) | 28 | ~6 min |
| 人格特质 | MBTI 性格类型 (详尽版) | 60 | ~14 min |
| 人格特质 | 大五人格 BFI-44 | 44 | ~10 min |
| 情绪与心理健康 | PHQ-9 抑郁症筛查 | 9 | ~3 min |
| 情绪与心理健康 | GAD-7 广泛性焦虑 | 7 | ~2 min |
| 情绪与心理健康 | SDS 抑郁自评 (Zung) | 20 | ~5 min |
| 情绪与心理健康 | SAS 焦虑自评 (Zung) | 20 | ~5 min |
| 职业与发展 | 霍兰德职业兴趣 (RIASEC) | 60 | ~12 min |
| 领导力与团队 | 4D 领导力风格 (NASA) | 32 | ~8 min |

每份量表都附有分维度/分区间的权威性解读、为什么会得到这个结果的解释，以及可操作的建议。

## 本地运行

ES 模块不能通过 `file://` 直接打开，需要一个静态服务器：

```bash
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

或者用 `npx serve`、`caddy file-server`、任意你顺手的静态服务器都行。

## 项目结构

```
index.html         首页, 列出所有量表
test.html          答题页, ?scale=<id>
result.html        结果页, 从 sessionStorage 读取上一份答卷

js/
  app.js              首页渲染
  test-runner.js      答题流程
  result-renderer.js  结果计算与渲染, 调用 AI 分析
  scorer.js           数据驱动的打分引擎
  scale-loader.js     量表 JSON 加载
  ai-analyzer.js      Anthropic API 流式调用

scales/
  index.json          量表清单与分类
  <id>.json           单个量表的题目, 计分规则, 解读文案

css/style.css        所有样式
docs/references.md   每份量表的出处、授权与中文化引用
```

## AI 深度解读 (可选)

结果页底部可以输入自己的 Anthropic API Key（仅存于浏览器 `localStorage`，不会上传到任何服务器），点击「AI 深度解读」会调用 `claude-sonnet-4-6` 对你的回答模式做个性化分析。

- 请求直接从浏览器发往 `api.anthropic.com`，需要带 `anthropic-dangerous-direct-browser-access: true` 头。
- 如果 Anthropic 关闭浏览器直连，只需在前面加一层最小代理即可，前端逻辑无需改动。
- AI 分析是 **补充**，不是替代。每份量表的静态解读已经能独立站住。

## 添加新量表

1. 在 `scales/` 下新建 `<id>.json`，按现有量表的形状写题目、计分规则和解读。计分方式 (`scoring.method`) 与解读类型 (`interpretation.type`) 的组合参考 [CLAUDE.md](./CLAUDE.md)。
2. 在 `scales/index.json` 的 `scales[]` 追加一条入口。
3. 如果是全新的计分形状，扩展 `js/scorer.js` 的 `score()` 与 `interpret()` 分发表，以及 `result-renderer.js` 的渲染分支。
4. 在 `docs/references.md` 注明来源与授权。

JSON 字符串里不要直接写 `"`，用中文「」或排印用引号 “” 代替，否则会破坏 JSON 解析。

## 来源与授权

详见 [docs/references.md](./docs/references.md)。简而言之：

- PHQ-9 / GAD-7：公有领域，原作者明示可免费使用。
- BFI-44：John & Srivastava (1999) 学术免费使用版本。
- SDS / SAS：Zung 编制的经典量表，国内临床公开使用。
- Holland (RIASEC)：本项目使用 **自行撰写** 的题目，避免触及 PAR 出版的官方 SDS/VPI 著作权。
- MBTI® 是 The Myers-Briggs Company 的注册商标；本项目同样使用 **自行撰写** 的题目，仅借鉴 16 型框架进行教育性自评，不声称等同于官方 MBTI 测评。

## 免责声明

- 本站工具仅用于 **心理学知识普及与自我探索**，**不构成临床诊断依据**。
- 临床筛查量表 (PHQ-9 / GAD-7 / SDS / SAS) 在中度及以上结果会建议寻求专业帮助；高分结果会附上危机求助热线。如有持续困扰，请直接联系精神科医生或心理咨询师。
- 人格 / 职业类量表 (MBTI / BFI / Holland) 描述的是个体差异与权衡，不存在「更好」或「更差」的类型。

## License

代码部分采用 MIT 协议。量表内容的版权状态见上方「来源与授权」一节。
