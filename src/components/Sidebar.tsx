'use client';

import { useState, Suspense } from 'react';
import { Settings, Briefcase, Loader2 } from 'lucide-react';
import { SidebarHeader } from '@/components/SidebarHeader';
import { ClientSidebarHistory } from '@/components/ClientSidebarHistory';
import { useSidebar } from '@/components/SidebarContext';
import { DashboardModal } from '@/components/DashboardModal';
import { SettingsModal } from '@/components/SettingsModal';

export function Sidebar() {
  const { isOpen, closeSidebar } = useSidebar();
  const [isPortfolioOpen, setIsPortfolioOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={closeSidebar}
        />
      )}
      
      <aside id="main-sidebar" className={`group/sidebar fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-black border-r border-zinc-200 dark:border-zinc-900 h-full flex flex-col transition-all duration-300 lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Top Section / Header */}
        <SidebarHeader />

        {/* History Section */}
        <div className="flex-1 overflow-y-auto px-2 py-4 custom-scrollbar">
          <h3 className="text-[11px] font-semibold text-zinc-600 uppercase tracking-widest mb-3 px-2 group-[.sidebar-collapsed]/sidebar:hidden">Recent</h3>
          
          <Suspense fallback={<div className="text-zinc-500 text-xs text-center py-4"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>}>
            <ClientSidebarHistory />
          </Suspense>
        </div>

        {/* Bottom Section */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-900 space-y-2">
          <button 
            onClick={() => setIsPortfolioOpen(true)}
            className="w-full flex items-center gap-3 px-3 group-[.sidebar-collapsed]/sidebar:px-0 group-[.sidebar-collapsed]/sidebar:justify-center py-2.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-white transition-colors text-sm text-left group/link"
            title="Portfolio"
          >
            <Briefcase className="w-4 h-4 text-zinc-500 group-hover/link:text-zinc-300 shrink-0 transition-colors" />
            <span className="truncate group-[.sidebar-collapsed]/sidebar:hidden">Portfolio</span>
          </button>
          
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-3 group-[.sidebar-collapsed]/sidebar:px-0 group-[.sidebar-collapsed]/sidebar:justify-center py-2.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-white transition-colors text-sm text-left group/link"
            title="Settings"
          >
            <Settings className="w-4 h-4 text-zinc-500 group-hover/link:text-zinc-300 shrink-0 transition-colors" />
            <span className="truncate group-[.sidebar-collapsed]/sidebar:hidden">Settings</span>
          </button>
        </div>
      </aside>

      <DashboardModal isOpen={isPortfolioOpen} onClose={() => setIsPortfolioOpen(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
}
