import React, { useState } from 'react';
import { Word } from '../types';
import { dueText } from '../utils/dates';
import { speak } from '../utils/audio';
import { P6 } from '../data/seed';
import { isLeech } from '../utils/storage';
import { splitConj } from '../utils/conjugation';
import { ConjugatedForm, ConjugationLegend } from './ConjugatedForm';

interface WordDetailModalProps {
  word: Word | null;
  onClose: () => void;
  onEdit: (word: Word) => void;
  onDelete: (word: Word) => void;
  onImageChange: (word: Word, newImg: string) => void;
}

export const WordDetailModal: React.FC<WordDetailModalProps> = ({
  word,
  onClose,
  onEdit,
  onDelete,
  onImageChange
}) => {
  const [showFa, setShowFa] = useState(false);

  if (!word) return null;

  const handlePickImage = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 480 / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            onImageChange(word, canvas.toDataURL('image/jpeg', 0.8));
          }
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    };
    fileInput.click();
  };

  const articleBadge = () => {
    if (!word.art) return null;
    const colors: Record<string, string> = {
      der: 'bg-[#dbe9ff] text-[#0b3d91] dark:bg-[#1c3258] dark:text-[#a9ccff]',
      die: 'bg-[#ffe0e3] text-[#a1122b] dark:bg-[#4a1f28] dark:text-[#ffb3bf]',
      das: 'bg-[#dff5e3] text-[#0b6b2c] dark:bg-[#17402a] dark:text-[#a6efc0]'
    };
    return (
      <span className={`inline-block px-2.5 py-0.5 rounded-lg font-bold text-base ml-2 ${colors[word.art] || ''}`}>
        {word.art}
      </span>
    );
  };

  // Verb tables builder
  const renderVerbTable = () => {
    if (!word.conj && !word.prat && !word.perf) return null;
    // Shared splitter: accepts "a|b|c|d|e|f" and also comma-separated data
    const presForms = word.conj ? splitConj(word.conj) : [];

    return (
      <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 my-3 text-right">
        <h4 className="font-bold text-sm text-[#5d6676] dark:text-[#a3adbd] mb-3 flex items-center justify-between">
          <span>جدول صرف فعل</span>
          <span className="text-xs font-normal">
            {word.sep ? `جداشدنی (${word.sep})` : 'فعل استاندارد'}
          </span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {presForms.length > 0 && (
            <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl p-3">
              <div className="font-bold text-xs text-[#1f5fbf] dark:text-[#7fb0ff] border-b pb-1 mb-2 flex justify-between">
                <span>Präsens</span>
                <span className="text-[#5d6676]">زمان حال</span>
              </div>
              <div className="space-y-1 text-xs">
                {presForms.map((f, i) => (
                  <div key={i} className="flex justify-between gap-2 border-b border-dashed border-slate-100 dark:border-slate-800 pb-0.5" dir="ltr">
                    <span className="text-slate-400 text-[11px] flex-shrink-0">{P6[i]}</span>
                    <span className="min-w-0 text-right">
                      <ConjugatedForm verb={word.de} form={f} pronounIndex={i} sep={word.sep} />
                    </span>
                  </div>
                ))}
              </div>
              <ConjugationLegend />
            </div>
          )}

          {word.prat && (
            <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl p-3">
              <div className="font-bold text-xs text-amber-600 dark:text-amber-400 border-b pb-1 mb-2 flex justify-between">
                <span>Präteritum</span>
                <span className="text-[#5d6676]">گذشته ساده</span>
              </div>
              <div className="text-xs space-y-1" dir="ltr">
                <div className="text-slate-500 text-[11px]">3. Person (er/sie/es):</div>
                <div className="font-bold text-sm text-amber-700 dark:text-amber-300">{word.prat}</div>
              </div>
            </div>
          )}

          {word.perf && (
            <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl p-3">
              <div className="font-bold text-xs text-emerald-600 dark:text-emerald-400 border-b pb-1 mb-2 flex justify-between">
                <span>Perfekt</span>
                <span className="text-[#5d6676]">گذشته نقلی</span>
              </div>
              <div className="text-xs space-y-1" dir="ltr">
                <div className="text-slate-500 text-[11px]">Hilfsverb + Partizip II:</div>
                <div className="font-bold text-sm text-emerald-700 dark:text-emerald-300">{word.perf}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Structured notes parser
  const renderNotes = () => {
    if (!word.notes) return null;
    const lines = word.notes.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return (
      <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 my-3 text-right">
        <h4 className="font-bold text-sm text-[#5d6676] dark:text-[#a3adbd] mb-2">یادداشت‌ها و نکات ساختاری:</h4>
        <div className="space-y-2 text-sm leading-relaxed" dir="rtl">
          {lines.map((line, idx) => {
            const isWordFamily = line.startsWith('خانواده واژگانی:');
            const isStructure = line.startsWith('ساختار:');
            return (
              <p key={idx} className="text-[#1d2330] dark:text-[#eef1f6]">
                {isWordFamily && <span className="font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">خانواده واژگانی: </span>}
                {isStructure && <span className="font-bold text-emerald-600 dark:text-emerald-400">ساختار: </span>}
                {!isWordFamily && !isStructure && <span className="font-bold">نکته: </span>}
                <span>{line.replace(/^(خانواده واژگانی:|ساختار:|نکته:)\s*/, '')}</span>
              </p>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col">
        {/*
          Fulfills User Request #9:
          "همون بالا دکمه های : بازگشت ، ویرایش ، حذف و افزودن عکس هست. کمی به هم ریخته هستند .
          مرتب و تمیز هر چهارتا رو در یک خط نمایش بده و ترتیب و منطق اونها بر اساس عرف و روال استاندارد و کاربر پسند نرم افزارها و APP های فارسی باشه"
        */}
        <div className="sticky top-0 z-10 bg-white/95 dark:bg-[#1b2029]/95 backdrop-blur-md px-4 py-3 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center justify-between gap-2">
          {/* Back button on right in RTL */}
          <button
            onClick={onClose}
            className="flex items-center gap-1 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-3.5 py-1.5 rounded-xl font-bold text-xs md:text-sm shadow-xs hover:opacity-95 transition"
          >
            ↩ بازگشت
          </button>

          {/* Action buttons neatly grouped on left in standard order: Add/Change Image, Edit, Delete */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePickImage}
              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[#1d2330] dark:text-[#eef1f6] px-2.5 py-1.5 rounded-xl text-xs md:text-sm font-medium transition"
              title="افزودن یا تغییر تصویر"
            >
              {word.img ? '🖼 تصویر' : '📷 افزودن تصویر'}
            </button>
            <button
              onClick={() => onEdit(word)}
              className="bg-blue-50 hover:bg-blue-100 text-[#1f5fbf] dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/80 px-2.5 py-1.5 rounded-xl text-xs md:text-sm font-medium transition flex items-center gap-1"
            >
              ✏️ ویرایش
            </button>
            <button
              onClick={() => onDelete(word)}
              className="bg-red-50 hover:bg-red-100 text-[#b3261e] dark:bg-red-950/60 dark:text-red-300 dark:hover:bg-red-900/80 px-2.5 py-1.5 rounded-xl text-xs md:text-sm font-medium transition flex items-center gap-1"
            >
              🗑 حذف
            </button>
          </div>
        </div>

        {/* Modal Hero / Word Header */}
        <div className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white p-5 text-center">
          <div className="flex items-center justify-center gap-2 mb-2" dir="ltr">
            {articleBadge()}
            <span className="text-2xl md:text-3xl font-extrabold tracking-wide font-sans">{word.de}</span>
            <button
              onClick={() => speak(word.art ? `${word.art} ${word.de}` : word.de)}
              className="bg-white/20 hover:bg-white/30 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm transition ml-1"
              title="پخش تلفظ صوتی"
            >
              🔊
            </button>
          </div>

          {/* Translation with toggle or reveal */}
          <div className="mt-2 text-center" dir="rtl">
            {showFa ? (
              <p className="text-xl md:text-2xl font-bold text-amber-200">{word.fa}</p>
            ) : (
              <button
                onClick={() => setShowFa(true)}
                className="bg-white/20 hover:bg-white/30 text-white rounded-xl px-4 py-1.5 text-sm font-medium transition"
              >
                👁 نمایش ترجمه فارسی
              </button>
            )}
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3.5">
            {word.cat && (
              <span className="bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">
                📁 {word.cat}
              </span>
            )}
            {word.pos && (
              <span className="bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">
                {word.pos}
              </span>
            )}
            {word.lvl && (
              <span className="bg-amber-400 text-slate-900 text-xs px-2.5 py-0.5 rounded-full font-bold">
                {word.lvl}
              </span>
            )}
            {word.pl && (
              <span className="bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-medium" dir="ltr">
                pl: {word.pl}
              </span>
            )}
            {isLeech(word) && (
              <span className="bg-red-500 text-white text-xs px-2.5 py-0.5 rounded-full font-bold">
                🩸 واژه سخت
              </span>
            )}
          </div>

          <div className="mt-3 text-xs text-white/80">
            {dueText(word)} • فاصله: {word.ivl} روز • درست: {word.ok} • غلط: {word.bad}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 md:p-6 space-y-4">
          {/* Synonyms & Antonyms */}
          {(word.syn || word.ant) && (
            <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-3.5 text-sm space-y-2">
              {word.syn && (
                <div className="flex flex-wrap items-center gap-2 justify-start">
                  <span className="font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">مترادف:</span>
                  <span className="font-bold" dir="ltr">{word.syn}</span>
                  {word.synFa && <span className="text-[#5d6676] dark:text-[#a3adbd]">({word.synFa})</span>}
                </div>
              )}
              {word.ant && (
                <div className="flex flex-wrap items-center gap-2 justify-start">
                  <span className="font-bold text-amber-600 dark:text-amber-400">متضاد:</span>
                  <span className="font-bold" dir="ltr">{word.ant}</span>
                  {word.antFa && <span className="text-[#5d6676] dark:text-[#a3adbd]">({word.antFa})</span>}
                </div>
              )}
            </div>
          )}

          {/* Image */}
          {word.img && (
            <div className="text-center bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-3">
              <img
                src={word.img}
                alt={word.de}
                className="max-h-56 mx-auto rounded-xl object-contain shadow-xs"
              />
              <button
                onClick={() => onImageChange(word, '')}
                className="mt-2 text-xs text-red-500 hover:text-red-700 underline"
              >
                حذف تصویر
              </button>
            </div>
          )}

          {/*
            Fulfills User Request #11:
            "مثالها و ترجمه ها : مثال از چپ به راست هست ولی ترجمه وسط چین هست ، ترجمه راست به چپ بشه"
          */}
          {(word.ex || word.ex2) && (
            <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 text-right">
              <h4 className="font-bold text-sm text-[#5d6676] dark:text-[#a3adbd] mb-3">جملات مثال:</h4>
              <div className="space-y-4">
                {word.ex && (
                  <div className="border-b border-dashed border-[#dde1ea] dark:border-[#333b4a] pb-3 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2" dir="ltr">
                      <p className="text-sm md:text-base font-semibold text-slate-900 dark:text-slate-100 leading-relaxed text-left">
                        {word.ex}
                      </p>
                      <button
                        onClick={() => speak(word.ex)}
                        className="text-xs bg-white dark:bg-slate-800 border rounded-lg px-2 py-1 flex-shrink-0"
                      >
                        🔊
                      </button>
                    </div>
                    {word.exFa && (
                      <p className="text-xs md:text-sm text-[#5d6676] dark:text-[#a3adbd] mt-1.5 text-right" dir="rtl">
                        {word.exFa}
                      </p>
                    )}
                  </div>
                )}

                {word.ex2 && (
                  <div className="pt-1">
                    <div className="flex items-start justify-between gap-2" dir="ltr">
                      <p className="text-sm md:text-base font-semibold text-slate-900 dark:text-slate-100 leading-relaxed text-left">
                        {word.ex2}
                      </p>
                      <button
                        onClick={() => speak(word.ex2)}
                        className="text-xs bg-white dark:bg-slate-800 border rounded-lg px-2 py-1 flex-shrink-0"
                      >
                        🔊
                      </button>
                    </div>
                    {word.ex2Fa && (
                      <p className="text-xs md:text-sm text-[#5d6676] dark:text-[#a3adbd] mt-1.5 text-right" dir="rtl">
                        {word.ex2Fa}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Verb conjugations if verb */}
          {renderVerbTable()}

          {/* Notes and structure */}
          {renderNotes()}

          {/* Tags */}
          {word.tags && (
            <div className="flex flex-wrap gap-1.5 text-xs text-right">
              {word.tags.split(/[,،]/).map((tag, i) => (
                <span
                  key={i}
                  className="bg-slate-200 dark:bg-slate-700 px-2.5 py-1 rounded-full text-slate-700 dark:text-slate-300"
                >
                  #{tag.trim()}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
