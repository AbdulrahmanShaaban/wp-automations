'use strict';

module.exports = function (ctx) {
  const { ok, assert, loadWorkflow, findCodeNode, runCode, ENV_OK, ORDER, webhookItem } = ctx;
  const wf = loadWorkflow('f2-status-updates.json');
  const verify = findCodeNode(wf, 'Verify HMAC + validate');
  const fmt = findCodeNode(wf, 'Format customer email');
  const mark = findCodeNode(wf, 'Mark processed');

  const rawOrder = () => JSON.stringify(ORDER);
  const orderWith = (patch) => JSON.stringify(Object.assign({}, ORDER, patch));
  const runVerify = (rawBody, opts, sd) =>
    runCode(verify, [webhookItem(rawBody, opts)], { sd: sd || {} })[0];

  ok('f2-structure: settings, unique node names, valid connection endpoints', () => {
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
    const email = wf.nodes.find((n) => n.name === 'Send Email (customer)');
    assert.strictEqual(email.type, 'n8n-nodes-base.emailSend');
    assert.strictEqual(email.typeVersion, 2.1);
    const hook = wf.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
    assert.strictEqual(hook.parameters.path, 'woo-order-updated');
    assert.strictEqual(hook.parameters.options.rawBody, true);
  });

  ok('f2-happy-processing: ok + sendable + order fields', () => {
    const { json } = runVerify(rawOrder());
    assert.strictEqual(json.ok, true, json.reason);
    assert.strictEqual(json.reason, 'valid');
    assert.strictEqual(json.sendable, true);
    assert.strictEqual(json.sendableReason, '');
    assert.strictEqual(json.duplicate, false);
    assert.strictEqual(json.orderId, 50);
    assert.strictEqual(json.status, 'processing');
    assert.strictEqual(json.total, 1310);
    assert.strictEqual(json.email, 'qa@nilad.test');
    assert.strictEqual(json.customerName, 'منى أحمد');
  });

  ok('f2-completed: sendable=true', () => {
    const { json } = runVerify(orderWith({ status: 'completed' }));
    assert.strictEqual(json.ok, true, json.reason);
    assert.strictEqual(json.sendable, true);
    assert.strictEqual(json.status, 'completed');
  });

  ok('f2-shipped: sendable=true', () => {
    const { json } = runVerify(orderWith({ status: 'shipped' }));
    assert.strictEqual(json.ok, true, json.reason);
    assert.strictEqual(json.sendable, true);
  });

  ok('f2-pending: sendable=false + status-not-actionable, ok untouched', () => {
    const { json } = runVerify(orderWith({ status: 'pending' }));
    assert.strictEqual(json.ok, true, json.reason);
    assert.strictEqual(json.reason, 'valid');
    assert.strictEqual(json.sendable, false);
    assert.strictEqual(json.sendableReason, 'status-not-actionable');
  });

  ok('f2-bad-signature: tampered secret → ok=false reason bad-signature', () => {
    const crypto = require('crypto');
    const bad = crypto.createHmac('sha256', 'wrong-secret').update(rawOrder()).digest('base64');
    const { json } = runVerify(rawOrder(), { signature: bad });
    assert.strictEqual(json.ok, false);
    assert.strictEqual(json.reason, 'bad-signature');
  });

  ok('f2-missing-order-id: valid signature but no id → rejected', () => {
    const noId = JSON.parse(rawOrder());
    delete noId.id;
    const { json } = runVerify(JSON.stringify(noId));
    assert.strictEqual(json.ok, false);
    assert.strictEqual(json.reason, 'missing-order-id');
  });

  ok('f2-duplicate: sd pre-seeded f2:50:processing → duplicate=true', () => {
    const { json } = runVerify(rawOrder(), undefined, { processed: ['f2:50:processing'] });
    assert.strictEqual(json.ok, true, json.reason);
    assert.strictEqual(json.duplicate, true);
  });

  ok('f2-format-no-email: missing billing.email → hasEmail=false, exact keys', () => {
    const noEmail = JSON.parse(rawOrder());
    delete noEmail.billing.email;
    const [v] = runCode(verify, [webhookItem(JSON.stringify(noEmail))], { sd: {} });
    assert.strictEqual(v.json.ok, true, v.json.reason);
    assert.strictEqual(v.json.email, '');
    const [out] = runCode(fmt, [v], { sd: {} });
    assert.deepStrictEqual(Object.keys(out.json).sort(), ['hasEmail', 'orderId', 'status', 'subject', 'text', 'toEmail']);
    assert.strictEqual(out.json.hasEmail, false);
    assert.strictEqual(out.json.toEmail, '');
  });

  ok('f2-format-message: order id + Arabic status text, HTML-escaped, no emoji', () => {
    const evil = JSON.parse(rawOrder());
    evil.billing.first_name = 'منى <script>أحمد</script>';
    const [v] = runCode(verify, [webhookItem(JSON.stringify(evil))], { sd: {} });
    assert.strictEqual(v.json.ok, true, v.json.reason);
    const [out] = runCode(fmt, [v], { sd: {} });
    assert.deepStrictEqual(Object.keys(out.json).sort(), ['hasEmail', 'orderId', 'status', 'subject', 'text', 'toEmail']);
    assert.strictEqual(out.json.hasEmail, true);
    assert.strictEqual(out.json.toEmail, 'qa@nilad.test');
    assert.strictEqual(out.json.orderId, 50);
    assert.strictEqual(out.json.status, 'processing');
    assert.strictEqual(out.json.subject, 'حالة طلبك #50 تغيّرت');
    assert.ok(out.json.text.includes('رقم الطلب: 50'), 'order id in body');
    assert.ok(out.json.text.includes('طلبك قيد التجهيز'), 'Arabic processing message');
    assert.ok(out.json.text.includes('1310'), 'total in body');
    assert.ok(out.json.text.includes('&lt;script&gt;'), 'HTML escaped');
    assert.ok(!out.json.text.includes('<script>'), 'no raw script tag');
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(out.json.subject + out.json.text), 'no emoji');
  });

  ok('f2-format-completed: Arabic completed wording', () => {
    const [v] = runCode(verify, [webhookItem(orderWith({ status: 'completed' }))], { sd: {} });
    const [out] = runCode(fmt, [v], { sd: {} });
    assert.strictEqual(out.json.hasEmail, true);
    assert.ok(out.json.text.includes('تم تسليم/اكتمل طلبك'), 'completed message');
    assert.ok(out.json.subject.includes('#50'), 'order id in subject');
  });

  ok('f2-format-shipped: Arabic shipped wording', () => {
    const [v] = runCode(verify, [webhookItem(orderWith({ status: 'shipped' }))], { sd: {} });
    const [out] = runCode(fmt, [v], { sd: {} });
    assert.ok(out.json.text.includes('طلبك في الطريق إليك'), 'shipped message');
  });

  ok('f2-mark-processed: writes f2:<id>:<status>, idempotent, caps at 500, passthrough', () => {
    const sd = {};
    const [v] = runCode(verify, [webhookItem(rawOrder())], { sd: {} });
    const [f] = runCode(fmt, [v], { sd: {} });
    const [out] = runCode(mark, [f], { sd });
    assert.deepStrictEqual(sd.processed, ['f2:50:processing']);
    assert.strictEqual(out.json.subject, f.json.subject);
    runCode(mark, [f], { sd });
    assert.deepStrictEqual(sd.processed, ['f2:50:processing'], 'second write is a no-op');
    const sdCap = { processed: Array.from({ length: 500 }, (_, i) => 'f2:' + i + ':processing') };
    runCode(mark, [f], { sd: sdCap });
    assert.strictEqual(sdCap.processed.length, 500, 'capped at 500');
    assert.ok(sdCap.processed.includes('f2:50:processing'));
  });

  ok('f2-mark-direct: key written from orderId/status on the item (no emailSend output dependency)', () => {
    const sd = {};
    runCode(mark, [{ json: { orderId: 50, status: 'shipped' } }], { sd });
    assert.deepStrictEqual(sd.processed, ['f2:50:shipped']);
    const fmtOut = runCode(fmt, [runVerify(rawOrder())], { sd: {} })[0];
    assert.strictEqual(fmtOut.json.orderId, 50, 'Format output carries orderId for Mark');
    assert.strictEqual(fmtOut.json.status, 'processing', 'Format output carries status for Mark');
  });
};
