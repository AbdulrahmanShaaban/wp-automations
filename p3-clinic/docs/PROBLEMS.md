# PROBLEMS — P3 عيادة سِراج للأسنان

سجل المشاكل بالترتيب الزمني (مصري، والمسارات/الأوامر بالإنجليزية) — نفس شكل `p1-fashion-store/docs/PROBLEMS.md`.
**الأدلة الأصلية في `docs/AUDIT/evidence/` لم تُمسّ** — كل إعادة قياس بعد الإصلاح في `docs/AUDIT/evidence/remediation/` (قرار `audit-evidence-remediation-split`).

---

### 2026-10-07 — PowerShell double-encoded العربي في `front-page.html` (resolved)

- **الحالة:** اتحلّت + بوابة encoding اتضافت لـ`verify.sh`.
- **اللي حصل:** `Get-Content`/`Set-Content` في PowerShell 5.1 قرا الملف كـANSI (من غير BOM) وكتبه UTF-8 → double encoding، والصفحة الرئيسية طلعت **tofu** في المتصفح، و**`verify.sh` كان عدّى عادي** (الفحوص كانت تفوت الحكاية دي).
- **ليه:** round-trip خاطئ في أدوات PowerShell الافتراضية للملفات العربية (متأكد — موثّق كدرس في `CONVENTIONS.md`).
- **الحل:** أُعيدت كتابة القالب بـUTF-8 صحيح بأدوات الكتابة (مش PowerShell)، وأُضيفت **بوابة encoding** في `verify.sh` (وجود حقيقي لعبارة «مسار العمل» + منع mojibake signatures) — `verify.sh` بقت **46/46 ALL PASS** وقتها.
- **الدليل:** `docs/PLAN.md` (حاجة encodings) · `docs/CONVENTIONS.md` (دروس المحتوى).

### 2026-10-07 — `label{display:grid}` كسر نموذج الحجز على 1440 بس (resolved)

- **الحالة:** اتحلّت بالـoverride.
- **اللي حصل:** النموذج كان سليم على 390 وكسر على **1440**: النجمة `*` بقت واقفة في عمود جنب الحقل المجاور.
- **ليه:** قاعدة عامة `label{display:grid}` — النص و`span` بقوا items في عمودين، فالـlabel اتعدّل layout (متأكد — نفس الدرس مسجّل في `CONVENTIONS.md`).
- **الحل:** `label{display:block}` جوه `.siraj-booking` + `.siraj-label{min-height:calc(2*1.5em)}` عشان الـinputs تتحاذى في شبكة عمودين (في `wp-content/themes/siraj-theme/style.css`).
- **الدليل:** `docs/CONVENTIONS.md` (دروس المحتوى) · `docs/PLAN.md` (إصلاحات التحقق البصري).

### 2026-10-07 — مسارات `file:./assets/...` ما بترجّعش على الواجهة (resolved)

- **الحالة:** اتحلّت + بوابة 200 اتضافت.
- **اللي حصل:** الصور في القوالب خرجت HTML حرفي `file:./assets/...` = صورة مكسورة في المتصفح.
- **ليه:** `file:` اصطلاح المحرر فقط — WordPress **لا** يحلّه عند العرض (متأكد — قِيس فعليًا).
- **الحل:** مسارات جذرية `/wp-content/themes/siraj-theme/assets/img/...` (قرار `theme-images-root-relative`) + فحص **200 لكل صورة مُشار إليها** في `verify.sh` — الفشل بقى أحمر بدل ما يفضل مكسور بصمت.
- **الدليل:** `docs/DECISIONS.md#theme-images-root-relative` · `docs/CONVENTIONS.md`.

### 2026-10-07 — `printf | grep -q` مع `pipefail` فشل كاذب على صفحات >64KB (resolved)

