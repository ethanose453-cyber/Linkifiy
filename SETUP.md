# دليل ربط الفورم بـ Google (Sheets + Drive + إشعار إيميل)

الفورم كيخدم بدون Tally. البيانات والملفات كيمشيو **لحساب Google ديالك**.
الوقت المطلوب: ~5 دقائق. ماخاصكش تكون مبرمج.

---

## الخطوة 1 — أنشئ Google Sheet
1. سير لـ [sheets.new](https://sheets.new) وأنشئ جدول جديد، سمّيه مثلاً `Linkify - تسجيلات`.
2. من الرابط ديال الجدول، انسخ الـ **ID**:
   ```
   https://docs.google.com/spreadsheets/d/[هادا هو الـ ID]/edit
   ```

## الخطوة 2 — أنشئ مجلد فـ Google Drive
1. سير لـ [drive.google.com](https://drive.google.com) → **New → Folder** → سمّيه `Linkify - ملفات`.
2. حلّ المجلد، ومن الرابط انسخ الـ **ID**:
   ```
   https://drive.google.com/drive/folders/[هادا هو الـ ID]
   ```

## الخطوة 3 — أنشئ الـ Apps Script
1. سير لـ [script.new](https://script.new) (كيفتح محرر Apps Script جديد).
2. مسح أي كود كاين، ولصق **كامل محتوى** الملف [`apps-script/Code.gs`](apps-script/Code.gs).
3. فوق فالكود، عمّر `CONFIG` بالقيم ديالك:
   ```js
   const CONFIG = {
     SHEET_ID:        "ID ديال الجدول من الخطوة 1",
     DRIVE_FOLDER_ID: "ID ديال المجلد من الخطوة 2",
     NOTIFY_EMAIL:    "بريدك@gmail.com",
   };
   ```
4. حفظ (💾 أو Ctrl+S).

## الخطوة 4 — انشر الـ Web App
1. فوق على اليمين: **Deploy → New deployment**.
2. فـ "Select type" اختار ⚙️ → **Web app**.
3. عمّر:
   - **Description:** Linkify form
   - **Execute as:** `Me` (أنت)
   - **Who has access:** `Anyone` ← مهم باش الفورم يقدر يرسل
4. اضغط **Deploy** → غادي يطلب منك **Authorize access** → اختار حسابك → "Advanced" → "Go to ... (unsafe)" → **Allow**.
   > (رسالة "unsafe" عادية حيت السكريبت ديالك أنت، ماشي منشور.)
5. غادي تحصل على رابط بحال:
   ```
   https://script.google.com/macros/s/AKfyc..../exec
   ```
   **انسخو.**

## الخطوة 5 — لصق الرابط فالفورم
1. حلّ ملف [`form.js`](form.js).
2. فالسطر الأول تقريباً، بدّل:
   ```js
   const GOOGLE_SCRIPT_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
   ```
   بـ:
   ```js
   const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfyc..../exec";
   ```
3. حفظ، اعمل commit/push (أو خلّيني نديرها أنا).

---

## ✅ اختبار
- حل `index.html`، عمّر الفورم، وصيفطو.
- خاص: يبان "🎉 مبروك"، تدخل صف جديد فالـ Sheet، يتحطو الملفات فمجلد Drive، ويوصلك إيميل.
- لاختبار الباكند وحدو: حلّ رابط الـ `/exec` فالمتصفح → خاص يبان `{"status":"ok"...}`.

## ⚠️ ملاحظات مهمة
- **كل تعديل فـ Code.gs** → خاصك تعيد النشر: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy** (الرابط كيبقى نفسو).
- **الخصوصية:** الملفات كتبقى **خاصة** فـ Drive ديالك (ماشي عمومية). هادا مهم — راجع نقطة CNDP فالـ README.
- **حدود مجانية:** ~100 إيميل/نهار، وDriveApp/Sheets فيهم حصص يومية واسعة. كافية بزاف للـ MVP.
- إيلا بغيتي تكبّر لاحقاً (آلاف التسجيلات/نهار، أو ملفات كبيرة): ننتقلو لباكند حقيقي (Supabase مثلاً).
