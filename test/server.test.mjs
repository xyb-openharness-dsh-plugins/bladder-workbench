/**
 * 服务层测试（M5 第三层）：接口、路径剥离、静态服务、越界拦截、页面模板。
 *
 * 为什么单独测这一层：`/api/bootstrap` 是开发版唯一的数据入口，一旦它把绝对路径
 * 或本机目录泄漏出去，整份「数据只在本机」的承诺就作废了；而静态服务一旦漏了越界拦截，
 * 包内任意文件都能被读走。这两件事靠肉眼看不出来，必须逐条断言。
 *
 * ⚠️ 本文件**只测 M5 已实现的接口**。原型里那些「点了只弹提示」的动作（如导出）
 * 若后端还没接，这里不写断言、也不假装它通过——未实现就该在报告里是空的。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbenchServer, stripBasePath } from '../dsh/server.js';

/** 起一个临时服务并返回 {origin, close}；port 传 0 让系统分配，避免和别的测试撞车 */
async function startServer(opts = {}) {
  const app = createWorkbenchServer({ dbPath: ':memory:', ...opts });
  const server = await app.listen(0);
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    app,
    origin,
    async close() {
      await new Promise((r) => server.close(r));
      app.close();
    },
  };
}

test('stripBasePath：前缀剥离与 /ui 入口改写', () => {
  const base = '/api/bladder-workbench';
  assert.equal(stripBasePath(`${base}/ui/app.js`, base), '/app.js', 'UI 资源要去掉 /ui 前缀');
  assert.equal(stripBasePath(`${base}/ui`, base), '/index.html', '/ui 本身是入口');
  assert.equal(stripBasePath(`${base}/ui/`, base), '/index.html', '/ui/ 也是入口');
  assert.equal(stripBasePath(`${base}/`, base), '/index.html', '前缀根就是首页');
  assert.equal(stripBasePath(base, base), '/index.html', '无尾斜杠的前缀根也是首页');
  assert.equal(stripBasePath('/别的路径', base), '/别的路径', '不匹配前缀时原样返回，不猜');
  assert.equal(stripBasePath('/x', ''), '/x', '空前缀不做任何改写');
});

test('GET / → 200 且是开发版首页（模板占位符已全部替换）', async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.origin}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('id="wbMain"'), '首页必须含业务主区 #wbMain');
    assert.ok(!/\{\{[A-Z_]+\}\}/.test(html), `模板占位符没有被替换：${html.match(/\{\{[A-Z_]+\}\}/g)?.join(', ')}`);
    /* 36 号：primer-data.js / primer.js 是共享模块，开发版必须保留；
       只禁止原型专用的 data.js / charts.js（charts 已拼进 app.js）。 */
    const protoOnlyHtml = html.replace(/primer-data\.js|primer\.js/g, '');
    assert.ok(!protoOnlyHtml.includes('data.js'), '开发版不该引原型的 data.js（数据走 /api/bootstrap）');
    assert.ok(!protoOnlyHtml.includes('charts.js'), '开发版不该引原型的 charts.js（已拼进 app.js）');
    assert.ok(html.includes('data-api-base'), 'html 标签上要有 data-api-base，供 app.js 拼接口地址');
  } finally { await s.close(); }
});