- **الحالة:** اتحلّت — الفحص اتغيّر لـ`case`.
- **اللي حصل:** `verify.sh` رجّع FAIL كاذب لما الصفحة عدّت 64KB (حجم الـpipe buffer).
- **ليه:** `grep -q` بيخرج عند أول تطابق → `printf` بيموت **SIGPIPE** → الـpipeline بيرجع **141** و`set -o pipefail` بيحوّله لفشل (متأكد).
- **الحل:** استُبدلت بأنماط `case "$HTML" in *'dir="rtl"'*) …` زي باقي الفحوص في `scripts/verify.sh`.
- **الدليل:** `docs/CONVENTIONS.md` (دروس المحتوى) · `docs/PLAN.md`.

### 2026-10-07 — `backdrop-filter` في الهيدر حبس القائمة المفتوحة على الموبايل (resolved)

- **الحالة:** اتحلّت.
- **اللي حصل:** القائمة المفتوحة (`position:fixed` overlay) اتحوّلت لشريط ضيّق جوّه الهيدر بدل ما تغطي الشاشة.
- **ليه:** `backdrop-filter` على الهيدر بيعمل containing block للعناصر الـ`fixed` جوّاه (متأكد — نفس الفحص البصري في P1).
- **الحل:** تعطيل الـfilter أثناء فتح القائمة: `html.has-modal-open .site-header` في `wp-content/themes/siraj-theme/style.css`.
- **الدليل:** `docs/PLAN.md` (إصلاحان أثناء التحقق) + لقطة `docs/evidence/foundation-390-menu.png`.

### 2026-10-07 — زرار CTA في الهيدر لفّ سطرين على 390 (resolved)

- **الحالة:** اتحلّت.
- **اللي حصل:** نص الزرار انقسم على سطرين في عرض الموبايل 390.
- **ليه:** الـselector كان ضيّق (بس جزء من الزرار).
- **الحل:** وسّع الـselector ليشمل `.wp-block-button__link` في `style.css`.
- **الدليل:** `docs/PLAN.md` (إصلاحان أثناء التحقق).

### 2026-10-07 — تجربة scroll-driven CSS خبّت 24/24 عنصر بدون JS (resolved)

- **الحالة:** اتحلّت — المسار اتشال نهائيًا وبقى JS-only.
- **اللي حصل:** تجربة reveal بـ`animation-timeline: view()` سبّبت إن **كل الأقسام المخفية تفضل مخفية** والـJS معطّل، والقياس `motion-check.js` طلع **24/24 مخفي**.
- **ليه:** متصفح بيـparse شرط `@supports (animation-timeline: view())` من غير ما يقود الـtimeline، و`animation-fill-mode: both` بيسيب `opacity:0` · وكمان `CSS.supports('animation-timeline','view')` رجّع **false** غلط لأن القيمة لازم `'view()'` بأقواس (أخطآن متأكد منهما — مسجّلين في `CONVENTIONS.md`).
- **الحل:** شِيل المسار كله → reveal **JS-only** مع صنف `js-motion` هو اللي بيفعّل حالة الإخفاء، و`.reveal` **مرئي في الـCSS الأساسية دايمًا** (غياب السكربت = محتوى ظاهر مضمون) + `prefers-reduced-motion` بيلغي السكربت أصلًا · بلا GSAP (درس خطوط P1).
- **الدليل:** `scripts/motion-check.js` → `docs/evidence/motion-report.json` (4 أوضاع) + لقطات `motion-{css-path,js-path,nojs}-1440` · `docs/DECISIONS.md`.

### 2026-10-07 — `wp:image` جوّا `wp:html` ما بتتParsedش (resolved — سُجّلت كقاعدة)

- **الحالة:** سُجّلت ك convention، مش bug يتعادل.
- **اللي حصل:** تعليقات `wp:image` جوّا كتلة `wp:html` طلعت نص عادي.
- **ليه:** كل أقسام الـfront-page جوّا كتلة **`wp:html` واحدة** (قرار تصميم) فـWordPress ما بيحلّلش بلوكات جوّاها.
- **الحل:** مفيش تعليق بلوك جوّا `wp:html` أبدًا — الصور بتتكتب `<img>` عادي بمسار جذري.
- **الدليل:** `docs/CONVENTIONS.md` (دروس المحتوى) · `docs/DECISIONS.md#theme-images-root-relative`.

