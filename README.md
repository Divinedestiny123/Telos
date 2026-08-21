# Telos - Your AI Agent for Web3 Trading on X Layer

Telos is an intelligent, conversational Web3 trading assistant built on **X Layer**. By integrating Anthropic's Claude AI with direct on-chain execution, Telos allows users to execute complex DeFi operations—including Spot Swaps on QuickSwap V3 and Perpetual Futures—through natural language.

## Features

- **Natural Language Trading**: Simply type "Swap 1 USDC for WETH" or "Long WETH with 1 USDC at 10x leverage." Telos parses your intent and prepares the exact on-chain transaction.
- **Spot Swaps**: Seamlessly integrated with QuickSwap V3 on X Layer for optimal routing.
- **Perpetual Futures**: Integrated with a custom TelosPerps smart contract on X Layer, complete with real-time OKX Oracle price synchronization.
- **Unified Portfolio Dashboard**: Track your active perpetual positions, unrealized PnL, live price charts, and recent spot swap history all in one place.
- **Failsafe UX**: Built-in RPC bypass links prevent users from getting stuck during congested network conditions.

## Tech Stack

- **Frontend**: Next.js 14, React, Tailwind CSS, Recharts
- **Web3**: viem, wagmi, OKX Connect Wallet
- **AI**: Anthropic Claude 3.5 Haiku API
- **Smart Contracts**: Solidity (Deployed on X Layer)
- **Database**: Prisma with PostgreSQL (for chat history)

## Getting Started

First, install dependencies:
```bash
npm install
```

Set up your `.env.local`:
```
ANTHROPIC_API_KEY=your_api_key
DATABASE_URL=your_postgres_url
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_wc_id
```

Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## X Layer Smart Contracts
- **Telos Perps**: `0x4F6974794B5912beCac93C659ec2ffE73976161F`
- **QuickSwap V3 Router**: `0x4B9f4d2435Ef65559567e5DbFC1BbB37abC43B57`
