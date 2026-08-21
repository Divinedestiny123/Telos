'use client';

import { ReactNode } from 'react';
import { createConfig, WagmiProvider, http } from 'wagmi';
import { xLayer } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const config = createConfig({
  chains: [xLayer],
  connectors: [
    injected({
      target() {
        return {
          id: 'okxWallet',
          name: 'OKX Wallet',
          provider: typeof window !== 'undefined' ? (window as any).okxwallet : undefined,
        }
      }
    }),
    injected() // Fallback to generic injected (MetaMask, etc) if OKX Wallet is not found
  ],
  transports: {
    [xLayer.id]: http(),
  },
});

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
