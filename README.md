# 小泉宝 UroPal · 膀胱癌工作台

面向膀胱癌患者与照护者的本机优先工作台：NMIBC/MIBC 分野读懂、TURBT 与二次电切、膀胱灌注周期、膀胱镜复查与复发恐惧、尿流改道三术式与造口日常、肾功能与上尿路长期监测、复诊准备与临床试验档案

这是接入骨架，尚未实现真实业务。初始化后先将 [项目设计提示词](docs/DESIGN-PROMPT.md) 交给当前Agent；它应展示实际路径并以已有用户/场景/流程素材对齐设计者、研究与取舍原则。癌种项目另有 [完整专用提示词](prompts/NEW-CANCER-WORKBENCH.md)。需求见 [BRIEF](docs/BRIEF.md)，规格见 [SPEC](docs/SPEC.md)，任务见 [TASKS](docs/TASKS.md)；先读 [AGENTS](AGENTS.md)。CLI输出交接与首问，实际对话由Agent接续。

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