### 2026-10-08 — `save_post` طلّع payload ناقص (نيوتر n8n) (resolved)

- **الحالة:** اتحلّت بفعل صريح.
- **اللي حصل:** إشعار التأكيد كان بيوصل بحقول فارغة (فيها `post_title` بس) عند اختبار التدفّق.
- **ليه:** `save_post` بيـfire **جوّا `wp_insert_post` قبل** ما الـmeta تتحفظ — فالقارئ بياخد الحالة وقتها (متأكد — الاختبار أثبتها، مسجّلة في `PLAN.md` سطر 48).
- **الحل:** حدث domain جديد **`siraj_booking_created`** بيُطلق من `siraj-core/booking.php` **بعد** حفظ الـmeta كاملة، والنيوتر `siraj-core/notifier.php` بيسمعه (بواسطة payload كامل: اسم/موبايل `+20…`/خدمة/تاريخ/ملاحظات).
- **الدليل:** `docs/PLAN.md` (n8n booking confirmation) · `docs/DECISIONS.md#booking-confirmation-hmac-webhook` · `docs/evidence/n8n-sink-test.txt`.

### 2026-10-08 — CORS رفض `:8889` لأن core يقصّ البورت (resolved)

- **الحالة:** اتحلّت + مقاسة 68/0.
- **اللي حصل:** الردود الخاصة بين الموقع لنفسه كانت بترفض أصل `http://localhost:8889`.
- **ليه:** `is_allowed_http_origin` بتقارن مع `get_allowed_http_origins()` اللي **بيقصّ البورت** (`http://localhost` بلا `:8889`) — متأكد، موثّق في `GATE-2026-10-08.md` §1.
- **الحل:** إزالة `rest_send_cors_headers` من `rest_pre_serve_request` جوّا **`rest_api_init` بـpriority 99** (core بيسجّلها عند `rest_api_default_filters()` على `rest_api_init@10` فالإزالة المبكرة no-op) + emitter خاص يقارن بـ`home_url()/site_url()` — في `siraj-core/hardening.php`.
- **الدليل:** `docs/AUDIT/GATE-2026-10-08.md` §1 · `docs/AUDIT/evidence/remediation/probe.txt` (CORS evil=0 · own=1).

### 2026-10-08 — ترويسات الأمان كانت ناقصة على REST (resolved)

- **الحالة:** اتحلّت + مقاسة.
- **اللي حصل:** ردود `/wp-json/...` كانت بتخرج **بلا ترويسات الأمان**.
- **ليه:** REST بيخرج أثناء `parse_request` **قبل** `send_headers` — فالـhook المتأخر ما بيوصلش (متأكد — `GATE` §1).
- **الحل:** ربط الترويسات كمان على **`init@0`** (مع `send_headers` + `login_init`) في `siraj-core/hardening.php`.
- **الدليل:** `docs/AUDIT/GATE-2026-10-08.md` §1 · `probe.txt` 68/0.

### 2026-10-07/08 — أهداف الفوتر 18px checkbox و22px (resolved)

- **الحالة:** اتحلّت — ≥24px حسب WCAG 2.2.
- **اللي حصل:** مربعات/روابط الفوتر كانت أصغر من الحد الأدنى للمس.
- **ليه:** قياسات الوصولية — WCAG 2.2 بتحدد **24px** كحد أدنى للهدف.
- **الحل:** تكبير لأحجام ≥24px في `wp-content/themes/siraj-theme/style.css` (سُجّل أولاً ضمن إصلاحات المحتوى في `PLAN.md` بتاريخ 2026-10-07، وأُعيد قياسه ضمن حملة remediation الوصولية 2026-10-08).
- **الدليل:** `docs/PLAN.md` (إصلاحات التحقق البصري) · `docs/AUDIT/GATE-2026-10-08.md` §2 (axe **0 violations ×10 تركيبات**).

### 2026-10-08 — كل `wp-env start` بيرجّع permalinks date-based (resolved)

