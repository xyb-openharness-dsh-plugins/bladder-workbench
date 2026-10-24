/**
 * 业务库 store（M5）。三件事：开库 / 迁移（按文件名顺序执行 schema/*.sql）/ 关库。
 *
 * 迁移执行器语义（照家族，但**去掉** GBM 的 checksum 冻结校验）：
 * - 按文件名前缀编号顺序执行 schema/ 下**全部** .sql；
 * - 用 `schema_migrations` 台账记录已应用版本，**重跑不重复执行**（幂等）；
 * - 不记录/比对文件 sha256：本仓的冻结保护由 scripts/check-schema.mjs +
 *   schema/freeze-contract.md 负责（对 0001 的 sha256 有独立校验），
 *   把同一件事在库里再做一遍会让「换文件名/补注释」这类无关改动变成开库失败。
 *
 * ⚠️ 关于台账：`schema/0001_initial.sql` 自己就有 `CREATE TABLE IF NOT EXISTS
 * schema_migrations (version, name, applied_at)`，但**不能依赖它**——迁移文件是
 * 被本函数执行的，若把建台账交给第 1 个迁移文件，那么「记录哪些迁移已应用」这件事
 * 与被记录的第 1 个迁移互相依赖，空库上必然先执行 0001 才能写入台账。
 * 所以本函数自己先 `CREATE TABLE IF NOT EXISTS`（形状与 0001 完全一致，0001 里那句
 * 就退化成 no-op），并兼容历史上只有 (version, applied_at) 两列的台账。
 *
 * 不做：预后评分、推荐、判读——这些列在库里不存在（freeze-contract 四契约①）。
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_DIR = fileURLToPath(new URL('../schema/', import.meta.url));
export const DEFAULT_DB = fileURLToPath(new URL('../workspace/xyb-bladder.sqlite', import.meta.url));

/** 台账表名（下载/迁移/校验三处共用，避免各写一份字面量） */
export const LEDGER = 'schema_migrations';

/** 只认 NNNN_name.sql：认不出的文件不猜，直接报错（check-schema 的口径更宽，这里更严） */
const FILE_RE = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** 本机时间 + 时区偏移的 ISO8601（schema 里 applied_at 注释要求「ISO8601 带 +08:00」） */
export function nowISO(date = new Date()) {
  const d = new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    + `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
}

/** 只要日期部分的 ISO 串（y-m-d），既有的业务字段用这个口径 */
export function todayISO(now = new Date()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 按编号排序的迁移文件列表。 */
export function migrationFiles(dir = SCHEMA_DIR) {
  const sqlFiles = readdirSync(dir).filter((f) => f.endsWith('.sql'));
  const unknown = sqlFiles.filter((f) => !FILE_RE.test(f));
  if (unknown.length) {
    throw new Error(`schema/ 里有不符合 NNNN_name.sql 的文件：${unknown.join(', ')}`);
  }
  return sqlFiles.sort((a, b) => Number(a.slice(0, 4)) - Number(b.slice(0, 4)));
}

/**
 * 保证台账存在，并返回它**实际**有的列名。
 * 返回列名是为了下面按列插入：老库可能只有 version/applied_at 两列，
 * 硬写三列会报 "table schema_migrations has no column named name"。
 */
function ensureLedger(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ${LEDGER} (
  version    INTEGER PRIMARY KEY,
  name       TEXT,
  applied_at TEXT NOT NULL
)`);
  let cols = db.prepare(`PRAGMA table_info(${LEDGER})`).all().map((c) => c.name);
  if (!cols.includes('name')) {
    db.exec(`ALTER TABLE ${LEDGER} ADD COLUMN name TEXT`);
    cols = db.prepare(`PRAGMA table_info(${LEDGER})`).all().map((c) => c.name);
  }
  return cols;
}

/**
 * 执行未应用的迁移；已应用的跳过（幂等）。
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ executed: string[], applied: Array<{version:number,name:string|null,applied_at:string}> }}
 */
