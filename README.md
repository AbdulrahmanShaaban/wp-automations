# ورشة التسليمات — Delivery Workspace

مستودع التسليمات المكتملة وملفات البحث — **مرفوع على**: <https://github.com/AbdulrahmanShaaban/wp-automations> (public · `main`).
كل مشروع **مستقل** (هويته، أوامر تشغيله، وبوابته) — والمجلد الجذري يجمع ملفات البحث المشتركة.

## المشاريع

| المجلد | المشروع | التقنيات | الحالة |
|---|---|---|---|
| `p1-fashion-store/` | متجر أزياء عربي (Demo) | WordPress + WooCommerce + n8n + بوابات دفع | ✅ مسلَّم — بوابة GATE: GO |
| `p3-clinic/` | عيادة سِراج للأسنان — حجز مواعيد (Demo) | WordPress block theme + حجز خاص + n8n HMAC | ✅ مسلَّم — بوابة GATE: GO |

- تفاصيل كل مشروع: `README.md` داخله.
- ملفات البحث المشتركة في الجذر: `MARKET_RESEARCH.md` · `OPENCODE_MASTER_BRIEF.md`.
- سياق وقرارات كل مشروع: `docs/` داخله (`PLAN` · `ARCHITECTURE` · `DECISIONS` · `CONVENTIONS` · `AUDIT/GATE`).

## التشغيل السريع (لأي مشروع)

```bash
cd <p1-fashion-store | p3-clinic>
npm install          # wordpress/env + أدوات
npm start            # الموقع على http://localhost:8888 (p1) أو 8889 (p3)
bash scripts/seed.sh    # محتوى idempotent
bash scripts/verify.sh  # بوابة القبول — لا تدّعِ "تم" قبلها
```

## سياسة المستودع

- **الأسرار لا تُرفع**: `.env` و`*.local.*` في `.gitignore` — القيم الحيّة محلية فقط (wp options + ملفات env). `.env.example` (القوالب) يُرفع.
- **اللقطات (screenshots) حُذفت** لتقليل الحجم وهي قابلة لإعادة التوليد بالسكربتات — ما تبقى من أدلة هو JSON/TXT/MD داخل `docs/` و`docs/AUDIT/evidence/`.
- **`node_modules/` والـcaches متجاهَلة** (تعاد بـ`npm install`).
