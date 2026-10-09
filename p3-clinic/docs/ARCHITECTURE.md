# Architecture — P3: عيادة سِراج للأسنان (Demo)

## Stack
WordPress **block theme** عبر `@wordpress/env` على **port 8889** (8888 محجوز لـ P1) · PHP **8.3** · بدون WooCommerce.
Theme: **`siraj-theme`** مبني على `design/tokens.css` · Plugin صغير: **`siraj-core`** (حجز + hardening + SEO + إشعار n8n، بدون اعتماديات خارجية).
حركة: **JS-only reveals** (بلا GSAP — قرار موثّق في DECISIONS؛ `.reveal` مرئي أساسًا والحالة المخفية مربوطة بصنف `js-motion`) · لغة الموقع: عربية RTL فقط.
Automation: **n8n webhook موقّع HMAC** (مُختبَر على sink محلي؛ التشغيل الحيّ على خادم الصاحب — `n8n/README.md`).
راجع `docs/DECISIONS.md` لكل خيار (لماذا 8889، لماذا plugin خاص، لماذا Alexandria فقط، لماذا التوقيع HMAC).

## Structure
```
p3-clinic/
  design/                 # مخرجات التصميم المعتمدة (قراءة فقط) + الأدلة
    APPROVED.md  direction.md  brief.md  tokens.css  preview-a.html
    img/photos/           # 8 صور Unsplash محمّلة محلياً + CREDITS.md
    img/logo-mark.svg     # شعار أصلي (design/logo.mjs)
    shots/                # لقطات المعاينة/الدليل
  docs/                   # سياق الجلسة: PLAN / ARCHITECTURE / DECISIONS / CONVENTIONS
  docs/AUDIT/             # تقارير التدقيق الثلاثة + GATE-2026-10-08.md (GO)
  docs/AUDIT/evidence/    # baseline (security/a11y/perf — أرشيف لا يُمسّ)
    remediation/          # أدلة ما بعد الإصلاح (probe/throttle/axe/lighthouse/verify)
  docs/evidence/          # لقطات البناء والتحقق + booking + motion + n8n-sink-test.txt
  wp-content/themes/siraj-theme/   # block theme (style.css + theme.json + قوالب + parts)
  wp-content/plugins/siraj-core/
    siraj-core.php        # الذرّة (require فقط)
    booking.php           # shortcode + CPT + تحقق/حفظ + حدث siraj_booking_created
    notifier.php          # webhook موقّع HMAC إلى n8n (timeout 3s, failure=log فقط)
    hardening.php         # ترويسات أمان + CORS pin + throttles + حظر/xmlrpc/404/301
    seo.php               # meta/OG/Twitter/JSON-LD (Dentist+Breadcrumb+FAQPage)
    seed-wp.php           # boot واحد idempotent (هوية/صفحات/محتوى/إعدادات)
  scripts/                # seed.sh / verify.sh (بوابتان) + php-tune.js (post-start)
                          # + booking-e2e.js / motion-check.js / shots.js
                          # + optimize-images.js / fetch-fonts.mjs / n8n-sink.js
  n8n/
    workflows/            # booking-confirmation.json + error-alert.json
    README.md             # runbook + توقيع + خطوات التركيب الحيّ
  .wp-env.json            # config + lifecycleScripts.afterStart → php-tune.js
  README.md
```

## Key Patterns In Use
- **block theme مُدار بـ `theme.json`** — الألوان/الخطوط/الأنصاف من tokens، لا أسلوب inline متفرّق (wordpress-woocommerce).
- **tokens مصدر حيد**: `design/tokens.css` يُترجم إلى `theme.json` — لا نسخة ثانية من اللوحة.
- **seed idempotent + verify gate**: `scripts/seed.sh` بلا تكرار، `scripts/verify.sh` بوابة قبول قبل أي ادعاء "تم" (**50/50** — تشمل `php -l` وبوابات المحتوى والencoding و«مفيش صور أشخاص»).
- **حجز داخل plugin خاص `siraj-core`** — لا plugin حجز خارجي (DEPENDENCY-FREE للعرض). الحفظ يُطلق حدث domain `siraj_booking_created` **بعد** الـmeta (مش save_post المبكر).
- **توقيع webhook**: `X-Siraj-Signature: v1=hex(HMAC-SHA256("<ts>.<rawBody>"))` + skew ≤300s — نفس المنطق في notifier.php والعقدة في n8n و`scripts/n8n-sink.js` (ثلاثة مزايلاة متطابقة).
- **أداء البيئة**: `scripts/php-tune.js` (opcache `validate_timestamps=0`) عبر `lifecycleScripts.afterStart` — بعد أي تعديل PHP أعد تشغيله (يُنهي بـgraceful reload).
- **أدلة غير قابلة للتعديل**: تقارير `docs/AUDIT/*` baseline أرشيف؛ كل إعادة قياس في `evidence/remediation/` (DECISIONS `audit-evidence-remediation-split`).
- **demo-marking convention** — كل محتوى خيالي موسوم Demo في النص footer؛ راجع `docs/CONVENTIONS.md`.
- **عرض vs ملكية**: `design/` عقد معتمد (لا يُعدَّل)؛ `docs/` + `README.md` ملك هذا المشروع.

## Changelog
- 2026-10-06 — تأسيس `docs/` + `README.md`؛ بوابة التصميم مُعتمدة (A).
- 2026-10-07 — foundation + content/booking + motion؛ بوابات verify 29→44→46.
- 2026-10-08 — QA (3 تدقيقات + remediation) → `GATE-2026-10-08.md` **GO**؛ n8n notifier + workflows + اختبار sink؛ verify **50/50**.
