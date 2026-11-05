// src/components/ExerciseHeader.tsx
import React from 'react';

interface Props {
  title: string;
  onExit: () => void;
  onOpenHelp: () => void;
  onNextExercise?: () => void;
  onBackStep?: () => void;
}

export const ExerciseHeader: React.FC<Props> = ({
  title,
  onExit,
  onOpenHelp,
  onNextExercise,
  onBackStep
}) => {
  return (
    <div className="w-full mb-6 relative">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        {/* Far Left: Exit Control */}
        <button
          onClick={onExit}
          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="خروج از تمرین"
        >
          ✕
        </button>

        {/* Center Title */}
        <h2 className="text-base font-bold text-gray-800">{title}</h2>

        {/* Right Help Button */}
        <button
          onClick={onOpenHelp}
          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-bold"
          title="راهنما"
        >
          ؟
        </button>
      </div>

      {/* Floating Action Controls on Bottom Left */}
      <div className="fixed bottom-6 left-6 z-40 flex flex-col space-y-2">
        {onNextExercise && (
          <button
            onClick={onNextExercise}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full shadow-lg transition-all"
          >
            تمرین بعدی ←
          </button>
        )}
        {onBackStep && (
          <button
            onClick={onBackStep}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium rounded-full shadow-md"
          >
            بازگشت
          </button>
        )}
      </div>
    </div>
  );
};
