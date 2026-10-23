# 项目规格 v0.1 · 小泉宝 UroPal · 膀胱癌工作台

| 项 | 值 |
|---|---|
| 包名 | `@xyb-community/bladder-cancer-workbench` |
| 版本 | `0.1.0`（草案期） |
| 阶段 | **Phase1（设计）**：调研 → SPEC → schema 草案 → HTML demo |
| 闸口 | `G1` `G2` `G3` **均未签认** |
| 状态 | **草案**。确认人/日期：待补。不得把本模板当成已确认业务。 |
| 上游 | `docs/USER-RESEARCH.md`、`docs/SCENARIOS.md`、`docs/DIFF-MATRIX.md`、`docs/research/*`、`research/bladder-cancer/*` |

> **纪律**：本 SPEC 中每个医学数字都必须能在 `docs/research/` 找到原文出处，否则写「待核验」。
> **一期止点（`DESIGN-07`）**：完成调研 / SPEC / schema 草案 / HTML demo / 文件体系；**业务代码一行不写**；MinerU 只留接口与设置页骨架。

---

## 设计者与研究/场景依据

已按 `docs/DESIGN-PROMPT.md` 与 `docs/DESIGNER-BRIEF.md` 对齐角色、研究方法、成功标准与取舍原则（12 节，已落盘）。要点：

- **我代表谁**：三条**并列**记录主体——A NMIBC 患者本人（保膀胱线）、B MIBC 患者本人（根治/改道线）、C 照护者（配偶/子女，**实际主要录入者**）。潜在冲突：患者想少记、想保膀胱；家属想多记、想尽快切。**工作台对「保还是切」零倾向**，「保膀胱」不得被写成默认正确选项。
- **研究方法**：证据分层 `E1 权威原文 > E2 官方注册库 > E3 患者教育材料 > E4 设计假设`。**⚠️ 本项目无真实患者访谈、无病历、无患者侧材料**（`DESIGN-10`，m00282）；患者教育材料**不等于**真实用户验证。
- **成功判据**：①患者能说出三个要问医生的问题；②换一个照护者接手**不用问患者**就知道灌注排到第几周与下次膀胱镜日期；③急症 30 秒内找到判据与联系入口。
- **追踪链**：`证据 E → 需求 N → 场景 S → 功能 F → 数据/交互 → 验收 A`（见 `docs/SCENARIOS.md §4` 抽样）。
- **证据文件**：`docs/research/中文权威共识-事实提取.md`（11 份共识，约 200 条事实）、`docs/research/2025-2026-膀胱癌治疗格局-事实提取.md`（9 份 FDA/III 期）、CACA 膀胱癌 QA（48 问答）、ADC 临床应用安全共识（2022）。
- **独立 review**：**未做**（`docs/DESIGN-REVIEW.md` 待写）。不得写成"已通过"。

## 问题、用户与最小闭环

**问题**：膀胱癌患者手里有报告、有化验单、有一句"下周三来灌注"，但**串不起来**："我在哪条线？走到哪一步？这次复查和灌注排到第几？下次门诊要问什么？"

**用户**：见上三条主体。**输入**：病理/化验原文、灌注与复查安排、造口日常、医生口头信息。**动作**：抄录/导入 → 标记核对状态 → 在分野页确认自己那条线 → 记录灌注与复查 → 记指标 → 生成复诊摘要。**输出**：复诊问题清单 + 摘要；造口日记；一图秀趋势；试验线索。**失败恢复**：低精力时只打勾/只读；断网时全部本地可用；资料缺失时给空态与「来源待补」，**不猜**。

**最小闭环（一期）**：录入病理原文 → 分野 → 灌注/复查排程 → 指标 → 复诊摘要。

## 方案与 ADR

| ADR | 候选 | 选择 | 理由 |
|---|---|---|---|
| **ADR-01 布局** | ①`business-first` 整页 customFrame ②`split` 分栏 | **business-first**，`businessWidth 0.72` | 与泌尿族 T0（前列腺癌 `business-first` / `0.72`）逐字段对齐；业务是主任务，对话在右侧 |
| **ADR-02 分野实现** | ①单值字段 `stage_group` ②**多断言并列**（三张表：`line_selections` / `staging_assertions` / `pathology_findings`） | **②多断言并列**（借卵巢癌） | 同一患者可能同时存在临床分期与病理分期；`G2` 与「高级别」须**并列不换算**；单值字段会强迫过早归一 |
| **ADR-03 术式建模** | ①枚举字段 ②**不可逆事实 + 版本链** | **②** | 尿流改道不可逆；改记录必须留痕不覆盖（对照乳腺癌「点位方案换版 → 旧序列断线不拼接」） |
| **ADR-04 灌注结构** | ①一条等距序列 ②**疗程 + 每次事件两层** | **②** | 原文是「即刻 24h 内 → 诱导每周 1 次×6～8 → 维持每 2～4 周 1 次」的**两段结构**，等距序列表达不了 |
| **ADR-05 造口录入** | ①每日打卡 ②**按一次录一批 + 可复用耗材目录** | **②** | `DESIGN-09`：按主要录入者（照护者）的精力预算设计 |
| **ADR-06 存储** | ①JSON 文件仓储（卵巢）②**SQLite + 迁移 ledger**（淋巴/乳腺/肺/胃） | **②SQLite** | 家族主流；需版本链、CHECK 约束、`no_rewrite` 触发器；临床试验快照另存一份只读 SQLite |
| **ADR-07 临床库** | ①只用离线语料 ②**自采 CT.gov + ChiCTR 双源** | **②** | 实测：MCP 离线语料**只有胰腺癌**，膀胱癌命中 **0** 条；故必须自采，并如实声明 CDE 未采集 |

**宿主能力表**：

| 能力 | 官方合同 | 本机核验 | 替代路径 |
|---|---|---|---|
| 右侧原生会话面板 | `prompts/DSH-AGENT-PANE-INTEGRATION.md` | **未验证**（未接入 DSH） | HTML 阶段用状态稿 + 「复制草稿」退化路径 |
| 面板宽度持久化 | 同上 | **未验证** | localStorage + `clampAgentWidth()` |
| MinerU 云端解析 | `docs/18-MINERU-PARSING.md` v2 | **未验证**（一期不接通） | 手动抄录 |
| 高德 POI | `docs/12-AMAP-POI.md` | **不适用**（本项目无地点需求） | — |

