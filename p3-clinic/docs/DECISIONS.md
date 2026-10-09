# Decisions

> Append-only. لا تُحذف ولا تُعاد كتابة الإدخالات القديمة — أضف خطاً بالإدخال الأحدث إذا ألغى واحداً سابقاً.
> التاريخ: **2026-10-06** لكل ما يلي (بدء المشروع).

## design-direction-A — 2026-10-06
اعتمدنا الاتجاه **A «الروشتة»** (حبري/ورق وصفة طبية) بعد بوابة التصميم.
Why: مفهوم مميّز يمرّ الاختبار العام (سطر يرسم نفسه + ترقيم هامش + ختم RX) ولا يتكرّر مع P1.
Alternative considered: B «العيادة الخاصة» (مينيمال داكن) و C «دفتر الوصفات» (ورملي) — بقيا في `preview-b/c.html` ولم يُبنَيا.

## stack-wordpress-block-theme — 2026-10-06
WordPress **block theme** عبر wp-env، لا HTML ثابت ولا headless.
Why: نفس أدوات P1 المُجرَّبة (seed/verify/reset) + قصة بورتفوليو متماسكة ("أبني مواقع ووردبريس").
Alternative considered: HTML/CSS ثابت (أسرع لكن لا يُظهر خبرة WP) · headless WP + React (تكلفة بلا عائد لصفحة عرض واحدة).

## port-8889 — 2026-10-06
wp-env على **8889**.
Why: 8888 محجوز بـ P1، والتشغيل المتوازٍ لل,callbacks_VERIFY ضروري.
Alternative considered: إيقاف P1 لتحرير 8888 — مرفوض، يكسر مشاريع جاهزة أثناء عمل P3.

## booking-custom-plugin — 2026-10-06
نموذج الحجز داخل plugin خاص **`siraj-core`**، بدون plugin حجز جاهز.
Why: صفر اعتماديات خارجية للعرض، ويطابق نمط `nilad-core` في P1.
Alternative considered: Amelia/Bookly إلخ — تحديثات/تراخيص/قيود تكلفة لعرض تجريبي لا يحتاج مزامنة تقويم حقيقية.

## imagery-unsplash-local — 2026-10-06
صور Unsplash الثمانية **محمّلة محلياً** في `design/img/photos/` (ترخيص تجاني مجاني بلا نسب).
Why: التضمين المحلي يمنع الكسر عند تغيّر الرابط؛ والنص يجب أن يصرّح أنها توضيحية لا لعيادة حقيقية.
Alternative considered: hotlinking (يعتمد على شبكة طرف ثالث) · صور Pexels (رُفضت أيضاً برمجياً).

## logo-own-mark — 2026-10-06
شعار أصلي `img/logo-mark.svg` مولَّد من `design/logo.mjs`.
Why: شعار طرف ثالث = مخاطر علامة تجارية (trademark) في عمل يُعرض علناً.
Alternative considered: شعار/كتابات عيادة حقيقية — مرفوض قانونياً وأخلاقياً.

## font-alexandria-only — 2026-10-06
خط **Alexandria** فقط (عرض + نص). Cairo وInter ممنوعان صراحةً.
Why: الاتجاه المعتمد `APPROVED.md` يُثبّت Alexandria ويستثني البقية؛ خلافه = خرق العقد.
Alternative considered: Cairo (نفس نمط AI-template الشائع) — ممنوعة بالاتجاه.

## content-demo-no-medical-claims — 2026-10-06
كل المحتوى خيالي وموسوم **Demo**، بلا ادعاءات طبية، بلا before/after، بلا إحصاءات/شهادات مُختلقة، بلا أشخاص حقيقيين كفريق (صور stock توضيحية يُقال ذلك في النص).
Why: ثقة + امتثال؛ موقع عرض يدّعي عيادة حقيقية = مسؤولية.
Alternative considered: صور "قبل/بعد" لملء المساحات — ممنوعة في `brief.md` (hard rule).

