import React, { useEffect, useState } from 'react';
import { AppState } from '../types';
import { User } from 'firebase/auth';
import {
  signInWithGoogle, signInWithEmail, registerWithEmail, signOutCloud,
  uploadStateToCloud, fetchCloudMeta, downloadStateFromCloud, type CloudMeta
} from '../utils/cloud';
import { IconBtn } from './IconBtn';
import { X, Cloud, Upload, Download, LogOut, HelpCircle } from 'lucide-react';

interface CloudAccountModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  state: AppState;
  onApplyState: (s: AppState) => void;
  onShowToast?: (msg: string, isErr?: boolean) => void;
  onSyncEnabled?: (uid: string) => void;
}

export const CloudAccountModal: React.FC<CloudAccountModalProps> = ({
  open, onClose, user, state, onApplyState, onShowToast, onSyncEnabled
}) => {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const [meta, setMeta] = useState<CloudMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [confirmUpload, setConfirmUpload] = useState(false);
  const [confirmDownload, setConfirmDownload] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMsg(null); setConfirmUpload(false); setConfirmDownload(false);
    if (user) {
      setMetaLoading(true);
      fetchCloudMeta(user)
        .then(setMeta)
        .catch(e => setMsg({ text: e?.message || 'خطا در خواندن وضعیت ابر.', err: true }))
        .finally(() => setMetaLoading(false));
    } else { setMeta(null); }
  }, [open, user]);

  if (!open) return null;

  const run = async (name: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(name); setMsg(null);
    try { await fn(); } catch (e: any) { setMsg({ text: e?.friendly || e?.message || 'عملیات ناموفق بود.', err: true }); }
    finally { setBusy(''); }
  };

  const doGoogle = () => run('google', async () => { await signInWithGoogle(); onShowToast?.('ورود با گوگل موفق بود.', false); });

  const doEmail = () => run(mode, async () => {
    if (!email.trim() || pw.length < 6) throw { friendly: 'ایمیل و رمز (حداقل ۶ کاراکتر) را کامل کن.' };
    if (mode === 'register') await registerWithEmail(email, pw);
    else await signInWithEmail(email, pw);
    onShowToast?.(mode === 'register' ? 'حساب ساخته و وارد شدی.' : 'ورود موفق بود.', false);
  });

  const doUpload = () => run('upload', async () => {
    if (!user) return;
    await uploadStateToCloud(user, state);
    setMeta(await fetchCloudMeta(user));
    setConfirmUpload(false);
        if (onSyncEnabled) onSyncEnabled(user.uid);
    setMsg({ text: `☁️ آپلود کامل شد (${state.words.length} واژه). از این به بعد تغییرات خودکار همگام می‌شوند.`, err: false });
    onShowToast?.('کتابخانه به فضای ابری آپلود شد؛ sync خودکار فعال شد.', false);
  });

  const doDownload = () => run('download', async () => {
    if (!user) return;
    const cloud = await downloadStateFromCloud(user);
    if (!cloud) throw { friendly: 'ابر خالی است؛ اول «آپلود» را بزن.' };
    // safety net: automatic local backup file before replacing
    try {
      const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `wortbuch-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } catch { /* backup is best-effort */ }
    onApplyState(cloud);
    setConfirmDownload(false);
    setMsg({ text: `⬇️ دریافت کامل شد (${cloud.words.length} واژه). نسخهٔ قبلی به‌صورت فایل پشتیبان ذخیره شد.`, err: false });
    onShowToast?.('داده‌ها از فضای ابری بازیابی شد.', false);
  });

  const input = 'w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 text-sm outline-none';

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col" dir="rtl">
        <div dir="ltr" className="sticky top-0 z-10 bg-white/95 dark:bg-[#1b2029]/95 backdrop-blur-md px-4 py-3 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center gap-2">
          <IconBtn onClick={onClose} title="بستن"><X size={18} className="text-red-500" /></IconBtn>
          <IconBtn onClick={() => setHelpOpen(v => !v)} title="این بخش چیست؟"><HelpCircle size={18} className="text-[#1f5fbf]" /></IconBtn>
          <h3 className="flex-1 text-right font-bold text-base text-slate-900 dark:text-slate-100">☁️ حساب ابری</h3>
        </div>

       {helpOpen && (
          <div className="px-4 md:px-5 pt-4">
            <div className="rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/30 p-3.5 text-xs md:text-sm leading-7 text-slate-700 dark:text-slate-200 space-y-2">
              <div className="font-extrabold text-sky-700 dark:text-sky-300">☁️ این بخش چیست؟</div>
              <p>اینجا می‌توانی کتابخانهٔ واژگان و کل سابقهٔ یادگیری‌ات را در فضای ابری امن ذخیره کنی — تا از هر دستگاهی که وارد حساب‌ات شوی، همان داده‌ها را داشته باشی و اگر مرورگر یا گوشی عوض شد، هیچ‌چیز از دست نرود.</p>
              <ul className="space-y-1">
                <li>• <b>آپلود به ابر:</b> نسخهٔ فعلی این دستگاه در ابر ذخیره می‌شود (محتوای قبلی ابر جایگزین می‌شود؛ داده‌های دستگاه دست‌نخورده می‌ماند).</li>
                <li>• <b>دریافت از ابر:</b> نسخهٔ ابری روی این دستگاه بازیابی می‌شود؛ قبل از جایگزینی، به‌طور خودکار از داده‌های فعلی پشتیبان می‌گیرد.</li>
                <li>• <b>حریم خصوصی:</b> هر حساب فقط به دیتای خودش دسترسی دارد — هیچ‌کس دیگر، حتی ما.</li>
                <li>• <b>بدون اینترنت / بدون حساب:</b> برنامه کامل کار می‌کند؛ ابر فقط یک کپی امنِ اضافه است.</li>
              </ul>
              <button type="button" onClick={() => setHelpOpen(false)} className="text-[11px] font-bold text-sky-700 dark:text-sky-300 underline">
                   فهمیدم، بستن    
              </button>
            </div>
          </div>
        )}
        <div className="p-4 md:p-5 space-y-4">
          {msg && (
            <div className={`p-3 rounded-xl text-sm border ${msg.err ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300' : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'}`}>
              {msg.text}
            </div>
          )}

          {!user ? (
            <>
              <button
                type="button"
                onClick={doGoogle}
                disabled={!!busy}
                className="w-full h-11 bg-white dark:bg-white border border-slate-300 rounded-xl font-bold text-slate-800 shadow-sm hover:bg-slate-50 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy === 'google'
                  ? <span className="inline-block animate-spin">⏳</span>
                  : <span className="font-sans font-extrabold text-lg" style={{ color: '#4285F4' }}>G</span>}
                <span>ورود با Google</span>
              </button>

              <div className="flex items-center gap-2 text-[11px] text-[#5d6676] dark:text-[#a3adbd]">
                <span className="flex-1 border-t border-slate-200 dark:border-slate-800" /> یا با ایمیل <span className="flex-1 border-t border-slate-200 dark:border-slate-800" />
              </div>

              <input type="email" dir="ltr" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} className={input} />
              <input type="password" dir="ltr" placeholder="رمز عبور (حداقل ۶ کاراکتر)" value={pw} onChange={e => setPw(e.target.value)} className={input} />

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={doEmail}
                  disabled={!!busy}
                  className={`h-11 rounded-xl text-xs font-bold text-white transition flex items-center justify-center gap-1.5 disabled:opacity-50 ${mode === 'signin' ? 'bg-[#1f5fbf] hover:bg-[#194ea0]' : 'border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}
                >
                  {busy === 'signin' ? <span className="inline-block animate-spin">⏳</span> : '📥 ورود'}
                </button>
                <button
                  type="button"
                  onClick={() => { setMode(mode === 'signin' ? 'register' : 'signin'); }}
                  className={`h-11 rounded-xl text-xs font-bold transition border ${mode === 'register' ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                >
                  🆕 ساخت حساب جدید
                </button>
              </div>
              {mode === 'register' && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  بعد از ساخت حساب، «ثبت‌نام» را دوباره نزن؛ حساب ساخته می‌شود و وارد می‌شوی.
                </p>
              )}
              <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] leading-6">
                داده‌های تو فقط با این حساب به فضای ابری وصل می‌شوند و هیچ‌کس جز خودت به آن‌ها دسترسی ندارد. بدون ورود هم برنامه کاملاً کار می‌کند.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl p-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-sm font-bold text-emerald-800 dark:text-emerald-200 flex-1 truncate" dir="ltr">{user.email}</span>
              </div>

              <div className="rounded-xl border border-[#dde1ea] dark:border-[#333b4a] p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>📚 واژه‌های محلی:</span><b>{state.words.length}</b></div>
                <div className="flex justify-between">
                  <span>☁️ واژه‌های ابری:</span>
                  <b>{metaLoading ? '…' : meta ? meta.words : 'ابر خالی'}</b>
                </div>
                {meta && (
                  <div className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]">
                    آخرین همگام‌سازی ابر: {new Date(meta.updatedAt).toLocaleString('de-AT')}
                  </div>
                )}
              </div>

              {confirmUpload || confirmDownload ? (
                <div className="rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 space-y-2.5">
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-200 leading-6">
                    {confirmUpload
                      ? <>تأیید آپلود به ابر: <b dir="ltr">{state.words.length}</b> واژه از این دستگاه <b dir="ltr">→</b> ابر. محتوای قبلیِ ابر پاک می‌شود؛ داده‌های این دستگاه دست‌نخورده می‌ماند.</>
                      : <>تأیید دریافت از ابر: <b dir="ltr">{meta ? meta.words : 0}</b> واژه از ابر <b dir="ltr">→</b> این دستگاه. داده‌های فعلی این دستگاه جایگزین می‌شوند (پشتیبان خودکار می‌گیرد).</>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={confirmUpload ? doUpload : doDownload}
                      disabled={!!busy}
                      className="h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition disabled:opacity-50"
                    >
                      {busy ? '⏳ در حال اجرا…' : 'بله، اجرا کن'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setConfirmUpload(false); setConfirmDownload(false); }}
                      disabled={!!busy}
                      className="h-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold transition"
                    >
                      انصراف
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => { setConfirmDownload(false); setConfirmUpload(true); }} disabled={!!busy}
                    className="w-full h-11 rounded-xl bg-[#1f5fbf] hover:bg-[#194ea0] text-white text-sm font-bold transition flex items-center justify-center gap-2 disabled:opacity-50">
                    <Upload size={16} /> آپلود کتابخانهٔ این دستگاه به ابر
                  </button>
                  <button type="button" onClick={() => { setConfirmUpload(false); setConfirmDownload(true); }} disabled={!!busy}
                    className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition flex items-center justify-center gap-2 disabled:opacity-50">
                    <Download size={16} /> دریافت از ابر روی این دستگاه
                  </button>
                </>
              )}

                            {confirmSignOut ? (
                <div className="rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 space-y-2.5">
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-200 leading-6">
                    ⚠️ مطمئنی که می‌خواهی خارج شوی؟ (داده‌های این دستگاه محلی می‌مانند؛ فقط ارتباط با حساب ابری قطع می‌شود — با ورود دوباره همه‌چیز برمی‌گردد.)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => run('out', async () => { await signOutCloud(); setConfirmSignOut(false); })}
                      disabled={!!busy}
                      className="h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition disabled:opacity-50"
                    >
                      {busy === 'out' ? '⏳ …' : 'بله، خارج شو'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmSignOut(false)}
                      disabled={!!busy}
                      className="h-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold transition"
                    >
                      انصراف
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmSignOut(true)}
                  className="w-full h-10 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5">
                  <LogOut size={14} /> خروج از حساب
                </button>
              )}
              <button
                type="button"
                onClick={() => { setConfirmSignOut(false); onClose(); }}
                className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition flex items-center justify-center gap-1.5"
              >
                ✓ بازگشت
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CloudAccountModal;