**不复用未核验版本号**：本项目只声明 `node >= 22`、`@deepseek-ai/cordis >=4.0.1 <5`、`schemastery >=3.18.1 <4`（脚手架生成，由 `dsh-wb-cli check` 校验）。

## 功能范围

链接 `docs/FEATURE-INVENTORY.csv`（待生成，phase1 末）。

**一级导航（12）**：

```
看板
病情整理        资料库 / 待核对草稿 / 病情档案 / 指标检测 / 病情汇总
我的分型与分期  分野与分型 / 病理与分级 / 分期断言 / 危险度*
手术与 TURBT    TURBT 序列 / 二次电切 / 根治性切除
膀胱灌注        周期总览 / 本次记录 / 禁忌与中断 / 副作用
尿流改道与造口  三术式对照 / 回肠造口 / 原位新膀胱 / 输尿管皮肤造口 / 造口日记 / 耗材目录
治疗历程        治疗线 / 用药与周期 / 疗效评估 / 肾功能门槛
复查与膀胱镜    复查排程 / 本次记录 / 方式与麻醉 / 疼痛与心情 / 尿细胞学 / 上尿路监测
检查与指标      指标总览 / 分类指标卡 / 电解质与 B12* / 肾功能
病情一图秀      —（无二级）
急症与安全      血块与尿潴留 / BCG 全身感染 / 造口缺血梗阻 / 无尿与腰痛
生活与照护      饮水与饮食 / 造口与社交 / 性功能与亲密* / 工作与出行 / 照护者交接
复诊准备        问题清单 / 复诊摘要 / 就诊准备
临床试验        线索 / 已收藏 / 入组问题
设置            齿轮入口，不占左侧导航
```

`*` ＝ **来源待补**（见末节）：入口必须在，内容可薄，界面标「待核验 / 来源待补」。

**范围外（明确不做）**：疾病百科、每日打卡式健康记录、自动复发风险计算、自动危险度分层、保膀胱 vs 根治的推荐、造口照片 AI 判读、分期算分器、生存期预测、非尿路上皮膀胱肿瘤、膀胱良性病变（间质性膀胱炎/神经源性膀胱等）。

**隐藏/渐进披露**：低频配置（数据包来源、导出格式）折叠；教学放 💡 帮助；**阻断错误与必要确认不可隐藏**。

## 数据与 API

实体/关系见 `docs/SCHEMA.md` 与 `schema/draft/0001_initial.sql`（草案，**`G3` 前不执行不冻结**）。

**实体清单（21 组）**：

通用 `workspace` / `subject` / `document`(sha256) / `source_ref` / `record` / `viewpoint`(is_private 默认 1) / `question` / `task` / `saved_result` / `export_job` / `change_log`；导入 `import_file` / `parse_job` / `candidate`；**膀胱癌专属** `line_selection`（分野，带版本链） / `pathology_report`+`pathology_finding` / `staging_assertion`（`clinical`/`pathological`/`post_neoadjuvant` 三态并列） / `surgery_event` / `instillation_course`+`instillation_event`+`contraindication_flag` / **`bcg_response`（S17）** / **`high_risk_marker`（S17）** / `diversion_fact` / `stoma_supply`+`stoma_log`+`continence_log` / `followup_schedule`+`cystoscopy_record`+`cystoscopy_experience` / `urine_cytology` / `upper_tract_surveillance` / `renal_function`+`split_renal_function`+`drainage` / `urgent_symptom` / `private_note` / `treatment_line`+`regimen_drug`+`cycle`+`response`；指标 `metric_definition`(版本化 code+version) / `observation` / `measurement` / `symptom_entry`。

**事实与候选分离**：`candidate` **永远只是候选**，逐项确认才进事实层。接受 ≠ 审核；审核字段保持 NULL 直到人工确认。

**核心校验**：`muscle_present ∈ {有,无,未提及}`；`variant_is_predominant ∈ {是,否,未提及}`；`bcg_response.status ∈ {初治,无应答,不耐受,未判定}`；`high_risk_marker.kind` **四值且与共识原文一一对应**（BCG无应答/血管淋巴管侵犯/变异组织类型/前列腺尿道侵犯）；`result_state ∈ {阴性,非典型,可疑,阳性}`；`phase ∈ {即刻,诱导,维持}`；`diversion_fact.kind` 四值；`observation` 缺测留 **NULL**（不写 0、不写空串）；**`lab` 或 `method` 不同的观察值不连线**。

**时区与单位**：日期存 ISO `YYYY-MM-DD`；时间戳带 `+08:00`。单位存**原文** `unit_raw` + 归一 `unit_norm`（归一前**先剥 LaTeX 外壳**：`$10^9/L$` → `10⁹/L`）；认不出留空并标「缺单位」。

**迁移**：只增不改。`0001_initial.sql` 冻结后只能新增 `0002_*.sql`；`schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`。

**读模型版本**：视图按页面需要建（如 `v_followup_due`、`v_instillation_progress`），**领域事实不跟随 Tab**。

**外部信息合同**：临床试验数据（§「临床试验数据」）来源 = `unified-trial-mcp` 六通道中的 `ctv`/`chictr_online` 与本机 `chictr-mcp-server` sidecar、以及 ClinicalTrials.gov API v2。每条带**检索日期 / 窗口 / 来源 / 查询式 / 纳排口径 / 失败通道 / 去重规则**，写入 `manifest.json`。**获取成功 ≠ 已核实**；`NOT_ENABLED` / `NEEDS_SETUP` / `NOT_QUERIED` / `TIMEOUT` **不得推出"不存在"**。未知/过期写「未核实」，不伪装成当前结论。

## 设置与配置页面

引用 `docs/SETTINGS-DESIGN.md`。业务页右上**具名齿轮**入口。至少含：

