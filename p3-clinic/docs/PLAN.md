# Plan — P3: عيادة سِراج للأسنان (Demo)

الموجز: `design/brief.md` · العقد: `design/APPROVED.md` · المرجع المُنفَّذ منه: `p1-fashion-store`.

## Current State
بوابة التصميم **نجحت (2026-10-06)**: الاتجاه **A «الروشتة»** معتمد في `design/APPROVED.md`، والمعاينة `preview-a.html` مُتحقَّق منها في المتصفح (حركة + صور حقيقية + شعار).

**الأساس (Foundation) مكتمل ومُتحقق منه (2026-10-07):**
- بيئة: `.wp-env.json` (port **8889**, PHP 8.3, `testsEnvironment:false`, بلا WooCommerce) + `scripts/patch-wp-env.js` مطبَّق · Docker/wp-env شغّالان · `npm start` 28–98s.
- ثيم `siraj-theme`: `style.css` (tokens A مطويّة + header/hero/كارت/فوتر، بلا letter-spacing غير صفر، بلا Cairo/Inter، radius 14px وحيد) · `theme.json` v3 (palette A, Alexandria, hero clamp, root padding 0 — الـ`.container` يدير العرض) · `functions.php` (خطوط self-hosted أولاً + CDN fallback، `--siraj-logo` من `get_theme_file_uri`، favicon wp_head) · قوالب: `front-page` (هيرو RX—001 `wp:html`)، `index/page/single/404` · `parts/header.html` (navigation بـ`overlayMenu:"mobile"` — لا `display:none` بلا toggle) + `parts/footer.html`.
- خطوط: `scripts/fetch-fonts.mjs` — Alexandria variable: ملفَين وحيدَين (arabic+latin ≈61KB) + `assets/css/fonts.css` (10 faces) — درس audit P1 مطبَّق من الولادة.
- plugin `siraj-core`: `siraj-core.php` (ذري) + `seed-wp.php` (boot واحد idempotent: هوية، WPLANG=ar، صفحات home/services/team/contact، حذف sample-page + hello-world، page_on_front، permalinks `/%postname%/`).
- سكربتات: `scripts/seed.sh` (language file-check + تفعيل + seed — أُشغّل مرتين = لا تكرار) · `scripts/verify.sh` (**29/29 ALL PASS**).
- تحقق بصري: أدلة `docs/evidence/foundation-{1440,1440-full,1024,390,390-menu,services-1440}.png` — كلها مفحوصة (الموبايل + القائمة المفتوحة + صفحة subpage + الفوتر)، console نظيف.
- إصلاحان أثناء التحقق: (1) `backdrop-filter` على الهيدر كان يحبس قوارب `position:fixed` في صندوق الهيدر → تُعطَّل أثناء فتح القائمة (`html.has-modal-open .site-header`); (2) زرار CTA في الهيدر لفّ سطرين على 390 → وسّع selector ليشمل `.wp-block-button__link`.

## In Progress
- [x] **بوابة P1** — `docs/AUDIT/GATE-2026-10-06.md` صدرت NO-GO بـ7 blockers، وأُعيدت **GO (مشروطة)** بعد إغلاقها全部 والتحقق (`p1/docs/AUDIT/evidence/remediation/`).

