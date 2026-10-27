# 小泉宝 UroPal · 膀胱癌工作台

面向膀胱癌患者与照护者的本机优先工作台：NMIBC/MIBC 分野读懂、TURBT 与二次电切、膀胱灌注周期、膀胱镜复查与复发恐惧、尿流改道三术式与造口日常、肾功能与上尿路长期监测、复诊准备与临床试验档案

这是接入骨架，尚未实现真实业务。初始化后先将 [项目设计提示词](docs/DESIGN-PROMPT.md) 交给当前Agent；它应展示实际路径并以已有用户/场景/流程素材对齐设计者、研究与取舍原则。癌种项目另有 [完整专用提示词](prompts/NEW-CANCER-WORKBENCH.md)。需求见 [BRIEF](docs/BRIEF.md)，规格见 [SPEC](docs/SPEC.md)，任务见 [TASKS](docs/TASKS.md)；先读 [AGENTS](AGENTS.md)。CLI输出交接与首问，实际对话由Agent接续。

## 疾病概要

看板右上角的「?」能展开同一份内容（数据源 `prototypes/v0.1/primer-data.js`）。四段只做公开信息的整理，不是对任何一份档案的判断。

### 定义

膀胱癌是发生在膀胱的恶性肿瘤，最常见的组织学类型是尿路上皮癌。本项目把「肿瘤有没有长到肌层」作为第一条分野线：非肌层浸润性（NMIBC）与肌层浸润性（MIBC），两条线的术式、灌注与复查节奏不同；还没确认的人可以选「我还不确定」，工作台不强行归类。分野以病理报告里「肌层是否受累」为准，报告未写肌层时标为「待澄清项」，不当作正常结论。项目对「保膀胱还是切除」保持零倾向，「保膀胱」不被写成默认正确选项。

**来源**：NCCN · NCCN Guidelines · Bladder Cancer（1.2025，据本项目 docs/DEV-PLAN.md 目标池记录）· 未取得原件，据二次来源 · 页码待核 ｜ 本项目 · docs/SPEC.md · 2026-10-24 版 · 项目文档

### 医学资料规范和指南情况