1. **患者资料目录**：路径（主目录缩成 `~`）、就绪状态；切换后**旧快照失效**；卸载不删除业务数据。
2. **文档解析（MinerU）**：`GET /api/bladder/settings/mineru` → `{configured, source: file|env|none, sourceLabel, masked, file, fileExists, tokenUrl, permissions, error?}`；`POST` 同路径 `{token}` 保存 / `{action:"clear"}` 清除，均返回同 GET 状态；错误码 `400 invalid_token`（空/<8/>1024/含空白/非 `[A-Za-z0-9._-]`）、`500 settings_write_failed`、`405`。唯一实现层 `dsh/settings.js`；唯一密钥文件 `mineru.json`；Token 优先级 **显式 > 文件 > env**；界面只给**掩码 + 来源 + 文件路径**，原文**永不**回界面/日志/错误消息。**一期只做骨架，不联网。**
3. **指南与数据包来源/版本**：列出 `docs/SOURCES.md` 的来源、版本、采集日期、核实状态。
4. **字号三档**（基线 12.5px / 15px / 17.5px）。
5. **关于**：版本号须与 `package.json` / `VERSION` / 顶栏 chip **三处同源**。

**草稿保存/取消/错误恢复**：设置页改动需显式保存；保存失败保留输入并给可重试错误；**成功才关弹窗**；Token 输入框保存后清空。

**密钥纪律**：密钥不得进提示词 / SPEC / HTML 夹具 / 日志 / 导出 / 患者目录；`.gitignore` 必须含 `.secrets/`。

## UI 与原型一致性

**原型**：`prototypes/v0.1/`（HTML，路径/版本/hash 待 `G2` 记录）。语义 token 见 §「品牌令牌」。

**品牌令牌**：
- 品牌主色（青泉）`--wb-brand: #1793A6`；`ink #0D5A66`；`soft #E7F4F7`
- 主行动 `--wb-action: #0F6E7D`；对偶暖色 `--wb-accent: #C96A1E`（`soft #FBEFE2`、`ink #8A4410`）
- 纸色 `#F6FAFB`；卡 `#FFFFFF`；正文 `#1E3A42`；次要 `#4E6B74`；描边 `#CFE0E5`
- **数据色**（家族级语义，只区分序列不表示优劣）：尿路/膀胱镜 `#1793A6`、肾功能 `#4A6FA5`、电解质与 B12 `#A85A3C`、血常规 `#A03D5C`、营养体重 `#2F7D6B`、症状自评 `#8A6BA8`
- **硬规则**：**分类变量（尿细胞学四态、分级、有无肌层）绝不按「好/坏」着色**
- 字体系统栈；正文 15–16px/1.6；辅助 12.5–13px；标题 26–30px；数字 `tabular-nums`；操作区 ≥44px；大字三档；`prefers-reduced-motion` 停动效。

**一图秀**（详见 `docs/ONE-CHART-SPEC.md`）：C1–C12 全部适用。三条不可让步：①每线按该指标**全期** min/max 归一化并写明**不可比**；②**单点不连线**、空窗口给**空态**；③**治疗条与数据区分层**（治疗条固定绘图区上方独立行；手术＝菱形+竖虚线）。另有：末点每序列只标一次 / 距右边界 <46px 改 `text-anchor=end` / 多序列错开 ≥11px；网格轨道 `minmax(0,1fr)`，390px 下 `documentElement.scrollWidth === 390`，横滚容器为 `.chart-wrap`；动画 `pathLength="1"` + `stroke-dashoffset`，点 40–50ms 递增延迟；时间窗 3/6/12 月与全部；指标选择上限 3–6；治疗事件竖线与节点同 ID 联动；点值可回来源。

**指标卡（3D）**：外卡固定高 **276px**（大字模式统一 **340px**，正反一致）、圆角 18px、内边距 20px、卡间距 16px；数字约 33px / 项目名 15px / 正文 12px / 元信息 11px；`perspective:1100px` 外卡 + `transform-style:preserve-3d` 内层 + 两面 `position:absolute; inset:0` + `backface-visibility:hidden` + 背面预转 180° + `[data-flipped=true]` 时 `rotateY(180deg)`；**≥700px 两列、<700px 单列，不做三列以上**；`role=group` / `tabindex=0`，隐藏面 `aria-hidden` + `inert`。**翻转是固定高度 3D 翻转，不是上下展开插入内容。**

**顶栏**（`prompts/DSH-WORKBENCH-TOP-BAR.md`）：三段式（左＝品牌 + 版本 chip；中＝一句状态说明；右＝主操作按钮组 `margin-left:auto`）。header padding `6px 12px`；必须有 `padding-inline-start: var(--dsh-frame-leading-clearance, 12px)`；gap 10px、按钮组内 6px；品牌 12.5px/700；版本 chip 11px/500、`border-radius:999px`、`padding:1px 8px`、**中性灰不跟品牌色**；说明 11.5px + `flex:1` + `min-width:200px`；主按钮 `padding:5px 14px`、999px、白字。**版本号必须在首页首屏可见**（发布可见性 P1）。

**键盘与 reduce motion**：分隔器 `role="separator"` + `aria-valuemin/max/now` + `tabindex=0`，←/→ 步进 2%，Home/End 到边界；`prefers-reduced-motion` 时一图秀直接给终态、卡片静态等高切换。

**链接 PARITY**：`docs/PARITY.csv`。**偏离逐条记录依据与替代方案**。

## 资源与 Agent

**assets 清单**：`assets/tokens.css` / `tokens.json` / `manifest.json` / `brand/xyb-logo.png` / `icons/{clover,flower-5,flower-7}.svg` / `reference/ctcae/CTCAE_v5.0_Quick_Reference_5x7.pdf` / `reference/metric-trends/*`。许可：随包分发，CTCAE 原文只读引用。

**资料目录 / 原生会话双状态**：顶栏分别显示两个**独立**状态（资料目录就绪 / 会话绑定）；**真实就绪且 owner/映射确认后才绿**；切换时使旧快照失效；保存或草稿成功 **不代替**连接状态。见 `docs/09-WORKBENCH-STATUS.md`。