## Content build + booking (2026-10-07) — مكتمل ومتحقق
- **الأقسام** في `front-page.html`: الخدمات 01–06 بأسعارها، معرض صور (3 صور أدوات/زرع)، الفريق (بطاقات monogram — **بلا صور أشخاص**)، مسار العمل 4 خطوات، FAQ (5 أسئلة `details/summary`)، شريط تواصل، ودعوة حجز → `/book/`. كل قسم له `id` والروابط الداخلية بتتحقق (0 hash مكسور).
- **الصور**: 5 صور بسموح بها فقط بعد فحص بصري — استُبعد `team-ortho.jpg` (طبيب راجل) و`band-exam.jpg` (وجه مريض) نهائيًا؛ القرار `no-people-photos-in-demo` ومُنفَّذ كـgate في `verify.sh`.
- **نموذج الحجز** `siraj-core/booking.php` (shortcode + CPT خاص `siraj_booking` + nonce + honeypot + تحقق كامل) وصفحة `/book/` من الـseed.
- **محتوى الصفحات** صار في `seed-wp.php` (services/team/contact/book) والـseed بقى يحدّث المحتوى إذا اختلف (قرار `seed-owns-page-content`).
- **الأدلة**: `docs/evidence/content3-report.json` + 10 لقطات (1440/390 × 5 صفحات) + `booking-invalid-390.png` + `booking-success-390.png` + تقرير `booking-e2e.js` (invalid → رسالة داخل الحقل + `aria-invalid` + القيم محفوظة · valid → `role="status"` · honeypot → رفض · **صف واحد مخزّن** #24).
- **`scripts/verify.sh`: 44/44 ALL PASS** (كان 29) — Includes: نموذج الحجز + nonce + honeypot + عدم وجود shortcode خام، الأقسام، CTA الحجز، 4 صور ترجع 200، بوابة «مفيش صور أشخاص»، `php -l` لـ`booking.php`.
- **إصلاحات أثناء التحقق البصري**: (1) `label{display:grid}` العام كسر نموذج الحجز على 1440 → override + تثبيت ارتفاع الـlabel؛ (2) `file:./` في الصور ما بيترجمش → مسارات جذرية + فحص 200؛ (3) أهداف الفوتر 18pxCheckbox 22px → ≥24px؛ (4) `grep -q` + `pipefail` فشل كاذب مع صفحة >64KB → `case` (الدروس في `CONVENTIONS.md`).

## Motion phase (2026-10-07) — مكتمل ومتحقق
- **Reveal-on-scroll** على 24 عنصر (section heads + صفوف الخدمات + الصور + كروت الفريق + الخطوات + الكتلةالس + دعوة الحجز)، مع stagger داخل كل مجموعة.
- **الأمان أولًا**: `.reveal` مرئي في الـCSS الأساسية؛ حالة الإخفاء مربوطة بصنف `js-motion` اللي بضيفه السكربت بنفسه → **بدون JS المحتوى كله ظاهر** (المقاس: 24/24). `prefers-reduced-motion: reduce` → السكربت مش بيتفعّل أصلًا + CSS backup بـ`!important`.
- **قررتُ ألّا أستخدم scroll-driven CSS** بعد القياس: `@supports (animation-timeline:view())` + `fill-mode: both` سبّب **24/24 مخفي** والـJS متعطّل، و`CSS.supports()` رجّع false بسبب قوسين ناقصة (`'view'` بدل `'view()'`). قرار موثّق في CSS نفسه + `DECISIONS.md`.
- **بلا GSAP**: البريفيو كان بيحمّل GSAP من CDN؛ عيادة تجريبية مش محتاجة سكربت خارجي render-blocking (نفس درس خطوط P1).
- **الأدلة**: `scripts/motion-check.js` → `docs/evidence/motion-report.json` + 3 لقطات (`motion-css-path-1440`، `motion-js-path-1440`، `motion-nojs-1440`).

## حادثة encodings (2026-10-07) — بوابة جديدة
`Get-Content`/`Set-Content` في PowerShell 5.1 double-encoded العربي في `front-page.html` (الصفحة طلعت tofu). أُعيدت كتابة القالب بـUTF-8 صحيح، و**أُضيفت بوابة encoding في `verify.sh`** (presence حقيقي لعبارة «مسار العمل» + منع mojibake signatures) — `verify.sh` الآن **46/46 ALL PASS**.
الدروس في `CONVENTIONS.md`: استخدم أدوات الكتابة للملفات العربية، واقيس كل آمية متصفح قبل ما تبني عليها.

## QA audits + remediation (2026-10-08) — مكتمل، بوابة GO
- **3 تدقيقات baseline**: `docs/AUDIT/security.md` (28) · `a11y-arabic.md` (8) · `perf-seo.md` (15) — الأدلة الأصلية لم تُمسّ، وكل أدلة الإصلاح في `docs/AUDIT/evidence/remediation/`.
- **الإصلاحات**: style.css (F1 skip-link/F8) · header/footer (F3/F4 + روابط /book/) · front-page (webp + width/height + FAQPage JSON-LD) · seed (F2/M1/M3/H4) · `.wp-env.json` (WDD=false، file mods ممنوعة، `lifecycleScripts.afterStart` → php-tune) · `hardening.php` (headers + CORS pin + throttles) · `seo.php` · booking throttle+focus · صور webp (−81%) · `verify.sh` gates.
- **القياس بعد الإصلاح**: security probe **68/0** · login-throttle **9/0** · booking-throttle **11/0** · axe **0 violations ×10 تركيبات** · F1 مرسوم+hit-testable · headingSkips=[] · `successFocused=true` · Lighthouse home **100/100 a11y/SEO** · **verify.sh 50/50 ALL PASS** · booking-e2e أخضر.
- **الحكم**: `docs/AUDIT/GATE-2026-10-08.md` = **GO** (أبواب النشر المقبولة موثّقة: shuffle-salts/rename admin، رؤوس cache، قياس performance بعد النشر، n8n الحيّ owner-blocked).
- **درس بيئي**: C1 جذوره bind-mount بطيء → `scripts/php-tune.js` (validate_timestamps=0) موصول بـafterStart؛ بعد أي تعديل PHP أعد تشغيله.

## n8n booking confirmation (2026-10-08) — مكتمل ومُختبَر (live = owner-blocked)
- **المحفّز**: حدث domain `siraj_booking_created` يُطلقه `booking.php` **بعد** حفظ الـmeta كاملة (save_post كان ي fire داخل `wp_insert_post` قبل الـmeta — عيوب اكتُشفت بالاختبار وأُصلحت بفعل صريح).
- **المرسل**: `siraj-core/notifier.php` — payload `booking.created` (اسم من `post_title` + موبايل `+20…` + خدمة/label عربي + تاريخ + ملاحظات) + توقيع `X-Siraj-Signature: v1=hex(HMAC-SHA256("<ts>.<rawBody>"))` + `X-Siraj-Timestamp` (skew ≤300s)، timeout 3s، الفشل = `error_log` فقط (الحجز لا يعتمد على n8n).
- **التدفّق**: `n8n/workflows/booking-confirmation.json` (Webhook rawBody → Code verify+normalize → IF → Respond 200/401 → Telegram) + `error-alert.json` (Error Workflow) + `n8n/README.md` (runbook + خطوات التركيب).
- **الاختبار المحلي**: `scripts/n8n-sink.js` + `docs/evidence/n8n-sink-test.txt` — **VALID بحمولة كاملة** (id=32) · توقيع خاطئ → 401 · timestamp منتهٍ → 401 · الاتصال container→host جاهز (`host.docker.internal:9333`).
- **التشغيل الحيّ**: على n8n صاحب المشروع (license rule) — الخطوات في `n8n/README.md`؛ الخيارات مضبوطة حاليًا على sink المحلي.

## Next (مرتَّبة بالأولوية)
1. ~~Handoff~~ ✅ — سُلّم في الشات (2026-10-08): حالة المشروع + تدفق التشغيل + أبواب النشر في `GATE-2026-10-08.md` + runbook في `n8n/README.md`.
2. ~~n8n flow~~ ✅ · ~~QA gate + remediation~~ ✅ · ~~Content/Booking/Motion~~ ✅ · ~~اختبار إعادة التشغيل~~ ✅.
3. الباقي كله owner-blocked: نشر فعلي + n8n live + shuffle-salts/تعريب admin على خادم الصاحب.

## Recently Completed
- [x] **تحضير المستودع للرفع (2026-10-08)** — تنظيف: 236 لقطة/16 log (‎44MB)، `.gitignore` موحّد للورشة (أسرار/caches)، فحص index خالٍ من hex/مفاتيح، `.env` الحيّ متجاهَل، إزالة `.git` الفارغ من p1، README جذر · جاهز محليًا (8d616b8 + 4259c8e) — **الريبو النهائي ينتظر الاسم الجديد** من الصاحب (محاولة الرفع على Delivery-App أُزيلت بالكامل: remote main = commit فاضي بلا ملفات)
- [x] **اختبار متانة إعادة التشغيل (2026-10-08)** — `wp-env start` كامل: afterStart أعاد كتابة php-tune ( wordpress **و cli** — السكربت وُسّع للثانيتين) · permalinks رجعت date-based → `seed.sh` أصلحتها · بوابة verify جديدة **4b php-tune** → **50/50** · سلسلة الحجز كاملة بعد restart: e2e خضرّ + notifier → sink `signature:VALID` (id=34) · ARCHITECTURE أُعيدت كتابتها للواقع (لا GSAP، n8n مبني)
- [x] **n8n booking confirmation (2026-10-08)** — notifier HMAC + workflow + error alert + اختبار sink محلي (VALID/401)
- [x] **QA audits + remediation (2026-10-08)** — 3 تدقيقات + إصلاحات + إعادة قياس → `GATE-2026-10-08.md` GO (verify 50/50)
- [x] **Foundation (2026-10-07)** — wp-env 8889 + siraj-theme + siraj-core + seed/verify + أدلة بصرية (29/29)
- [x] بوابة التصميم (2026-10-06) — A معتمد + معاينة مُتحقَّق منها + شعار أصلي + صور Unsplash محلياً
- [x] تأسيس `docs/` + `README.md` (2026-10-06)

## Risks
| الخطر | الأثر | المعالجة |
|---|---|---|
| صور stock تُقرأ كعيادة حقيقية | مخاطر ثقة/امتثال | نص الـ copy + footer يصرّح أنها توضيحية (DECISIONS `content-demo-no-medical-claims`) |
| Docker/ wp-env يموت فجأة (تكرّر مرتين) | يوقف verify/البناء | إعادة `Docker Desktop` + `npm start` (28s) — موثَّق في هذه الجلسة |
| انتشار(scope creep) نحو أنماط P1 (WooCommerce/متجر) | تكلفة ووقت | ممنوع: عيادة لا متجر — راجع DECISIONS `stack-wordpress-block-theme` |
| تعارض منافس (وكيل يمسّ نفس الملفات) | كتب مكررة | كل ملف مملوك لجهة واحدة؛ `docs/` + `README.md` لي أنا |
