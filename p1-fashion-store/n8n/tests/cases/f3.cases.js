/**
 * f3.cases.js — sample-payload tests for Nilad F3 pending-order recovery.
 * Executes the ACTUAL jsCode of f3-pending-recovery.json via runCode().
 */
module.exports = function (ctx) {
  const { ok, assert, loadWorkflow, findCodeNode, runCode, ENV_OK } = ctx;
  const wf = loadWorkflow('f3-pending-recovery.json');
  const filter = findCodeNode(wf, 'Filter + dedupe');
  const format = findCodeNode(wf, 'Format messages');
  const mark = findCodeNode(wf, 'Mark processed');
  const env = { ...ENV_OK, PENDING_HOURS: '48' };
  const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
  const mk = (over = {}) => ({
    id: 101,
    status: 'pending',
    total: '450.00',
    date_created: hoursAgo(72),
    billing: { email: 'sara@nilad.test', first_name: 'سارة', last_name: 'علي' },
    ...over,
  });

  ok('f3-structure: settings, schedule shape, connection endpoints', () => {
    assert.ok(wf.name && Array.isArray(wf.nodes) && wf.connections && wf.settings);
    assert.strictEqual(wf.settings.executionOrder, 'v1');
    assert.strictEqual(wf.settings.timezone, 'Africa/Cairo');
    const names = new Set(wf.nodes.map((n) => n.name));
    for (const want of ['Filter + dedupe', 'Format messages', 'Mark processed', 'Nothing pending', 'Owner alert']) {
      assert.ok(names.has(want), 'missing node: ' + want);
    }
    for (const [src, outs] of Object.entries(wf.connections)) {
      assert.ok(names.has(src), 'connection source missing: ' + src);
      for (const branch of outs.main) for (const c of branch || []) {
        assert.ok(names.has(c.node), 'connection target missing: ' + c.node);
      }
    }
    const sched = wf.nodes.find((n) => n.type === 'n8n-nodes-base.scheduleTrigger');
    assert.strictEqual(sched.typeVersion, 1.2);
    assert.strictEqual(sched.parameters.rule.interval[0].field, 'hours');
    assert.strictEqual(sched.parameters.rule.interval[0].hoursInterval, 3);
  });

  ok('f3-old-pending: 72h pending kept with correct ageHours + fields', () => {
    const [out, ...rest] = runCode(filter, [{ json: [mk()] }], { sd: {}, env });
    assert.strictEqual(rest.length, 0);
    assert.strictEqual(out.json.orderId, 101);
    assert.strictEqual(out.json.email, 'sara@nilad.test');
    assert.strictEqual(out.json.customerName, 'سارة علي');
    assert.strictEqual(out.json.total, '450.00');
    assert.strictEqual(out.json.hasEmail, true);
    assert.ok(out.json.ageHours >= 71 && out.json.ageHours <= 73, 'ageHours ≈ 72, got ' + out.json.ageHours);
  });

  ok('f3-too-new: 2h pending dropped → none', () => {
    const out = runCode(filter, [{ json: [mk({ id: 102, date_created: hoursAgo(2) })] }], { sd: {}, env });
    assert.deepStrictEqual(out[0].json, { none: true });
  });

  ok('f3-non-pending: old but status != pending dropped → none', () => {
    const out = runCode(filter, [{ json: [mk({ status: 'processing', date_created: hoursAgo(100) })] }], { sd: {}, env });
    assert.deepStrictEqual(out[0].json, { none: true });
  });

  ok('f3-already-marked: sd pre-seeded f3:50 dropped → none', () => {
    const out = runCode(filter, [{ json: [mk({ id: 50 })] }], { sd: { keys: ['f3:50'] }, env });
    assert.deepStrictEqual(out[0].json, { none: true });
  });

  ok('f3-no-survivors: empty array / non-array payload → { none: true }', () => {
    const empty = runCode(filter, [{ json: [] }], { sd: {}, env });
    assert.deepStrictEqual(empty[0].json, { none: true });
    const bogus = runCode(filter, [{ json: { unexpected: true } }], { sd: {}, env });
    assert.deepStrictEqual(bogus[0].json, { none: true });
  });

  ok('f3-mixed: only the eligible order survives (age + status + dedupe)', () => {
    const mix = [
      mk({ id: 1 }), // eligible
      mk({ id: 2, date_created: hoursAgo(1) }), // too new
      mk({ id: 3, status: 'completed' }), // paid → not pending
      mk({ id: 4 }), // already reminded
    ];
    const out = runCode(filter, [{ json: mix }], { sd: { keys: ['f3:4'] }, env });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].json.orderId, 1);
  });

  ok('f3-format: email/tg texts carry id + total + Arabic + escaping', () => {
    const out = runCode(
      format,
      [{
        json: {
          orderId: 101,
          email: 'sara@nilad.test',
          customerName: 'سارة <script>علي</script>',
          total: '450.00',
          ageHours: 72,
          hasEmail: true,
          none: false,
        },
      }],
      { sd: {}, env }
    );
    const j = out[0].json;
    assert.strictEqual(j.none, false);
    assert.strictEqual(j.email, 'sara@nilad.test');
    assert.strictEqual(j.emailSubject, 'طلبك المعلق #101 بانتظارك');
    assert.ok(j.emailSubject.includes('#101'));
    for (const field of ['emailText', 'tgText']) {
      assert.ok(j[field].includes('#101'), field + ' contains order id');
      assert.ok(j[field].includes('450'), field + ' contains total');
      assert.ok(/[\u0600-\u06FF]/.test(j[field]), field + ' contains Arabic');
      assert.ok(j[field].includes('&lt;script&gt;'), field + ' HTML-escapes customerName');
      assert.ok(!j[field].includes('<script>'), field + ' has no raw script tag');
    }
    assert.ok(j.emailText.includes('48'), 'email quotes PENDING_HOURS threshold');
    assert.ok(j.tgText.includes('🕓') && j.tgText.includes('72') && j.tgText.includes('ج.م'), 'owner line format');
  });

  ok('f3-format-none: { none: true } passes through untouched', () => {
  const out = runCode(format, [{ json: { none: true } }], { sd: {} });
  // The Format node still resolves the Telegram credentials for downstream use
  // (the IF branch feeds the Telegram node directly), but it must not invent an order.
  assert.strictEqual(out[0].json.none, true);
  assert.strictEqual(out[0].json.orderId, undefined, 'no order id invented');
  assert.ok(typeof out[0].json.tgToken === 'string', 'credentials still resolved');
});

  ok('f3-mark: writes f3:<id> key, dedupes, passes data through', () => {
    const sd = {};
    const [out] = runCode(mark, [{ json: { orderId: 101, total: '450.00' } }], { sd });
    assert.deepStrictEqual(sd.keys, ['f3:101']);
    assert.strictEqual(out.json.orderId, 101);
    assert.strictEqual(out.json.total, '450.00');
    runCode(mark, [{ json: { orderId: 101 } }], { sd });
    assert.deepStrictEqual(sd.keys, ['f3:101'], 'no duplicate key');
  });

  ok('f3-mark-cap: static-data keys capped at 500, oldest evicted', () => {
    const sd = {};
    for (let i = 0; i <= 500; i++) runCode(mark, [{ json: { orderId: i } }], { sd });
    assert.strictEqual(sd.keys.length, 500);
    assert.ok(!sd.keys.includes('f3:0'), 'oldest key evicted');
    assert.ok(sd.keys.includes('f3:500'), 'newest key kept');
  });
};