**本地与云能力**：默认**全部本地**（SQLite + 本地文件）。唯一云能力是 MinerU 解析，**用户显式触发**并告知原件出本机；不可用时降级为手动抄录。**代理是已知缺口**：Node 内置 fetch 不认 `HTTP_PROXY/HTTPS_PROXY`。

### DSH 原生 AI 对话入口与面板

- 全局顶栏**可见入口**，文案「AI 对话 / 打开 AI 对话 / 收起 AI 对话」；写明连接中 / 已连接 / 不可用三态；首次点击的**创建或复用规则**：显式创建或复用归属于当前项目的会话。
- 面板默认**关**；可独立隐藏并重新打开；**隐藏不结束会话、不清空筛选/表单/滚动状态、不丢原生草稿**。
- 可调宽：**默认 35%、范围 25%–45%**（社区基线）；键盘 ←/→ 步进 2%，Home/End 到边界；宽度持久化到 localStorage，读回经 `clampAgentWidth()`；`role="separator"` + aria 三值 + `tabindex=0`。
- **形态区分**：本项目为 `business-first`（CustomFrame）→ 右侧原生面板 + 可访问拖动分隔器。容器 **<760px** 改覆盖式抽屉 **≤420px**（业务区不让位、**splitter 不出现**）。
- 宿主不支持隐藏/重开/调宽时：列出实际限制与替代交互，**不得用工作台自制聊天窗冒充原生能力**。
- **上下文草稿**（`prompts/DSH-AGENT-PANE-INTEGRATION.md §6.1`）：只读接口 `GET /api/agent/context?scope=…` → `{blocks:[{label, lines[]}], gaps[], excluded[]}`。范围边界：图表页只带当前选中序列；就诊准备带问题清单与未完成待办、**默认不带私密**；核对/草稿页**仅已确认入库的事实**，未确认候选只报条数。**四条不可让步**：①只抄记录、缺项写「没有」不补不推测；②「已确认」只表示转录核对，必须写明「**不等于医学审核**」；③私密 fail-closed，勾选后标「本次已勾选带入」；④**草稿不得带本机资料目录路径（含用户名）**。送达 `postMessage({type:'bladder:agent-draft', prompt})`，面板侧**同时**校验 `event.source === iframe.contentWindow` 与 `event.origin === location.origin`；长度上限 **8000**；只调 `setDraft`，**不调用任何提交/发送**；空态不给入口；脱离宿主退化为「复制草稿」并写明没有 AI 面板。
- 记录到 `docs/AGENT-PANE-DESIGN.md`、`docs/UI-PARITY.md`、`docs/ACCEPTANCE.md`。**HTML 状态稿与目标 Desktop 实测证据：均未做。**

## 实施与验证

顺序（`docs/17` 十阶段 / `docs/22` Phase1–3）：

```
Phase1 设计  阶段1 需求调研 ✅ → 阶段2 需求确认（BRIEF/SPEC/草案/HVT/验收）→ 阶段3 HTML 原型
             → 【G1】业务流程签认 → 阶段4 HTML 确认【G2】→ 阶段5 数据集【G3】
Phase2 迁移  正式迁移 + 冻结 sha256 + demo manifest + 检查链
Phase3 实现  阶段6 系统开发（parity >98%）→ 阶段7 测试修复
             → 阶段8 DSH Desktop 发布前核验（V1 包级 / V2 装机 / V3 业务）→ 阶段9 发布与人工验收 → 阶段10 复盘
```

**本轮（phase1）已完成**：需求调研、`USER-RESEARCH.md`、`SCENARIOS.md`、`DIFF-MATRIX.md`、共识事实落盘、2026 临床库（295 条）、`SPEC.md`。**进行中**：HTML 原型、schema 草案、`HVT-REVIEW.md`。

**每项任务有依赖/文件边界/验收证据/状态**：见 `docs/TASKS.md`。

**分层验证口径（不可互相替代）**：代码检查 ≠ 安装完成 ≠ 界面加载 ≠ 业务可用 ≠ 外部服务成功。**未观察到的写「未验证」。**

## 交付与发布

**包版本/显示来源**：`VERSION` / `package.json` / `workbench.json` / 顶栏 chip / 页脚 / 关于 —— **六处同源**（家族一致性审计项）。

**安装入口/profile**：DSH Desktop 读 `~/Library/Application Support/dsh-desktop/harness/profiles/web`（注意 `~/.dsh/profiles/*` **不是**它）。

**分别授权、分别记录**：①本机安装 ②业务仓库 Git 推送 ③GitHub Release / npm ④Awesome Workbench 市场目录 PR。**四者均未授权**。未授权市场投稿写「不适用」，不创建 PR。

**Demo 清理 / 回滚 / 未验证项**：见 `docs/RELEASE.md`（当前为空模板）。源码回滚与数据库兼容**分开判断**，不以清库恢复版本。

## 互动设计与确认关口

引用 `docs/DESIGN-SESSION.md`（已写 DESIGN-01…10）与 `docs/UI-DESIGN.md`（待写）。

**当前状态**：模板已就绪、部分已填写、**G1/G2/G3 均待确认**。未决项：HTML 原型签认、schema 签认、HVT 五层检查、独立 review、资料目录最终确认。

**已确认（用户本人，`docs/DESIGN-SESSION.md` 留痕）**：

| ID | 决策 | 用户确认 |
|---|---|---|
| DESIGN-01 | 膀胱癌当**泌尿族实际先行者**（不等前列腺癌 T0，共享件标「待回填」） | m00145 |
| DESIGN-02 | **两条线都做，MIBC 做厚** | m00145 |
| DESIGN-03 | **三种改道都做，各自独立页签** | m00145 |
| DESIGN-04 | 品牌 **小泉宝 · UroPal** | m00145 |
| DESIGN-05 | 工作目录（受沙箱约束改为就地 init） | m00145 |
| DESIGN-06 | **2026 全年 + CT.gov 主通道 + 中国通道，目标 300–500 条** | m00145 |
| DESIGN-07 | **严格停在 phase1** | m00145 |
| DESIGN-08 | 首屏**先问一次分野**，再进看板 | m00282 |
| DESIGN-09 | 录入**按照护者批量录入**设计 | m00282 |
| DESIGN-10 | 证据可得性：**有资料目录、无真实访谈、无临床核对人** | m00282 |

