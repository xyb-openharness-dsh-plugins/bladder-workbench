# 交付索引 · 小泉宝 UroPal（phase1）

> 一页看清：phase1 到底交付了什么、放在哪、怎么打开、哪些**没做**。
> 状态：**G1 / G2 / G3 三道闸口全部未签**。本页不构成任何一道闸口的签认。

## 一、怎么打开 HTML demo

原型是**纯静态文件、零依赖、零构建**——直接用浏览器打开即可，不需要起服务器：

```
open /Users/qinxiaoqiang/Downloads/bladder-workbench/prototypes/v0.1/index.html
```

若浏览器对 `file://` 下的相对路径有安全限制，用任意静态服务：

```
cd /Users/qinxiaoqiang/Downloads/bladder-workbench/prototypes/v0.1 && python3 -m http.server 8080
# 然后访问 http://127.0.0.1:8080/
```

打开后第一屏是**分野闸门**（先问你在哪条线），选一条线才长出对应看板。

## 二、HTML demo 文件清单（`prototypes/v0.1/`）

| 文件 | 用途 | sha256（前 16 位） |
|---|---|---|
| `index.html` | 外壳：顶栏三段式 + 左侧导航 + 业务主区 + Agent 抽屉 | `cbcd779f4ae644bc` |
| `tokens.css` | 语义 token：品牌色、数据色、字号三档、间距、圆角 | `8b36dfac64f14e41` |
| `shell.css` | 布局与组件：顶栏、导航、卡片、表格、弹窗、Agent 面板、窄屏覆盖 | `45967975e569d073` |
| `data.js` | 演示数据（**全部为演示用假数据，不含任何真实病历**）+ 指标目录 + 2026 试验真实样本 | `2f237e956de7436c` |
| `charts.js` | 一图秀渲染（C1–C12）与折线动画；按容器**实测宽度 1:1** 渲染 | `d0af60e59a8ed0f3` |
| `app.js` | 15 个一级页 + 二级页签、状态持久化、分级与提醒、草稿生成 | `5c5778f182aa0cfe` |

**版本号**：`v0.1.0`（顶上角版本 chip 与页脚两处同源，均由 `app.js` 的 `APP_VERSION` 注入）。

**截图**：`prototypes/v0.1/_shots/`（22 张，由自检脚本自动生成）。

**自检**：

```
cd /Users/qinxiaoqiang/Downloads/bladder-workbench && node scripts/verify-prototype.mjs
```

结果：**断言 116 条，通过 116，失败 0**（含真浏览器 Chromium 驱动、`390px` 横向不溢出、零控制台 error，以及图表真实几何对齐）。

## 三、2026 临床试验数据（`research/bladder-cancer/`）

| 文件 | 内容 |
|---|---|
| `trials-2026.jsonl` | 295 条，每行一条扁平记录 |
| `bladder_cancer_trials_2026.sqlite` | 同一批数据的 SQLite 快照（含 4 个视图） |
| `manifest.json` | 抓取口径、分布、每文件 sha256、**10 条 limitations** |

**真实数字（不是估计）**

- 总计 **295 条**：ClinicalTrials.gov **212** + ChiCTR **83**
- 研究类型：干预性 **195** / 观察性 **89** / 其他 10 / 扩展用药 1
- 含中国中心或中国注册：**158 条**
- 抓取日期：**2026-10-22**；窗口：两源均为 **2026-01-01 起**
- 脚本：`scripts/fetch-bladder-trials-2026.mjs`（可重跑，`--dry-run` 只探测不写盘）

**四个视图（患者视角用哪个很关键）**

| 视图 | 含义 |
|---|---|
| `v_bladder_interventional` | **膀胱癌 × 干预性**——患者最关心的那批 |
| `v_bladder_only` | 排除 `scope=utuc`（上尿路尿路上皮癌，**不是膀胱癌**） |
| `v_interventional` | 只要干预性 |
| `v_china` | 含中国中心或中国注册 |

```sql
-- 例：膀胱癌的干预性试验，在中国有中心的
SELECT registry, registry_id, title, recruitment_status
FROM v_bladder_interventional WHERE is_china = 1;
```