| 机构 | 文件 | 版本 / 年份 | 原件 | 本台的用途 |
|---|---|---|---|---|
| NCCN | NCCN Guidelines · Bladder Cancer | 1.2025（据 docs/DEV-PLAN.md 目标池记录） | [未取得原件](https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1417)（据二次来源） | 分野、术式与复查节奏的并列参照；条目级引用未引入，页码待核 |
| 中国肿瘤医院泌尿肿瘤协作组 | 中国膀胱癌保膀胱治疗多学科诊治协作共识 | 2022 版（中华肿瘤杂志 2022;44(3):209-218） | [未取得原件](https://www.liangyihui.net/doc/87900)（据二次来源） | 复查间隔（2022 版）的出处；条目级引用未引入，页码待核 |
| 中国肿瘤医院泌尿肿瘤协作组 | 中国膀胱癌保膀胱治疗多学科诊治协作共识（2024 版） | 2024 版（中华肿瘤杂志 2024;46(12):1136-1155） | [未取得原件](https://news.medlive.cn/uro/info-progress/show-220363_191.html)（据二次来源） | 极高危四项构成（2024 版）的出处；条目级引用未引入，页码待核 |
| 中国肿瘤医院泌尿肿瘤协作组 | 非肌层浸润性膀胱癌膀胱灌注治疗专家共识 | 2021 版（中华肿瘤杂志 2021;43(10):1027-1033） | [未取得原件](https://d.wanfangdata.com.cn/periodical/zhzl202110006)（据二次来源） | 灌注禁忌与中断的语境参照；条目级引用未引入，页码待核 |

- NCCN 1.2025 是项目目标池里登记的病种与版本（膀胱癌 #35，T1），不是本项目看过的指南；引用时只写版本号，不写条文。
- 两份中文共识的期刊出处与年份已核到（中华肿瘤杂志 2022 / 2024，以及 2021 灌注共识），机构写作中国肿瘤医院泌尿肿瘤协作组；页码与条文均未核对。
- 未取得 E1 原文时，界面写「未引入」，不占位猜。

**来源**：见上表逐行。

### 目前治疗全景概要

按分野与治疗段落分组，只列指南与共识里出现过的手段，不排序、不比优劣、不含剂量与疗程。

- 非肌层浸润（NMIBC）：TURBT（经尿道膀胱肿瘤电切，记录完全 / 不完全切除原文）；二次电切；膀胱灌注（即刻 24 小时内 / 诱导每周 1 次 × 6～8 / 维持，演示方案为 BCG）；BCG 应答必须有医生原话，没有原话只能停在「未判定」。
- 肌层浸润（MIBC）：根治性膀胱切除与尿流改道重建；尿流改道三术式零倾向对照——回肠通道造口（Bricker 术）、原位新膀胱、输尿管皮肤造口；保膀胱路径引用 2022 / 2024 保膀胱共识的复查间隔与极高危四项构成。
- 晚期 / 转移后：系统治疗按线记录方案、周期与疗效评估；临床试验只整理登记信息与入排条件。
- 贯穿全程：肾功能与上尿路监测（肌酐、eGFR、核素肾图分侧、上尿路影像；顺铂不耐受门槛写作 CrCl <60 ml/min 或 eGFR ≤60 ml/min）；复查只记「约在哪天、做了没有」。

> 以上是文献与指南里列出的手段，按病期与线序排列，不代表任何一项适合你。选哪一个，这一句需要问你的医生。

**来源**：NCCN · NCCN Guidelines · Bladder Cancer（1.2025，未取得原件）· 页码待核 ｜ 中国膀胱癌保膀胱治疗多学科诊治协作共识（2022 / 2024 年版，未取得原件）· 页码待核

### 发展趋势

只写已发生的事实，每条带日期或版本号。

1. 2022 年与 2024 年：项目演示数据分别引用《中国膀胱癌保膀胱治疗多学科诊治协作共识》的两个年份版本（2022 版用于复查间隔，2024 版用于极高危四项构成）；两版之间的修订条目与生效日期未核实。
2. 截至 2026-10-22：本项目自采膀胱癌登记快照 295 条（ClinicalTrials.gov 212 条 / ChiCTR 83 条），其中干预性研究 195 条、观察性 89 条。按研究场景：未注明 105、NMIBC 或膀胱内治疗 79、MIBC 或围手术期 54、晚期或转移 57。
3. 截至 2026-10-22：295 条中 RECRUITING 121 条、NOT_YET_RECRUITING 141 条、COMPLETED 18 条；ChinaDrugTrials 通道本轮未采集，覆盖未知。
4. 截至 2026-10-25：项目记录的病种目标池版本为 NCCN 1.2025（docs/DEV-PLAN.md，膀胱癌 #35，T1）；原件未取得，生效日期与此前版本的版本号未核实。

**来源**：本项目 · research/bladder-cancer/manifest.json（采集日 2026-10-22）· 项目数据 ｜ ClinicalTrials.gov / ChiCTR · 登记检索 · 采集日 2026-10-22 · 一手登记数据 ｜ NCCN · 1.2025（据 docs/DEV-PLAN.md）· 未取得原件 · 页码待核

## 开发顺序

先共创SPEC和候选数据关系，再交付HTML交互工作台；由用户确认对应版本/模块后，复核SCHEMA/API并实现生产功能。确认记录见docs/PROTOTYPE-REVIEW.md；模型不依赖前端Tab/流程。模板骨架不是业务已确认。

## 当前进度（phase1，2026-10-24）

**已完成** M0 骨架 → M1 调研·SPEC → M2 原型 → M3 数据模型草案 → M4 临床库；
**未开始** M5 开发版 → M6 装机 → M7 发布；**G1/G2/G3 三个闸口全部未签**。详见 [TASKS](docs/TASKS.md)。

| 交付物 | 位置 | 规模 |
| --- | --- | --- |
| 调研 · 场景 · 差异化 | `docs/USER-RESEARCH.md` · `SCENARIOS.md`(S01–S18) · `DIFF-MATRIX.md` | 18 场景 · 15 行矩阵 |
| 规格 · HVT 审核 · 验收 | `docs/SPEC.md` · `HVT-REVIEW.md` · `ACCEPTANCE.md` | AC-01…AC-54 · HVT B 级 0 |
| HTML 交互原型 | [`prototypes/v0.1/`](prototypes/v0.1/) | 14 一级页 + 48 二级页签 + 设置 · 自检 155/155 |
| 数据模型草案 | `schema/0001_initial.sql` | 44 表 8 索引 · 探针 37/37（**G3 前不进 `schema/`**） |
| 2026 临床试验库 | [`research/bladder-cancer/`](research/bladder-cancer/) | 295 条（CT.gov 212 + ChiCTR 83）· SQLite + 4 视图 |

自检：`verify-prototype` 155/155 · `verify-one-chart` 12/12 · `verify-metric-trend` 15/15(2 未实现) ·
`check-schema-draft` 37/37 · `check-wording` 双面 0 · `dsh-wb-cli check` staticPass。

## 当前能力

- 一个 DSH 工作台注册、认证的健康接口、版本展示与标准/大字切换。
- 已明确选择布局：business-first。business-first 使用 customFrame；模板不创建会话或复制聊天。需要 AI 协助时按官方合同接入原生 conversation 和会话管理。
- **HTML 原型可 `file://` 直接打开**，含 14 个一级页与全部二级页签，数据**全部为演示用假数据**（不含任何真实病历）。
- **业务代码一行未写**（一期止点）：无业务数据库接线、无真实密钥、未接 DSH Desktop。所有业务页按 G1/G2/G3 签认后的 spec 逐项实现。

**已知未实现**：主体/角色切换（照护者视角）· MT14/MT16 · 原生 AI 面板真实接入 · DSH Desktop 实测。
**最大证据缺口**：本项目无真实用户访谈（用户已裁定跳过）。

## 开发与本地验收

需要 Node.js 22+、Git、包管理器和可用 DSH Desktop；采用 SQLite 时另核验 node:sqlite 版本条件。宿主 peers 的范围仅是模板基线，请与目标 Desktop 实际依赖核对。

```bash
npm install
npm run check
npm run pack:check
npm pack
```

`npm install` 可能按 npm 策略解析 peer；勿为消警告重复打包宿主 runtime。客户端本身是单文件；引入 TS/组件库后需添加构建步骤并保留单文件导出。

本地安装入口以当前 Desktop/CLI 帮助为准。安装后按 [docs/06-VALIDATION-AND-RELEASE.md](docs/06-VALIDATION-AND-RELEASE.md) 与官方自测完成真实 UI 验收，并填写 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)。静态检查不代表已加载。

Logo 来源与使用限制见 assets/README.md。许可证、作者、仓库/发布策略由本项目维护者确认后填写；模板默认为 private/UNLICENSED。

感谢小x宝社区、DataElement 社区，以及 sam / hhx / 繁华的 ❤️ 贡献。

初始化来源记录见 `.dsh-wb-starter.json`。更新社区脚手架不会覆盖本项目；需要升级时先用相同确认配置在临时目录生成，再审阅差异。CLI 用法见 [docs/CLI-GIT.md](docs/CLI-GIT.md)。

## HTML先行与数据演进

业务开发前先交付HTML交互工作台原型、实际预览并由用户确认版本/hash和范围。数据设计先区分领域事实、流程状态和页面读模型，走查前端/流程变化、兼容与迁移；原型对象不直接作为表。见[规范](docs/14-HTML-AND-DATA-CONTRACT.md)。