**所用 UI 技能与实际预览证据**：`taste` / `design-taste-frontend`（HTML 原型阶段）；**实际浏览器预览证据待 `G2` 补**。

**数据等级与事实/文件/记忆/缓存分工**：引用 `docs/SCHEMA.md`。事实（`record` 家族）与候选（`candidate`）**分区**；不按 Tab 建事实表。

**设计修订记录影响的功能 ID**：见 `docs/TASKS.md`。**未确认模块不记为开发完成。**

## HTML原型先行（业务开发前关口）

```
HTML 路径/版本/hash：prototypes/v0.1/  —— hash 待补（G2 时记录）
实际浏览器/尺寸/关键交互证据：待补
用户确认版本/范围/人/日期：待确认
```

**未确认范围不得进入正式业务开发。**

**顺序**：需求与数据边界草案 → HTML 交互 UI → 实际预览 → 用户确认 → 对应业务实现。

**一期止点**：只到「HTML 交互 UI + 实际预览」，**业务实现不开始**。

## 数据模型演进关口

| 维度 | 归属 | 演进示例 |
|---|---|---|
| 领域事实/关系 | `schema/*.sql`（事实层，`G3` 后只增不改） | 新增 `continence_log` 字段 |
| 工作流实例/版本/状态 | `change_log` + 版本链（`supersedes_id` / `is_current`） | 改病理断言、改术式 |
| 页面读模型/偏好 | 视图 + localStorage | 新增 `v_instillation_progress`、字号档、面板宽度 |

**SCHEMA 变化矩阵**：

| 变化类型 | 处理 |
|---|---|
| 导航/布局变化 | **不改事实表**，只改读模型与前端 |
| 多视图 | 新增视图，不改表 |
| 字段/指标扩展 | 新增 `metric_definition` 版本，不改已有 observation |
| 流程插入/跳过/重开 | 用状态字段 + `change_log`，不删历史行 |
| 来源纠正/删除 | `no_delete` 语义：标记失效 + `supersedes_id`，物理保留 |
| 旧库/旧客户端 | 增量迁移 + 视图层兼容；**不以清库恢复版本** |

**每类变化的 API 兼容/投影更新/迁移、备份/恢复/回退证据**：待 Phase2 补（届时写 `schema/freeze-contract.md`）。

完整要求见 `docs/14-HTML-AND-DATA-CONTRACT.md`；**模拟原型结构不是最终表**。

---

## 膀胱癌专属模块规格

每条：**触发 / 字段 / 规则 / 验收**。差异矩阵全表见 `docs/DIFF-MATRIX.md`。

### M01 `F-分野`（S01）
**触发** 首次进入或病理结论新增/修改。**字段** —— 刻意**拆成三张表**而不是一个 `diagnosis_assertion`：
- `line_selections`：`line ∈ {nmibc, mibc, undetermined}` / `decided_at` / `reason`（「报告看不懂」也是合法理由）/ 版本链 `is_current` + `supersedes_id`
- `staging_assertions`：`kind ∈ {clinical, pathological, post_neoadjuvant}` / `t_stage` / `n_stage` / `m_stage` / `source_ref_id` / 版本链
- `pathology_findings`：分级与「有没有取到肌层」等**原文照录**字段（分级两套并列不换算）
派生 `line`（**原文缺失即回 undetermined**）。拆开的原因：分野、分期、病理形态是三件不同的事，合并后「同一患者同时有临床分期与病理分期」就只能靠自由文本挤在一个字段里，AC-04 的版本链也无处落。
**规则** 未选线不给任一线的专属内容；可改，改留痕。
**验收** AC-01 未选线时看板**不出现**任何一线专属大卡；AC-02 选 NMIBC 出「灌注/膀胱镜复查/尿细胞学」卡、选 MIBC 出「改道/肾功能/造口日记」卡，**两者不并存**；AC-03「我还不确定」可选且不强行归类；AC-04 改线进版本链不覆盖。

### M02 `F-病理核对`（S02, S18，**优先级最高的翻译点**）
**字段** `pathology_finding`：`finding_id / document_id / raw_text / report_date / specimen / grade_raw（原文）/ grade_scheme_raw（原文提到的体系名，可空）/ muscle_present（有|无|未提及）/ tumor_size_raw / concurrent_cis_raw / lymphovascular_invasion_raw / histologic_variants_raw（照录）/ variant_is_predominant（是|否|未提及，>50%）/ review_state（待核对|已核对）/ reviewed_by / reviewed_at`。
**规则**
- **两套分级并列原文保存，不做任何映射、不出现等价表述**（依据：11 份中文共识中 `G1/G2/G3` **零出现**，只有「低级别/高级别」）。
- `muscle_present = 无` 必须呈现为「**分期可能不完整，是需要问医生的点**」，**不得渲染成好消息**。
- 报告未提及 = `未提及`，**不等于**「无」。
- 认不出的词**照录**并标「未核实」。
- **组织学变异型（S18）只做原文保留**：识别到 `histologic_variants_raw` 非空时追加一条待问项，**不解释预后、不做分级、不写「更凶/更危险」**。可带来源陈述「2024 版把『变异组织类型』列为极高危构成之一」，但**不得**由工作台据此给出处置方向。
**验收** AC-05「未见肌层」标为待澄清项而非正常结论；AC-06 三态可区分；AC-07 全站搜不到任何 G↔级别换算/等价文案；AC-08 认不出照录标「未核实」；**AC-48** 变异型只出现在原文与待问项，全站搜不到针对变异型的预后/严重程度措辞；**AC-49** `variant_is_predominant` 三态可区分。

### M03 `F-灌注`（S03，**最独有**）
**字段**
- `instillation_course`：`course_id / agent（BCG|表柔比星|吉西他滨|丝裂霉素|其他）/ phase（即刻|诱导|维持）/ planned_total / started_on / status / discontinued_reason / supply_note`
- `instillation_event`：`event_id / course_id / planned_on / actual_on / dose_raw / retention_minutes（可空）/ position_rotation / outcome（完成|取消|中断）/ cancel_reason_code / adverse_note / source`
- `contraindication_flag`：`flag_id / kind / observed_on / source`

