'use client';

import { useState, useEffect, useRef } from 'react';
import { Bot, Send, User, PanelLeft, Wallet, X, LogOut, Menu, Copy, Check } from 'lucide-react';
import { TransactionPreview } from '@/components/TransactionPreview';
import { saveMessage, createChatSilent, updateChatTitle } from '@/actions/chat';
import { useConnect, useAccount, useDisconnect, useSwitchChain } from 'wagmi';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { useSidebar } from './SidebarContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isTransaction?: boolean;
  transactionData?: string;
  timestamp?: string;
  animate?: boolean;
};

function Typewriter({ content, onComplete, messagesEndRef }: { content: string, onComplete: () => void, messagesEndRef: React.RefObject<HTMLDivElement | null> }) {
  const [displayed, setDisplayed] = useState('');
  
  useEffect(() => {
    let i = 0;
    const chunkSize = 3; // Number of characters to reveal per tick
    
    const timer = setInterval(() => {
      i += chunkSize;
      setDisplayed(content.slice(0, i));
      
      // Auto-scroll while typing
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });

      if (i >= content.length) {
        clearInterval(timer);
        onComplete();
      }
    }, 15); // 15ms per chunk for a fast, readable speed
    
    return () => clearInterval(timer);
  }, [content, onComplete, messagesEndRef]);

  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayed}</ReactMarkdown>;
}

