'use client';

import { PanelLeft, PanelRight, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { createChat } from '@/actions/chat';
import { toast } from 'react-hot-toast';

export function SidebarHeader() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { address, isConnected } = useAccount();

  const handleNewChat = async () => {
    if (!isConnected || !address) {
      toast((t) => (
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="font-semibold text-[#CDFF00]">Action Required</span>
            <span className="text-sm text-zinc-300">Connect your wallet to start trading.</span>
          </div>
          <button onClick={() => toast.dismiss(t.id)} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      ), { duration: 3000 });
      return;
    }
    await createChat('New Trade Chat', address);
  };

  const toggleSidebar = () => {
    const sidebar = document.getElementById('main-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('w-64');
      sidebar.classList.toggle('w-[68px]'); // 68px wide when collapsed
      sidebar.classList.toggle('sidebar-collapsed');
      setIsCollapsed(!isCollapsed);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header / Brand Area */}
      <div className={`flex items-center h-10 ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
        {isCollapsed ? (
          <button 
            onClick={toggleSidebar}
            className="group relative w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center transition-transform hover:scale-110 shadow-[0_0_10px_rgba(205,255,0,0.2)] cursor-pointer"
            title="Open Sidebar"
          >
            <img src="/telos_bot.png" alt="Telos" className="w-full h-full object-cover group-hover:opacity-0 transition-opacity absolute inset-0 duration-300" />
            <div className="w-full h-full bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white">
              <PanelRight className="w-5 h-5" />
            </div>
          </button>
        ) : (
          <>
            <button 
              onClick={toggleSidebar}
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors shrink-0 -ml-2 cursor-pointer"
              title="Close Sidebar"
            >
              <PanelLeft className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 shadow-[0_0_10px_rgba(205,255,0,0.3)]">
            <img src="/telos_bot.png" alt="Telos Avatar" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-xl font-medium text-zinc-900 dark:text-white tracking-wide shrink-0">Telos</h1>
          </>
        )}
      </div>

      {/* New Chat Button */}
      <button 
        onClick={handleNewChat}
        className={`w-full flex items-center transition-all duration-300 overflow-hidden cursor-pointer ${
          isCollapsed 
            ? 'justify-center w-9 h-9 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800' 
            : 'justify-center gap-2 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 shadow-sm'
        }`}
        title={isCollapsed ? "New Chat" : ""}
      >
        <Plus className="w-4 h-4 text-[#CDFF00] shrink-0" />
        {!isCollapsed && <span className="font-medium text-sm whitespace-nowrap text-zinc-900 dark:text-white">New Chat</span>}
      </button>
    </div>
  );
}
