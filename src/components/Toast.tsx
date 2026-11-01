import React from 'react';

interface ToastProps {
  message: string;
  isError?: boolean;
}

export const Toast: React.FC<ToastProps> = ({ message, isError }) => {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-[90%] pointer-events-none animate-bounce-subtle"
    >
      <div
        className={`px-4 py-3 rounded-2xl text-xs md:text-sm font-bold shadow-xl border text-center ${
          isError
            ? 'bg-[#fdeaea] text-[#b3261e] border-[#b3261e] dark:bg-[#3a1a18] dark:text-[#ff9a92] dark:border-[#ff9a92]'
            : 'bg-[#e2f5ea] text-[#0d7a3e] border-[#0d7a3e] dark:bg-[#12301f] dark:text-[#6fe0a0] dark:border-[#6fe0a0]'
        }`}
      >
        {message}
      </div>
    </div>
  );
};
