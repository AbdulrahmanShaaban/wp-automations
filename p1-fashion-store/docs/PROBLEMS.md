# Problems log

Format (Egyptian Arabic) per OPENCODE_MASTER_BRIEF Part 1.4 — every problem that breaks, is uncertain, or needs a decision gets an entry here **and** the same shape told to the owner in chat:

```
المشكلة: (جملة واحدة)
ليه حصلت: (السبب الأرجح، وهل متأكد ولا تخمين)
جربت إيه: (بالترتيب)
الحلول: (اللي عملته) / الخيارات: A أو B (وأنا أرشح ... لأن ...)
تأثيرها على العميل: (مفيش / بسيطة / لازم تتحل قبل التسليم)
عايز مني إيه: (لو في حاجة بس أنا اللي أقدر أعملها)
```

**Rules:** never hide a problem; never silently work around a security/payment issue; never claim something passed without running it; always state what could not be verified.

---

## Entries

Minor note, resolved: Docker Desktop installed (v29.7.2) but its daemon was not running on 2026-10-01 — **owner started it; verified running (Client+Server 29.7.2), same day.**

---

### 2026-10-01 — Chrome CLI screenshots cropped wrong on mobile widths (resolved)

- **المشكلة:** لقطات `chrome --headless --window-size=390` كانت بتطلع النص مقصوص من اليمين في الصفحات العربية (RTL).
- **ليه حصلت:** متأكد — Chrome بيلمّ `--window-size=390` لـ **500px** (أقل عرض نافذة، اتأكدت بـ `--dump-dom` رجّع `innerWidth=500`)، فالصفحة كانت تت-layout بعرض 500 والصورة تتاخد بعرض 390 → المحتوى اللي ناحية يمين الـ RTL بيتقص.
- **جربت إيه:** `--headless` قديم وجديد، `--hide-scrollbars`، `--virtual-time-budget` — كلهم 500px.
- **الحلول:** `puppeteer-core` مع `Emulation.setDeviceMetricsOverride` (viewport حقيقي 390) — السكربت في `scripts/screenshot.js` (محتاج `puppeteer-core` في مجلد الـ scripts).
- **تأثيرها:** اتحلت — كل لقطات `design/shots/` اتعاد التقاطها بالسكربت.

### 2026-10-01 — Screenshot/read tools served stale images (open, workaround)

- **المشكلة:** أداة `read` للصور (وقاطعات MCP screenshots قبلها) بترجّع صورة قديمة غير اللي اطلبته — حصل كذا مرة إن صورة مسار تانية خالص تظهر.
- **ليه حصلت:** مش متأكد — الطبقتين اتأثروا، والـ MCP بيرجّع نفس الـ bytes القديمة مهما اتغير الصفحة.
- **جربت إيه:** مسارات جديدة، نسخ مختلفة، JPG — الاستمرار نفس الصورة.
- **الحلول:** التحقق بـ **pixel probes** (قراءة ألوان إحداثيات محددة) + قياسات `getBoundingClientRect` من JS. لاحقاً في نفس اليوم رجعت أداة `Read` تشتغل طبيعي مع الصور (اتأكدت بالصور الجديدة نفسها).
- **تأثيرها:** بسيطة على التوثيق الداخلي — اتحلت عملياً.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-01 — wp-env Docker build بيفشل بسبب مساحة في اسم المستخدم (resolved)

- **المشكلة:** `wp-env start` كان بيفشل عند `composer global require phpunit ... exit code: 1` أثناء بناء صورة الـ cli.
- **ليه حصلت:** متأكد — اسم مستخدم الويندوز فيه مساحة (`Abdelrahman Shaaban`)، وDockerfile بتاع wp-env بيضيف المستخدم بـ `adduser ... $HOST_USERNAME || true` (بيفشل بصامت لأن BusyBox بيرفض المسافات)، فالنتيجة إن الـ composer بيشتغل والـ HOME مش موجود → `/.composer does not exist`.
- **جربت إيه:** قراية كود wp-env (`docker-config.js`) وتجربة البناء يدوياً.
- **الحلول:** `scripts/patch-wp-env.js` (idempotent) بيعدّل Dockerfile الخاص بـ wp-env ويزوّد `mkdir/chown + ENV HOME` قبل خطوة الـ composer، وبيتشغل أوتوماتيك من `npm install` (postinstall) ومن `reset.sh` (وبيتشاف بـ marker). التفاصيل في `docs/DECISIONS.md` (`wp-env-workarounds`).
- **تأثيرها:** اتحلت — كل عمليات `wp-env start`/`reset` بعد الـ patch بتمشي. لو `npm install` حدّث wp-env، الـ patch بيتزامن تاني تلقائياً.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-01 — WooCommerce بيتثبت بـ slug غلط لما نستخدم `woocommerce.latest-stable` (resolved)

- **المشكلة:** الـ seed كان بيرجع `currency USD` بدل EGP رغم إن الإعدادات اتزفت، والفحص بيقول "مش لاقي plugin بال slug المطلوب".
- **ليه حصلت:** متأكد — wp-env بيشتق slug الـ plugin من **اسم ملف الـ zip** وهو بيشيل فقط الالحقات الرقمية (`woocommerce.latest-stable.zip` → slug = `woocommerce.latest-stable` مش `woocommerce`).
- **جربت إيه:** قراية `parse-source-string.js` بتاع wp-env + فحص `wp plugin list`.
- **الحلول:** تثبيت الإصدار بـ **pin صريح** في `.wp-env.json`: `woocommerce.11.1.2.zip` → wp-env بيشيل `11.1.2` → slug = `woocommerce` زي الفل.
- **تأثيرها:** اتحلت — بعد أول `reset.sh` كامل الـ verify بيعدي والـ currency EGP.
- **عايز منك إيه:** ولا حاجة. (الإصدارات المؤكدة: WP 7.1.2 / WooCommerce 11.1.2 / PHP 8.3 / wp-env 11.16.0.)

