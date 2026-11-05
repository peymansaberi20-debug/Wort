// src/components/PwaExitModal.tsx
import React from 'react';

interface Props {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const PwaExitModal: React.FC<Props> = ({ isOpen, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl text-right dir-rtl">
        <h3 className="text-xl font-bold text-gray-800 mb-3">تأیید خروج</h3>
        <p className="text-gray-600 mb-6 text-base">آیا می‌خواهید از برنامه خارج شوید؟</p>
        
        <div className="flex space-x-2 rtl:space-x-reverse justify-end">
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            تأیید خروج
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-colors"
          >
            انصراف
          </button>
        </div>
      </div>
    </div>
  );
};
