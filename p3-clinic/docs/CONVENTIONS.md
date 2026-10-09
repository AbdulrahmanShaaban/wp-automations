# Conventions

> هذا الملف **only project-specific deviations** — القواعد العامة تُراجَع في المهارات العالمية لا تُنسخ هنا.

- **عربية فقط، بلا i18n أصلاً** — لا طبقة ترجمة، لا `lang` switcher، لا ملفات `ar/en` (موقع عربي RTL واحد). القواعد التفصيلية: `arabic-rtl` skill.
- **علامة Demo** — كل عنصر خيالي يظهر عليه/في سياقه **Demo**، والـ footer يصرّح بأن العيادة تجريبية والصور stock توضيحية. لا `noindex` افتراضي كـ "طريقة الـ demo" هنا.
- **بلا ادعاءات طبية** (硬 rule من `design/brief.md`): لا ضمانات، لا نتائج علاج، لا before/after، لا أرقام/شهادات مُختلقة — راجع `docs/DECISIONS.md#content-demo-no-medical-claims`.
- **أسلوب الكتابة**: العربية للنثر، والمعرّفات والمسارات بالإنجليزية (مثلاً `scripts/verify.sh`) — نفس أسلوب `p1-fashion-store/docs/`.
- **مجلد العمل ليس git repo** — لا `git log` كسجل تاريخ؛ سجل التاريخ هو `docs/DECISIONS.md` (append-only) و`PLAN.md#Recently Completed`. إن أُضيف init لاحقاً، هذه القاعدة تُلغى.
- **`design/` قراءة فقط** — عقد معتمد (`APPROVED.md`)؛ أي تعديل عليه يمرّ عبر بوابة تصميم جديدة.
- **بوابة QA** — قبل أي ادعاء "تم": `/audit` ثم `/launch-check` (kit commands)، والتحقق عبر `scripts/verify.sh` — نمط P1.
- **تشغيل السكربتات على هذه الجهاز**: عبر Git Bash لا `bash` (WSL معطّل: `& "C:\Program Files\Git\bin\bash.exe" scripts/verify.sh`). داخل السكربتات، `MSYS2_ARG_CONV_EXCL`/`MSYS_NO_PATHCONV` تُضبط **per-command على أوامر الحاوية فقط** لا globally — الوضع العام يكسر `-o /dev/null` لـcurl الأصلي (ينتج `200000`).
- الوصولية والـ RTL والـ typograpy: راجع `accessibility-wcag` و `arabic-rtl` و `wordpress-woocommerce` — لا إعادة صياغة هنا.

## دروس المحتوى (2026-10-07) — اقرأها قبل ما تلمس القوالب
- **`printf … | grep -q` مع `set -o pipefail` = فشل كاذب**: grep -q بيخرج عند أول تطابق، وprintf بيموت SIGPIPE، والـpipeline بيرجع 141. ظهرت لما الصفحة عدّت 64KB (حجم الـpipe buffer). استخدم `case "$HTML" in *'dir="rtl"'*) …` زي باقي الفحوص في `verify.sh`.
- **القاعدة العامة `label{display:grid}` تكسر أي label فيه نص + span**: النص والـspan بيصيروا items في عمودين، والنجمة `*` بتقفز لتحت الحقل المجاور (نموذج الحجز طلع مظبوط على 390 وكسر على 1440!). الحل: override `label{display:block}` جوه `.siraj-booking` + `.siraj-label{min-height:calc(2*1.5em)}` عشان الـinputs تتحاذى في شبكة عمودين.
- **`file:./assets/...` ما بيترجمش على الواجهة** — استخدم المسار الجذري للثيم (DECISIONS `theme-images-root-relative`)، وحط فحص 200 لكل صورة في `verify.sh`.
- **الصفحة الكبيرة بتتقصّ أحيانًا في `curl` عبر PowerShell**: اكتب في ملف (`curl -o file`) واقرأ من الملف، متحاولش تقرا 70KB جوّه متغيّر واحد.
- **`wp:image` داخل `wp:html` لا يُحلَّل**: كل أقسام الـfront-page جوه كتلة `wp:html` واحدة (قرار تصميم)، فأي تعليق بلوك جوّاها مجرد نص عادي.
- **قاعدة «مفيش صور أشخاص» مُطبَّقة آليًا** — `verify.sh` بيفشل لو `team-ortho|band-exam` ظهر في الصفحة أو في `assets/img` (DECISIONS `no-people-photos-in-demo`).
- **اختبر النموذج في متصفح حقيقي**: `scripts/booking-e2e.js` بيملا الفورم ويضغط submit فعليًا وبيصوّر 3 حالات (invalid / valid / honeypot) — اختبارات PHP جوه العملية ما بتغطيش الـHTTP path.

