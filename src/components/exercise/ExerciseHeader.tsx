import React from 'react';

interface Props {
  title: string;
  onExit: () => void;
  onOpenHelp: () => void;
  onNextExercise?: () => void;
  onBackStep?: () => void;
  timeRemaining?: number;
}

export const ExerciseHeader: React.FC<Props> = ({
  title,
  onExit,
  onOpenHelp,
  onNextExercise,
  onBackStep,
  timeRemaining
}) => {
  return (
    <div className="relative w-full mb-6">
      {/* Top Standardized Toolbar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        {/* Far Left: Exit Control */}
        <button
          onClick={onExit}
          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center"
          aria-label="Exit Exercise"
          title="خروج از تمرین"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Center: Title */}
        <h2 className="text-lg font-bold text-gray-800">{title}</h2>

        {/* Right Group: Timer & Help Icon */}
        <div className="flex items-center space-x-3 rtl:space-x-reverse">
          {timeRemaining !== undefined && (
            <div className="text-sm font-mono font-semibold bg-gray-100 px-3 py-1 rounded-md text-gray-700">
              ⏱ {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
            </div>
          )}
          <button
            onClick={onOpenHelp}
            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            aria-label="Help"
            title="راهنما"
          >
            <span className="text-xl font-bold">؟</span>
          </button>
        </div>
      </div>

      {/* Floating Action Controls on Left Bottom/Side */}
      <div className="fixed bottom-6 left-6 z-40 flex flex-col space-y-3">
        {/* Floating Next Exercise Button (Positioned Above Back Button) */}
        {onNextExercise && (
          <button
            onClick={onNextExercise}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full shadow-lg transition-transform active:scale-95 flex items-center justify-center space-x-2"
            title="تمرین بعدی"
          >
            <span>تمرین بعدی</span>
            <span>←</span>
          </button>
        )}

        {/* Back Button */}
        {onBackStep && (
          <button
            onClick={onBackStep}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-full shadow-md text-sm transition-colors"
            title="بازگشت"
          >
            بازگشت
          </button>
        )}
      </div>
    </div>
  );
};