- **الحالة:** اتحلّت في تدفق start→seed→verify + بوابة verify.
- **اللي حصل:** بعد إعادة تشغيل كاملة، الروابط رجعت `/?p=123` بدل `/%postname%/`.
- **ليه:** إعادة إنشاء الحاوية بترجّع إعدادات WP الافتراضية (متأكد — تكرر فعليًا في اختبار المتانة).
- **الحل:** `bash scripts/seed.sh` بيصلّحها (idempotent) — التدفق الثابت: `npm start` → `bash scripts/seed.sh` → `bash scripts/verify.sh`، وفيه بوابة permalinks بتراقب الموضوع.
- **الدليل:** `docs/CONVENTIONS.md` (دروس remediation) · `docs/PLAN.md` (اختبار إعادة التشغيل).

### 2026-10-08 — Docker/wp-env وقع فجأة مرتين في نفس الجلسة (resolved — إجراء ثابت)

- **الحالة:** اتحلّت بالإجراء المعتمد.
- **اللي حصل:** كل عملية `wp-env start`/verify اتوقّفت فجأة، مرتين.
- **ليه:** Docker Desktop بيموت تحت الضغط على ويندوز (نفس أزمة P1 — متأكد من الرسايل).
- **الحل:** إعادة تشغيل **Docker Desktop** → اتأكد `docker info` فيه `Server:` → `npm start` (28 ثانية تقريبًا) → `bash scripts/seed.sh` → `bash scripts/verify.sh` — مسجّل كخطر معالَج في `PLAN.md#Risks`.
- **الدليل:** `docs/PLAN.md` (Risks).

### 2026-10-08 — `opcache.validate_timestamps=0` بيخبّي تعديلات PHP اليدوية (resolved)

- **الحالة:** اتحلّت + بوابة 4b.
- **اللي حصل:** تعديل يدوي في ملف PHP ما بيظهرش على الموقع.
- **ليه:** إعداد الأداء `validate_timestamps=0` (جزء من حل بطء bind-mount — C1) بيمنع opcache من إعادة فحص الملفات (متأكد).
- **الحل:** بعد **أي** تعديل PHP شغّل `node scripts/php-tune.js` (بيكتب الـini ويعيد تحميل Apache) · موصول بـ`lifecycleScripts.afterStart` في `.wp-env.json` · السكربت بيطبّق على حاويتي **wordpress و cli** (نظاما ملفاتهما مستقلان) · **بوابة verify 4b** بتقيس `ini_get` عبر حاوية cli.
- **الدليل:** `docs/DECISIONS.md#php-tune-lifecycle-validate-timestamps-0` · `docs/AUDIT/GATE-2026-10-08.md` (بند 5) · `README.md`.

### 2026-10-08 — grep جزئي وحّد إن `afterStart` hook كود ميّت (resolved)

- **الحالة:** اتحلّت — الاستدعاء اتأكد شغّال.
- **اللي حصل:** استنتاج إن `lifecycleScripts.afterStart` مش بتتنادى، وكان هيتعاد تعديل/توثيق على افتراض غلط.
- **ليه:** البحث اتعمل على `lib\*.js` بس — والمستدعي الحقيقي في `@wordpress/env` **`lib/commands/start.js:129`** (متأكد).
- **الحل:** قاعدة: **أكمل البحث لكل الحزم قبل ما تستنتج إن ميزة ميتة** (دروس remediation) · الـhook اتأكد تشغيليًا بعد `wp-env start` (بيعيد كتابة php-tune تلقائيًا).
- **الدليل:** `docs/CONVENTIONS.md` (دروس الـQA/remediation) · `docs/DECISIONS.md#php-tune-lifecycle-validate-timestamps-0`.

### 2026-10-08 — `tail` على Apache error.log بيعلّق للأبد (resolved)

- **الحالة:** اتحلّت بمسار بديل.
- **اللي حصل:** أوامر المتابعة كانت بتتجمّد من غير أي مخرج.
- **ليه:** `/var/log/apache2/error.log` في الحاوية **symlink إلى `/dev/stderr`** (متأكد).
- **الحل:** سجلات Apache من المضيف عبر `docker logs <wordpress-container>`.
- **الدليل:** `docs/CONVENTIONS.md` (دروس الـQA/remediation).