export function migrate(db, { dir = SCHEMA_DIR, now = () => nowISO() } = {}) {
  db.exec('PRAGMA foreign_keys = ON');
  const cols = ensureLedger(db);

  const applied = new Map(
    db.prepare(`SELECT version, name, applied_at FROM ${LEDGER}`).all().map((r) => [r.version, r]),
  );

  const executed = [];
  for (const file of migrationFiles(dir)) {
    const version = Number(file.slice(0, 4));
    if (applied.has(version)) continue; // 幂等：已应用过就跳过，不重复执行

    const sql = readFileSync(join(dir, file), 'utf8');
    const pairs = [['version', version], ['name', file], ['applied_at', now()]]
      .filter(([column]) => cols.includes(column));

    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare(`INSERT INTO ${LEDGER} (${pairs.map(([c]) => c).join(', ')}) VALUES (${pairs.map(() => '?').join(', ')})`)
        .run(...pairs.map(([, value]) => value));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`${file} 执行失败：${error.message}`);
    }
    executed.push(file);
  }

  return {
    executed,
    applied: db.prepare(`SELECT version, name, applied_at FROM ${LEDGER} ORDER BY version`).all(),
  };
}

/** 开库（默认执行迁移）。path 可以是文件路径，也可以是 ':memory:'（测试用）。 */
export function openDb(path, { runMigrate = true, now = () => nowISO() } = {}) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  if (runMigrate) migrate(db, { now });
  return db;
}

export function closeDb(db) {
  db.close();
}

/**
 * 轻量 store：库/台账状态 + 少量受控写入。读模型（dsh/readmodels.js）与演示数据
 * （dsh/demo.js）本里程碑**还没有**，所以这里只放三类都会依赖的共同件，
 * 不 import 不存在的模块。
 *
 * 两种调用都支持（为了让「我先建 store 再自己 migrate」的验证脚本能直接跑）：
 *   createStore(db)                      —— 家族风格，传已开好的 DatabaseSync
 *   createStore({ file: ':memory:' })    —— 自己开库（默认已执行迁移）
 */
export function createStore(options = {}, { today = todayISO } = {}) {
  const givenDb = typeof options?.prepare === 'function';
  const db = givenDb
    ? options
    : openDb(options?.file ?? DEFAULT_DB, {
      runMigrate: options?.runMigrate !== false,
      now: options?.now,
    });

  const q = (sql, ...args) => db.prepare(sql).all(...args);
  const one = (sql, ...args) => db.prepare(sql).get(...args) ?? null;
  const run = (sql, ...args) => db.prepare(sql).run(...args);

  /** 表名只允许来自 sqlite_master：PRAGMA 与 COUNT 里都是字符串拼接，不能直接吃调用方输入 */
  function knownTable(table) {
    const hit = one("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", table);
    if (!hit) throw new Error(`库里没有这张表：${table}`);
    return table;
  }

  return {
    db,
    today,

    /** 库里的表（排除 sqlite_ 内部表） */
    tables() {
      return q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .map((r) => r.name);
    },

    columns(table) {
      return q(`PRAGMA table_info(${knownTable(table)})`).map((c) => c.name);
    },

    count(table) {
      return one(`SELECT COUNT(*) AS n FROM ${knownTable(table)}`).n;
    },

    /** 有没有档案主体（将来 demo 播种与空态判据都用它，替代 GBM 的 hasProfiles） */
    hasSubjects() {
      return this.count('subjects') > 0;
    },

    /** 迁移台账（诊断与 /api/bootstrap 用） */
    ledger() {
      return q(`SELECT version, name, applied_at FROM ${LEDGER} ORDER BY version`);
    },

    /** demo_meta 里的键值（演示数据集元信息；读不出来就当没有，不抛） */
    meta(key) {
      const row = one('SELECT value FROM demo_meta WHERE key = ?', key);
      return row?.value ?? null;
    },

    setMeta(key, value) {
      run(
        `INSERT INTO demo_meta (key, value, schema_version, updated_at) VALUES (?, ?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
        key, value, nowISO(),
      );
      return this.meta(key);
    },

    close() {
      db.close();
    },
  };
}