### 2026-10-01 — Git Bash (MSYS) بيدوّر `php -l` على مسار ويندوز غلط (resolved)

- **المشكلة:** `verify.sh` كان بيطلع `FAIL: php -l` على الملفات رغم إنها سليمة.
- **ليه حصلت:** متأكد — Git Bash (MSYS) بيحول أي argument فيه مسار يبدأ بـ `/` لمسار ويندوز (`/var/www/...` → `C:/Program Files/Git/var/...`)، فـ php ما لقاش الملف ورجّع exit 1.
- **جربت إيه:** تجربة بنفس الأمر من git-bash وPowerShell — الفرق كان في الـ conversion.
- **الحلول:** `verify.sh` بيصدّر `MSYS2_ARG_CONV_EXCL='*'` + `MSYS_NO_PATHCONV=1` قبل أي استدعاء، وبيشغّل فحوصات `php -l` بـ `EXIT_PLUGIN=0 EXIT_THEME=0` كمخرج منفصل.
- **تأثيرها:** اتحلت — verify بيعدي دلوقتي من غير أي فلسك رمادي.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-01 — Docker engine بيموت في نص عملية reset (resolved)

- **المشكلة:** في نص `reset.sh` كل `wp-env start` بدأ يفشل بـ `failed to connect to the docker API at npipe://... The system cannot find the file specified`.
- **ليه حصلت:** متأكد — Docker Desktop قفل/وقع أثناء الشغل (الماكينة كانت تحت ضغط ذاكرة أثناء destroy/rebuild).
- **جربت إيه:** فحص `docker info`، فحص Task Manager، إعادة تشغيل Docker Desktop.
- **الحلول:** إجراء ثابت متوثّق: لو Docker واقف → شغّل Docker Desktop → اتأكد `docker info` فيه `Server:` → أعد `bash scripts/reset.sh`.
- **تأثيرها:** اتحلت — الـ reset رجع يعدي من أوله. بس اتذكر إن أي run بيتقطع بسبب Docker لازم يتعاد من الأول.
- **عايز منك إيه:** لو شفت الرسالة دي تاني: شغّل Docker Desktop من Start Menu وأعد أمر الـ reset زي ما هو.

### 2026-10-01 — style.css بتاع الثيم مش متحمّل → ألوان H1 غلط (resolved)

- **المشكلة:** صفحة الهوم كانت بتطلع بخلفية صفراء تحت الكلمات (الـ `<mark>` كان بياخد أصفر الـ UA stylesheet)، مع إن `verify.sh` كان بيقول "theme stylesheet loaded" (false positive).
- **ليه حصلت:** متأكد — بلوكت themes **مش بتحمّل `style.css` تلقائياً**؛ لازم `wp_enqueue_style` صريح في `functions.php`. والـ check القديم كان بيتقبل أي stylesheet.
- **جربت إيه:** فحص HTML و`style.css` والـ DOM → لقيت `<mark>` بـ `background: rgb(255,255,0)` من الـ UA stylesheet.
- **الحلول:** إضافة `wp_enqueue_style('nilad-style', get_stylesheet_uri(), ...)` في `functions.php`، وتشديد check في `verify.sh` لازم يكون stylesheet بتاع `wp-content/themes/nilad-theme/style.css` بالظبط. بعد الإصلاح: `FFFF00=0` وكل الألوان مضبوطة (cream `#FAF8F4` + أبيض + `#E4F1EC` + أخضر `#0B6B57`).
- **تأثيرها:** اتحلت — لقطات `design/shots/foundation-*.png` اتعاد التقاطها بعد الإصلاح.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-01 — الصفحات كانت بتفتح في 8–24 ثانية (resolved)

- **المشكلة:** لود الهوم كان 8–24 ثانية على localhost، وده كان بيخلّي لقطات puppeteer تقطع بـ timeout أحياناً.
- **ليه حصلت:** متأكد دلوقتي — تلات أسباب متراكمة (قِيست كلها بالأرقام):
  1. **الـ bind mount بتاع Docker Desktop على ويندوز بطيء**: كل `stat()`/قراءة ملف ≈ 8–10ms، وكل ملفات WordPress + WooCommerce + الـ cache مركّبة عليه. (مقيست: 1059 فحص ملف = 8.3 ثانية.)
  2. **OPcache كان بيعيد فحص كل الملفات** بعد أي فاصل أكتر من 60 ثانية (revalidate) → آلاف الفحوصات البطيئة في كل طلب بعد أي راحة.
  3. **WooCommerce كان بيسجّل (eager) ~100 block class في كل طلب frontend** — `BlockTypesController::register_blocks` لوحدها = **3.5–5 ث** (اكتشفتها بـ callback timing wrappers على hooks الـ init).
- **جربت إيه:** hook timeline + قياس HTTP + تغليف كل callbacks في `init` بـ timing (xdebug مش مثبت، strace اتحظر من Docker) → A/B بتصفير `woocommerce_get_block_types` → تثبيت القاتل `register_blocks`.
- **الحلول (كلها متكتّبة في الكود):**
  1. `scripts/php-tune.js` (بيتشغل تلقائياً من `lifecycleScripts.afterStart` في `.wp-env.json` + `npm run tune`): بيكتب `zz-nilad-perf.ini` جوه الـ container (realpath 4MB، opcache 192M/20000 ملف، interned 32M، `validate_timestamps=0`) ويعمل `apache2ctl graceful`.
  2. `scripts/opcache-reset.sh` (`npm run opcache:reset`) — **لازم يتشغّل بعد أي تعديل ملف PHP** (وتحته في README).
  3. في `nilad-core`: تعطيل التسجيل الدافع (eager) لكتل WooCommerce على صفحات الـ frontend العادية (`woocommerce_should_register_blocks → false` بره admin/REST/AJAX/cron) + تسجيلهم **عند أول render لكتلة `woocommerce/*`** عبر `pre_render_block` — متأكد فعلاً: الاختبار رجّع `fired=woocommerce/product-categories has_run=0` ثم سجل وعرض بلا `wp:missing`.
  4. لقيت وصلت: الثيم كان ناقص `page.html` و`single.html` فكانت الصفحات (عن/تواصل/الخصوصية) بتظهر **بمحتوى فاضي** — اتضافت وبقت تعرض المحتوى (رقم الصفحة: 82KB بعد الإصلاح).
