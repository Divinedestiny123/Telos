'use client';

import { ReactNode } from 'react';
import { createConfig, WagmiProvider, http } from 'wagmi';
import { xLayer } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const config = createConfig({
  chains: [xLayer],
  connectors: [
    injected() // Use generic injected to avoid "Provider not found" errors with specific targets
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
