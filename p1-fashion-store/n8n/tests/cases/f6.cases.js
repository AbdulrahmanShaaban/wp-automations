'use strict';

module.exports = function (ctx) {
  const { ok, assert, loadWorkflow, findCodeNode, runCode, ENV_OK } = ctx;
  const wf = loadWorkflow('f6-review-request.json');
  const select = findCodeNode(wf, 'Select review candidates');
  const fmt = findCodeNode(wf, 'Format review email');
  const mark = findCodeNode(wf, 'Mark requested');
  const env = { ...ENV_OK, REVIEW_AFTER_DAYS: '5' };

  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  const completedOrder = (patch) =>
    Object.assign(
      {
        id: 50,
        status: 'completed',
        date_completed: ago(6 * 86400000),
        billing: {
          first_name: 'منى',
          last_name: 'أحمد',
          email: 'qa@nilad.test',
        },
        line_items: [{ name: 'عباية كتان مطرّزة', quantity: 1, product_id: 38 }],
      },
      patch
    );
  const runSelect = (orders, sd) => runCode(select, [{ json: orders }], { sd: sd || {}, env })[0];

  ok('f6-structure: settings, schedule rule, connection endpoints, emailSend', () => {
    assert.ok(wf.name && Array.isArray(wf.nodes) && wf.connections && wf.settings);
    assert.strictEqual(wf.settings.executionOrder, 'v1');
    assert.strictEqual(wf.settings.timezone, 'Africa/Cairo');
    const names = wf.nodes.map((n) => n.name);
    assert.strictEqual(new Set(names).size, names.length, 'duplicate node names');
    for (const [src, outs] of Object.entries(wf.connections)) {
      assert.ok(names.includes(src), `missing source ${src}`);
      for (const branch of outs.main) for (const c of branch || []) {
        assert.ok(names.includes(c.node), `missing target ${c.node}`);
      }
    }
    const sched = wf.nodes.find((n) => n.type === 'n8n-nodes-base.scheduleTrigger');
    assert.strictEqual(sched.typeVersion, 1.2);
    assert.strictEqual(sched.parameters.rule.interval[0].field, 'days');
    assert.strictEqual(sched.parameters.rule.interval[0].triggerAtHour, 10);
    const email = wf.nodes.find((n) => n.name === 'Send review request');
    assert.strictEqual(email.type, 'n8n-nodes-base.emailSend');
    assert.strictEqual(email.typeVersion, 2.1);
    assert.strictEqual(email.retryOnFail, true);
    const markNode = wf.nodes.find((n) => n.name === 'Mark requested');
    assert.ok(
      wf.connections['Format review email'].main[0].some((c) => c.node === 'Mark requested'),
      'Format → Mark'
    );
    assert.ok(
      wf.connections['Mark requested'].main[0].some((c) => c.node === 'Send review request'),
      'Mark → email (mark before send)'
    );
    assert.strictEqual(markNode.type, 'n8n-nodes-base.code');
  });

  ok('f6-eligible: completed 6 days ago → fields + productUrl', () => {
    const [out] = [runSelect([completedOrder()])];
    assert.strictEqual(out.json.none, undefined, 'not the none marker');
    assert.strictEqual(out.json.orderId, 50);
    assert.strictEqual(out.json.email, 'qa@nilad.test');
    assert.strictEqual(out.json.firstName, 'منى');
    assert.strictEqual(out.json.productId, 38);
    assert.strictEqual(out.json.productName, 'عباية كتان مطرّزة');
    assert.strictEqual(out.json.productUrl, 'http://localhost:8888/?p=38');
  });

  ok('f6-too-new: completed only 1 day ago → dropped', () => {
    const [out] = [runSelect([completedOrder({ date_completed: ago(86400000) })])];
    assert.strictEqual(out.json.none, true);
  });

  ok('f6-wrong-status: old but processing → dropped', () => {
    const [out] = [runSelect([completedOrder({ status: 'processing' })])];
    assert.strictEqual(out.json.none, true);
  });

  ok('f6-missing-email: no billing.email → dropped', () => {
    const o = completedOrder();
    delete o.billing.email;
    const [out] = [runSelect([o])];
    assert.strictEqual(out.json.none, true);
  });

  ok('f6-no-product-id: line items without product_id → dropped', () => {
    const o = completedOrder();
    o.line_items = [{ name: 'هدية', quantity: 1 }];
    const [out] = [runSelect([o])];
    assert.strictEqual(out.json.none, true);
  });

  ok('f6-date-completed-null: excluded', () => {
    const [out] = [runSelect([completedOrder({ date_completed: null })])];
    assert.strictEqual(out.json.none, true);
  });

  ok('f6-duplicate: sd pre-seeded f6:50 → dropped', () => {
    const [out] = [runSelect([completedOrder()], { keys: ['f6:50'] })];
    assert.strictEqual(out.json.none, true);
  });

  ok('f6-none: empty input / non-array payload → none marker', () => {
    assert.strictEqual(runSelect([]).json.none, true);
    const wrapped = runCode(select, [{ json: { body: [] } }], { sd: {}, env })[0];
    assert.strictEqual(wrapped.json.none, true);
  });

  ok('f6-format: Arabic subject/text, order id, link, escaped, exact keys', () => {
    const evil = completedOrder();
    evil.line_items[0].name = 'عباية <script>خبيثة</script>';
    const [v] = runCode(select, [{ json: [evil] }], { sd: {}, env });
    const [out] = runCode(fmt, [v], { sd: {} });
    assert.deepStrictEqual(Object.keys(out.json).sort(), ['email', 'key', 'orderId', 'subject', 'text']);
    assert.strictEqual(out.json.key, 'f6:50');
    assert.strictEqual(out.json.email, 'qa@nilad.test');
    assert.ok(out.json.subject.includes('عباية &lt;script&gt;خبيثة&lt;/script&gt;'), 'escaped product in subject');
    assert.ok(!out.json.subject.includes('<script>'), 'no raw script in subject');
    assert.ok(out.json.text.includes('#50'), 'order id in body');
    assert.ok(out.json.text.includes('http://localhost:8888/?p=38'), 'product link in body');
    assert.ok(out.json.text.includes('شكرًا لطلبك'), 'Arabic thanks');
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(out.json.subject + out.json.text), 'no emoji');
  });

  ok('f6-format-defaults: empty firstName / product name fallback', () => {
    const o = completedOrder();
    o.billing.first_name = '';
    o.line_items[0].name = '';
    const [v] = runCode(select, [{ json: [o] }], { sd: {}, env });
    const [out] = runCode(fmt, [v], { sd: {} });
    assert.ok(out.json.subject.includes('مشترياتك'), 'product fallback');
    assert.ok(out.json.text.includes('عزيزنا العميل'), 'name fallback');
  });

  ok('f6-mark: writes f6 key, idempotent, caps at 500, passthrough', () => {
    const sd = {};
    const input = { json: { orderId: 50, email: 'qa@nilad.test', subject: 's', text: 't', key: 'f6:50' } };
    const [out] = runCode(mark, [input], { sd });
    assert.deepStrictEqual(sd.keys, ['f6:50']);
    assert.strictEqual(out.json.key, 'f6:50', 'passthrough keeps key for the email node');
    runCode(mark, [input], { sd });
    assert.deepStrictEqual(sd.keys, ['f6:50'], 'second write is a no-op');
    const sdCap = { keys: Array.from({ length: 500 }, (_, i) => 'f6:' + i) };
    runCode(mark, [input], { sd: sdCap });
    assert.strictEqual(sdCap.keys.length, 500, 'capped at 500');
    assert.ok(sdCap.keys.includes('f6:50'));
  });
};
