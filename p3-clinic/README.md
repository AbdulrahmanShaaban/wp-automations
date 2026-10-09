# عيادة سِراج للأسنان (Demo) — P3

**ما هو:** موقع عرض (portfolio demo) لعيادة أسنان خيالية في مصر — عربي RTL بالكامل، مبني على block theme في WordPress، بتصميم معتمد من بوابة معاينات (الاتجاه **A «الروشتة»**). الإجراء الأساسي للمستخدم: **احجز زيارة** عبر نموذج حجز مخصص، مع أتمتة تأكيد لاحقة عبر n8n.

العيادة والمحتوى كله خيالي وموسوم **Demo** — لا ادعاءات طبية، ولا شعاب/نتائج قبل وبعد، ولا أرقام أو شهادات مُختلقة.

**الحالة:** بوابة التصميم ناجحة (2026-10-06) · بناء كامل (foundation/content/booking/motion) · **بوابة QA: GO** (`docs/AUDIT/GATE-2026-10-08.md` — تدقيق أمان/وصولية/أداء بعد الإصلاح + `verify.sh` 50/50).

## Tech Stack

| القطعة | التقنية |
|---|---|
| CMS | WordPress (block theme) عبر `@wordpress/env` |
| Port | **8889** (‏8888 محجوز لمشروع P1) |
| PHP | 8.3 |
| Theme | `wp-content/themes/siraj-theme` — من `design/tokens.css` |
| Plugin | `wp-content/plugins/siraj-core` — حجز + hardening + SEO (بلا اعتماديات خارجية) |
| حركة | JS-only reveals (بلا GSAP — قرار موثّق) مع احترام `prefers-reduced-motion` |
| Automation | n8n — webhook موقّع HMAC جاهز في `n8n/` (التشغيل الحيّ على خادم صاحب المشروع) |
| Design | `design/APPROVED.md` — لوحة `#F7F8FC` / `#2F4BD8` / `#A3231B`، خط **Alexandria** |

## Getting Started

المتطلبات: **Docker Desktop يعمل** + Node.js.

```bash
npm install          # @wordpress/env
npm start            # -> http://localhost:8889  (+ lifecycleScripts.afterStart → scripts/php-tune.js)
bash scripts/seed.sh    # محتوى/إعدادات idempotent (إعادة التشغيل لا تكرر)
bash scripts/verify.sh  # بوابة التحقق قبل أي ادعاء "تم" (50/50)
```

**بعد أي تعديل ملفات PHP** شغّل `node scripts/php-tune.js` — الإعداد `opcache.validate_timestamps=0` يعني إن التعديل مش هيظهر قبل إعادة تحميل Apache (السكربت ينتهي بـgraceful reload، ويطبّق على حاويتي wordpress **وcli**). ملاحظة: أي `wp-env start` يعيد permalinks إلى date-based — تُصلحها `bash scripts/seed.sh` (التدفق start→seed→verify) ثم `bash scripts/verify.sh` (بوابتا permalinks + php-tune تراقبان ذلك).

بناء صور Docker في أول تشغيل يستغرق بضع دقائق. راجع `docs/ARCHITECTURE.md` لتفاصيل الهيكل و`docs/PLAN.md` للحالة الحالية.

## Project Structure

الهيكل الكامل وأنماط التصميم المُستخدمة: **`docs/ARCHITECTURE.md`** · القرارات: `docs/DECISIONS.md` · القيود الخاصة: `docs/CONVENTIONS.md`.

```
design/      # عقد التصميم المعتمد + الصور + الشعار (قراءة فقط)
docs/        # سياق الجلسة: PLAN / ARCHITECTURE / DECISIONS / CONVENTIONS
wp-content/  # theme siraj-plugin + plugin siraj-core
scripts/     # seed.sh / verify.sh
n8n/         # تأكيد الحجز (لاحقاً)
```

## Demo & content honesty

- العيادة اسمها الخيالي **عيادة سِراج للأسنان** وكل ما فيها Demo.
- الصور من **Unsplash** (ترخيص تجاني، بلا إلزام نسب) وهي **توضيحية** — في بناء حقيقي تُستبدل بصور العيادة نفسها.
- الشعار أصلي (`design/logo.mjs`) — لا شعار طرف ثالث.
- لا ادعاءات طبية ولا before/after ولا فريق حقيقي — انظر `docs/DECISIONS.md#content-demo-no-medical-claims`.

## قبل النشر الفعلي (handoff checklist)

1. `wp config shuffle-salts` + إعادة تسمية مستخدم `admin` وكلمة مرور قوية.
2. رؤوس cache للملفات الثابتة على خادم النشر (Apache/Nginx) — wp-env لا يقيسها.
3. قياس Lighthouse بعد النشر (أرقام الـdemo محكومة بـDocker bind-mount محلي).
4. تفعيل n8n الحيّ: استيراد `n8n/workflows/booking-confirmation.json` + ضبط `SIRAJ_N8N_SECRET` + سجل التوقيع في `n8n/README.md`.

## QA evidence

- الحكم: `docs/AUDIT/GATE-2026-10-08.md` (GO) · التقارير: `docs/AUDIT/{security,a11y-arabic,perf-seo}.md` (baseline) — أدلة ما بعد الإصلاح: `docs/AUDIT/evidence/remediation/` (probe 68/0 · throttles 9/0 و11/0 · axe 0×10 · verify 50/50).