## دروس الـmotion (2026-10-07)
- **`@supports (animation-timeline: view())` مش ضمان**: متصفح يـparse الشرط بدون ما يقود الـtimeline بيسيب كل الأقسام عند `opacity:0` لأن `animation-fill-mode: both`. القياس: **24/24 عنصر مخفي** والـJS معطّل. شِيلنا المسار كله — الـreveal بقى JS-only مع صنف `js-motion` هو اللي بيفعّل الحالة المخفية، ف absence السكربت = محتوى مرئي مضمون (`scripts/motion-check.js` بيقيس 4 أوضاع: JS / no-JS / reduced-motion / stub).
- **`CSS.supports('animation-timeline','view')` رجّع false** لأني نسيت الأقواس: القيمة لازم `'view()'` مش `'view'`. الفرق ده كان بيخلي الـJS يفكّر إن الدعم ناقص ويفعّل陪 padding على CSS شغّال — أساسًا لازم تتحقق من الآلية قبل ما تبني عليها.
- **الـreveal بالـJS لازم يشتغل مرتين في الاختبار**: مع الـscript وبلا، قبل التحقق ما consider خلص.
- **خلّي `.reveal` مرئي في الـCSS الأساسية دايمًا**، والخفاء مربوط بصنف الـJS. أي inversion هنا = درس P1 (محتوى مخفي) بيتكرر.
- **`Get-Content`/`Set-Content` في PowerShell 5.1 ضاعوا العربي**: الـround-trip قرا الملف كـANSI (مفيش BOM) وكتبه UTF-8 = double encoding، والصفحة طلعت tofu في المتصفح والـverify مرّ. **استخدم الـwrite/edit tools للملفات العربية**، أو .NET صريح. دلوقتي `verify.sh` فيه بوابة encoding (بيطلب «مسار العمل» ويمنع signatures الم mojibake) — الفرج إني ضفت الفحص بعد ما الكارثة حصلت.

## دروس الـQA/remediation (2026-10-08)
- **المتغيّرات البيئية تسرّب بين الأوامر في نفس الجلسة**: ضبط `$env:MSYS_NO_PATHCONV='1'` لأمر wp-env ثم تشغيل `verify.sh` في نفس المسار يورّثه للـchild process → curl الأصلي يكسر (exit 23) ويطبع الكود قبل الفشل = `200000`. الضبط per-command **داخل** السكربت يحميه؛ لا تضبطه على مستوى الجلسة قبل تشغيل أي سكربت فيه curl. (أصل الـ200000 موثوق في سطر 6–12 من `verify.sh` نفسه).
- **`wp option list --search` يخفي صفوف transients** (الناتج يبدو كأن المفتاح مش موجود) → استخدم `wp transient get/delete <key>` مباشرة.
- **تمرير كود PHP متعدد الأسطر لـ`wp eval` عبر npx → wp-env يفشل صامتًا** (الاقتباس يتشوّه في الطريق) → احسب المفاتيح محليًا (node crypto md5/hmac) واستدعِ `wp option get`/قارن من الشل.
- **`/var/log/apache2/error.log` symlink إلى `/dev/stderr`** → `tail` يعلّق للأبد. سجلات Apache: `docker logs <wordpress-container>`.
- **أداة تدقيق منسوخة قد تكتب فوق الأدلّة الأصلية**: افحص `OUT = path.join(__dirname,'..')` قبل نسخ أي أداة — صحّحناه إلى `OUT = __dirname` في نسخ remediation (DECISIONS `audit-evidence-remediation-split`).
- **بعد أي `wp-env start`**: permalinks تعود date-based → تُصلحها `bash scripts/seed.sh` (التدفق start→seed→verify) وتراقبها بوابة verify. الـini لا ينجو من إعادة إنشاء الحاوية لكن `afterStart` يعيد كتابته تلقائيًا (مُتحقَّق تشغيليًا 2026-10-08 — الاستدعاء `@wordpress/env` `start.js:129`) **على الحاويتين wordpress وcli** (نظاما ملفاتهما مستقلان — بوابة verify 4b تقيس عبر cli). وبعد أي تعديل PHP يدويًا: `node scripts/php-tune.js`.
- **لا تستنتج أن ميزة مكتبة "ميتة" من grep جزئي**: grep على `lib\*.js` وحده لم يجد مستدعي `executeLifecycleScript` (الحقيقة في `lib/commands/start.js:129`) — أكمل البحث لكل الحزم قبل تغيير إعداد/توثيق اعتمادًا على "dead code".