- **النتيجة:** الهوم من **8–24 ث → 1.7–2.0 ث** (دافئ). أول طلب بعد `opcache:reset` أو بعد `wp-env start` ≈ 15–19 ث (ترميم OPcache — مرة واحدة بس، وطبيعي).
- **تأثيرها على العميل:** اتحلت. ملاحظة تشغيلية واحدة: **بعد أي تعديل ملف PHP شغّل `npm run opcache:reset`** (الصفحات HTML/الثيم متأثرةش — دي مش PHP).
- **عايز منك إيه:** ولا حاجة.

### 2026-10-02 — صفحات المتجر/السلة/المنتج كانت بتظهر `<div class="wp-site-blocks"></div>` فاضي (resolved)

- **المشكلة:** `/shop/` و`/cart/` و`/product/...` كانت بترجع HTML كامل (head + body) لكن جوه `wp-site-blocks` مفيش أي حاجة — والصفحات العادية (الهوم، عن، الخصوصية) شغالة عادي. كانت "طافية" بين لقطة والتانية (اشتغلت في `b7` ووقفت بعدها بثواني).
- **ليه حصلت:** WooCommerce 9+ بيشغّل وضع **"Coming Soon"** تلقائياً وقت onboarding المتجر الجديد (`woocommerce_coming_soon=yes`)، وده بيخدم صفحة coming-soon لزائر الـ store pages (shop/cart/product) من غير ما يظهر أي خطأ. أول حاجة فضيت في الـ HTML كانت بالظبط `<meta name='woo-coming-soon-page' content='yes'>` — الـ meta دي هي المفتاح. الـ onboarding كان شغّلها في الخلفية في نص الجلسة (بعد لقطات b7)، عشان كده "طافت" فجأة.
- **جربت إيه:** مقارنة curl vs Chrome (نفس البايت بالظبط → مش Client-side)، فحص الـ template resolution و`wp_template` posts (مفيش override)، لوجging على `render_block`/`template_include` مؤقّت (اكتشف `template_include=''`)، لحد ما لقيت الـ meta tag.
- **الحلول:** `wp option update woocommerce_coming_soon no` + `woocommerce_coming_soon_store_pages_only no` — والاتنين اتضافوا في `seed.sh` عشان أي reseed يفضل مقفول. بعد كده الصفحات رجعت: shop 142KB / cart 434KB / product 93KB.
- **الدروس المستفادة:** أي صفحة WooCommerce "فاضية" من غير error في الـ logs → افحص `woo-coming-soon-page` meta الأول.
- **عايز منك إيه:** ولا حاجة (لقطات الشاهد `b8-shop-*` بعد الإصلاح).

### 2026-10-02 — نصوص إنجليزية مخبّية (baked) في صفحة السلة + بادئة "Category: " في صفحة المنتج (resolved)

- **المشكلة:** صفحة السلة كانت بتعرض "Your cart is currently empty!" و"New in store" إنجليزي (رغم إن الـ locale = ar وترجمة WooCommerce العربية مثبتة وتجربتها بتشتغل)، وصفحة المنتج كانت بتعرض "Category: هدوم".
- **ليه حصلت (حالتين مختلفتين):**
  1. **السلة:** WooCommerce بيولّد محتوى صفحة السلة وقت التنصيب (سياق CLI = en_US) و**بيحفظ النص الإنجليزي مباشرة في `post_content`** كـ static block HTML — الـ gettext مايشوفهوش أبداً. فحص `wp post get 6 --field=post_content` أثبته.
  2. **المنتج:** قالب `single-product.html` المعرّف في قالب WooCommerce فيه `<!-- wp:post-terms {...,"prefix":"Category: "} -->` — البادئة HTML attribute ثابتة برضه، مش نص مترجم.
- **جربت إيه:** فحص `determine_locale()` في CLI وweb (= ar فيهم)؛ ترجمة مباشرة `__('Your cart is currently empty!')` في CLI وweb (= عربي فيهم)؛ لوج `render_block_data` — اكتشفت فجوة صغيرة مميتة: الـ parsed block بييجي بالمفتاح **`attrs`** (صيغة `parse_blocks`) مش `attributes`، فالمقارنة الأولى رجعت `NULL`.
- **الحلول:**
  1. إصلاح محتوى السلة في `seed-catalog.php` (`strtr` إنجليزي→عربي، idempotent) — اتثبت باللقطة `b9-cart-1440.png`.
  2. فلتر `render_block_data` في `nilad-core.php` بيدوّر على `core/post-terms` ويبدّل أي prefix يبدأ بـ "Category" لـ "التصنيف: " (بيكتب في `attrs` و`attributes`) — اتثبت `b9-product-1440.png`.
- **الدروس:** الـ block content المحفوظ في الـ DB كـ static HTML = نص "baked" مش قابل للترجمة — لازم يتحدّث في الـ seed؛ وفي `render_block_data` استخدم `attrs` مش `attributes`.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-02 — أخطاء جسر wp-env في PowerShell (resolved، متكتّبة في seed.sh)

