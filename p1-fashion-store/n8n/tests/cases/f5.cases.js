module.exports = function (ctx) {
  const { ok, assert, loadWorkflow, findCodeNode, runCode, ENV_OK } = ctx;
  const wf = loadWorkflow('f5-daily-summary.json');
  const agg = findCodeNode(wf, 'Aggregate yesterday');
  const fmt = findCodeNode(wf, 'Format summary');
  const mark = findCodeNode(wf, 'Mark sent');

  const mk = (over) =>
    Object.assign(
      {
        id: 1,
        status: 'processing',
        total: '100.00',
        line_items: [{ name: 'عباية كتان', quantity: 1 }],
      },
      over
    );

  // same yesterday-date computation as the workflow code (local date parts)
  const yesterdayKey = () => {
    const d = new Date(Date.now() - 86400000);
    const p2 = (n) => String(n).padStart(2, '0');
    return 'f5:' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  };

  ok('f5-math: 3 orders → revenue 300, orderCount 3, byStatus.refunded 1', () => {
    const o1 = mk({ status: 'processing', total: '100.00', line_items: [{ name: 'قميص قطني', quantity: 2 }] });
    const o2 = mk({ status: 'completed', total: '200.00', line_items: [{ name: 'حقيبة يد', quantity: 1 }] });
    const o3 = mk({ status: 'refunded', total: '999.00', line_items: [{ name: 'فستان سهرة', quantity: 7 }] });
    const [out] = runCode(agg, [{ json: [o1, o2, o3] }], { sd: {}, env: ENV_OK });
    assert.strictEqual(out.json.dup, false);
    assert.strictEqual(out.json.orderCount, 3);
    assert.strictEqual(out.json.revenue, 300);
    assert.strictEqual(out.json.byStatus.refunded, 1);
    assert.strictEqual(out.json.byStatus.processing, 1);
    assert.strictEqual(out.json.byStatus.completed, 1);
    assert.strictEqual(out.json.pendingCount, 0);
    // refunded line_items ignored → winner is قميص 2 vs حقيبة 1
    assert.deepStrictEqual(out.json.topProduct, { name: 'قميص قطني', qty: 2 });
    assert.strictEqual(out.json.dateStr, yesterdayKey().slice(3));
  });

  ok('f5-empty: empty orders array → zeros, topProduct null, dup false', () => {
    const [out] = runCode(agg, [{ json: [] }], { sd: {}, env: ENV_OK });
    assert.strictEqual(out.json.dup, false);
    assert.strictEqual(out.json.orderCount, 0);
    assert.strictEqual(out.json.revenue, 0);
    assert.strictEqual(out.json.pendingCount, 0);
    assert.strictEqual(out.json.topProduct, null);
    assert.deepStrictEqual(out.json.byStatus, {});
    assert.strictEqual(out.json.dateStr, yesterdayKey().slice(3));
  });

  ok('f5-duplicate: sd.keys has f5:<yesterday> → only { dup: true }', () => {
    const sd = { keys: [yesterdayKey()] };
    const out = runCode(agg, [{ json: [mk()] }], { sd, env: ENV_OK });
    assert.strictEqual(out.length, 1);
    assert.deepStrictEqual(out[0].json, { dup: true });
    assert.strictEqual(out[0].json.dup, true);
  });

  ok('f5-top-product: winner summed across line_items (2+3 vs 1)', () => {
    const a = mk({
      status: 'processing',
      total: '10.00',
      line_items: [
        { name: 'فستان صيفي', quantity: 2 },
        { name: 'وشاح حرير', quantity: 1 },
      ],
    });
    const b = mk({ status: 'completed', total: '20.00', line_items: [{ name: 'فستان صيفي', quantity: 3 }] });
    const [out] = runCode(agg, [{ json: [a, b] }], { sd: {}, env: ENV_OK });
    assert.deepStrictEqual(out.json.topProduct, { name: 'فستان صيفي', qty: 5 });
    assert.strictEqual(out.json.revenue, 30);
  });

  ok('f5-body-wrapper: non-array json with .body array handled', () => {
    const o1 = mk({ total: '100.00' });
    const o2 = mk({ status: 'completed', total: '200.00' });
    const [out] = runCode(agg, [{ json: { body: [o1, o2] } }], { sd: {}, env: ENV_OK });
    assert.strictEqual(out.json.dup, false);
    assert.strictEqual(out.json.orderCount, 2);
    assert.strictEqual(out.json.revenue, 300);
  });

  ok('f5-refunded-excluded: refunded cut from revenue but counted', () => {
    const o1 = mk({ status: 'refunded', total: '500.00' });
    const o2 = mk({ status: 'pending', total: '50.00' });
    const [out] = runCode(agg, [{ json: [o1, o2] }], { sd: {}, env: ENV_OK });
    assert.strictEqual(out.json.revenue, 50);
    assert.strictEqual(out.json.orderCount, 2);
    assert.strictEqual(out.json.byStatus.refunded, 1);
    assert.strictEqual(out.json.pendingCount, 1);
  });

  ok('f5-format: Arabic tgText has dateStr, revenue, top product, HTML-escaped', () => {
    const o = mk({
      status: 'processing',
      total: '300.00',
      line_items: [{ name: '<script>فستان</script>', quantity: 5 }],
    });
    const [aggOut] = runCode(agg, [{ json: [o] }], { sd: {}, env: ENV_OK });
    const [out] = runCode(fmt, [aggOut], { sd: {}, env: ENV_OK });
    assert.strictEqual(out.json.key, 'f5:' + aggOut.json.dateStr);
    const t = out.json.tgText;
    assert.ok(t.includes('📊 ملخص يومي ' + aggOut.json.dateStr), 'dateStr in message');
    assert.ok(t.includes('الطلبات: 1'), 'order count in message');
    assert.ok(t.includes('الإيراد: 300 ج.م'), 'revenue in message');
    assert.ok(t.includes('المعلقة: 0'), 'pending count in message');
    assert.ok(t.includes('&lt;script&gt;فستان&lt;/script&gt;'), 'product name HTML-escaped');
    assert.ok(!t.includes('<script>'), 'no raw script tag');
    assert.ok(t.includes('الأكثر مبيعًا:'), 'top product line present');
    assert.ok(t.includes('(5)'), 'top product qty in message');
    assert.ok(t.includes('processing: 1'), 'byStatus short line');
    assert.ok(!/\p{Extended_Pictographic}/u.test(t.replace(/📊/g, '')), 'no emoji besides leading 📊');
  });

  ok('f5-format-empty: no orders → dash top-product line, key still valid', () => {
    const [aggOut] = runCode(agg, [{ json: [] }], { sd: {}, env: ENV_OK });
    const [out] = runCode(fmt, [aggOut], { sd: {}, env: ENV_OK });
    assert.strictEqual(out.json.key, 'f5:' + aggOut.json.dateStr);
    assert.ok(out.json.tgText.includes('الأكثر مبيعًا: —'), 'em-dash when no products');
    assert.ok(out.json.tgText.includes('الطلبات: 0'), 'zero orders in message');
  });

  ok('f5-mark-sent: writes key, passthrough, no dupes, cap 100', () => {
    const sd = {};
    const [out] = runCode(mark, [{ json: { tgText: 'x', key: 'f5:2026-10-02' } }], { sd, env: ENV_OK });
    assert.deepStrictEqual(sd.keys, ['f5:2026-10-02']);
    assert.strictEqual(out.json.tgText, 'x');
    assert.strictEqual(out.json.key, 'f5:2026-10-02');
    runCode(mark, [{ json: { key: 'f5:2026-10-02' } }], { sd, env: ENV_OK });
    assert.deepStrictEqual(sd.keys, ['f5:2026-10-02']);
    sd.keys = [];
    for (let i = 0; i < 100; i++) sd.keys.push('f5:old-' + i);
    runCode(mark, [{ json: { key: 'f5:new' } }], { sd, env: ENV_OK });
    assert.strictEqual(sd.keys.length, 100);
    assert.ok(sd.keys.includes('f5:new'), 'new key kept');
    assert.ok(!sd.keys.includes('f5:old-0'), 'oldest key evicted');
  });
};