**规则（E1，2021 灌注共识）**
- 计划结构：**即刻 24h 内**；**诱导每周 1 次 × 6～8 次**；**维持每 2～4 周 1 次**。BCG 诱导须**术后 ≥2 周**。国产 BCG 每次 **120 mg**、1 年共 **19 次**；SWOG 方案 3 年共 **27 次**。
- **化疗灌注禁忌 4 条**：膀胱穿孔 / 肉眼血尿 / 严重化学性膀胱炎 / 急性尿路感染。**BCG 另加 2 条**：术后 2 周内 / 创伤性导尿。
- 取消时必须解释为「**这是禁忌保护**」，不是出事了。
- **漏一次不给任何处置建议**（原文无统一口径）。
- `retention_minutes`（憋尿时长）原文为图片未获取 → 字段存在但默认空，标「来源待补」，**不得给建议值**。

**验收** AC-09 周期表能表达「诱导 + 维持」**两段结构**；AC-10 禁忌旗标可拦且给「保护」解释，BCG 比化疗多 2 条；AC-11 BCG 与化疗**药物集与模板不同**；AC-12 漏一次时**不出现任何处置建议**。

### M04 `F-手术`（S06）
**字段** `surgery_event`：`event_id / kind（TURBT|二次电切|根治性膀胱切除|尿流改道重建|其他）/ performed_on / complete_resection（完全|不完全|未提及）/ muscle_in_specimen（有|无|未提及）/ perforation（有|无|未提及）/ surgeon_note_raw / source`；根治术另挂 `diversion_fact` 与 `lymph_node_raw`、`margin_raw`。
**规则** TURBT 是**切除**不是取材活检；二次电切是**同一手术线的下一事件**，不新建主体档案。
**验收** AC-13 TURBT 与根治术是两类记录、字段集不同；AC-14 全站不把 TURBT 描述为「取活检」；AC-15 二次电切不产生新主体档案。

### M05 `F-改道`（S07/S08/S12）
**字段**
- `diversion_fact`（**不可逆事实**）：`fact_id / kind（回肠通道造口|原位新膀胱|输尿管皮肤造口|其他）/ performed_on / stoma_site_raw / supersedes_id / change_reason`
- `stoma_supply`（**可复用目录**）：`supply_id / kind（底盘|造口袋|防漏环|护肤粉|集尿器|支架）/ brand_model / size_raw / change_interval_days / notes`
- `stoma_log`（**按批录入**）：`log_id / batch_on / supply_id / changes_count / leak_count / skin_issue（无|红|破溃|其他）/ odor_management / night_drainer / note / privacy（默认 private）`
- `continence_log`（仅原位新膀胱）：`log_id / date / voided_volume_raw / residual_volume_raw / catheterization_times / pad_used / note`
- `metabolic_observation`（**P2，来源待补**）：B12 / 碳酸氢盐 / 氯 / UTI 事件 / 结石事件

**规则** 三术式字段集不同；术式不可逆、改动留痕；对照页**零倾向**。
**验收** AC-16 三种术式**各自独立页签、字段集不同**；AC-17 对照页**零倾向**（不排序、不推荐、无倾向色、不默认选中）；AC-18 造口日记是**批量**录入、耗材来自目录；AC-19 身体形象项**默认私密**；AC-20 术式改动后旧值仍可查。

### M06 `F-复查`（S04）
**字段** `followup_schedule`：`schedule_id / kind（膀胱镜|尿细胞学|上尿路影像|超声|CT/MRU）/ planned_on / interval_source（版本+出处）/ note`；`cystoscopy_record`：`record_id / performed_on / modality（柔性|硬性|荧光|麻醉方式）/ finding_raw / biopsy_taken / conclusion_raw / next_planned_on`；`cystoscopy_experience`：`record_id / pain_score(0–10) / mood_note / privacy`（**与临床结论分区**）；`urine_cytology`：`record_id / specimen_kind（自然尿|膀胱冲洗）/ result_state（阴性|非典型|可疑|阳性）/ result_raw / report_date / lab / method / source`；`upper_tract_surveillance`：`record_id / date / modality / finding_raw / hydronephrosis（有|无|未提及）/ split_renal_function_raw / anastomotic_site_note`。
**规则** 间隔口径 = **2022 版**（每 3 个月膀胱镜 + 尿细胞学；每 6～12 个月影像）；**2024 版不再复述间隔数字**，界面必须标版本。**全站禁止「终身」二字**。
**验收** AC-21 复查是独立一级页；AC-22 疼痛自评与心情存在且与临床结论**视觉分区**；AC-23 间隔数字带版本标；AC-24 全站 grep 不到「终身」；AC-25 尿细胞学**四态四个值**且「非典型」无倾向色、不渲染成阳性或阴性；AC-26 标本类型参与可比性提示；AC-27 上尿路标为「**第二原发监测**」且不出现「转移」推断。

### M07 `F-肾功`（S09/S11）
**字段** `renal_function`：`record_id / date / egfr / creatinine / method_raw / unit_raw / lab / ref_range_raw`；`split_renal_function`：`record_id / date / modality / left_raw / right_raw`；`drainage`：`record_id / kind（DJ 管|肾造瘘|无）/ placed_on / replaced_on / note`；`hydronephrosis_raw`。
**规则** 顺铂门槛 = **CrCl＜60 ml/min 或 eGFR ≤60 ml/min**（E1，2022/2024 保膀胱共识）→ 必须显示**出处与日期**，且**不写「该用/不该用哪个方案」**。
**验收** AC-28 肾功能与治疗历程**互相可见**；AC-29 门槛值显示出处与日期；AC-30 全站不出现「你应该用/不应该用某个方案」。

### M08 `F-急症`（S10）
**四类独立入口**：①血块与尿潴留 ②BCG 全身感染 ③造口缺血/梗阻 ④无尿与腰痛。
**字段** `urgent_symptom`：`entry_id / category / observed_on / note / judged_by（本人|照护者）/ action_taken_raw`。
**规则** 给**可判断的表述**；**不写因果**、**不写处置**；无来源条目显式标「待核验」+ 免责。
**验收** AC-31 四类各有独立入口；AC-32 无因果文案、无处置指令；AC-33 无来源条目标「待核验」；AC-34 30 秒内可达。

