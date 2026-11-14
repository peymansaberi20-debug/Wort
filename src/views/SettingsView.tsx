import React from 'react';

type SettingsViewProps = {
  // چنانچه پراپرتی یا توابعی برای تنظیمات دارید می‌توانید اینجا اضافه کنید
};

export const SettingsView: React.FC<SettingsViewProps> = () => {
  return (
    <div className="max-w-3xl mx-auto space-y-6 text-left text-sm text-slate-800 dark:text-slate-100 py-4" dir="ltr">
      {/* هدر بخش تنظیمات */}
      <div className="border-b border-slate-200 dark:border-slate-700 pb-4">
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <span>⚙️</span>
          <span>Einstellungen</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Verwalten Sie hier Ihre persönlichen Präferenzen und Anwendungseinstellungen.
        </p>
      </div>

      {/* کارت اول: تنظیمات عمومی و رابط کاربری */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1b2029] p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span>🎨</span>
          <span>Darstellung & Oberfläche</span>
        </h3>
        
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-white">Erscheinungsbild (Theme)</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Wählen Sie zwischen heller und dunkler Ansicht</p>
            </div>
            <select className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#232934] px-3.5 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/40">
              <option>Systemstandard</option>
              <option>Dunkel (Dark)</option>
              <option>Hell (Light)</option>
            </select>
          </div>
        </div>
      </div>

      {/* کارت دوم: تنظیمات صدا و پخش */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1b2029] p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span>🔊</span>
          <span>Audio- & Wiedergabeeinstellungen</span>
        </h3>

        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-white">Standard-Wiedergabegeschwindigkeit</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Legt die initiale Geschwindigkeit für Audios fest</p>
            </div>
            <select className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#232934] px-3.5 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/40">
              <option value="1.0">1.0x (Normal)</option>
              <option value="0.75">0.75x (Langsam)</option>
              <option value="1.25">1.25x (Schnell)</option>
              <option value="1.5">1.5x (Sehr schnell)</option>
            </select>
          </div>
        </div>
      </div>

      {/* کارت سوم: اطلاعات برنامه و نسخه */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1b2029] p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span>ℹ️</span>
          <span>Über die Anwendung</span>
        </h3>
        <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">Wort Anwendung & Simulator</span>
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Version 3.0</span>
        </div>
      </div>
    </div>
  );
};
