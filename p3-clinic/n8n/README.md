# n8n — تأكيد حجوزات عيادة سِراج

**الحالة:** التدفّق مُسلَّم ومُختبَر **على sink محلي** (توقيع + payload كامل، `docs/evidence/n8n-sink-test.txt`)؛ التشغيل الحيّ **owner-blocked**: يُستورد على n8n صاحب المشروع على خادمه هو (قاعدة ترخيص n8n: ممنوع استضافة n8n لعميل على خادمك أنت).

## المواصفة (10 أسطر)

1. **المحفّز**: حجز جديد في WordPress (`siraj_booking_created` بعد حفظ الـmeta كاملة).
2. **النتيجة**: رسالة Telegram للصاحب فيها الاسم/الموبايل/الخدمة/التاريخ/رقم الحجز.
3. **البيانات**: PII حقيقي (اسم + موبايل) — يُرسَل لغرفة Telegram خاصة فقط، بلا تسجيل في أماكن عامة.
4. **الأتمتة**: `wp-content/plugins/siraj-core/notifier.php` — webhook موقّع HMAC-SHA256 مع timeout 3 ثوانٍ.
5. **السر**: `SIRAJ_N8N_SECRET` في n8n == خيار `siraj_n8n_secret` في WP (توليد محلي عشوائي 64 hex).
6. **سياسة الفشل**: الحجز لا يعتمد على n8n أبدًا — فشل الإرسال = سطر في `error_log` فقط، والنموذج ينجح.
7. **التكرار**: WP لا يعيد المحاولة (محاولة واحدة) → تكرار نادر؛ لو أُضيفت إعادة محاولة لاحقًا أضِف dedupe على `booking.id`.
8. **الرفض**: توقيع خاطئ/منتهٍ → `401` فورًا (اختبار سلبي موثّق في الأدلة).
9. **تنبيه الأخطاء**: `workflows/error-alert.json` يُضبط كـ Error Workflow لكل workflow → Telegram.
10. **الملكية**: البوت وخزانته وn8n كلها لحساب/خادم صاحب المشروع.

## التوقيع (مطابق في الطرفين)

```
X-Siraj-Timestamp: <unix seconds>          (-skew ≤ 300s)
X-Siraj-Signature: v1=<hex( HMAC-SHA256( "<timestamp>." + <raw body>, SECRET ) )>
```

التحقق موجود مرتين بنفس المنطق: Code node في `workflows/booking-confirmation.json` و`scripts/n8n-sink.js`.

## التركيب على n8n (خادم الصاحب)

1. استورد `workflows/booking-confirmation.json` و`workflows/error-alert.json`.
2. ضبط env: `SIRAJ_N8N_SECRET=<hex>` — وعلى بعض الإصدارات يلزم `NODE_FUNCTION_ALLOW_BUILTIN=crypto` لعقدة Code (تحقّق من مستندات إصدارك).
3. افتح عقدة Webhook وتأكد أن خيار **Raw Body** مفعّل (بدونه التوقيع لا يتطابق أبدًا).
4. عقدتا Telegram: اربط credential حسابك، واستبدل `REPLACE_WITH_YOUR_CHAT_ID` في العقدتين.
5. اضبط Error Workflow في settings الخاص بالـworkflow الرئيسي (error-alert).
6. فعّل (Activate) → انسخ رابط الإنتاج: `https://<n8n>/webhook/siraj-booking`.
7. في WordPress: `wp option update siraj_n8n_webhook_url <الرابط>` — والسر مضبوط مسبقًا (أو `wp option update siraj_n8n_secret <hex>` جديد + غيّره في n8n معًا).
8. اختبر: احجز حجزًا تجريبيًا من `/book/` → يجب أن تصل رسالة Telegram خلال ثوانٍ، وراجع Executions في n8n.

## الاختبار المحلي (بدون n8n)

```bash
SIRAJ_N8N_SECRET=<hex> node scripts/n8n-sink.js            # من المضيف :9333
# والحالات في WP: siraj_n8n_webhook_url = http://host.docker.internal:9333/siraj-sink
node scripts/booking-e2e.js                                 # حجز فعلي → VALID في سجل الـsink
```

الأدلة: `docs/evidence/n8n-sink-test.txt` — سطر VALID بحمولة كاملة + رفض توقيع خاطئ ومنتهٍ (401).

## الاعتماديات والقيود

- لا اعتماديات خارجية في WP: `wp_remote_post` فقط.
- `opcache.validate_timestamps=0` في بيئة التطوير → بعد أي تعديل في `notifier.php`/`booking.php`: `node scripts/php-tune.js`.
- رقم الهاتف يُطبَّع في WP إلى `+20…` عند الحفظ، والعقدة تتحقق دفاعيًا بصيغة `+20(10|11|12|15)xxxxxxxx`.