### M09 `F-私密`（S13，P2）
**字段** `private_note`：`note_id / topic（性功能|生育|身体形象|其他）/ note / privacy（默认 private）/ share_scope（private|selectable）`。
**验收** AC-35 默认私密（fail-closed）；AC-36 未显式勾选时**绝不**进入导出与 Agent 草稿。

### M10 `F-代记`（S14）
**字段** `actor`（记录人）与 `subject`（被记录者）**分离**；每条事实带 `recorded_by`；`handover_view`（只读摘要）。
**验收** AC-37 换照护者后**不问患者**即可说出当前灌注周次与下次复查日期；AC-38 每条事实可答「谁记的/记的是谁」；AC-39 患者端可只读 + 打勾 + 急症。

### M11 `F-复诊`（S15）
**字段** `question`（`kind ∈ fact|concern`）/ `task` / `visit_summary`（含 `blocks[{label, lines[]}]`、`gaps[]`、`excluded[]`）。
**验收** AC-40 问题清单可增删排序；AC-41 摘要**只抄记录**、缺项写「没有」；AC-42 私密项默认不带入；AC-43 摘要**不含本机路径或用户名**。

### M12 `F-试验`（S16）
**验收** AC-44 显示「登记状态 ≠ 入组资格」；AC-45 标注 `utuc` 与 `urothelial-unspecified` 边界；AC-46 不构成方案推荐；AC-47 可收藏并转成入组问题。

### M15 `F-应答`（S17，**NMIBC 线最重要的一次抉择**）
**字段** `bcg_response`：`response_id / course_id（指向 instillation_course）/ status（初治|无应答|不耐受|未判定）/ decided_on / decided_by_raw（医生原话里的角色）/ doctor_words_raw（医生原话照录）/ recorded_at`。
`high_risk_marker`：`marker_id / subject_id / kind（BCG无应答|血管淋巴管侵犯|变异组织类型|前列腺尿道侵犯）/ source_ref_id（指向共识原文条目）/ noted_on`。
**规则**
- **`status` 只能来自「医生说了什么」**：`decided_on` 与 `doctor_words_raw` 必填（原文照录）。工作台**不自行判定**「无应答」——那是临床判断。
- **零倾向**：不推荐切也不推荐保。指南原文（2024 保膀胱共识：「BCG 无应答、血管淋巴管侵犯、变异组织类型、前列腺尿道侵犯患者，应首选根治性膀胱切除术」）可作**带来源的引用**呈现，但界面必须**同时**标明**这是指南的判断，不是本工作台的结论**。
- **不预测**：不给出「还能保多久」「成功率多少」任何形式的估计。
- `high_risk_marker` 四项**与共识原文一一对应**，不得增补或删减；每一项都要能回指原文条目（`source_ref_id`）。
- 应答状态变化**进版本链**（不覆盖旧判定），因为「什么时候被判无应答」本身就是患者要回顾的事实。
**验收** **AC-50** 界面不出现「建议切/建议保」类表述，且指南原文引用旁必须同屏出现「这是指南的判断」标识；**AC-51** `decided_on` 与 `doctor_words_raw` 为空时不得保存为「无应答」；**AC-52** 极高危四项与共识原文可逐项比对，且每项有 `source_ref_id`；**AC-53** 全站搜不到针对「还能保多久」的估计式文案；**AC-54** 应答状态改动留痕、旧判定标「已被替代」而不删除。

### M13 指标目录与一图秀
**一期指标目录**：肾功能（eGFR、肌酐）｜血常规（白细胞、血红蛋白、中性粒细胞绝对值）｜肝功能（ALT、AST）｜营养（体重）｜症状自评（疼痛 0–10、排尿困扰、乏力）｜尿检（尿细胞学**四态，不进折线**）｜电解质与代谢（钾、氯、碳酸氢盐、B12 —— ⚠️ **来源待补，P2**）。
**规则** **分类变量一律不进折线图**；`lab` 或 `method` 不同不连线（拆可比组）；缺测留 NULL。

### M14 指标分级与提醒
按 `docs/23-METRIC-GRADING-AND-ALERTS.md`，四条不可让步：①指标卡**按类别分组**、组顺序与一图秀**同源**（两页组名/顺序/项数一致）；②有国际标准（**CTCAE v5.0**）直接用，**只启用有绝对数值界限的项**，「×ULN」型**不启用也不近似**；③分级是**对照不是诊断**——徽章「**对照 CTCAE v5.0 · N 级**」+ 区间/来源/免责，用了通用下限要标出；④看板提醒只把「表达面（感受）」与「指标面」**两列并置**，**不写因果、不写处置**，只有一侧不弹（`paired`/`labsOnly` 由读模型算）。**分级是派生值：读取时算、不落库。**

---

## 医学边界与文案红线

**六态不可混同**：`未检测` ≠ `未检出` ≠ `阴性` ≠ `失败` ≠ `待出` ≠ `VUS`。每一态都要能单独表示。

**文案红线（零命中，由 `scripts/check-wording.mjs` 检查）**：禁止出现 `建议治疗`、`可能复发`、`可以停药`、`无需就医`、`终身随访`、`应该用`、`不应该用`、`预后良好`、`治愈`；带具体百分比的 `复发率`。

**零倾向要求**：对「**保膀胱 vs 根治**」「**三种改道选哪种**」——不排序、不推荐、不用倾向色、不设默认值、不在文案里暗示优劣。

**来源标注**：每个医学数字旁须有来源标（如「2021 灌注共识」）与版本。

---

## 临床试验数据（2026）

