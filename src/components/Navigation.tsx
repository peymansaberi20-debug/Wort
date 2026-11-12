import React from 'react';

export type NavTab = 'dash' | 'prac' | 'lib' | 'io' | 'set';

interface NavigationProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

const TABS: { id: NavTab; label: string; icon: string }[] = [
  { id: 'dash', label: 'داشبورد', icon: '🏠' },
  { id: 'prac', label: 'تمرین‌ها', icon: '🎯' },
  { id: 'lib', label: 'واژگان', icon: '📚' }
];

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onSelectTab }) => {
  return (
    <>
      {/* Desktop Sidebar Navigation */}
      <nav className="hidden md:flex flex-col gap-1.5 bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-2.5 shadow-sm sticky top-20">
        {TABS.map(tab => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl font-medium text-sm transition text-right w-full ${
                isActive
                  ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold shadow-sm'
                  : 'text-[#1d2330] dark:text-[#eef1f6] hover:bg-slate-100 dark:hover:bg-[#252c38]'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white/95 dark:bg-[#1b2029]/95 backdrop-blur-md border-t border-[#dde1ea] dark:border-[#333b4a] px-2 py-1.5 flex items-center justify-around shadow-lg">
        {TABS.map(tab => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition flex-1 text-center ${
                isActive
                  ? 'text-[#1f5fbf] dark:text-[#7fb0ff] font-bold'
                  : 'text-[#5d6676] dark:text-[#a3adbd]'
              }`}
            >
              <span className="text-xl mb-0.5">{tab.icon}</span>
              <span className="text-[11px] leading-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
