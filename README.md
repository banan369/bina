# بينا — نسخة ويب جاهزة للربط والنشر

**بينا — الخير يتبادل** منصة مجتمعية عربية RTL لتبادل المساعدة والمهارات بدون مقابل مادي.

## ما يعمل الآن
- واجهة رئيسية كاملة ومتجاوبة.
- مجتمع بصري متنوع بدل صورة شخصين فقط.
- تصفح "أحتاج مساعدة" و"أقدر أساعد" مع البحث والتصنيف.
- إنشاء طلبات وعروض جديدة.
- وضع محلي للمعاينة فقط عند عدم إعداد Supabase.
- وضع Supabase حقيقي للتسجيل والدخول وحفظ الطلبات والعروض وإدارتها والرسائل والإعدادات.
- إنشاء Profile آلي عند التسجيل.
- RLS مفعّل في قاعدة البيانات.
- توافق مباشر مع الجداول الحالية `profiles` و`requests` و`offers` و`messages`، دون migration جديد.

## تشغيل سريع
يمكن فتح `index.html` مباشرة، والأفضل عبر خادم محلي:

```bash
python3 -m http.server 8080
```

ثم افتحي `http://localhost:8080`.

## تفعيل Supabase الحقيقي
1. استخدمي مشروع Supabase الحالي وجداوله الحالية، ولا تشغّلي migration جديدًا.
2. من **Project Settings → API** انسخي:
   - Project URL
   - anon / publishable public key
3. افتحي `supabase-config.js` وضعي القيم:

```js
window.BINA_SUPABASE = {
  url: 'https://YOUR_PROJECT.supabase.co',
  anonKey: 'YOUR_PUBLIC_ANON_KEY'
};
```

4. لا تضعي `service_role` داخل الموقع إطلاقًا.
5. عند نشر الموقع، أضيفي رابط الدومين في **Authentication → URL Configuration** في Supabase.

## الملفات
- `index.html` — الصفحة والتبويبات.
- `styles.css` — الهوية والتجاوب.
- `app.js` — المنطق، Auth، المنشورات، والوضع المحلي الاحتياطي.
- `supabase.sql` — تنبيه توثيقي بأن النسخة لا تحتاج إلى migration.
- `supabase-config.js` — مكان وضع مفاتيح المشروع العامة.

## ما بقي قبل الإطلاق العام
- اختبار صلاحيات RLS بحسابين مختلفين.
- إضافة سياسة الاستخدام والخصوصية والإبلاغ عن المحتوى.
- رفع المشروع إلى GitHub ثم منصة الاستضافة.

## إشعارات البريد للطلبات والعروض الجديدة

توجد Edge Function باسم `notify-new-post` في `supabase/functions/notify-new-post`. تعمل في الخادم فقط: تتحقق من Webhook من نوع `INSERT` للجدولين الحاليين `public.requests` و`public.offers`، تقرأ المستخدمين من `auth.users` بصلاحية Admin، تستبعد `record.user_id`، ثم ترسل رسالة منفصلة لكل مستلم عبر Resend. لا تعدّل هذه الإضافة أي جدول أو سياسة RLS ولا تنقل قائمة البريد إلى المتصفح.

يمنع مفتاح `Idempotency-Key` الثابت لكل (جدول، سجل، مستلم) تكرار الرسالة عندما يعيد Webhook نفس الحدث. ويُعالَج كل إرسال على حدة، لذلك لا يمنع فشل مستلم واحد إرسال الرسائل للبقية. لا تعيد استجابة الدالة أي عنوان بريد.

### 1. الأسرار المطلوبة في Supabase

أنشئي قيمة عشوائية طويلة لـ `BINA_WEBHOOK_SECRET`، ثم نفّذي محليًا بعد ربط Supabase CLI بالمشروع:

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxx \
  NOTIFICATION_FROM_EMAIL='Bina <notifications@YOUR_VERIFIED_DOMAIN>' \
  BINA_WEBHOOK_SECRET='A_LONG_RANDOM_VALUE'