export function ChatArea({ initialMessages, chatId }: { initialMessages: Message[], chatId?: string }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isMounted, setIsMounted] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const createdChatIdRef = useRef<string | null>(null);

  // Wallet Logic
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  // Auto-switch to X Layer Mainnet if on the wrong network
  useEffect(() => {
    if (isConnected && chainId && chainId !== 196 && switchChain) {
      switchChain({ chainId: 196 });
    }
  }, [isConnected, chainId, switchChain]);
  const router = useRouter();
  const { toggleSidebar } = useSidebar();

  const handleWalletClick = () => {
    try {
      if (!isConnected) {
        const isOkxAvailable = typeof window !== 'undefined' && (window as any).okxwallet;
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // If on mobile and OKX Wallet is not active in the browser, redirect to OKX App
        if (isMobile && !isOkxAvailable) {
          const dappUrl = window.location.href;
          window.location.href = `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(dappUrl)}`;
          return;
        }

        const okxConnector = connectors.find(c => c.id === 'okxWallet');
        const genericInjected = connectors.find(c => c.id === 'injected');
        
        // Prioritize okxWallet. If not installed, fallback to generic injected to trigger standard error.
        const targetConnector = isOkxAvailable ? (okxConnector || genericInjected) : (okxConnector || genericInjected);
                                
        if (targetConnector) {
          connect({ connector: targetConnector }, {
            onSuccess: () => {
              toast((t) => (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="font-semibold text-[#CDFF00]">Wallet Connected</span>
                    <span className="text-sm text-zinc-300">Your secure session is active.</span>
                  </div>
                  <button onClick={() => toast.dismiss(t.id)} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ), { duration: 3000 });
            },
            onError: (error) => {
              console.error("Connection error:", error);
              
              toast((t) => (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="font-semibold text-[#CDFF00]">Connection Failed</span>
                    <span className="text-sm text-zinc-300">
                      Please install or open the OKX Wallet extension.
                    </span>
                  </div>
                  <button onClick={() => toast.dismiss(t.id)} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ), { duration: 5000 });
            }
          });
        } else {
          toast((t) => (
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="font-semibold text-[#CDFF00]">Wallet Error</span>
                <span className="text-sm text-zinc-300">Could not initialize connection options.</span>
              </div>
              <button onClick={() => toast.dismiss(t.id)} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ), { duration: 5000 });
        }
      }
    } catch (error) {
      console.error(error);
      toast.error('An unexpected error occurred.', { duration: 3000 });
    }
  };

  // Sync state only when navigating between different chats
  useEffect(() => {
    if (createdChatIdRef.current && createdChatIdRef.current === chatId) return;
    setMessages(initialMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input, timestamp };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    // Add loading indicator message
    const loadingId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: loadingId, role: 'assistant', content: '...' }]);

    let activeChatId = chatId || createdChatIdRef.current;
    let isNewChat = false;

    if (!activeChatId && address) {
      try {
        isNewChat = true;
        activeChatId = await createChatSilent("New Chat", address);
        createdChatIdRef.current = activeChatId;
        // Do not router.replace yet, to avoid unmounting ChatArea and losing the loading state
      } catch (error) {
        console.error("Error creating chat", error);
      }
    }

    const isFirstMessage = messages.length === 0;

    if ((isNewChat || isFirstMessage) && activeChatId) {
      // Fire off title generation in the background
      const currentActiveChatId = activeChatId;
      fetch('/api/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.content }),
      })
      .then(res => res.json())
      .then(async data => {
        if (data.title) {
          await updateChatTitle(currentActiveChatId, data.title);
          window.dispatchEvent(new Event('chat-history-updated'));
        }
      })
      .catch(console.error);
    }

    // Save user message to DB if we are in a chat
    if (activeChatId) {
      await saveMessage(activeChatId, 'user', userMessage.content, false);
    }

    try {
      const [res] = await Promise.all([
        fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userMessage.content, address, chatId: activeChatId }),
        }),
        new Promise(resolve => setTimeout(resolve, 2000)) // Minimum delay to show "thinking" animation
      ]);

      if (!res.ok) {
        throw new Error(res.status === 500 ? 'Network timeout communicating with AI.' : 'Error fetching response');
      }

      const data = await res.json();

      setMessages((prev) => prev.map((msg) =>
        msg.id === loadingId
          ? { ...msg, content: data.content || 'Error fetching response', isTransaction: data.isTransaction, transactionData: data.transactionData, animate: true }
          : msg
      ));

      // Save assistant message to DB
      if (activeChatId) {
        await saveMessage(activeChatId, 'assistant', data.content || 'Error fetching response', data.isTransaction, data.transactionData);
      }
      
      if (isNewChat && activeChatId) {
        router.replace(`/?chatId=${activeChatId}`);
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Network Error.';
      setMessages((prev) => prev.map((msg) =>
        msg.id === loadingId ? { ...msg, content: errorMsg } : msg
      ));
    }
  };

    return (
      <div className="flex flex-col h-full bg-white dark:bg-black relative">
      {/* Top Bar */}
      <div className="flex justify-between items-center px-4 lg:px-6 py-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={toggleSidebar}
            className="p-2 -ml-2 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors lg:hidden cursor-pointer"
          >
            <Menu className="w-6 h-6" />
          </button>
          {/* Mobile title */}
          <span className="font-semibold text-zinc-900 dark:text-white lg:hidden">Telos</span>
        </div>

        <div className="flex items-center gap-3">
          {chatId && <span className="hidden sm:inline-block text-xs bg-[#CDFF00]/10 text-[#CDFF00] px-2 py-1 rounded">Active Session</span>}
          <button 
            onClick={handleWalletClick}
            className={`flex items-center gap-2 px-4 py-2 border rounded-full text-sm font-medium transition-colors cursor-pointer ${isMounted && isConnected ? 'bg-[#CDFF00]/10 border-[#CDFF00]/20 text-emerald-600 dark:text-[#CDFF00]' : 'bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white'}`}
          >
            <Wallet className="w-4 h-4" />
            <span>
              {isMounted && isConnected && address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connect'}
            </span>
          </button>
          
          {isMounted && isConnected && (
            <button 
              onClick={() => disconnect(undefined, {
                onSuccess: () => {
                  toast((t) => (
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-zinc-300">Wallet Disconnected</span>
                        <span className="text-sm text-zinc-500">Your session has been ended.</span>
                      </div>
                      <button onClick={() => toast.dismiss(t.id)} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ), { duration: 3000 });
                }
              })}
              className="p-2.5 rounded-full bg-zinc-100 dark:bg-zinc-900 hover:bg-red-500/10 dark:hover:bg-red-500/20 text-zinc-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 border border-zinc-200 dark:border-zinc-800 transition-colors cursor-pointer"
              title="Disconnect Wallet"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto px-4 pb-32 custom-scrollbar">
          <div className="max-w-3xl mx-auto space-y-10 pt-8">
            {isMounted && !isConnected ? (
              <div className="h-full flex flex-col items-center justify-center mt-32 space-y-6 text-center animate-fade-in">
                <div className="relative">
                  <div className="absolute inset-0 bg-[#CDFF00] blur-xl opacity-20 rounded-full"></div>
                  <div className="w-16 h-16 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-[#CDFF00]/30 shadow-lg flex items-center justify-center relative overflow-hidden">
                    <img src="/telos_bot.png" alt="Telos Logo" className="w-full h-full object-cover" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Welcome to Telos</h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-[280px] mx-auto">
                    Connect your OKX Wallet to access your secure trading terminal.
                  </p>
                </div>

                <button 
                  onClick={handleWalletClick}
                  className="mt-6 flex items-center gap-2 px-8 py-3 bg-[#CDFF00] hover:bg-[#b8e600] text-black font-semibold rounded-full transition-transform hover:scale-105 shadow-[0_0_20px_rgba(205,255,0,0.3)] cursor-pointer"
                >
                  <Wallet className="w-5 h-5" />
                  <span>Connect Wallet</span>
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center mt-32 space-y-6 text-center animate-fade-in">
                <div className="relative">
                  <div className="absolute inset-0 bg-[#CDFF00] blur-xl opacity-20 rounded-full"></div>
                  <div className="w-16 h-16 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-[#CDFF00]/30 shadow-lg flex items-center justify-center relative overflow-hidden">
                    <img src="/telos_bot.png" alt="Telos Logo" className="w-full h-full object-cover" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-medium tracking-tight text-zinc-900 dark:text-white">How can I help you trade today?</h2>
                  <p className="text-zinc-500 text-sm max-w-sm mx-auto">Select "New Chat" to begin a secure session.</p>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 lg:gap-4 animate-fade-in ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  {msg.role !== 'user' && (
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full overflow-hidden flex items-center justify-center mt-1 transition-all duration-300 ${
                      msg.content === '...' 
                        ? 'shadow-[0_0_20px_rgba(205,255,0,0.6)] animate-pulse border border-[#CDFF00]/50' 
                        : 'shadow-[0_0_15px_rgba(205,255,0,0.2)]'
                    }`}>
                      <img src="/telos_bot.png" alt="Telos Avatar" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[95%] lg:max-w-[85%] group`}>
                    <div className="flex items-center gap-2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {msg.role === 'user' && (
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(msg.content);
                            setCopiedId(msg.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="p-1 rounded text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
                        >
                          {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <span className="text-[11px] text-zinc-500">
                        {msg.role === 'user' ? 'You' : 'Telos'} {msg.timestamp && `• ${msg.timestamp}`}
                      </span>
                      {msg.role !== 'user' && (
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(msg.content);
                            setCopiedId(msg.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="p-1 rounded text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
                        >
                          {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                    <div className={`text-[15px] lg:text-[16px] leading-relaxed px-4 py-2.5 lg:px-5 lg:py-3 ${msg.role === 'user' ? 'bg-zinc-100 dark:bg-zinc-900 rounded-3xl text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300'}`}>
                      {msg.content === '...' ? (
                        <div className="flex items-center gap-3 h-6 px-1">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-[#CDFF00] rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                            <div className="w-2 h-2 bg-[#CDFF00] rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                            <div className="w-2 h-2 bg-[#CDFF00] rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                          </div>
                          <span className="text-sm font-medium bg-gradient-to-r from-zinc-500 to-zinc-400 bg-clip-text text-transparent animate-pulse">
                            Thinking...
                          </span>
                        </div>
                      ) : (
                        <div className="prose prose-zinc dark:prose-invert prose-p:leading-relaxed prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-800 prose-pre:border prose-pre:border-zinc-200 dark:prose-pre:border-zinc-700/50 max-w-none break-words">
                          {msg.animate ? (
                            <Typewriter 
                              content={msg.content} 
                              messagesEndRef={messagesEndRef}
                              onComplete={() => {
                                setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, animate: false } : m));
                              }} 
                            />
                          ) : (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          )}
                        </div>
                      )}
                    </div>

                    {msg.isTransaction && (
                      <div className="mt-3 lg:mt-4 w-full">
                        <TransactionPreview data={msg.transactionData} />
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} className="pb-4" />
          </div>
        </div>

        {/* Floating Input Area */}
        {isMounted && isConnected && (
          <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-white via-white/95 dark:from-black dark:via-black/95 to-transparent pt-10 pb-6 px-4">
            <div className="max-w-3xl mx-auto relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask Telos to trade..."
                className="w-full bg-zinc-50 dark:bg-zinc-900/50 backdrop-blur-md border border-zinc-200 dark:border-zinc-700/50 rounded-full py-3.5 lg:py-4 pl-6 pr-14 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-all text-[15px] lg:text-base"
              />
              <button
                onClick={handleSend}
                className="absolute right-2 p-2.5 rounded-full bg-black dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                disabled={!input.trim()}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <div className="text-center mt-3 text-xs text-zinc-600">
              Telos can make mistakes. Consider verifying important information.
            </div>
          </div>
        )}
      </div>
    );
  }
