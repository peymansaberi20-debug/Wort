import React, { useState } from 'react';
import {
  PROVIDERS,
  PROVIDER_IDS,
  ProviderId,
  clearApiKey,
  getActiveProvider,
  getApiKey,
  getModel,
  isKeyPersisted,
  setActiveProvider,
  setApiKey,
  setModel,
  testConnection
} from '../utils/aiProvider';

interface Draft {
  key: string;
  model: string;
  persist: boolean;
}

const loadDraft = (p: ProviderId): Draft => ({
  key: getApiKey(p),
  model: getModel(p),
  persist: isKeyPersisted(p)
});

/**
 * Settings card of the AI providers (Gemini, Groq, OpenRouter).
 * (The file/export name is kept for compatibility with the settings screen.)
 */
export function GeminiKeyCard() {
  const [active, setActive] = useState<ProviderId>(() => getActiveProvider());
  const [selected, setSelected] = useState<ProviderId>(() => getActiveProvider());
  const [drafts, setDrafts] = useState<Record<ProviderId, Draft>>(() => ({
    gemini: loadDraft('gemini'),
    groq: loadDraft('groq'),
    openrouter: loadDraft('openrouter')
  }));
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const info = PROVIDERS[selected];
  const d = drafts[selected];
  const patch = (v: Partial<Draft>) => setDrafts(prev => ({ ...prev, [selected]: { ...prev[selected], ...v } }));

  const test = async () => {
    setBusy(true);
    setStatus(null);
    // The test only uses the typed key; nothing is saved or changed by it.
    const r = await testConnection(selected, d.key);
    setStatus({ ok: r.ok, msg: r.message });
    setBusy(false);
  };

  const save = () => {
    if (!d.key.trim()) {
      setStatus({ ok: false, msg: 'ابتدا کلید API را وارد کنید.' });
      return;
    }
    setApiKey(selected, d.key, d.persist);
    setModel(selected, d.model);
    setActiveProvider(selected);
    setActive(selected);
    setStatus({
      ok: true,
      msg: d.persist
        ? `«${info.label}» فعال شد و کلید در این مرورگر ذخیره شد.`
        : `«${info.label}» فعال شد. کلید فقط تا بستن یا بازخوانی صفحه نگه داشته می‌شود.`
    });
  };

  const remove = () => {
    clearApiKey(selected);
    patch({ key: '', persist: false });
    setStatus({ ok: true, msg: `کلید «${info.label}» از این مرورگر پاک شد.` });
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
        یکی از سه سرویس را انتخاب و کلید API خودتان را وارد کنید. محدودیت و سهمیهٔ رایگان را خود هر سرویس تعیین می‌کند
        و ممکن است تغییر کند؛ برنامه هیچ مدل پولی را به‌صورت خودکار فعال نمی‌کند. بدون کلید هم می‌توانید از «کپی دستور
        برای هوش مصنوعی خارجی» (ChatGPT، Claude و…) استفاده کنید.
      </p>

      <div className="grid grid-cols-3 gap-2" role="tablist">
        {PROVIDER_IDS.map(id => (
          <button
            key={id}
            role="tab"
            aria-selected={selected === id}
            onClick={() => {
              setSelected(id);
              setStatus(null);
              setShow(false);
            }}
            className={`px-2 py-2 rounded-xl text-sm font-bold border transition ${
              selected === id
                ? 'bg-[#1f5fbf] text-white border-[#1f5fbf]'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
            }`}
          >
            {PROVIDERS[id].label}
            {active === id && <span className="block text-[10px] font-normal opacity-90">فعال</span>}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-[#f6f7fb] dark:bg-[#12151c] p-4 text-sm leading-7 space-y-1">
        <div className="font-bold">راهنمای گرفتن کلید «{info.label}»</div>
        <ol className="list-decimal pr-5 space-y-0.5">
          <li>
            وارد{' '}
            <a href={info.keyUrl} target="_blank" rel="noopener noreferrer" className="text-[#1f5fbf] underline" dir="ltr">
              {info.keyUrl.replace('https://', '')}
            </a>{' '}
            شوید.
          </li>
          <li>یک کلید جدید بسازید و آن را کپی کنید.</li>
          <li>آن را در کادر زیر بچسبانید و «ذخیره و فعال‌سازی» را بزنید.</li>
        </ol>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-semibold">کلید API</span>
        <div className="flex gap-2">
          <input
            type={show ? 'text' : 'password'}
            value={d.key}
            onChange={e => patch({ key: e.target.value })}
            autoComplete="off"
            spellCheck={false}
            dir="ltr"
            placeholder="API key"
            className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-white dark:bg-[#12151c] text-sm font-mono"
          />
          <button
            onClick={() => setShow(s => !s)}
            className="px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm"
            aria-label={show ? 'پنهان کردن کلید' : 'نمایش کلید'}
          >
            {show ? '🙈' : '👁'}
          </button>
        </div>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-semibold">مدل</span>
        <input
          list={`models-${selected}`}
          value={d.model}
          onChange={e => patch({ model: e.target.value })}
          dir="ltr"
          spellCheck={false}
          className="w-full px-3 py-2 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-white dark:bg-[#12151c] text-sm font-mono"
        />
        <datalist id={`models-${selected}`}>
          {info.modelExamples.map(m => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <span className="block text-[11px] text-[#5d6676] dark:text-[#a3adbd] leading-5">
          نام مدل‌های پیشنهادی فقط نمونه است و ممکن است دیگر در دسترس یا رایگان نباشد؛ نام مدل را از مستندات «{info.label}»
          بررسی کنید.
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm leading-6">
        <input
          type="checkbox"
          checked={d.persist}
          onChange={e => patch({ persist: e.target.checked })}
          className="mt-1.5"
        />
        <span>
          کلید در این مرورگر ذخیره بماند
          <span className="block text-[11px] text-[#5d6676] dark:text-[#a3adbd]">
            پیش‌فرض: کلید فقط در حافظهٔ همین نشست می‌ماند. ذخیره در مرورگر کاملاً امن نیست؛ اسکریپت یا افزونهٔ مخرب مرورگر
            ممکن است به آن دسترسی پیدا کند. کلید هرگز در فایل پشتیبان قرار نمی‌گیرد و فقط به «{info.label}» فرستاده
            می‌شود. روی رایانه‌های مشترک ذخیره نکنید.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={save}
          className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2 rounded-xl text-sm font-bold"
        >
          ذخیره و فعال‌سازی
        </button>
        <button
          onClick={test}
          disabled={busy}
          className="bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-60"
        >
          {busy ? 'در حال آزمون…' : 'آزمون اتصال'}
        </button>
        <button
          onClick={remove}
          className="bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 px-4 py-2 rounded-xl text-sm font-bold"
        >
          پاک کردن کلید
        </button>
      </div>

      {status && (
        <div
          className={`rounded-xl px-3 py-2 text-sm ${
            status.ok
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'
          }`}
        >
          {status.ok ? '✅' : '❌'} {status.msg}
        </div>
      )}
    </div>
  );
}