supabase functions deploy notify-new-post --no-verify-jwt
```

توفر Supabase للدالة `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` افتراضيًا. يجب أن تبقى قيمة service role و`RESEND_API_KEY` وSecret الخاص بالـ Webhook ضمن **Edge Function Secrets** فقط؛ لا تضعي أيًا منها في `supabase-config.js` أو GitHub. مفتاح `anon` العام الحالي للواجهة لا يتغير.

### 2. إعداد Resend

1. أضيفي Domain في لوحة Resend وأكملي DNS verification (عادة سجلات SPF وDKIM المطلوبة في اللوحة).
2. أنشئي API Key مخصصًا للإرسال واحفظيه في Secret أعلاه.
3. اجعلي `NOTIFICATION_FROM_EMAIL` عنوانًا تابعًا للدومين الموثق. عنوان اختبار Resend قد يكون مقيدًا بعنوان مالك الحساب، ولذلك يلزم توثيق الدومين للإرسال الفعلي لجميع المستخدمين.

### 3. إنشاء Database Webhooks يدويًا

لا يمكن إنشاء Webhooks الخاصة بمشروعك من ملفات المستودع، لذا يلزم تنفيذ الآتي في لوحة Supabase بعد نشر الدالة. من **Database → Webhooks → Create a new hook** أنشئي Webhookين:

| الاسم المقترح | الجدول | الحدث | النوع | الرابط |
|---|---|---|---|---|
| `notify-new-request` | `public.requests` | `INSERT` فقط | HTTP Request / POST | `https://PROJECT_REF.supabase.co/functions/v1/notify-new-post` |
| `notify-new-offer` | `public.offers` | `INSERT` فقط | HTTP Request / POST | الرابط نفسه |

أضيفي في كل Webhook ترويسة HTTP مخصصة باسم `x-bina-webhook-secret` وقيمتها **نفس** `BINA_WEBHOOK_SECRET`. لا تفعّلي أحداث UPDATE أو DELETE. لا حاجة إلى migration، ولا ينبغي تغيير `requests` أو`offers` أو`messages` أو`profiles`.

> إذا كانت واجهة لوحة المشروع لا تتيح Custom Headers، أنشئي الـ Database Webhook عبر SQL/واجهة Supabase الموثقة مع ترويسة secret نفسها؛ لا تضعي secret في ملف migration داخل Git.

### 4. اختبار ما بعد الإعداد

1. أنشئي حسابين ببريدين صالحين ومؤكدين (A وB).
2. سجّلي الدخول بالحساب A وانشري `request`: يجب أن تصل رسالة «طلب مساعدة جديد في بينا» إلى B فقط، وبها العنوان والوصف والمدينة/التصنيف إن وُجدا والرابط.
3. انشري `offer`: يجب أن تصل إلى B فقط بعنوان «عرض مساعدة جديد في بينا».
4. راقبي **Edge Functions → notify-new-post → Logs**؛ يظهر عدد `sent` و`failed` ومعرّفات المستخدمين عند الخطأ، من دون تسجيل عنوان البريد.
5. اختبري بحساب وحيد: يجب أن يسجل Log عبارة `No eligible recipients` وألا يرسل شيئًا.
6. الحساب بلا بريد صالح يُتجاوز بأمان. وللتأكد من عزل الفشل، استخدمي مستلمًا يرفضه Resend؛ يجب أن يظهر فشله في Log وتستمر رسائل بقية المستلمين.
7. أعيدي إرسال payload نفسه من صفحة Webhook logs: يجب أن تمنع Resend الرسالة المكررة بفضل idempotency key.

يمكن تشغيل اختبارات المنطق المحلية (النوعان، الاستبعاد، المستخدم الوحيد، البريد غير الصالح، الاستمرار بعد فشل مستلم، وثبات منع التكرار) هكذا:

```bash
node --test supabase/functions/notify-new-post/notification.test.mjs
```