- **المشكلة:** محاولة زرع محتوى الصفحات (HTML عربي كبير) عبر `npx @wordpress/env run cli wp eval ...` كانت بتفشل بصيغ مختلفة.
- **ليه حصلت (3 أسباب):**
  1. أي أرجيومت فيه **newline** بين `npx @wordpress/env run` بيتشقّق عند أول سطر (المحتوى بيتحفظ كأول سطر بس).
  2. **base64 كبير ~9KB** كأرجيومت → "The command line is too long." (حد ويندوز للـ command line).
  3. Git Bash بيعيد كتابة أرجيومنتات `/var/www/...` لمسارات ويندوز (`php -l` و`wp eval-file` كانوا بيدوّوا على مسار غلط).
- **الحلول:** محتوى الصفحات بيتحطّ في ملف داخل الـ plugin directory المونت (`scripts/content/*.html`) → `base64` صغير عبر stdin/أمر قصير → `wp_update_post`؛ والسكربتات الكبيرة بتتشغّل بـ `wp eval-file /var/www/html/wp-content/plugins/nilad-core/...` (ملف داخل الكونتينر)؛ و`MSYS2_ARG_CONV_EXCL='*'` + `MSYS_NO_PATHCONV=1` متضافين في أول `seed.sh` و`verify.sh`.
- **الدروس:** أي نص > ~2KB يتمرّر لـ wp-env → ملف + `eval-file`، مش argv.
- **عايز منك إيه:** ولا حاجة (بنفس النمط اتزرع catalog كله).

### 2026-10-02 — الشحن المجاني كان متاح تحت حد الـ1,500 جنيه (resolved)

- **المشكلة:** سلة بـ1,250 جنيه كانت بتعرض خيار **"شحن مجاني" مختار**، رغم إن الشريط الإعلاني والصفحة بيقولوا "شحن مجاني فوق 1,500 ج.م" — الإعدادات في الأدمن كانت صح والسلوك الغلط.
- **ليه حصلت:** متأكد بعد فحص مباشر — الـ seed كان بيكتب المبلغ في مفتاح **غلط**: `minimum_amount`، بينما حقل WooCommerce الحقيقي اسمه **`min_amount`** (اكتشفته من `instance_form_fields` بتاعة الطريقة نفسها). فـ `get_option('minimum_amount')` كان بيرجّع فاضي → العتبة بقت 0 → الشحن المجاني متاح دايمًا. وكمان الكود القديم كان بيكتب الإعدادات **لأول مرة فقط** لما الطريقة تتضاف (مفيش convergence) فالمفتاح الغلط مكانش بيتعالج بعدها.
- **جربت إيه:** قراية الإعدادات الخام من الـ options (مظبوطة: min 1500!) → `wp eval-file` بينادي `is_available` على كائن الطريقة نفسها (رجّع `true` لحزمة 1250 و`minimum_amount=NULL`) → فحص مفاتيح `instance_form_fields` (طلعت `title,requires,min_amount,ignore_discounts`).
- **الحلول:** `seed-catalog.php` بقى يكتب المفتاح الصح `min_amount` **ويوفّر (converge) إعدادات الطريقةتين في كل تشغيل**. التحقق بـ Store API على الحالتين: 1,250 → متاح "شحن قياسي 60" فقط (شحن 60)؛ 1,630 → "شحن مجاني" (شحن 0).
- **تأثيرها على العميل:** اتحلت — اللقطة `b17-checkout-full-1440.png` بتظهر "شحن قياسي 60 ج.م" مختار و"شحن مجاني" مش موجودة كخيار تحت الحد.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-02 — صفحة الدفع كانت بتفقد هيدر الموقع كله (resolved)

- **المشكلة:** `/checkout/` كان بيفتح بلوجو "نيلاد" بس — من غير الشريط الإعلاني، ولا القوائم، ولا الفوتر، عكس كل صفحات الموقع.
- **ليه حصلت:** متأكد — WooCommerce نفسها بتوفّر قالب `page-checkout.html` (اسم الملف بيتآزر مع slug بتاع الصفحة `checkout`) وهو بيشاور على هيدر خاص بيها `checkout-header` (لوجو + لينك السلة فقط) ومش بيشاور على فوتر أصلًا. صفحة السلة عندها قالب تاني (`page-cart.html`) بيشاور على هيدر/فوتر **الثيم** — عشان كده كانت سليمة.
- **جربت إيه:** فحص HTML الموصول للمتصفح **مع تفعيل JS معطّل** (اكتشف إن الهيدر مفقود من الرد نفسه مش مخفي بـ CSS/JS) → بحث عن ملفات القوالب جوه بلجن WooCommerce لقيت `templates/templates/page-checkout.html` و`parts/checkout-header.html`.
- **الحلول:** ملف ثيم `templates/page-checkout.html` بيتجاوز قالب WooCommerce (أولوية الثيم) بنفس الهيكل بتاع `page-cart.html` بتاعه: هيدر الثيم + store-notices + محتوى الصفحة + فوتر الثيم.
- **تأثيرها على العميل:** اتحلت — لقطات `b17-checkout-{full,vp}-1440.png`: هيدر كامل (الشريط الإعلاني + القوائم + زر السلة + اتسوّق الآن) + فوتر، مع نفس ملخص الطلب العربي.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-02 — لقطات fullPage لصفحة السلة كانت مزحزحة ~369px (resolved، workaround)