test('GET /api/bootstrap → 200，形状正确，且不泄漏本机绝对路径', async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.origin}/api/bootstrap`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
    const boot = await res.json();

    for (const key of ['meta', 'catalogs', 'profiles', 'app', 'layout', 'runtime']) {
      assert.ok(key in boot, `bootstrap 缺字段 ${key}`);
    }
    assert.ok(Array.isArray(boot.profiles), 'profiles 必须是数组');
    assert.ok(boot.profiles.length >= 2, `应至少有两个演示档案，实际 ${boot.profiles.length}`);
    assert.ok(Array.isArray(boot.catalogs?.NAV), 'catalogs.NAV 必须在（导航是目录不是患者事实）');
    assert.equal(boot.catalogs.NAV.filter((n) => n.id !== 'settings').length, 14, '一级导航应为 14 项');

    // 「数据只在本机」的承诺：响应里不许出现本机绝对路径或用户名
    const raw = JSON.stringify(boot);
    for (const bad of ['/Users/', '/home/', 'qinxiaoqiang', process.env.HOME || '\u0000']) {
      assert.ok(!raw.includes(bad), `bootstrap 泄漏了本机路径片段：${bad}`);
    }
  } finally { await s.close(); }
});

test('GET /api/bootstrap?profile= → 指定的档案存在时用它，不存在时回落到第一个', async () => {
  const s = await startServer();
  try {
    const boot = await (await fetch(`${s.origin}/api/bootstrap`)).json();
    const ids = boot.profiles.map((p) => p.id);

    const picked = await (await fetch(`${s.origin}/api/bootstrap?profile=${encodeURIComponent(ids[1])}`)).json();
    assert.equal(picked.profileId, ids[1], '指定存在的档案应当被选中');

    const fallback = await (await fetch(`${s.origin}/api/bootstrap?profile=__不存在__`)).json();
    assert.equal(fallback.profileId, ids[0], '指定不存在的档案应回落到第一个，而不是报错或返回空');
  } finally { await s.close(); }
});

test('未知接口 → 404 JSON（不落回首页 HTML，否则前端会把 404 当数据解析）', async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.origin}/api/没有这个接口`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
    const body = await res.json();
    assert.ok(body.error, '404 响应要带可读的 error 字段');
  } finally { await s.close(); }
});

test('静态服务越界拦截：编码过的 ../ 也必须被拒', async () => {
  const s = await startServer();
  try {
    for (const p of [
      '/../package.json',
      '/..%2fpackage.json',
      '/%2e%2e%2f%2e%2e%2fpackage.json',
      '/../../../../etc/passwd',
    ]) {
      const res = await fetch(`${s.origin}${p}`, { redirect: 'manual' });
      assert.ok(
        res.status === 403 || res.status === 404,
        `越界路径 ${p} 应当被拒（403/404），实际 ${res.status}`,
      );
      const text = await res.text();
      assert.ok(!text.includes('"name"') || !text.includes('bladder-workbench'),
        `越界路径 ${p} 竟然读到了 package.json 的内容`);
    }
  } finally { await s.close(); }
});

test('basePath 模式（宿主挂载）：前缀下的接口与 UI 都能通', async () => {
  const base = '/api/bladder-workbench';
  const s = await startServer({ basePath: base, apiBase: base, runtime: 'host' });
  try {
    const boot = await fetch(`${s.origin}${base}/api/bootstrap`);
    assert.equal(boot.status, 200, `带前缀的 bootstrap 应可用，实际 ${boot.status}`);
    const data = await boot.json();
    assert.ok(Array.isArray(data.profiles));

    const ui = await fetch(`${s.origin}${base}/ui/app.js`);
    assert.equal(ui.status, 200, `带前缀的 UI 资源应可用，实际 ${ui.status}`);
    assert.match(ui.headers.get('content-type') || '', /javascript/);

    const page = await fetch(`${s.origin}${base}/ui/`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes('id="wbMain"'));
    assert.ok(html.includes(`data-api-base="${base}"`),
      `宿主模式下页面要拿到挂载前缀，实际 data-api-base 不是 ${base}`);
    assert.equal((await res_json(await fetch(`${s.origin}${base}/api/bootstrap`))).runtime, 'host');
  } finally { await s.close(); }
});

async function res_json(res) { return res.json(); }

test('数据库落在 :memory: 时页面仍可服务（不依赖磁盘）', async () => {
  const s = await startServer({ dbPath: ':memory:' });
  try {
    const res = await fetch(`${s.origin}/`);
    assert.equal(res.status, 200);
    const boot = await (await fetch(`${s.origin}/api/bootstrap`)).json();
    assert.ok(boot.profiles.length >= 2, '内存库也应当完成播种');
  } finally { await s.close(); }
});