## no-people-photos-in-demo — 2026-10-07
قاعدة محتوى: **لا صورة فيها شخص** في موقع سِراج. قسم الفريق بيبقى ببطاقات monogram (أول حرفين من التخصص) بدل صور، والصور المسموحة = أدوات/تفاصيل زرع + صالة انتظار فاضية.
Why: صاحب المشروع طلب ذلك صراحةً، وهو قرار يتّسق مع الخطر المسجّل في `PLAN.md`: صور stock تُقرأ كعيادة حقيقية أو كطاقم حقيقي. الفحص البصري للصور المرشحة أوجب استبعاد `team-ortho.jpg` (طبيب راجل) و`band-exam.jpg` (وجه مريض قريب من الكاميرا مع أثر لحية) — قاعدةgowAmbiguity: أي صورة غير واضحة الجنس تُعتبر مرفوضة، والأفضل ألّا صور أشخاص أصلًا. المعتمد: 3 صور أدوات/زرع + صالة انتظار.
Alternative considered: صور طبيبات بحجاب — مقبولة نظريًا لكن لم تتوفّر صورة مطابقة للتنسيق، وقاعدة «بدون أشخاص» أنظف وأقل مخاطرة.
Gate: `scripts/verify.sh` يُسقط الـgate لو ظهر `team-ortho|band-exam` في الصفحة أو في `assets/img` — القاعدة مُطبَّقة آليًا لا بالذاكرة.