### 2026-10-08 — تسريب `MSYS_NO_PATHCONV` بين أوامر نفس الجلسة (resolved)

- **الحالة:** اتحلّت.
- **اللي حصل:** `verify.sh` فشلت بـexit 23 وطبعت `200000` (كود curl قبل الفشل).
- **ليه:** ضبط `$env:MSYS_NO_PATHCONV='1'` لأمر wp-env في نفس الجلسة بيورّثه لـchild process → بيكسر curl الأصلي (متأكد — موثوق من سطور 6–12 في `verify.sh` نفسه).
- **الحل:** الضبط **per-command داخل السكربت** على أوامر الحاوية بس — لا تضبطه على مستوى الجلسة قبل تشغيل أي سكربت فيه curl (قاعدة مكتوبة في `CONVENTIONS.md`).
- **الدليل:** `docs/CONVENTIONS.md` (دروس الـQA/remediation) · `scripts/verify.sh`.

### 2026-10-08 — أداة تدقيق منسوخة خطرت تكتب فوق الأدلّة الأصلية (resolved)

- **الحالة:** اتحلّت قبل أي ضرر.
- **اللي حصل:** نسخ أداة تدقيق لتشغيلها في remediation كان هيرجّع `OUT = path.join(__dirname,'..')` — يعني يكتب في مجلد الـ**baseline** فوق الأدلّة الأصلية.
- **ليه:** نسخة بالغفلة من أداة كانت مصممة تخرج للمجلد الأب (متأكد — اتفحص صراحة).
- **الحل:** تصحيح إلى **`OUT = __dirname`** في نسخ remediation + قاعدة قبل نسخ أي أداة: افحص `OUT` بتاعها — قرار `audit-evidence-remediation-split` (baseline = أرشيف لا يُمسّ).
- **الدليل:** `docs/DECISIONS.md#audit-evidence-remediation-split` · `docs/CONVENTIONS.md`.

### 2026-10-08 — أبواب نشر (open, owner-blocked)

- **الحالة:** **مفتوحة — على صاحب المشروع** (ولي الأمر)، الموقع الديمو شغّال وكل فحوص داخلية خضراء.
- **اللي حصل:** بوابة التسليم `GATE-2026-10-08.md` طلعت **GO** بشرط إن الأبواب دي تتنفّذ قبل أي نشر حقيقي.
- **الأبواب:**
  1. **قبل أي نشر فعلي:** `wp config shuffle-salts` + إعادة تسمية مستخدم `admin` + كلمة مرور قوية (wp-env demo: غير مطلوب).
  2. **رؤوس cache للملفات الثابتة** على خادم النشر (Apache/Nginx) — مش جزء من wp-env.
  3. **قياس performance بعد النشر الفعلي** — أرقام الديمو محكومة بـbind-mount محلي.
  4. **n8n الحيّ** على خادم صاحب المشروع (قاعدة الترخيص) — الخطوات في `n8n/README.md`.
- **الدليل:** `docs/AUDIT/GATE-2026-10-08.md` §4 · `README.md` (قبل النشر الفعلي).

---

## أرقام مُتحقَّقة (ممكن الاستشهاد بيها)

- `scripts/verify.sh`: **29 → 44 → 46 → 50/50 ALL PASS** · security probe **68/0** · login throttle **9/0** · booking throttle **11/0** · axe **0 violations ×10** · Lighthouse home **76/100/100/100** (CLS 0.033) · book **92/100/100/92** (CLS 0.002) · webp **−81%** · booking-e2e أخضر · n8n sink signature **VALID** (id 32/34).
- ملاحظة صدق: كل دي قياسات **على بيئة التطوير** (port 8889 · PHP 8.3 · Docker/wp-env) — warm TTFB ≈ **0.4–0.7s** مقيس محليًا (bind-mount محدود)، وأي رقم إنتاجي لازم يتقاس بعد النشر.
