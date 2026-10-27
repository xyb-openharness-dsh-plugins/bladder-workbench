/* 小泉宝 UroPal · 疾病概要数据（36 号）
 * 口径：docs/DISEASE-PRIMER.md；规范：starter docs/36-DISEASE-PRIMER.md。
 * 全部内容属第 ② 层（解释）：只写定义、文件、指南列举过的手段、已发生的变化。
 * 任何「你该怎么办」的判断都不在这里，固定出口是「这一句需要问你的医生」。
 *
 * 原件状态照实写：本项目未取得 NCCN、保膀胱共识与灌注共识的任何原件。
 * NCCN 版本号（1.2025）来自本仓 docs/DEV-PLAN.md 的目标池记录，不是看过的指南。
 */
window.DISEASE_PRIMER = {
  brand: '小泉宝 UroPal',
  name: '膀胱癌',
  en: 'Bladder Cancer',
  updated: '2026-10-25',
  sections: [
    {
      id: 'definition',
      title: '定义',
      intro: '膀胱癌是发生在膀胱的恶性肿瘤，最常见的组织学类型是尿路上皮癌。本项目把「肿瘤有没有长到肌层」'
        + '作为第一条分野线：非肌层浸润性（NMIBC）与肌层浸润性（MIBC），两条线的术式、灌注与复查节奏不同；'
        + '还没确认的人可以选「我还不确定」，工作台不强行归类。',
      points: [
        '分野口径：NMIBC / MIBC 以病理报告里「肌层是否受累」为准；项目要求报告未写肌层时标为「待澄清项」，不当作正常结论。',
        '病理与分级：项目记录病理类型、分级、分期断言（医生原话）与危险度标记；本台不生成分级或分期换算。',
        '两条线不并存：选 NMIBC 出灌注、膀胱镜复查与尿细胞学卡；选 MIBC 出改道、肾功能与造口日记卡。改线留痕，不覆盖。',
        '安全边界：项目对「保膀胱还是切除」保持零倾向，「保膀胱」不被写成默认正确选项；本台不做这种取向的表达。',
        '急症语境：血块与尿潴留、BCG 全身感染、造口缺血梗阻、无尿与腰痛，项目单列「急症与安全」，只给联系入口与判据原文，不做处置建议。'
      ],
      sources: [
        { org: 'NCCN', doc: 'NCCN Guidelines · Bladder Cancer', version: '1.2025（据本项目 docs/DEV-PLAN.md 目标池记录，原件未取得）', original: false, secondaryUrl: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1417', page: '页码待核', note: '二次来源：NCCN 官方指南页' },
        { org: '本项目', doc: 'docs/SPEC.md（三分野、M02 病理核对与 AC-05 待澄清口径）', version: '2026-10-24 版', original: true, nolink: true, page: '不适用（项目文档）', note: '仓内文档，无公开 https 链接' }
      ]
    },
    {
      id: 'evidence',
      title: '医学资料规范和指南情况',
      intro: '这台工作台里出现的每一条「该查什么、该怎么复查」，都应能追到下面某一份文件。'
        + '本项目没有取得任何一份的原件；NCCN 的版本号来自本仓目标池记录；两份中文共识已核到期刊出处与二次来源页，页码仍要另核。',
      table: {
        head: ['机构', '文件', '版本 / 年份', '原件', '本台的用途'],
        rows: [
          ['NCCN', 'NCCN Guidelines · Bladder Cancer', '1.2025（据 docs/DEV-PLAN.md 目标池记录）', { text: '未取得原件', url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1417' }, '分野、术式与复查节奏的并列参照；条目级引用未引入，页码待核'],
          ['中国肿瘤医院泌尿肿瘤协作组', '中国膀胱癌保膀胱治疗多学科诊治协作共识', '2022 版（中华肿瘤杂志 2022;44(3):209-218）', { text: '未取得原件', url: 'https://www.liangyihui.net/doc/87900' }, '复查间隔（2022 版）的出处；条目级引用未引入，页码待核'],
          ['中国肿瘤医院泌尿肿瘤协作组', '中国膀胱癌保膀胱治疗多学科诊治协作共识（2024 版）', '2024 版（中华肿瘤杂志 2024;46(12):1136-1155）', { text: '未取得原件', url: 'https://news.medlive.cn/uro/info-progress/show-220363_191.html' }, '极高危四项构成（2024 版）的出处；条目级引用未引入，页码待核'],
          ['中国肿瘤医院泌尿肿瘤协作组', '非肌层浸润性膀胱癌膀胱灌注治疗专家共识', '2021 版（中华肿瘤杂志 2021;43(10):1027-1033）', { text: '未取得原件', url: 'https://d.wanfangdata.com.cn/periodical/zhzl202110006' }, '灌注禁忌与中断的语境参照；条目级引用未引入，页码待核']
        ]
      },
      points: [
        'NCCN 1.2025 是项目目标池里登记的病种与版本（膀胱癌 #35，T1），不是本项目看过的指南；引用时只写版本号，不写条文。',
        '两份中文共识的期刊出处与年份已核到（中华肿瘤杂志 2022 / 2024，以及 2021 灌注共识），机构写作中国肿瘤医院泌尿肿瘤协作组；页码与条文均未核对。',
        '本项目对指南优先级的既有判定：E1 权威原文 > E2 官方注册库 > E3 患者教育材料 > E4 设计假设；未取得 E1 原文时，界面写「未引入」，不占位猜。',
        '本台对未取得原件的文件只记「存在」与「大致讲什么」，页码一律写待核。'
      ],
      sources: [
        { org: 'NCCN', doc: 'NCCN Guidelines · Bladder Cancer', version: '1.2025（未取得原件）', original: false, secondaryUrl: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1417', page: '页码待核', note: '二次来源：NCCN 官方指南页' },
        { org: '中国肿瘤医院泌尿肿瘤协作组', doc: '中国膀胱癌保膀胱治疗多学科诊治协作共识', version: '2022 版（中华肿瘤杂志 2022;44(3):209-218）', original: false, secondaryUrl: 'https://www.liangyihui.net/doc/87900', page: '页码待核', note: '二次来源：良医汇-肿瘤资讯期刊页' },
        { org: '中国肿瘤医院泌尿肿瘤协作组', doc: '中国膀胱癌保膀胱治疗多学科诊治协作共识（2024 版）', version: '2024 版（中华肿瘤杂志 2024;46(12):1136-1155）', original: false, secondaryUrl: 'https://news.medlive.cn/uro/info-progress/show-220363_191.html', page: '页码待核', note: '二次来源：医脉通解读页' },
        { org: '中国肿瘤医院泌尿肿瘤协作组', doc: '非肌层浸润性膀胱癌膀胱灌注治疗专家共识', version: '2021 版（中华肿瘤杂志 2021;43(10):1027-1033）', original: false, secondaryUrl: 'https://d.wanfangdata.com.cn/periodical/zhzl202110006', page: '页码待核', note: '二次来源：万方数据条目页（含摘要与页码）' }
      ]
    },
    {
      id: 'landscape',
      title: '目前治疗全景概要',
      intro: '下面按分野与治疗段落列出指南与共识里出现过的手段类别。这是「世界上大致有哪些办法」的地图，'
        + '不是给你排的先后顺序，也不含任何剂量、疗程与适用条件——那些必须由泌尿外科与肿瘤科按你的病理、分期与肾功能决定。',
      groups: [
        {
          label: '非肌层浸润（NMIBC）',
          points: [
            'TURBT（经尿道膀胱肿瘤电切）：项目把它作为 NMIBC 的基本术式，并记录「完全切除 / 不完全切除 / 未提及」的原文。',
            '二次电切：NMIBC 可能加做一次，MIBC 路径里也常出现；是否做由手术记录与病理决定。',
            '膀胱灌注：项目按「即刻（术后 24 小时内）/ 诱导（每周 1 次 × 6～8）/ 维持」三段记录；演示方案为 BCG（卡介苗），禁忌与中断单独记录。',
            '灌注应答：BCG 应答判定必须有医生原话；没有原话只能停在「未判定」，本台不自行判读。'
          ]
        },
        {
          label: '肌层浸润（MIBC）',
          points: [
            '根治性膀胱切除：项目记录术式与日期，并保留「尿流改道重建」作为独立事件。',
            '尿流改道三术式（零倾向对照）：回肠通道造口（Bricker 术）、原位新膀胱、输尿管皮肤造口；三种各有记录字段，本台不比较优劣。',
            '保膀胱路径：项目引用 2022 / 2024 保膀胱共识记录复查间隔；2024 版把「BCG 无应答、血管淋巴管侵犯、变异组织类型、前列腺尿道侵犯」列为极高危四项构成，本台只列构成与原文位置，不给处置方向。'
          ]
        },
        {
          label: '晚期 / 转移后',
          points: [
            '系统治疗：项目「治疗历程」按线记录方案、周期与疗效评估；具体药物与线序由肿瘤内科决定。',
            '临床试验：项目自采登记快照按「NMIBC 或膀胱内治疗 / MIBC 或围手术期 / 晚期或转移」分层展示，只整理登记信息与入排条件，不判断哪个试验更适合。'
          ]
        },
        {
          label: '贯穿全程的两件事',
          points: [
            '肾功能与上尿路监测：肌酐、eGFR、核素肾图分侧、上尿路影像分别记录；项目记录顺铂不耐受门槛为 CrCl <60 ml/min 或 eGFR ≤60 ml/min（来源写作 2022 / 2024 保膀胱共识）。',
            '复查节奏：膀胱镜 + 尿细胞学、上尿路影像按主诊医嘱记录；本台只记「约在哪天、做了没有」，不生成间隔。'
          ]
        }
      ],
      points: [
        '以上是文献与指南里列出的手段，按病期与线序排列，不代表任何一项适合你。选哪一个，这一句需要问你的医生。'
      ],
      sources: [
        { org: 'NCCN', doc: 'NCCN Guidelines · Bladder Cancer', version: '1.2025（未取得原件）', original: false, secondaryUrl: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1417', page: '页码待核', note: '二次来源：NCCN 官方指南页' },
        { org: '中国肿瘤医院泌尿肿瘤协作组', doc: '中国膀胱癌保膀胱治疗多学科诊治协作共识', version: '2022 / 2024 年版', original: false, secondaryUrl: 'https://news.medlive.cn/uro/info-progress/show-220363_191.html', page: '页码待核', note: '二次来源为 2024 版解读页；2022 版条目见「医学资料」表' }
      ]
    },
    {
      id: 'trend',
      title: '发展趋势',
      intro: '这一段只写已经发生的事：哪一版共识写了什么、登记平台上采集到多少条、NCCN 记录的是哪一版。'
        + '不写预测，不做评价，也不给任何倾向。',
      points: [
        '2022 年与 2024 年：项目演示数据分别引用《中国膀胱癌保膀胱治疗多学科诊治协作共识》的两个年份版本（2022 版用于复查间隔，2024 版用于极高危四项构成）；两版之间的修订条目与生效日期未核实。',
        '截至 2026-10-22：本项目自采膀胱癌登记快照 295 条（ClinicalTrials.gov 212 条 / ChiCTR 83 条），其中干预性研究 195 条、观察性 89 条。按研究场景：未注明 105、NMIBC 或膀胱内治疗 79、MIBC 或围手术期 54、晚期或转移 57。',
        '截至 2026-10-22：295 条中登记状态为 RECRUITING 121 条、NOT_YET_RECRUITING 141 条、COMPLETED 18 条；ChinaDrugTrials 通道本轮未采集，覆盖未知。',
        '截至 2026-10-25：本项目记录的病种目标池版本为 NCCN 1.2025（docs/DEV-PLAN.md，膀胱癌 #35，T1）；原件未取得，生效日期与此前版本的版本号未核实。'
      ],
      sources: [
        { org: '本项目', doc: 'research/bladder-cancer/manifest.json（登记快照与分层）', version: '采集日 2026-10-22', original: true, nolink: true, page: '不适用（项目数据）', note: '仓内采集快照，无公开 https 链接' },
        { org: 'ClinicalTrials.gov', doc: '登记检索（膀胱癌 / 尿路上皮癌 / 移行细胞癌）', version: '采集日 2026-10-22', original: true, url: 'https://clinicaltrials.gov/search?cond=Bladder%20Cancer', note: '一手登记数据，本项目自采；ChiCTR 通道结果仅存仓内快照' },
        { org: 'NCCN', doc: 'NCCN Guidelines · Bladder Cancer', version: '1.2025（据 docs/DEV-PLAN.md，原件未取得）', original: false, secondaryUrl: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1417', page: '页码待核', note: '二次来源：NCCN 官方指南页' }
      ]
    }
  ]
}
