/**
 * 数据层测试（test/ 三层里的 store 层）：迁移 / 播种 / 单事务 / 读模型。
 *
 * 纪律：**只用内存库**（`:memory:`），不落盘、不依赖 os.tmpdir()、不写固定路径。
 * 为什么较真这一点：数据层测试一旦碰磁盘文件，就会依赖上一个人跑测试留下的残留状态，
 * 于是「本机绿、换台机器红」——那种红最难查，因为它和你刚改的代码没关系。
 *
 * 关于「事务回滚」：`dsh/store.js` 没有 `tx` 包装（它只管开库/迁移/关库），
 * 单事务的保证在 `dsh/demo.js` 的 `seedDemo` 里（BEGIN → 全部 INSERT → COMMIT，
 * 任何异常 ROLLBACK 后原样抛出）。所以这里用**制造主键冲突**的方式验它，
 * 而不是验一个不存在的 API。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { openDb, migrate, migrationFiles, nowISO, todayISO, LEDGER } from '../dsh/store.js';
import { seedDemo, seedIfEmpty } from '../dsh/demo.js';
import { buildBootstrap } from '../dsh/readmodels.js';

/** 每个用例一个全新内存库（openDb 默认会跑迁移，所以拿到的就是「结构就绪、数据为空」） */
const fresh = () => openDb(':memory:');

const tableNames = (db) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);

const count = (db, table) => db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;

/** 全库行数快照：比「只看某张表」更能说明「没多写/没漏写」 */
const snapshot = (db) => Object.fromEntries(tableNames(db).map((t) => [t, count(db, t)]));

test('迁移幂等：连开两次不报错，台账只记一条 0001', () => {
  const db = fresh();
  const first = db.prepare(`SELECT version, name FROM ${LEDGER} ORDER BY version`).all();
  assert.equal(first.length, 1, '空库开一次应当只应用 0001');
  assert.equal(first[0].version, 1);

  // 再跑一次：已应用的迁移不许重复执行（重复执行会 CREATE TABLE 失败或重写数据）
  const again = migrate(db);
  assert.deepEqual(again.executed, [], '已应用过的迁移不应再执行');
  assert.equal(count(db, LEDGER), 1, '台账不许因为重跑而多出记录');

  // 文件名口径与执行器一致：只认 NNNN_name.sql，且按编号排序
  const files = migrationFiles();
  assert.ok(files.length >= 1);
  assert.match(files[0], /^\d{4}_[a-z0-9_]+\.sql$/);
});

test('空库读模型：不抛错、profiles 为空、静态目录仍在', () => {
  const db = fresh();
  const boot = buildBootstrap(db);
  assert.deepEqual(boot.profiles, [], '空库不该编出档案');
  // 目录常量是静态的，不依赖任何患者数据：空库时页面仍要能画出导航骨架
  assert.equal(boot.catalogs.NAV.length, 14);
  assert.ok(boot.meta.version, '版本号要能读到（发布可见性要求顶栏有版本）');
  assert.ok(!JSON.stringify(boot).includes('/Users/'), '读模型不许泄漏本机绝对路径');
});

test('播种幂等：第二次调用直接跳过，全库行数一字不差', () => {
  const db = fresh();
  const first = seedDemo(db);
  assert.equal(first.seeded, true);
  assert.ok(first.profiles.length >= 2, '演示库至少要有两个档案（NMIBC / MIBC）');
  assert.ok(first.inserted.observations > 0, '指标观测点要真的落库');

  const before = snapshot(db);
  const second = seedIfEmpty(db);
  assert.equal(second.seeded, false, '已有数据时必须整批跳过，不覆盖用户真实记录');
  assert.deepEqual(snapshot(db), before, '第二次播种不许改任何一张表');
});

test('单事务：播种中途失败要整体回滚，不能留半截演示数据', () => {
  const db = fresh();
  // 先占掉一个演示库一定会写的指标主键（metric_definitions 在播种序列的后半段，
  // 冲突时 subjects/documents/observations 等**已经写进去了** —— 正好用它验回滚）。
  db.prepare(
    "INSERT INTO metric_definitions (code, name, cat, unit, value_kind, created_at) VALUES ('egfr', '占位', '肾功能', 'mL/min', 'num', '2026-10-24')",
  ).run();

  assert.throws(() => seedDemo(db), /UNIQUE constraint failed/, '主键冲突应当原样抛出');

  for (const t of ['subjects', 'documents', 'pathology_reports', 'instillation_events', 'observations', 'records']) {
    assert.equal(count(db, t), 0, `回滚后 ${t} 不该有残留`);
  }
  // 冲突前自己插的那条不是播种写的，回滚不该动它（ROLLBACK 只退本次事务）
  assert.equal(count(db, 'metric_definitions'), 1);
});

