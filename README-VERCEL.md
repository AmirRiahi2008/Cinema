# انتشار دو صندلی روی Vercel

این نسخه، رابط React را روی Vercel منتشر می‌کند. اتاق‌ها، چت، پخش هماهنگ، دیتابیس و فایل‌های فیلم روی سرور Cloudflare فعلی می‌مانند. مرورگر از مسیر `/api/cinema/` روی همان دامنهٔ سایت استفاده می‌کند و External Rewrite در Vercel درخواست را به بک‌اند می‌فرستد. مسیر API قبل از مسیر جایگزین `index.html` قرار دارد؛ هیچ Vercel Function برای پروکسی ساخته نمی‌شود.

سرور فعلی آماده و تنظیم اتصال دامنه‌های `*.vercel.app` روی آن فعال است. برای این روش نیازی به ساخت دیتابیس یا وارد کردن کلید مخفی روی Vercel نداری. این بسته، انتقال کامل بک‌اند به Vercel نیست.

نشانی سرور:

```text
https://two-seats-amir.amirreza-riahi3311.chatgpt.site
```

## ۱. آماده کردن GitHub

پوشهٔ پروژه را که `package.json` و `vercel.json` داخلش است در VS Code باز کن. در GitHub یک ریپازیتوری خالی بساز؛ بدون README و بدون فایل اولیه. در ترمینال همان پوشه، این دستورها را بزن:

```bash
git init
git add .
git commit -m "Prepare Two Seats for Vercel"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/two-seats.git
git push -u origin main
```

`YOUR_USERNAME` و آدرس ریپازیتوری را با آدرس واقعی ریپوی تازه‌ات جایگزین کن. اگر همین پوشه قبلاً Git دارد، مرحلهٔ `git remote add` را قبل از بررسی `git remote -v` دوباره اجرا نکن. برای این بستهٔ تازه، پوشهٔ `.git` داخل ZIP نیست.

## ۲. ساخت پروژه روی Vercel

1. وارد https://vercel.com/new شو.
2. حساب GitHub را وصل و ریپوی همین پروژه را Import کن.
3. Root Directory همان پوشهٔ دارای `package.json` باشد. اگر کل محتویات پوشهٔ `two-seats` را در ریشهٔ ریپو پوش کرده‌ای، مقدار Root برابر `./` است.
4. تنظیمات فایل `vercel.json` از قبل آماده‌اند؛ در صفحهٔ Import مقادیر زیر را بررسی کن:

| گزینه | مقدار |
| --- | --- |
| Framework Preset | Vite |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm build:vercel` |
| Output Directory | `dist-vercel` |
| Node.js Version | `24.x` |

Framework را روی Vite قرار بده؛ خروجی این مسیر با Vite ساخته می‌شود. مسیر مستقل Cloudflare با `pnpm build` همچنان برای بک‌اند نگه داشته شده است.

## ۳. نسخهٔ pnpm و اتصال API

در بخش Environment Variables این مقدار را برای Production و Preview وارد کن تا نسخهٔ pnpm ثبت‌شده در `package.json` استفاده شود:

| Name | Value |
| --- | --- |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` |

آدرس بک‌اند در اولین Rewrite فایل `vercel.json` مشخص شده است. برای استفاده از بک‌اند دیگر، مقصد همان Rewrite را تغییر بده؛ اجرای محلی هم مقصد را از همین فایل می‌خواند. متغیر قدیمی `VITE_CINEMA_API_ORIGIN` در بیلد ورسل استفاده نمی‌شود و می‌توانی آن را از داشبورد حذف کنی.

درخواست‌های اتاق، چت، آپلود و پخش روی دامنهٔ خود سایت ارسال می‌شوند؛ بنابراین مرورگر برای اتصال به بک‌اند درخواست CORS Preflight نمی‌فرستد. پاسخ‌های خصوصی API کش نمی‌شوند. برای اعمال این تغییر، دیپلوی جدید لازم است.

هیچ API Key، کلید D1 یا کلید R2 را در متغیرهای `VITE_` نگذار؛ مقادیر این پیشوند داخل کد مرورگر قرار می‌گیرند.

## ۴. انتشار و استفاده

Deploy را بزن. پس از پایان Build، دامنهٔ اصلی پروژه با پسوند `.vercel.app` را باز کن. یک اتاق تازه بساز، لینک دعوت همان دامنه را برای پارتنرت بفرست و فیلم انتخاب کن.

فهرست اتاق‌های قبلی به مرورگر و دامنهٔ قبلی وابسته است. اتاق‌های جدید را از دامنهٔ Vercel بساز تا کلیدهای ورود و لینک‌های دعوت همان‌جا ذخیره شوند. داده‌های سرور با انتشار رابط روی Vercel حذف نمی‌شوند.

## اجرای محلیِ رابط Vercel

```bash
pnpm install --frozen-lockfile
pnpm dev:vercel
```

رابط را روی `http://localhost:5173` باز کن. در این حالت به سرور آنلاین وصل می‌شود و نیازی به مهاجرت دیتابیس محلی نیست.

بررسی خروجی انتشار:

```bash
pnpm build:vercel
```

اجرای کامل محلی با دیتابیس و فایل‌های شبیه‌سازی‌شده، همان مراحل README.md را دارد.

## دامنهٔ اختصاصی

دامنه‌های اصلی و Preview با پسوند `.vercel.app` آمادهٔ اتصال‌اند. برای دامنهٔ اختصاصی، Origin دقیق آن باید روی بک‌اند در `CINEMA_FRONTEND_ORIGINS` اضافه شود. مثال مقدار:

```text
https://cinema.example.com,https://www.cinema.example.com
```

این تنظیم روی بک‌اند Cloudflare است؛ اضافه کردنش فقط در پنل Vercel به‌تنهایی سرور را تغییر نمی‌دهد.

## جزئیات بررسی

- خروجی Vite بدون وابستگی به `cloudflare:workers` ساخته می‌شود.
- چت و فرمان‌های پخش با Bearer Key مخصوص هر صندلی احراز می‌شوند.
- درخواست از دامنهٔ Vercel، Cookie سرور را به‌عنوان دسترسی نمی‌پذیرد.
- پخش فیلم و زیرنویس از امضای فقط‌خواندنی و زمان‌دار استفاده می‌کند.
- تست‌ها شامل Preflight، دسترسی مجاز از Vercel، رد دامنه‌های نامعتبر، رد Cookie در درخواست بیرونی و Range رسانه از دامنهٔ Vercel هستند.
- انتشار واقعی روی حساب Vercel شما و آزمون روی دو مرورگر واقعی در این بسته انجام نشده‌اند.

مستندات رسمی:

- https://vercel.com/docs/frameworks/frontend/vite
- https://vercel.com/docs/project-configuration/vercel-json
- https://vercel.com/docs/functions/limitations