**必须如实说明的局限**（完整 10 条见 `manifest.json`）

- 两源**年份口径不一致**：CT.gov 按「首次公示」，ChiCTR 按「注册创建年」；ChiCTR 含「**补注册**」记录（先开展后补登记）。
- **登记状态 ≠ 入组资格**。
- `scope` 与 `setting` 是脚本按关键词派生的**分类，未逐条人工核对**。
- 两源覆盖都有限；**CDE（药物临床试验登记平台）本轮未采集**。
- ChiCTR 详情页含联系人姓名/电话/邮箱等 PII，**写盘前已按字段名剥除**，并有用例断言防止回退。

## 四、phase1 文档（`docs/`）

**本项目自建（非脚手架自带）**

| 文档 | 内容 | 对应闸口 |
|---|---|---|
| `USER-RESEARCH.md` | 两条线的患者困难排序；**证据分层，明确写「无真实访谈」** | G1 |
| `SCENARIOS.md` | S01–S16 场景（触发 → 想完成的事 → 产物）+ 排序 | G1 |
| `HVT-REVIEW.md` | 沿 HVT 十条疾病轴现场推导膀胱癌术语包 + 五层落地检查 | **G1** |
| `DIFF-MATRIX.md` | **15 行**差异化矩阵，每条「场景 → 功能 → 验收」 | **G1**（锁①：非空才允许开工） |
| `BRIEF.md` / `SPEC.md` | 需求简报与完整规格（含 ADR） | G1 |
| `CORE-MODULES.md` | 四个核心模块 + 为什么其余不算核心 + 产品立场 | G1 |
| `SCHEMA.md` | 数据模型**草案**（本阶段**不建表、不写迁移**） | **G3**（未签） |
| `DESIGN-PROMPT.md` | 设计者章程（已追写膀胱癌专用末节） | — |
| `DESIGNER-BRIEF.md` | 我代表谁、取舍标准、待验证假设 | — |
| `DESIGN-SESSION.md` | 决策台账 DESIGN-01…12（含用户确认原话与日期） | G1 留痕 |
| `PROTOTYPE-REVIEW.md` | 原型版本 / hash / 确认范围 | **G2**（未签） |
| `DIFF-MATRIX.md` | 见上 | — |
| `SOURCES.md` | 资料清单与来源分级 | — |
| `research/2025-2026-膀胱癌治疗格局-事实提取.md` | 9 份药物新闻 + CACA 患者问答 + ADC 安全共识的事实提取（每节含「患者易误解说法」与「原文没写」） | 证据 |
| `research/中文权威共识-事实提取.md` | 11 份中文共识的事实提取 + **哪些字段原文是图片未取得** | 证据 |

## 五、明确**没做**的事（phase1 止点）

按 DESIGN-07「严格停在 phase1」，以下**一件都没做**，不是遗漏：

1. **业务代码**：`dsh/` 只有脚手架生成的 `index.js`，`lib/` 只有 `client.js`。**一行生产业务代码未写。**
2. **数据库表**：`schema/` 目录为空，**没有 `0001_initial.sql`，没有迁移，没有建库**。
3. **Agent 面板**：**未实现、未验证**。原型里是 HTML 状态稿，不拿它冒充已接通。
4. **PDF 报告导入（MinerU）**：本轮**只留接口与设置页骨架**，没有真实解析链路。
5. **Git**：认领 Issue [#11](https://github.com/xyb-openharness-dsh-plugins/.github/issues/11) 已建并 `/claim` 成功；**病种仓库按组织规则「G1 通过才建仓」，故尚未创建、尚未推送**。
6. **装机**：未打包、未安装、未在 DSH Desktop 里加载过。

## 六、下一步（等你的话）

phase1 交付到 G2 闸口为止。要往下走，需要你先做三件事之一：

- **签 G1**：确认业务流程与功能范围（`docs/HVT-REVIEW.md` + `docs/DIFF-MATRIX.md` + `docs/SPEC.md`）；
- **提修改**：指哪一页哪一条不对，我改；
- **直接看 HTML**：打开上面那个 `index.html`，按自己的顺序点一遍，把不对的地方告诉我。

G1 未签之前，我不会开始建表和写业务代码。