| 项 | 值 |
|---|---|
| 位置 | `research/bladder-cancer/`（`trials-2026.jsonl` / `bladder_cancer_trials_2026.sqlite` / `manifest.json`） |
| 总量 | **295 条** |
| 来源 | ClinicalTrials.gov API v2 **212** + ChiCTR 本机 sidecar **83** |
| 原始命中（过滤前） | 511 |
| 研究类型 | 干预性 **195** / 观察性 89 / 其他 10 / 扩展可及 1 |
| 视角 | 膀胱 **217** / 尿路上皮未特指 55 / UTUC 23 |
| 含中国中心或中国注册 | **158** |
| 视图 | `v_bladder_only` 272 · `v_interventional` 195 · `v_bladder_interventional` **180** · `v_china` 158 |
| 未采集 | **ChinaDrugTrials（CDE）** —— 需人工 Cookie 的受控通道，覆盖未知（**不得解释为不存在**） |

**口径限制（必须随数据一起呈现）**
- 年份口径不一致：CT.gov 按「首次公示年 2026」；ChiCTR 按 `createyear=2026`（注册年）。
- ChiCTR 存在**补注册**，研究实施时间常早于注册时间。
- `setting`（NMIBC/MIBC/晚期）是按标题文本推断的**线索**字段，**不代表入组资格**；纳排须回原登记页。
- `scope=utuc` 不是膀胱癌；`urothelial-unspecified` 多为转移性尿路上皮癌，含膀胱来源但未逐条核对。
- **登记状态不是入组资格；不构成方案推荐。**
- **PII**：ChiCTR 详情页研究者/伦理联系人**已按字段名模式剥除（17 个字段）**，并有 `assertNoPii` 失败即中止的 fail-closed 自检；保留的 `伦理委员会批件文号` / `批准本研究的伦理委员会名称` / `伦理委员会批准日期` / `是否获伦理委员会批准` / `申请人所在单位` / `研究负责人所在单位` 为**非个人**信息。

## PDF 报告导入（按 `docs/18-MINERU-PARSING.md` v2）

一期**只留接口与设置页骨架**。契约要点：
- 只走 **HTTP API**，不包装本机 CLI（GUI 进程 PATH 受限）。四步：`POST /api/v4/file-urls/batch` → `PUT`（**不设 Content-Type**）→ 轮询 `/extract-results/batch/{batch_id}` → 解包 `full_zip_url`。
- 默认模型 **`pipeline`**（接口拒参才回退 `vlm`）；**flash 已作废**。
- **Token 优先级 显式 > 文件 > env**；唯一密钥文件 `mineru.json`。
- 抽取**只抄写不判断**：词边界（`CRP` 不当肌酐 Cr）、不等式 `<0.5` 原样保留、单位**先剥 LaTeX 外壳**（`$10^9/L$` → `10⁹/L`）、认不出留空标「缺单位」。
- **表格先 `htmlTablesToPipes()` 转竖线表 + 补分隔行，再按位置对齐；指标数与数值数不一致整行放弃。**
- 解析失败**不产候选**、不静默降级；事务原子（候选写入 + `document=parsed` + `job=succeeded` 同一事务，任一步失败整体回滚为 `parse_failed`）。
- `document.status` 只允许 **待解析 / 待核对 / 解析失败** 三个终态；「解析中」只在内存/任务记录。**接受 ≠ 审核**，审核字段保持 NULL。

---

## 未核实清单（实施前必须补或降级）

| # | 缺口 | 原文位置 | 处置 |
|---|---|---|---|
| 1 | 危险度分组各条判据（低/中/高危/极高危） | 2021 灌注共识表1、2024 保膀胱共识表5/6（**图片**） | 待补采；补前「危险度」页只给结构 |
| 2 | BCG 不良反应分级表 + 「必须立即就医」原文 | 灌注共识表3（**图片**） | 待补采；急症页先用保守表述 + 标「待核验」 |
| 3 | 灌注后膀胱内保留（憋尿）时间、灌注后饮水排尿要求 | 灌注共识表4（**图片**） | 待补采；字段默认空，**不给建议值** |
| 4 | 2024 版随访计划表 | 保膀胱共识表2/表7（**图片**） | 待补采；间隔暂用 2022 版口径并标版本 |
| 5 | HER2 IHC / FISH 判读表 | HER2 共识表2/表3（**图片**） | 待补采；HER2 只表示「检测了/结果原文」 |
| 6 | B12 / 代谢性酸中毒 / 结石 的权威来源 | **11 份共识中查不到** | 补来源，否则降二期 |
| 7 | 性功能与生育具体字段的来源 | **同上** | 补来源，否则降二期 |
| 8 | 尿细胞学四态（阴性/非典型/可疑/阳性）的权威口径 | 原文只说「是常规随访项」 | 找权威分级，否则标 `E4` |
| 9 | **真实患者访谈** | — | **无**；本项目最大证据缺口 |
| 10 | ChinaDrugTrials（CDE）通道覆盖 | — | 本轮未采集，覆盖未知 |
| 11 | 目标 Desktop 实测（V1/V2/V3） | — | **全部未做** |
| 12 | 独立 review（`docs/DESIGN-REVIEW.md`） | — | **未做** |

---

## 与家族共享件的关系（泌尿族）

组织计划中膀胱癌是 **W3 泌尿族 T1**，家族样板是**刚开工、家族基线未定**的前列腺癌（T0）。按 `DESIGN-01` 本项目**当泌尿族实际先行者**：共享件**先按本项目需要建，并标「待回填」**，等前列腺癌出来再对齐。

**泌尿族共享件候选（待回填）**：肾功能与分肾核素、尿流改道通用字段、尿动力学相关项、男性性功能与射精、造口耗材目录。

---

## 自查

- [x] 每条差异化都能追溯 `S → F → A`（`docs/DIFF-MATRIX.md`，15 行）
- [x] 医学事实均有出处或已标「待核验」
- [x] 一期止点明确（业务代码不写）
- [x] 12 个一级页、7 个在样板中不存在或结构不同
- [ ] **HVT 五层落地检查未跑**（`hvt_scan.py` 无膀胱癌术语包，须现场推导 `--terms`）
- [ ] **独立 review 未做**（`docs/DESIGN-REVIEW.md`）
- [ ] `G1`/`G2`/`G3` **均未签**
- [ ] `FEATURE-INVENTORY.csv`、`PARITY.csv`、`ACCEPTANCE.md` 待填
