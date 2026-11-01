import React, { useState } from 'react';

const KEY_NAME = 'gemini_api_key';

export function GeminiKeyCard() {
  const [key, setKey] = useState(() => {
    try { return localStorage.getItem(KEY_NAME) || ''; } catch { return ''; }
  });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const test = async () => {
    const k = key.trim();
    if (!k) {
      setStatus({ ok: false, msg: 'ابتدا کلید API را وارد کنید.' });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const r = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
        { headers: { 'x-goog-api-key': k } }
      );
      if (r.ok) {
        try { localStorage.setItem(KEY_NAME, k); } catch {}
        setStatus({ ok: true, msg: 'اتصال برقرار شد و کلید ذخیره شد.' });
      } else {
        const d: any = await r.json().catch(() => ({}));
        setStatus({ ok: false, msg: d?.error?.message || `خطا در اتصال (کد ${r.status})` });
      }
    } catch {
      setStatus({ ok: false, msg: 'ارتباط با گوگل برقرار نشد. اینترنت را بررسی کنید.' });
    }
    setBusy(false);
  };

  const remove = () => {
    try { localStorage.removeItem(KEY_NAME); } catch {}
    setKey('');
    setStatus({ ok: true, msg: 'کلید از این مرورگر حذف شد.' });
  };

  return (
    <div
      dir="rtl"
      className="bg-white dark:bg-[#1b2030] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 space-y-4"
    >
      <h3 className="text-lg font-bold flex items-center gap-2">
        <span>🤖</span>
        <span>اتصال به هوش مصنوعی</span>
      </h3>

      <p className="text-sm text-[#5d6676] dark:text-[#a3adbd] leading-7">
        برای استفاده از هوش مصنوعی (تکمیل واژگان، ترجمه سریع، استخراج از تصویر و تمرین‌ها)
        به یک کلید API رایگان گوگل نیاز دارید. کلید فقط در همین مرورگر ذخیره می‌شود.
      </p>

      <div className="rounded-2xl bg-[#f6f7fb] dark:bg-[#12151c] p-4 text-sm leading-7 space-y-1">
        <div className="font-bold">راهنمای گرفتن کلید:</div>
        <ol className="list-decimal pr-5 space-y-1">
          <li>
            روی لینک زیر بزنید و با حساب گوگل وارد شوید:
            <br />
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              dir="ltr"
              className="text-[#1f5fbf] dark:text-[#7fb0ff] underline break-all"
            >
              https://aistudio.google.com/apikey
            </a>
          </li>
          <li>دکمهٔ <b>Create API key</b> را بزنید.</li>
          <li>اگر پروژه خواست، یک پروژه جدید بسازید یا انتخاب کنید.</li>
          <li>کلید ساخته‌شده را کپی کنید و در کادر زیر بچسبانید.</li>
          <li>دکمهٔ «بررسی و ذخیره» را بزنید.</li>
        </ol>
        <div className="text-xs text-[#b42318] dark:text-[#ff9b92] pt-1">
          کلید را با کسی به اشتراک نگذارید و در چت یا GitHub ننویسید.
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type={show ? 'text' : 'password'}
          dir="ltr"
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="AIza..."
          className="flex-1 min-w-0 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-white dark:bg-[#12151c] px-3 py-2.5 text-sm"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="px-3 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] text-sm"
        >
          {show ? 'پنهان' : 'نمایش'}
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={test}
          disabled={busy}
          className="flex-1 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold rounded-full py-3 disabled:opacity-60"
        >
          {busy ? 'در حال بررسی...' : '🔌 بررسی و ذخیره'}
        </button>
        <button
          type="button"
          onClick={remove}
          className="px-4 rounded-full border border-[#dde1ea] dark:border-[#333b4a] text-sm"
        >
          حذف کلید
        </button>
      </div>

      {status && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            status.ok
              ? 'bg-[#e6f7ee] text-[#18794e] dark:bg-[#12301f] dark:text-[#7be0a8]'
              : 'bg-[#fdecea] text-[#b42318] dark:bg-[#3a1815] dark:text-[#ff9b92]'
          }`}
        >
          {status.ok ? '✅ ' : '❌ '}
          {status.msg}
        </div>
      )}
    </div>
  );
}
