'use strict';

module.exports = function (ctx) {
  const { ok, assert, loadWorkflow, findCodeNode, runCode, ENV_OK } = ctx;

  const wf = loadWorkflow('f7-site-monitor.json');
  const health = findCodeNode(wf, 'Evaluate health');
  const evaluate = (items) => runCode(health, items, { sd: {}, env: ENV_OK });

  const errWf = loadWorkflow('error-workflow.json');
  const fmt = findCodeNode(errWf, 'Format alert');
  const format = (items) => runCode(fmt, items, { sd: {}, env: ENV_OK });

  // ---------------------------------------------------------- F7 structure
  ok('f7-structure: schedule → http → health → if → noop/stop, settings, no errorWorkflow id', () => {
    assert.strictEqual(wf.settings.executionOrder, 'v1');
    assert.strictEqual(wf.settings.timezone, 'Africa/Cairo');
    assert.ok(!('errorWorkflow' in wf.settings), 'errorWorkflow id attached manually post-import');
    const names = wf.nodes.map((n) => n.name);
    for (const want of ['Hourly schedule', 'Fetch store', 'Evaluate health', 'Healthy?', 'Site up', 'Site down → error workflow']) {
      assert.ok(names.includes(want), 'missing node: ' + want);
    }
    const sched = wf.nodes.find((n) => n.type === 'n8n-nodes-base.scheduleTrigger');
    assert.strictEqual(sched.typeVersion, 1.2);
    assert.deepStrictEqual(sched.parameters.rule.interval, [{ field: 'hours', hoursInterval: 1 }]);
    const http = wf.nodes.find((n) => n.type === 'n8n-nodes-base.httpRequest');
    assert.strictEqual(http.typeVersion, 4.2);
    assert.strictEqual(http.parameters.method, 'GET');
    assert.strictEqual(http.parameters.url, '={{ $env.STORE_URL }}');
    assert.strictEqual(http.parameters.options.response.response.fullResponse, true);
    assert.strictEqual(http.parameters.options.timeout, 20000);
    assert.strictEqual(http.retryOnFail, false, 'health check must fail fast');
    const stop = wf.nodes.find((n) => n.type === 'n8n-nodes-base.stopAndError');
    assert.strictEqual(stop.parameters.errorMessage, "={{ 'Site down: ' + $json.reason }}");
    assert.deepStrictEqual(wf.connections['Hourly schedule'].main[0].map((c) => c.node), ['Fetch store']);
    assert.deepStrictEqual(wf.connections['Fetch store'].main[0].map((c) => c.node), ['Evaluate health']);
    assert.deepStrictEqual(wf.connections['Evaluate health'].main[0].map((c) => c.node), ['Healthy?']);
    assert.deepStrictEqual(wf.connections['Healthy?'].main[0].map((c) => c.node), ['Site up']);
    assert.deepStrictEqual(wf.connections['Healthy?'].main[1].map((c) => c.node), ['Site down → error workflow']);
  });

  // ------------------------------------------------------- Evaluate health
  ok('f7-200: statusCode 200 → healthy ok', () => {
    const [out] = evaluate([{ json: { statusCode: 200 } }]);
    assert.strictEqual(out.json.healthy, true);
    assert.strictEqual(out.json.reason, 'ok');
    assert.strictEqual(out.json.statusCode, 200);
  });

  ok('f7-302: redirect 302 → healthy ok', () => {
    const [out] = evaluate([{ json: { statusCode: 302, headers: { location: '/' } } }]);
    assert.strictEqual(out.json.healthy, true);
    assert.strictEqual(out.json.reason, 'ok');
    assert.strictEqual(out.json.statusCode, 302);
  });

  ok('f7-404: statusCode 404 → unhealthy http-404', () => {
    const [out] = evaluate([{ json: { statusCode: 404, body: '<html>404</html>' } }]);
    assert.strictEqual(out.json.healthy, false);
    assert.strictEqual(out.json.reason, 'http-404');
  });

  ok('f7-500: statusCode 500 → unhealthy http-500', () => {
    const [out] = evaluate([{ json: { statusCode: 500, body: 'Internal Server Error' } }]);
    assert.strictEqual(out.json.healthy, false);
    assert.strictEqual(out.json.reason, 'http-500');
  });

  ok('f7-missing-status: no statusCode → unhealthy request-failed', () => {
    const [out] = evaluate([{ json: {} }]);
    assert.strictEqual(out.json.healthy, false);
    assert.strictEqual(out.json.reason, 'request-failed');
    assert.strictEqual(out.json.statusCode, null);
  });

  ok('f7-invalid-status: non-numeric statusCode → request-failed', () => {
    const [out] = evaluate([{ json: { statusCode: 'OK' } }]);
    assert.strictEqual(out.json.healthy, false);
    assert.strictEqual(out.json.reason, 'request-failed');
  });

  ok('f7-connection-error: json.error ECONNREFUSED → request-failed', () => {
    const [out] = evaluate([{ json: { error: 'ECONNREFUSED' } }]);
    assert.strictEqual(out.json.healthy, false);
    assert.strictEqual(out.json.reason, 'request-failed');
  });

  ok('f7-connection-body: n8n connection error body → request-failed', () => {
    const [out] = evaluate([{ json: { body: 'ERROR: getaddrinfo ENOTFOUND localhost:8888' } }]);
    assert.strictEqual(out.json.healthy, false);
    assert.strictEqual(out.json.reason, 'request-failed');
  });

  ok('f7-checked-at: checkedAt is an ISO-8601 UTC string', () => {
    const [out] = evaluate([{ json: { statusCode: 200 } }]);
    assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(out.json.checkedAt), out.json.checkedAt);
    assert.ok(!Number.isNaN(Date.parse(out.json.checkedAt)));
  });

  ok('f7-single-item: exactly one item, exact output keys', () => {
    const out = evaluate([{ json: { statusCode: 200 } }]);
    assert.strictEqual(out.length, 1);
    assert.deepStrictEqual(Object.keys(out[0].json).sort(), ['checkedAt', 'healthy', 'reason', 'statusCode']);
  });

  // --------------------------------------------------- error-workflow structure
  ok('f7-alert-structure: errorTrigger first, Telegram retries, no errorWorkflow loop', () => {
    assert.strictEqual(errWf.nodes[0].type, 'n8n-nodes-base.errorTrigger');
    assert.strictEqual(errWf.nodes[0].typeVersion, 1);
    assert.deepStrictEqual(errWf.nodes[0].parameters, {});
    assert.strictEqual(errWf.settings.executionOrder, 'v1');
    assert.strictEqual(errWf.settings.timezone, 'Africa/Cairo');
    assert.ok(!('errorWorkflow' in errWf.settings), 'error workflow must not point at itself');
    const tg = errWf.nodes.find((n) => n.type === 'n8n-nodes-base.httpRequest');
    assert.strictEqual(tg.typeVersion, 4.2);
    // n8n 2.41 denies $env inside node expressions, so the Telegram node reads the
  // credentials the Format node resolved into the item.
  assert.strictEqual(tg.parameters.url, '=https://api.telegram.org/bot{{ $json.tgToken }}/sendMessage');
  assert.ok(!tg.parameters.url.includes('$env'), 'no $env left in the Telegram url');
  assert.ok(String(tg.parameters.jsonBody).includes('$json.tgChatId'), 'chat id read from the item');
    assert.strictEqual(tg.retryOnFail, true);
    assert.strictEqual(tg.maxTries, 3);
    assert.strictEqual(tg.waitBetweenTries, 2000);
    assert.deepStrictEqual(errWf.connections['Error Trigger'].main[0].map((c) => c.node), ['Format alert']);
    assert.deepStrictEqual(errWf.connections['Format alert'].main[0].map((c) => c.node), ['Telegram → owner']);
  });

  const errFixture = {
    json: {
      execution: { id: 1234, url: 'http://localhost:5678/execution/1234' },
      workflow: { id: 'wf-f1', name: 'Nilad F1: new order → Telegram + Sheet' },
      node: { name: 'Verify HMAC + validate' },
      error: {
        message: 'bad-signature for order 50\n    at executeWorkflow (workflow-execute.js:1:1)\n    at processTicksAndRejections',
        description: 'description must not be used while message exists',
        stack: 'Error: bad-signature\n    at Node.execute\n    at WorkflowRun.run',
      },
    },
  };

  // ------------------------------------------------------------ Format alert
  ok('f7-alert-format: Arabic header + workflow + node + execution + first line only', () => {
    const [out] = format([errFixture]);
    assert.deepStrictEqual(Object.keys(out.json).sort(), ['tgChatId', 'tgText', 'tgToken']);
    const t = out.json.tgText;
    assert.ok(t.includes('⚠️ n8n: تنبيه فشل'), 'Arabic header');
    assert.ok(t.includes('الواجهة/Workflow: Nilad F1: new order → Telegram + Sheet'), 'workflow name');
    assert.ok(t.includes('العقدة/node: Verify HMAC + validate'), 'node name');
    assert.ok(t.includes('التنفيذ/execution: 1234'), 'execution id');
    assert.ok(t.includes('السبب: bad-signature for order 50'), 'first line of message');
    assert.ok(!t.includes('executeWorkflow'), 'no second line');
    assert.ok(!t.includes('description must not be used'), 'no description fallback');
    assert.ok(!('stack' in out.json), 'no stack key in output');
    assert.ok(!t.includes('WorkflowRun.run'), 'no stack content');
  });

  ok('f7-alert-pii: email + 11-digit phone scrubbed from final text', () => {
    const f = JSON.parse(JSON.stringify(errFixture));
    f.json.error.message = 'failed to notify qa@nilad.test, call 01012345678 now';
    const [out] = format([f]);
    const t = out.json.tgText;
    assert.ok(!t.includes('qa@nilad.test'), 'email removed');
    assert.ok(t.includes('[email]'), 'email placeholder present');
    assert.ok(!t.includes('01012345678'), 'phone removed');
    assert.ok(t.includes('[phone]'), 'phone placeholder present');
  });

  ok('f7-alert-escape: < and > from the message are HTML-escaped', () => {
    const f = JSON.parse(JSON.stringify(errFixture));
    f.json.error.message = 'upstream <html>500</html> from store\nmore';
    const [out] = format([f]);
    const t = out.json.tgText;
    assert.ok(t.includes('&lt;html&gt;500&lt;/html&gt;'), 'escaped markup');
    assert.ok(!/[<>]/.test(t), 'no raw angle brackets left for parse_mode HTML');
  });

  ok('f7-alert-capped: cause line capped at 300 chars, second line dropped', () => {
    const f = JSON.parse(JSON.stringify(errFixture));
    f.json.error.message = 'x'.repeat(500) + '\nSECOND-LINE-MUST-DROP';
    const t = format([f])[0].json.tgText;
    assert.ok(!t.includes('SECOND-LINE-MUST-DROP'), 'only first line used');
    const cause = t.split('\n').find((l) => l.indexOf('السبب: ') === 0);
    assert.ok(cause, 'cause line present');
    assert.ok(cause.length <= 'السبب: '.length + 300, 'capped at 300 chars');
  });

  ok('f7-alert-defensive: empty error json still yields a tgText', () => {
    const [out] = format([{ json: {} }]);
    const t = out.json.tgText;
    assert.ok(t.includes('⚠️ n8n: تنبيه فشل'), 'header always present');
    assert.ok(t.includes('unknown'), 'unknown fallbacks');
    assert.ok(!/[<>]/.test(t), 'safe for parse_mode HTML');
  });

  ok('f7-alert-docs-shape: execution.error + lastNodeExecuted fallback works', () => {
    const [out] = format([
      {
        json: {
          execution: {
            id: '231',
            url: 'https://n8n.example.com/execution/231',
            error: { message: 'Example Error Message\nstack line', stack: 'Stacktrace' },
            lastNodeExecuted: 'Node With Error',
          },
          workflow: { id: '1', name: 'Example Workflow' },
        },
      },
    ]);
    const t = out.json.tgText;
    assert.ok(t.includes('Example Workflow'), 'workflow name');
    assert.ok(t.includes('Node With Error'), 'node name from lastNodeExecuted');
    assert.ok(t.includes('Example Error Message'), 'message from execution.error');
    assert.ok(!t.includes('Stacktrace'), 'stack never included');
  });
};