## booking-stores-in-custom-post-type — 2026-10-07
نموذج الحجز shortcode `[siraj_booking]` في `siraj-core/booking.php`، وكل طلب يُحفظ كـ custom post type خاص `public => false` (بيانات في post meta + `siraj_ip_hash` بالهاش مش IP خام)، وأعمدة في wp-admin (الاسم/الموبايل/الخدمة/التاريخ).
Why: المشروع بلا SMTP ولا بريد مُسلَّم (قرار `booking-custom-plugin`: بدون plugin خارجي)، فالحفظ في القاعدة هو الطريقة الوحيدة التي يقدر صاحبها يشوف الطلبات فعلًا. `public => false` عشان الطلبات—sheي فيها بيانات شخصية— ما تظهرش في REST ولا في الأرشيف ولا في نتائج البحث.
anti-spam: nonce + honeypot `siraj_website` مخفي بـclip (مش `display:none` عشان شكر ي قارئ الشاشة يفضل موجودًا)، مع رسالة رفض عامة عند التفعيل.
Verified: `scripts/booking-e2e.js` — إرسال غير صالح → رسالة عربية داخل الحقل + `aria-invalid` + القيم محفوظة + النموذج موجود؛ إرسال صالح → حالة نجاح `role="status"` + النموذج اختفى؛ honeypot → رفض بلا نجاح؛ **وصف واحد فقط** اتخزّن في القاعدة (#24، موبايل مُطبَّع +201012345678).

## seed-owns-page-content — 2026-10-07
`siraj_seed_page_id()` بقى يحدّث العنوان والمحتوى إذا اختلفا عن الـseed (كان بي CREATE فقط).
Why: «everything-as-code»: لو الـseed قال «المحتوى ده» والصفحة فيها stub أقدم، الـseed هو المصدر. بدون التحديث، كل تعديل محتوى بدو تعديل يدوي في الأدمن يكسر البناء.
Verified: تشغيل الـseed بعد بناء المحتوى طبع `updated: services/team/contact` + `created: book`؛ تشغيل ثانٍ = لا تغييرات (idempotent).

## theme-images-root-relative — 2026-10-07
صور القوالب تُشار إليها بمسار جذري `/wp-content/themes/siraj-theme/assets/img/x.jpg`، لا `file:./assets/...`.
Why: `file:` اصطلاح المحرر فقط — القياس أظهر أن WordPress **لا** يحلّه عند العرض على الواجهة، والـHTML خرج حرفيًا `file:./assets/...` (صورة مكسورة). وكل الأقسام داخل كتلة `wp:html` واحدة، فتعليقات `wp:image` بداخلها لا تُحلَّل أصلًا ولا تصلح كـhooks.
Why root-relative وليس PHP: القوالب ملفات HTML ثابتة، وWordPress يخدم ملفات الثيم من نفس المسار على أي استضافة. و`verify.sh` يتأكد أن كل صورة مُشار إليها ترجع 200 —الفشل يصير أحمر بدل ما يفضل مكسور بصمت.

## audit-evidence-remediation-split — 2026-10-08
أدلة التدقيق الأصلية (`evidence/{security,a11y,perf}`) **أرشيف لا يُمسّ**؛ كل إعادة قياس بعد الإصلاح تذهب في `evidence/remediation/`.
Why: التدقيق baseline لازم يفضل كما هو عشان أي مراجعة تقدر تقارن قبل/بعد؛ تعديل أدلة التقرير الأصلي = تلف السجل. والأدوات المنسوخة للتشغيل في remediation تُضبط `OUT = __dirname` عشان ما تكتبش فوق baseline بالغلط.
Verified: `GATE-2026-10-08.md` يستشهد بالمسارين معًا.

## core-cors-pinned-headers-everywhere — 2026-10-08
سِجنا CORS الخاص بنا بدل default في WordPress: إزالة `rest_send_cors_headers` من `rest_pre_serve_request` تُربط داخل **`rest_api_init` بـpriority 99** (مش أثناء تحميل الإضافة — core يسجّلها في `rest_api_default_filters()` على `rest_api_init@10`، فالإزالة المبكرة no-op)، وقارنّا Origin مع `home_url()/site_url()` لأن `get_allowed_http_origins()` يقصّ البورت (`http://localhost` بلا `:8889`) فيرفض أصل نفس-الموقع.
And: ترويسات الأمان تُرسَل من `send_headers` + `login_init` + **`init@0`** — REST API يخرج أثناء `parse_request` قبل `send_headers`، فبدون `init` الردود تطلع بلا ترويسات.
Why: الافتراضي بيسمح لأي origin مُسجَّل مقارنة بالمنصة؛ نحن نريد صفر منحنيات — موقع عرض واحد بنفس-Origin فقط.
Verified: `remediation/probe.txt` 68/0 (CORS evil=0 · own=1 · X-Powered-By غائب على REST · ترويسات ×6 صفحات).

## php-tune-lifecycle-validate-timestamps-0 — 2026-10-08
أداء wp-env على هذا الجهاز محكوم بـbind-mount بطيء (C1) → `scripts/php-tune.js` يكتب `zz-siraj-perf.ini` (realpath cache + opcache 192MB/20000 ملف + **`validate_timestamps=0`**) ويعيد تحميل Apache، موصول بـ`.wp-env.json lifecycleScripts.afterStart` (الاستدعاء في `@wordpress/env` `lib/commands/start.js:129` — مُتحقَّق تشغيليًا: بعد `wp-env start` يُعاد كتابة الـini تلقائيًا) **على الحاويتين wordpress وcli** — شائكان في `/var/www/html` لكن لكل منهما نظام ملفات مستقل، وبوابة verify 4b تقيس عبر cli (`ini_get=0`) — ويعاد تشغيله يدويًا بعد `docker restart` أو بعد أي تعديل PHP.
Why: `validate_timestamps=0` يلغي إعادة فحص آلاف الملفات لكل request (سبب TTFB الـ16–53s)؛ والـini داخل الحاوية يضيع مع إعادة إنشائها — الـlifecycle هو الضمانة، مش خطوة يدوية تُنسى.
Trade-off: أي تعديل PHP غير مرئي حتى `node scripts/php-tune.js` (ينتهي بـ`apache2ctl graceful`) — موثّق في README وCONVENTIONS.
Alternative considered: `revalidate_freq=60` وحده (أقل تغييرًا) — رُفض كحل دائم: أقل سقفًا وأضعف من إلغاء التحقق كله في بيئة dev معقولة.

## booking-confirmation-hmac-webhook — 2026-10-08
تأكيد الحجز = إشعار n8n عبر webhook موقّع **`hmac-sha256("<ts>.<rawBody>")`** + timestamp ≤300s، يُطلق من حدث domain جديد **`siraj_booking_created`** يُستدعى في `booking.php` **بعد** حفظ الـmeta — وليس من `save_post` (الاختبار أثبت أن `save_post` ي firing داخل `wp_insert_post` قبل كتابة meta → وصل payload بحقول فارغة وأُصلح بالفعل).
Why: TLS وحده لا يحمي webhook مكشوف (التخمين يستدعي معالجة)؛ والتوقيت يمنع replay. مطابق لنمط WooCommerce `X-WC-Webhook-Signature` مع زمن صلاحية.
Failure policy: timeout 3 ثوانٍ و`error_log` فقط — **الحجز أبدًا لا ينتظر n8n** (نبذة 10 أسطر في `n8n/README.md`).
Why n8n على خادم الصاحب: قاعدة ترخيص n8n (ممنوع استضافته لعميل على خادمك أنت) + صاحب البوت والبيانات هو صاحب المشروع.
Verified: `docs/evidence/n8n-sink-test.txt` — VALID بحمولة كاملة (id=32) + توقيع خاطئ 401 + timestamp منتهٍ 401 · ما بعد restart: `n8n-sink-e2e.txt` — e2e خضرّ (id=34) والسلسلة كاملة `signature:VALID skew=0`، وبدون listener استمر الحجز (سياسة الفشل) · `verify.sh` 50/50 يشمل `php -l notifier.php`.