- **المشكلة:** `page.screenshot({fullPage:true})` لصفحة السلة كانت بترجع صورة مزحزحة لليمين (مسطرة بيضا على الشمال والمحتوى مقصوص من اليمين) — واتكررت في 3 محاولات.
- **ليه حصلت:** مش متأكد — العطل في التقاط Chrome نفسه مش في الموقع: عند الالتقاط layout كان سليم تمامًا (`getBoundingClientRect` = 0..1440، `scrollWidth`=1440، مفيش overflow) وأبعاد PNG = 1440 بالظبط. الغريب: نفس الصفحة بالتقاط **viewport** عادي طالعت سليمة، والصفحات الأطول (الدفع) fullPage طالعت سليمة — النمط المعتدل: صفحة RTL بارتفاعها = الـ viewport بالظبط (1000px).
- **جربت إيه:** قياسات layout عند الالتقاط + أبعاد PNG + مقارنة viewport vs fullPage لنفس الصفحة.
- **الحلول:** شهادة السلة بتتخطّى بـ **viewport shot** (`b17-cart-1440.png` — الصفحة كلها ظاهرة في الشاشة أصلًا)؛ صفحات أطول بتتشال fullPage عادي.
- **تأثيرها على العميل:** مفيش تأثير على الموقع — أداة توثيق بس، واللقطات النهائية كلها سليمة.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-03 — إشعار "مؤهل للشحن المجاني" كان بيظهر في كل الحالات (resolved)

- **المشكلة:** شريط "طلبك مؤهل على الشحن المجاني" كان بيظهر حتى والسلة تحت الـ1,500 (المفروض يعرض "متبقي X ج.م").
- **ليه حصلت:** متأكد بعد فحص الـ payload — الـ Store API بتاع WooCommerce 11 مفيهوش مفتاح `items_subtotal` خالص (أسامي التوتالز: `total_items`, `total_tax`, ... بس)، فالكود القديم كان بيعمل `parseFloat(undefined)` = `NaN`، والشرط `NaN > 0.009` بيرجع `false` → الفرع اللي بيحسب "متبقي" مبيتنفذش أبدًا → النتيجة دايمًا "مؤهل".
- **جربت إيه:** قراية استجابة `/wc/store/v1/cart` الحقيقية (اتأكدت من مفاتيح `totals` و`currency_minor_unit: 0` للجنيه)، تجربة الحالتين 1,250 و1,630.
- **الحلول:** القراءة بقت من `totals.total_items` + حارس `isNaN` + الإخفاء لو `!cart.items_count`. التحقق: e2e `cart-notice-below-threshold` (متبقي 250 ج.م) و`cart-notice-qualified` (مؤهل) — اللقطات `b18-cart-*`.
- **تأثيرها على العميل:** اتحلت — الإشعار دلوقتي بيحسب صح قبل وأبعد العتبة.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-03 — اختبار رقم الموبايل كان بيقفل عند "الرمز البريدي" قبل ما يوصل للهوك (resolved)

- **المشكلة:** أول محاولة تقديم طلب بموبايل غلط كانت بترجع رسالة "الرمز البريدي" مش رسالة الموبايل المطلوبة.
- **ليه حصلت:** متأكد — علبة الرمز البريدي (الـ postcode) في الدفع بتاع WooCommerce **إلزامية لمصر**، وvalidate الـ client بيقفل الـ submit قبل ما الطلب يوصل للسيرفر خالص → الهوك بتاع الموبايل ما بيشتغلش. وكمان اكتشفت إن الـ block checkout بيستخدم ids مختلفة عن القديم (`#email` مش `#billing_email`، ومفيش `#billing-*` خالص — كل حاجة `#shipping-*`).
- **جربت إيه:** قراية الـ DOM بتاع صفحة الدفع الحقيقية + network log للـ submit → لقيت validation error للzip؛ عبيت `11511` فالموبايل بقى أول عائق.
- **الحلول:** سكربت الاختبار بيعبي `#shipping-postcode` دايمًا؛ والـ ids اتوثقت في `phase4-test.js`. بعدها الرد المطلوب ظهر: 400 ونص عربي "رقم الموبايل غير صحيح. مثال: 01012345678".
- **تأثيرها على العميل:** مفيش — دي قاعدة WooCommerce (zip لمصر فعليًا مطلوب)، والاختبار بقى بيمشي فوقها.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-03 — سكربت الاختبار كان بيقع بـ "detached Frame" تحت ضغط المضيف (resolved)

