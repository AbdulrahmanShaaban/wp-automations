'use strict';

module.exports = function (ctx) {
  const { ok, assert, loadWorkflow, findCodeNode, runCode, ENV_OK } = ctx;
  const wf = loadWorkflow('f4-low-stock-alert.json');
  const collect = findCodeNode(wf, 'Collect low stock');
  const fmt = findCodeNode(wf, 'Format alert');
  const mark = findCodeNode(wf, 'Mark alerted');
  const env = { ...ENV_OK, LOW_STOCK_QTY: '5' };

  const prod = (over) =>
    Object.assign({ id: 38, name: 'عباية كتان مطرّزة', manage_stock: true, stock_quantity: 3 }, over);

  ok('f4-structure: settings, node types, retries, no literal secrets', () => {
    assert.strictEqual(wf.settings.executionOrder, 'v1');
    assert.strictEqual(wf.settings.timezone, 'Africa/Cairo');
    const sched = wf.nodes.find((n) => n.type === 'n8n-nodes-base.scheduleTrigger');
    assert.strictEqual(sched.typeVersion, 1.2);
    const http = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest');
    assert.strictEqual(http.length, 2, 'fetch + telegram');
    for (const h of http) {
      assert.strictEqual(h.typeVersion, 4.2);
      assert.strictEqual(h.retryOnFail, true);
      assert.strictEqual(h.maxTries, 3);
    }
    const fetch = wf.nodes.find((n) => n.name === 'Fetch products');
    assert.strictEqual(fetch.parameters.method, 'GET');
    assert.strictEqual(fetch.parameters.options.timeout, 20000);
    assert.ok(String(fetch.parameters.url).includes('{{ $env.STORE_URL }}'), 'url from $env');
    assert.ok(!/bot\d{8,}:/.test(JSON.stringify(wf.nodes)), 'no literal telegram token');
    const names = wf.nodes.map((n) => n.name);
    assert.strictEqual(new Set(names).size, names.length, 'unique node names');
    for (const [src, outs] of Object.entries(wf.connections)) {
      assert.ok(names.includes(src), `connection source missing: ${src}`);
      for (const branch of outs.main) for (const c of branch || []) {
        assert.ok(names.includes(c.node), `connection target missing: ${c.node}`);
      }
    }
  });

  ok('f4-low-qty: stock 3 (<=5) included with all fields', () => {
    const [out] = runCode(collect, [{ json: [prod()] }], { sd: {}, env });
    assert.deepStrictEqual(out.json, {
      productId: 38,
      name: 'عباية كتان مطرّزة',
      stock: 3,
      qty: 3,
    });
  });

  ok('f4-high-qty: stock 10 (>5) excluded → none marker', () => {
    const out = runCode(collect, [{ json: [prod({ stock_quantity: 10 })] }], { sd: {}, env });
    assert.strictEqual(out.length, 1);
    assert.deepStrictEqual(out[0].json, { none: true });
  });

  ok('f4-zero-qty: stock 0 included (out of stock still alerts)', () => {
    const [out] = runCode(collect, [{ json: [prod({ stock_quantity: 0 })] }], { sd: {}, env });
    assert.strictEqual(out.json.stock, 0);
    assert.strictEqual(out.json.qty, 0);
    assert.strictEqual(out.json.productId, 38);
  });

  ok('f4-manage-stock-false: excluded even at low qty', () => {
    const out = runCode(collect, [{ json: [prod({ manage_stock: false })] }], { sd: {}, env });
    assert.deepStrictEqual(out[0].json, { none: true });
  });

  ok('f4-bad-stock: null / string / NaN stock excluded', () => {
    const out = runCode(
      collect,
      [
        {
          json: [
            prod({ id: 40, stock_quantity: null }),
            prod({ id: 41, stock_quantity: '3' }),
            prod({ id: 42, stock_quantity: NaN }),
          ],
        },
      ],
      { sd: {}, env }
    );
    assert.deepStrictEqual(out[0].json, { none: true });
  });

  ok('f4-dedupe: sd key f4:38:3 skipped, qty change key f4:38:2 passes', () => {
    const sd = { keys: ['f4:38:3'] };
    const out = runCode(collect, [{ json: [prod()] }], { sd, env });
    assert.deepStrictEqual(out[0].json, { none: true }, 'same product+qty already alerted');
    const [next] = runCode(collect, [{ json: [prod({ stock_quantity: 2 })] }], { sd, env });
    assert.strictEqual(next.json.productId, 38);
    assert.strictEqual(next.json.qty, 2);
    assert.strictEqual(next.json.stock, 2);
  });

  ok('f4-none: empty list → [{ none: true }] marker', () => {
    const out = runCode(collect, [{ json: [] }], { sd: {}, env });
    assert.deepStrictEqual(out, [{ json: { none: true } }]);
  });

  ok('f4-format: Arabic header + both product names + escaped <script>', () => {
    const items = [
      { json: { productId: 38, name: 'عباية كتان مطرّزة', stock: 3, qty: 3 } },
      { json: { productId: 41, name: 'قميص <script>alert(1)</script>', stock: 1, qty: 1 } },
    ];
    const [out] = runCode(fmt, items, { sd: {}, env });
    assert.deepStrictEqual(Object.keys(out.json).sort(), ['keys', 'tgChatId', 'tgText', 'tgToken']);
    assert.ok(out.json.tgText.includes('تنبيه: مخزون منخفض'), 'Arabic header');
    assert.ok(out.json.tgText.includes('عباية كتان مطرّزة'), 'first product name');
    assert.ok(out.json.tgText.includes('قميص'), 'second product name');
    assert.ok(out.json.tgText.includes('المتبقي: 3'), 'bullet qty for first');
    assert.ok(out.json.tgText.includes('المتبقي: 1'), 'bullet qty for second');
    assert.ok(out.json.tgText.includes('&lt;script&gt;'), 'HTML escaped');
    assert.ok(!out.json.tgText.includes('<script>'), 'no raw script tag');
    assert.deepStrictEqual(out.json.keys, ['f4:38:3', 'f4:41:1'], 'keys rebuilt as f4:<id>:<qty>');
  });

  ok('f4-mark-alerted: writes all keys to sd.keys, passthrough, no dupes', () => {
    const sd = {};
    const [out] = runCode(mark, [{ json: { tgText: 'تنبيه: مخزون منخفض', keys: ['f4:38:3', 'f4:41:1'] } }], { sd, env });
    assert.deepStrictEqual(sd.keys, ['f4:38:3', 'f4:41:1']);
    assert.strictEqual(out.json.tgText, 'تنبيه: مخزون منخفض');
    assert.deepStrictEqual(out.json.keys, ['f4:38:3', 'f4:41:1']);
    runCode(mark, [{ json: { tgText: 'x', keys: ['f4:38:3'] } }], { sd, env });
    assert.deepStrictEqual(sd.keys, ['f4:38:3', 'f4:41:1'], 're-run does not duplicate');
  });

  ok('f4-mark-alerted: caps sd.keys at 500 (oldest dropped)', () => {
    const sd = { keys: [] };
    for (let i = 0; i < 499; i++) sd.keys.push('f4:1:' + i);
    runCode(mark, [{ json: { keys: ['f4:38:3', 'f4:41:1'] } }], { sd, env });
    assert.strictEqual(sd.keys.length, 500);
    assert.ok(sd.keys.includes('f4:38:3'), 'new key kept');
    assert.ok(sd.keys.includes('f4:41:1'), 'new key kept');
    assert.ok(!sd.keys.includes('f4:1:0'), 'oldest key evicted');
  });
};