test('读模型只读：反复调用不改库里的任何一行', () => {
  const db = fresh();
  seedIfEmpty(db);
  const before = snapshot(db);
  buildBootstrap(db);
  buildBootstrap(db, { today: '2026-10-24' });
  assert.deepEqual(snapshot(db), before, '读模型写了库就说明它把「读」和「派生」混在一起了');
});

test('两个档案：分野不同、共享块相同、治疗事件泳道两线共用', () => {
  const db = fresh();
  seedIfEmpty(db);
  const [demo1, demo2] = buildBootstrap(db).profiles;

  assert.deepEqual([demo1.id, demo2.id], ['demo1', 'demo2']);
  assert.deepEqual([demo1.line, demo2.line].sort(), ['mibc', 'nmibc'], '一个 NMIBC 一个 MIBC');

  // 共享块：原型里这些是一份全局常量，两条线看到同一份内容（库里各自独立成行）
  for (const key of ['pathology', 'metrics', 'followup', 'renal', 'instillation', 'questions']) {
    assert.deepEqual(demo1[key], demo2[key], `${key} 在原型里不分线，两档案内容应相同`);
  }
  // 分野块：这些才是真的按 STATE.line 取数据集的地方
  assert.notDeepEqual(demo1.surgeryCase, demo2.surgeryCase, '手术史必须按分野取，否则 MIBC 只看得到 NMIBC 那次 TURBT');
  assert.notDeepEqual(demo1.treatmentCase, demo2.treatmentCase);
  assert.notDeepEqual(demo1.diversionCase, demo2.diversionCase);

  // 治疗事件泳道（一图秀）：原型 charts.js 的 TREATMENTS 是全局单份常量，不随分野切换，
  // 两条线共用这 3 条、id 逐字相同 —— M5 的验收是与原型逐字符一致，
  // 「按分野给不同时间线」属于对原型的改进，要先改原型并重新过 G2。
  const expected = [
    { d: '2026-09-18', label: 'TURBT', id: 'ev-turbt' },
    { d: '2026-10-02', label: 'BCG 诱导开始', id: 'ev-bcg' },
    { d: '2026-10-23', label: '灌注取消', id: 'ev-cancel' },
  ];
  assert.deepEqual(demo1.treatments, expected);
  assert.deepEqual(demo2.treatments, expected);
});

test('演示档案可一眼分辨：demo_meta 三键齐全，记录人含照护者', () => {
  const db = fresh();
  seedIfEmpty(db);
  const keys = db.prepare('SELECT key FROM demo_meta ORDER BY key').all().map((r) => r.key);
  assert.deepEqual(keys, ['uropal.demo.dataset', 'uropal.demo.free_blocks', 'uropal.demo.view_hints']);

  const subjects = db.prepare('SELECT id, is_self, relation FROM subjects ORDER BY id').all();
  assert.equal(subjects.length, 3, '两个患者本人 + 一个照护者记录人');
  assert.equal(subjects.filter((s) => s.is_self === 1).length, 2);
  assert.equal(subjects.filter((s) => s.is_self === 0).length, 1, '照护者代记要单独有主体，不能被记成患者本人');
});

test('记录人不变量：每条事实都有一条 records 行', () => {
  const db = fresh();
  seedIfEmpty(db);
  const byTable = db.prepare('SELECT entity_table AS t, COUNT(*) AS n FROM records GROUP BY entity_table').all();
  assert.ok(byTable.length >= 20, `records 覆盖的事实表太少（${byTable.length} 张）`);
  for (const { t, n } of byTable) {
    assert.equal(n, count(db, t), `${t} 的事实行数与 records 行数不一致`);
  }
});

test('日期口径：todayISO 只取日期，nowISO 带本机时区偏移，跨日不串', () => {
  // 用本地时间构造，避免测试机时区不同导致的假红
  assert.equal(todayISO(new Date(2026, 9, 24, 0, 0, 0)), '2026-10-24');
  assert.equal(todayISO(new Date(2026, 9, 24, 23, 59, 59)), '2026-10-24', '当天最后一秒仍算当天');
  assert.equal(todayISO(new Date(2026, 9, 25, 0, 0, 0)), '2026-10-25', '过了午夜就是第二天');

  const iso = nowISO(new Date(2026, 9, 24, 23, 5, 6));
  assert.match(iso, /^2026-10-24T23:05:06[+-]\d{2}:\d{2}$/);
});
