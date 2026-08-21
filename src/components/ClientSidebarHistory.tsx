'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { getChats, deleteChat } from '@/actions/chat';
import { MessageSquare, Loader2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

export function ClientSidebarHistory() {
  const { address, isConnected } = useAccount();
  const [chats, setChats] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentChatId = searchParams.get('chatId');

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    try {
      await deleteChat(id);
      setChats(prev => prev.filter(c => c.id !== id));
      if (currentChatId === id) {
        router.push('/');
      }
      toast.success('Chat deleted.', { style: { background: '#18181b', color: '#CDFF00', border: '1px solid rgba(205,255,0,0.2)' } });
    } catch (err) {
      toast.error('Failed to delete chat.', { style: { background: '#18181b', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' } });
    }
  };

  useEffect(() => {
    let isMountedFlag = true;
    
    async function fetchChats() {
      if (isConnected && address) {
        setIsLoading(true);
        try {
          const userChats = await getChats(address);
          if (isMountedFlag) {
            setChats(userChats);
          }
        } catch (error) {
          console.error("Failed to fetch chats", error);
        } finally {
          if (isMountedFlag) {
            setIsLoading(false);
          }
        }
      } else {
        setChats([]);
      }
    }

    fetchChats();

    const handleUpdate = () => {
      fetchChats();
    };

    window.addEventListener('chat-history-updated', handleUpdate);

    return () => {
      isMountedFlag = false;
      window.removeEventListener('chat-history-updated', handleUpdate);
    };
  }, [address, isConnected, currentChatId]); // Re-fetch if chatId changes (new chat created)

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || !isConnected) {
    return (
      <div className="px-3 py-6 text-center text-xs text-zinc-600 group-[.sidebar-collapsed]/sidebar:hidden">
        Connect your wallet to view history.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {isLoading && chats.length === 0 ? (
        <div className="flex justify-center py-4 group-[.sidebar-collapsed]/sidebar:hidden">
          <Loader2 className="w-4 h-4 text-[#CDFF00] animate-spin" />
        </div>
      ) : (
        <>
          {chats.map((chat) => (
            <Link 
              href={`/?chatId=${chat.id}`} 
              key={chat.id} 
              className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors group/item flex items-center justify-between ${
                currentChatId === chat.id 
                  ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white font-medium' 
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-zinc-900 dark:hover:text-zinc-300'
              }`}
              title={chat.title}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare className={`w-4 h-4 shrink-0 transition-colors ${currentChatId === chat.id ? 'text-[#CDFF00]' : 'text-zinc-500 group-hover/item:text-zinc-900 dark:group-hover/item:text-zinc-300'}`} />
                <span className="truncate group-[.sidebar-collapsed]/sidebar:hidden">{chat.title}</span>
              </div>
              
              <button 
                onClick={(e) => handleDelete(e, chat.id)}
                className="p-1 text-zinc-400 dark:text-zinc-500 hover:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover/item:opacity-100 transition-opacity group-[.sidebar-collapsed]/sidebar:hidden"
                title="Delete Chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </Link>
          ))}
          {!isLoading && chats.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-600 group-[.sidebar-collapsed]/sidebar:hidden">No recent chats.</div>
          )}
        </>
      )}
    </div>
  );
}
