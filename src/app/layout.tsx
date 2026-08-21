import type { Metadata } from 'next';
import './globals.css';

import { Web3Provider } from '@/components/Web3Provider';
import { SidebarProvider } from '@/components/SidebarContext';
import { ThemeProvider } from '@/components/theme-provider';

import { Sidebar } from '@/components/Sidebar';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'OKX AI - Chat-to-Trade',
  description: 'A premium AI-powered trading assistant on X Layer',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased h-screen w-screen flex overflow-hidden bg-white dark:bg-black text-zinc-900 dark:text-white">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <Web3Provider>
            <SidebarProvider>
              <Sidebar />
            <main className="flex-1 flex flex-col overflow-hidden relative">
              {children}
            </main>
            <Toaster 
              position="bottom-right" 
              toastOptions={{
                style: {
                  background: '#18181b', // zinc-900
                  color: '#fff',
                  border: '1px solid #27272a', // zinc-800
                },
              }}
            />
            </SidebarProvider>
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