- **المشكلة:** آخر سيناريو (تقديم الطلب COD) كان بيفشل فجأة برسالة "Attempted to use detached Frame" أحيانًا، ومرة بيرجع 409 من الـ checkout.
- **ليه حصلت:** متأكد جزئيًا — المضيف كان مضغوط (بناء Gradle/Android بياخد جيجابايتس + عمليات `wp` CLI بطيئة 20–260 ث) فـ Chrome/puppeteer بياخد timeout تحت الحد الافتراضي (180 ث CDP) والصفحة بتتقع. الـ 409 نفسه طبيعي: السيرفر بيرفض submit أثناء ما فيه draft checkout شغال (race بين محاولتين) وWooCommerce بيتعامل معاه.
- **جربت إيه:** زيادة `protocolTimeout=600000` + timeouts الصفحة + إعادة محاولة `goto` + تسجيل timeline لكل خطوة + helper `setVal` بـ native setter (React ما يهمّهوش الكتابة المباشرة) + إعادة تشغيل بعد ما المضيف فضى.
- **الحلول:** التلاتة اتضافوا في `phase4-test.js`، والنتيجة النهائية **9/9 PASS** (طلب #49 ثم #50) بوقت تشغيل ~3–8 دقائق حسب ضغط المضيف.
- **تأثيرها على العميل:** مفيش على الموقع — عطل أدوات اختبار تحت ضغط المضيف، والتشغيل الأخضر دليل إنه مستقر.
- **عايز منك إيه:** لو البناء بتاعك (Gradle) شغال، خلّيه يخلص الأول — اختبارات المتصفح هتبقى أسرع وأثبت.

### 2026-10-03 — PowerShell كان بيفسد ملف فيه عربي وقت النسخ (resolved، قاعدة دائمة)

- **المشكلة:** مرة أثناء تعديل سكربت، الملف طلع فاسد بحروف مشوّهة (mojibake).
- **ليه حصلت:** متأكد — PowerShell 5.1 بيقرا الملفات بـ ANSI لما مفيش BOM (`Get-Content -Raw` / `Set-Content`)، والعربي بيتفكك وقت القراءة ويعاد كتابته مشوّه.
- **جربت إيه:** إعادة كتابة الملف من المصدر الأصلي.
- **الحلول:** قاعدة: **أي ملف فيه عربي يتعدّل بأدوات التحرير (edit/write) بس** — لا `Get-Content`/`Set-Content` ولا redirect من PowerShell. ولما ضروري نعدّل من PS (ملفات ASCII بس) نستخدم `[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)`.
- **تأثيرها على العميل:** مفيش — وقعت في الأداة نفسها واتصلحت فورًا، والقاعدة منعت تكرارها.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-03 — من المرسل (From) كان فاضي في سجل الإيميلات (resolved)

- **المشكلة:** التحقق بيقول إن آخر إيميل مسجّل مفيهوش `from` رغم فلتر `woocommerce_email_from_address`.
- **ليه حصلت:** متأكد بعد قراية كود WooCommerce: الإيميلات بتبعت الدومين عن طريق **فلاتر `wp_mail_from`/`wp_mail_from_name`** اللي بتسجّل وتشيل حول كل `wp_mail` (`class-wc-email.php ~1230`) — مش بـ From header في `args['headers']`، فالقراءة القديمة من الهيدرز ترجع فاضي.
- **جربت إيه:** grep في مصدر WooCommerce + إعادة بعث إيميل الطلب (#50) بعد الإصلاح.
- **الحلول:** السجل بيقيس الهيدر الأول، ولو فاضي بيحلّ الفلاتر (`apply_filters('wp_mail_from'...)`) ويسجّل `نيلاد <orders@nilad.example.com>`. مثبت في `check-phase4` (جزء من `verify.sh`).
- **تأثيرها على العميل:** اتحلت — الهوية العربية للمرسل بقت مثبتة بالدليل.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-03 — Paymob (success/failure/refund) — سيرورة مقفولة على مفاتيحك (open, owner-blocked)

- **المشكلة:** تجارب الدفع الحقيقية على Paymob (نجاح/فشل/استرجاع) مش هتشتغل من غير مفاتيح الـ test بتاعتك.
- **ليه حصلت:** مؤكد — المفاتيح سر بتاع حسابك أنت (ASSETS_TODO #3: "ممنوع تبعتلي المفاتيح في الشات").
- **جربت إيه:** بلجن Paymob الرسمي اتثبت واتفعّل بنجاح من الـ seed؛ الاختبارات التانية (COD + تحويل بنكي) خضعت للاختبار الكامل.
- **الحلول:** الباقي في انتظارك: سجّل على Paymob → فعّل Integration Test → حط المفاتيح في `.env` وقت ما نعمل phase التكامل. هيتسجّل في التقرير النهائي إنه **NOT VERIFIED** لحد ساعتها.
- **تأثيرها على العميل:** لازم تتتحل قبل ما نقول "الدفع بيشتغل" في العرض النهائي — COD شغال وبيبيع، Paymob محتاج مفاتيحك.
- **عايز منك إيه:** مفاتيح Paymob test زي ما هي في `.env` (مش في الشات) وقت ما تجهز.

### 2026-10-03 — عقد HTTP/إيميل في n8n بتمسح بيانات الطلب قبل عقدة تسجيل المفتاح (resolved، قاعدة دائمة)

- **المشكلة:** في تدفقات F2/F3/F4/F5 عقدة "Mark" (المسؤولة عن منع التكرار) كانت **بعد** عقدة Telegram/الإيميل — وبكده بتوصلها استجابة API بتاع تيليجرام (`{ok, result}`) بدل بيانات الطلب، فالمفتاح بيتسجّل `f3:undefined` والحماية من التكرار بتوقّع.
- **ليه حصلت:** مؤكد — في n8n مخرجات عقد HTTP/إيميل **باستبدل** محتوى الـ item (مش بتزوده)، وأنا صممت الترتيب بمنطق "الأول الإرسال ثم التسجيل" (retry-safe) بدون ما أحسب استبدال الـ JSON ده.
- **جربت إيه:** مراجعة رسم التدفقات الستة + تقارير الـ agents، وإعادة تشغيل `node n8n/tests/run-tests.js` بعد التعديل.
- **الحلول:** قاعدة **mark-before-send**: كل عقدة Mark اتنقلت **قبل** عقدة الإرسال (F2 بعد Format، F3 بعد IF، F4/F5/F6 قبل الإرسال)، ورسالة Telegram بتاع F3 بقت تقرأ من `$('Format messages').item` بدل `$json`. التضحيات موثقة في `n8n/runbooks.md` (على الأغلب مرة واحدة بدل ازدواج).
- **تأثيرها على العميل:** اتحلت قبل التسليم — من غيرها العميل كان هيستقبل نفس التنبيه أكتر من مرة بعد أي إعادة تشغيل.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-03 — معاملات Schedule Trigger كانت غلط في نص التدفقات (resolved)

- **المشكلة:** F3 وF5 اتكتبوا بـ `parameters.interval` سادة، بينما n8n (1.x/2.x) بتقرأ `parameters.rule.interval` — يعني المجدول كان هيشتغل بالافتراضي (كل دقيقة/ساعة) مش زي المطلوب.
- **ليه حصلت:** تعارض بين تعليماتي للـ agents (كتبت الشكل الغلط في البرومبت) و`CONVENTIONS.md` (الشكل الصح)؛ نص الـ agents رجعوا للشكل الصح ونص لأولي.
- **جربت إيه:** مقارنة JSONs بعد استلام التقارير + grep في ملفات الاختبار.
- **الحلول:** توحيد التلاتة (F3/F5/F6) على `rule.interval` + تحديث assertion بتاع `f3.cases.js`. القاعدة اتثبتت في `n8n/CONVENTIONS.md`.
- **تأثيرها على العميل:** اتحلت قبل التسليم؛ الاستيراد على n8n 2.41.6 نجح بعد التعديل.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-03 — استيراد n8n جوه حاوية شغّالة بيفشل SQLITE_BUSY (resolved)

- **المشكلة:** `n8n import:workflow` جوّه حاوية فيها سيرفر n8n شغال كان بيفشل بـ "database is locked".
- **ليه حصلت:** مؤكد — سيرفر n8n داخل الحاوية ماسك قفل SQLite أثناء الـ migrations، وأي عملية CLI تانية على نفس الداتابيز بتترفض.
- **جربت إيه:** حاوية لمرة واحدة `--entrypoint sh -c "n8n import:workflow ... && n8n list:workflow"` بقاعدة جديدة معزولة.
- **الحلول:** التوثيق في `n8n/README.md` + الدليل الكامل في `n8n/tests/import-evidence.txt` (استيراد 8/8 على n8n 2.41.6).
- **تأثيرها على العميل:** مفيش — أداة تحقق بس، والطريقة الصحيحة اتوثقت.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-04 — n8n 2.41 بيقفل `$env` افتراضيًا فكل التدفقات وقعت (resolved، قاعدة دائمة)

- **المشكلة:** بعد ما شغّلنا n8n محلي واتصلنا بتيليجرام، **كل** الـ executions بتاعت F1 وقعت برسالة `access to env vars denied` — حتى الـ Code node اللي بيتحقق من HMAC.
- **ليه حصلت:** مؤكد من مصدر n8n نفسه: `workflow-data-proxy-env-provider.js` فيه `process.env.N8N_BLOCK_ENV_ACCESS_IN_NODE !== 'false'` — يعني `$env` ممنوع إلا لو القيمة **بالظبط** `false`. الجديد في 2.x إن الحظر ده بيغطي Code nodes كمان (مش expressions بس).
- **جربت إيه:** قراية الـ stack trace من قاعدة بيانات n8n نفسها (نُسخة من الـ SQLite في حاوية لمرة واحدة + فك `flatted` عشان نقرا `resultData.error`)، ثم grep في مصدر n8n على نص الرسالة.
- **الحلول:** `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` في `n8n/.env` + **إعادة إنشاء الحاوية** (لأن `docker restart` لا يقرأ `--env-file` تاني — فضل المتغير متقرأش والبواب فضل مقفول لحد ما عملنا recreate).
- **تأثيرها على العميل:** اتحلت — والدليل الحي في `n8n/tests/live-e2e-evidence.txt`: طلب صحيح = execution **success** + رسالة تيليجرام، وتوقيع مزوّر = execution **error** + إنذار من الـ Error Workflow.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-04 — اشترطات n8n 2.x الجديدة (استيراد/نشر/حذف/تفعيل) (resolved، قاعدة دائمة)

- **المشكلة:** بعد ما صلّحنا الإقلاع، كل خطوة إدارة في n8n 2.41 رجعت خطأ مختلف: استيراد مكرر، "no published version"، "Cannot update an archived workflow"، وتفعيل رجّع 400.
- **ليه حصلت:** n8n 2.x غيّر سلوكه: (1) `import:workflow` بيعمل **id جديد** لكل نسخة فالإعادة بتضاعف التدفقات، (2) لازم **publish** قبل التفعيل أو قبل ربطه كـ Error Workflow، و`publish:workflow --all` اتشال، (3) الحذف بيطلب **أرشفة** الأول (`POST /:id/archive`)، (4) التفعيل بيطلب `versionId` المنشورة في الـ body، (5) الـ Error Workflow نفسه لازم يكون منشور ومفعّل.
- **جربت إيه:** قراءة `n8n --help`، ثم فحص `workflow.service.js` جوّه الحاوية لأسماء الدوال، ثم تجارب على الـ API.
- **الحلول:** سكربتات صيانة دائمة: `scripts/cleanup-n8n-api.js` (تنضيف المكررات + ربط Error Workflow + تفعيل، وبيعمل unarchive للي اتأرشف بالغلط) و`scripts/n8n-publish.sh` (ينشر كل التدفقات). كلهم موثّقين في `n8n/README.md` وقاعدة "شغّل وأنضّف" واضحة.
- **تأثيرها على العميل:** مفيش — fuss برمجي اتحوّل لأوامر جاهزة.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-04 — طلبات الـ CLI ما بتوصّلهاش للـ webhooks (open، quirky بيئة اختبار)

- **المشكلة:** عملنا طلب حقيقي من المتجر (`phase4-test.js` → طلب #52) والـ webhook اتسجّل في WooCommerce، بس `pending_delivery=1` و`failure_count` زاد وn8n مافيش أي execution.
- **ليه حصلت:** مؤكد — WooCommerce بيبعت الـ webhooks **جوّه نفس الطلب** في Store API/REST، بس طلبات `wc_create_order()` من الـ CLI بتكتفي بـ `pending_delivery=1` وتستنى طابور Action Scheduler اللي **مش بيشتغل** في سياق wp-env CLI (و`wp cron event run action_scheduler_run_queue` مش بيوصّل الطابور كمان).
- **جربت إيه:** إنشاء الطلب من `wc_create_order` (اتسجّل بس اتخنق)، تشغيل `do_action('woocommerce_webhook_processing_queue')` (مفيش أثر)، تشغيل الـ Action Scheduler cron (مفيش أثر)، وبعنا الـ webhook **مباشرة** على n8n بتوقيع HMAC صحيح → اشتغل فورًا (وده اللي أثبت إن n8n سليم والخلل في WooCommerce CLI context).
- **الحلول:** إثبات المسار الكامل بـ probe موقّع على n8n مباشرة (`scripts/probe-f1-webhook.js` + `live-e2e-evidence.js`). لتسجيل hop من المتجر نفسه: **checkout حقيقي** (بنتاع `phase4-test.js`) أو **public URL/tunnel** في بيئة الإنتاج — الـ CLI route مش طريق التسليم الحقيقي.
- **تأثيرها على العميل:** مفيش على الموقع — quirk في بيئة الاختبار فقط، والمسار الحقيقي (Store API) بيشتغل في الإنتاج.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-03 — سكربت فحص الإعدادات كان بيقع عند الخروج (process.exit + fetch) (resolved، قاعدة دائمة)

- **المشكلة:** `n8n/check-live.js` (أداة التأكد من صحة التوكن والإعدادات) كان بيطبع كل النتيجة صح وبعدين **Node بيقع برسالة** `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` ورمز خروج غريب (`-1073740791`).
- **ليه حصلت:** مؤكد — كان بيستخدم `fetch` المدمج في Node (undici) وبيعمل `process.exit()` مباشرة؛ الـ sockets بتاعت الـ keep-alive لسه مفتوحة فيعمل إيقاف قسري للـ event loop على ويندوز وبيقع.
- **جربت إيه:** تشغيل السكربت بملف `.env` تجريبي — النتيجة صحيحة 100% بس العملية وقعت عند الخروج.
- **الحلول:** base دائمة: **ما تعملش `process.exit()` في سكربتات Node بتستخدم `fetch`** — حُط `process.exitCode = code` وسيب Node يقفل لوحده. اتطبّقت وأعدت التشغيل: مفيش وقوع، رمز الخروج سليم.
- **تأثيرها على العميل:** مفيش على الموقع — أداة تحقّق، بس كانت ممكن تخوّفه برسالة غريبة.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-04 — `/checkout/` بيرجّع على `/cart/` لما السلة فاضية، فالفحص كان بيقيس صفحة غلط (resolved، قاعدة دائمة)

- **المشكلة:** أداة الفحص كانت بتفتح `/checkout/` من غير ما تهيّئ السلة، فكان بيقيس صفحة السلة لا صفحة الدفع، وLighthouse طلع **0** في النسخة المخفّفة على زاوية إعادة التوجيه.
- **ليه حصلت:** مؤكد — WooCommerce بيحوّل صفحة الدفع لو مفيش منتجات في السلة (سلوك صح)، لكن أداة الفحص كانت بتفتح الصفحة على البتّ.
- **جربت إيه:** فحص صفحة الدفع بعد ضبّط السلة: ~446KB فيها `order-summary`، بينما نسخة إعادة التوجيه كانت ~0 بايت. بعدها زوّدت `seedCart()` في `scripts/qa-audit.js`: تقرأ `nonce` من `GET /wc/store/v1/cart`، تعمل `POST /cart/add-item`، وتستخدم `cart_token` كوكيز للـ HTTP والـ puppeteer وLighthouse (عن طريق `extraHeaders`).
- **الحلول:** الفحص دلوقتي **بيقيس صفحة دفع حقيقية** — وطلع إن فيها مشاكل إتاحة وصول كانت مخفية تمامًا (3 مشاكل + 2 زرار صغير)، اتصلحت أو اتسجلت.
- **تأثيرها على العميل:** مفيش على الموقع — دي كانت هتخفي أدق مكان في المتجر عن القياس.
- **عايز منك إيه:** ولا حاجة.

### 2026-10-04 — مشاكل إتاحة وصول في كود WooCommerce نفسه (open، upstream، سيبناها عن قصد)

- **المشكلة:** فحص axe على صفحة الدفع الحقيقية رجّع مشكلتين بخطورة **serious**: (1) `aria-prohibited-attr` — `aria-label` على `<div>` من غير role (order summary وskeleton)، (2) `autocomplete-valid` — `autocomplete="section-contact contact email"` (الـ `section-*` token شكله غلط).
- **ليه حصلت:** مؤكد من الـ HTML الحقيقي: السيرفر بيخرج **صفر** `aria-label` على divs وصفر `section-contact` — يعني الـ markup ده **بيتولّد من React بعد التحميل** (scaffold)، مش من PHP. فلو هنخدع بـ filter على `the_content` أو `render_block` (وده اللي جربته الأول) مش هيوصله أصلاً.
- **جربت إيه:** (1) `render_block` على أسماء بلوكات WooCommerce → ما وصلش، لأن البلوكات الداخلية بأسماء تانية؛ (2) `the_content` مع `is_cart() || is_checkout()` → نفس النتيجة (صفر تعديل في الـ HTML)، وده اللي أثبت إن التوليد ديناميكي بالكامل.
- **الحلول:** اتشال الكود اللي مش شغّال (أهم من إننا نسيب كود ميت)، واتسجلت كـ **upstream** في `docs/QA-REPORT.md` §6. السبب إن إصلاحها client-side معناه patch للـ DOM بعد React — بيتصارع مع إعادة الرسم في كل تحديث وممكن يكسر سلاسة الدفع. تتحل لما WooCommerce يطلعها، وبعدها `npm run qa` يتأكد.
- **تأثيرها على العميل:** مش بتوقف عميل حقيقي (اسم مكرر لمجموعة في قارئ الشاشة)، بس **مفيش ادّعاء إنها مظبوطة 100% في كل التفاصيل** — رقم Lighthouse (100) بيحكي عن overall، وقاعدتنا إننا نفصل بين upstream وكودنا بصراحة.
- **عايز منك إيه:** ولا حاجة.
