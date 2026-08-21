import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { encodeFunctionData, parseEther, parseUnits, getAddress } from 'viem';
import crypto from 'crypto';
import prisma from '@/lib/prisma';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  timeout: 25000, // 25 second timeout
  maxRetries: 1,
});

const QUICKSWAP_V3_ROUTER = '0x4B9f4d2435Ef65559567e5DbFC1BbB37abC43B57';

async function resolveToken(symbolOrAddress: string): Promise<{ address: string, decimals: number }> {
  // QuickSwap V3 on X Layer has liquidity for Bridged USDC.e, NOT Native USDC.
  // Using Native USDC will cause QuickSwap swaps to revert.
  if (symbolOrAddress.toUpperCase() === 'USDC') return { address: '0x74b7f16337b8972027f6196a17a631ac6de26d22', decimals: 6 };

  try {
    // Fetch official X Layer Token List
    const res = await fetch('https://raw.githubusercontent.com/okx/xlayer-tokenlist/main/xlayer.tokenlist.json', { 
      next: { revalidate: 3600 } 
    });
    if (res.ok) {
      const data = await res.json();
      const token = data.tokens.find((t: any) => 
        t.symbol.toUpperCase() === symbolOrAddress.toUpperCase() || 
        t.address.toLowerCase() === symbolOrAddress.toLowerCase()
      );
      if (token) return { address: token.address, decimals: token.decimals };
    }
  } catch (e) {
    console.error("Failed to fetch token list", e);
  }

  // If passed a raw 0x address but not found in list, assume 18 decimals as fallback
  if (symbolOrAddress.startsWith('0x')) {
    return { address: symbolOrAddress, decimals: 18 };
  }

  // Fallbacks for critical tokens if API fails
  if (symbolOrAddress.toUpperCase() === 'USDT') return { address: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d', decimals: 6 };
  if (symbolOrAddress.toUpperCase() === 'WETH') return { address: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c', decimals: 18 };
  if (symbolOrAddress.toUpperCase() === 'OKB' || symbolOrAddress.toUpperCase() === 'WOKB') return { address: '0xe538905cf8410324e03A5A23C1c177a474D59b2b', decimals: 18 };
  if (symbolOrAddress.toUpperCase() === 'WBTC') return { address: '0xea034fb02eb1808c2cc3adbc15f447b93cbe08e1', decimals: 8 };

  // Generate a deterministic synthetic address for unknown tokens (e.g. SHIB, PEPE on OKX Futures)
  // Use sha256 to get 64 hex chars, take the first 40 (20 bytes), and pad with 0x.
  const hash = crypto.createHash('sha256').update(symbolOrAddress.toUpperCase()).digest('hex');
  const syntheticAddress = '0x' + hash.substring(0, 40);
  
  // Pass through viem's getAddress to ensure the checksum is correct for the transaction builder
  return { address: getAddress(syntheticAddress), decimals: 18 };
}

// This should be set in .env or passed from the client if it's dynamic
const TELOS_PERPS_ADDRESS = '0x4f6974794b5912becac93c659ec2ffe73976161f'; // Real deployed contract

const TELOS_PERPS_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "_asset", "type": "address" },
      { "internalType": "address", "name": "_marginToken", "type": "address" },
      { "internalType": "uint256", "name": "_marginAmt", "type": "uint256" },
      { "internalType": "uint256", "name": "_leverage", "type": "uint256" },
      { "internalType": "bool", "name": "_isLong", "type": "bool" }
    ],
    "name": "openPosition",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

const ALGEBRA_ROUTER_ABI = [
  {
    "inputs": [
      {
        "components": [
          { "internalType": "address", "name": "tokenIn", "type": "address" },
          { "internalType": "address", "name": "tokenOut", "type": "address" },
          { "internalType": "address", "name": "recipient", "type": "address" },
          { "internalType": "uint256", "name": "deadline", "type": "uint256" },
          { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
          { "internalType": "uint256", "name": "amountOutMinimum", "type": "uint256" },
          { "internalType": "uint160", "name": "limitSqrtPrice", "type": "uint160" }
        ],
        "internalType": "struct ISwapRouter.ExactInputSingleParams",
        "name": "params",
        "type": "tuple"
      }
    ],
    "name": "exactInputSingle",
    "outputs": [{ "internalType": "uint256", "name": "amountOut", "type": "uint256" }],
    "stateMutability": "payable",
    "type": "function"
  }
] as const;

const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

export async function POST(req: Request) {
  try {
    // Basic IP rate limiting to protect API keys
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip';
    const now = Date.now();
    const limitData = rateLimitMap.get(ip) || { count: 0, lastReset: now };

    if (now - limitData.lastReset > RATE_LIMIT_WINDOW_MS) {
      limitData.count = 0;
      limitData.lastReset = now;
    }

    if (limitData.count >= MAX_REQUESTS_PER_WINDOW) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
    }

    limitData.count += 1;
    rateLimitMap.set(ip, limitData);

    const { message, address, chatId } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const tools = [
      {
        name: "build_x_layer_transaction",
        description: "Builds a transaction object for X Layer when the user wants to trade, buy, or swap tokens. Do not call this tool unless you have the tokenIn, tokenOut, and amount clearly specified by the user.",
        input_schema: {
          type: "object",
          properties: {
            tokenIn: { type: "string", description: "The token the user wants to sell (e.g. OKB, USDC, USDT, WETH)" },
            tokenOut: { type: "string", description: "The token the user wants to buy" },
            amount: { type: "string", description: "The amount of tokenIn to trade" }
          },
          required: ["tokenIn", "tokenOut", "amount"]
        }
      },
      {
        name: "build_x_layer_perps_transaction",
        description: "Builds a transaction object for X Layer when the user wants to trade perpetuals (open a Long or Short position with leverage). Do not call this tool unless you have the asset (e.g. WBTC, WETH), margin amount, leverage multiplier, and direction (Long/Short).",
        input_schema: {
          type: "object",
          properties: {
            asset: { type: "string", description: "The asset to long or short (e.g., WBTC, WETH)" },
            marginAmt: { type: "string", description: "The amount of margin to use" },
            marginToken: { type: "string", description: "The token to use for margin (e.g., USDC, USDT). Defaults to USDC." },
            leverage: { type: "number", description: "The leverage multiplier (e.g., 10 for 10x)" },
            isLong: { type: "boolean", description: "True if longing, false if shorting" }
          },
          required: ["asset", "marginAmt", "leverage", "isLong"]
        }
      },
      {
        name: "fetch_trending_markets",
        description: "Fetches real-time trending cryptocurrencies and market data. Call this tool when the user asks what is trending, hot, or what they should trade.",
        input_schema: {
          type: "object",
          properties: {}
        }
      }
    ];

    if (!process.env.ANTHROPIC_API_KEY) {
      // Offline fallback: Simulate AI logic
      const lower = message.toLowerCase();
      if (lower.includes('buy') || lower.includes('swap')) {
        if (!lower.includes('with') && !lower.includes('for')) {
          return NextResponse.json({
            content: "I can help you with that trade! Which token would you like to swap from, and exactly how much?",
            isTransaction: false,
          });
        }
        
        const tokenInInfo = await resolveToken('OKB');
        const tokenOutInfo = await resolveToken('USDC');
        const amountInWei = parseEther('1'); // Simulated 1 OKB
        
        const data = encodeFunctionData({
          abi: ALGEBRA_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [{
            tokenIn: tokenInInfo.address as `0x${string}`,
            tokenOut: tokenOutInfo.address as `0x${string}`,
            recipient: (address as `0x${string}`) || '0x0000000000000000000000000000000000000000',
            deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 20),
            amountIn: amountInWei,
            amountOutMinimum: BigInt(0),
            limitSqrtPrice: BigInt(0)
          }]
        });

        const txData = {
          type: 'SPOT',
          to: QUICKSWAP_V3_ROUTER,
          data: data,
          value: amountInWei.toString(), // Send msg.value because tokenIn is native OKB
          display: {
            tokenIn: 'OKB',
            tokenOut: 'USDC',
            amount: '1',
            tokenInAddress: tokenInInfo.address
          }
        };

        return NextResponse.json({
          content: "I've prepared the transaction for you using QuickSwap V3. Please review and sign below.",
          isTransaction: true,
          transactionData: JSON.stringify(txData)
        });
      }

      return NextResponse.json({
        content: "I'm in offline mode right now. Ask me to 'swap' or 'buy' to see a demo trade!",
        isTransaction: false
      });
    }

    let messagesArray: any[] = [];
    
    // Fetch chat history if we have a chatId
    if (chatId) {
      const history = await prisma.message.findMany({
        where: { chatId },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      
      // Anthropic requires alternating user/assistant messages.
      // We group consecutive messages of the same role to prevent API errors.
      let lastRole = '';
      for (const msg of history) {
        // Skip transactions or empty messages for pure text context
        if (!msg.content) continue;
        
        if (msg.role === lastRole && messagesArray.length > 0) {
          messagesArray[messagesArray.length - 1].content += `\n\n${msg.content}`;
        } else {
          messagesArray.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
          lastRole = msg.role;
        }
      }
    }
    
    // Append the current user message
    if (messagesArray.length > 0 && messagesArray[messagesArray.length - 1].role === 'user') {
      messagesArray[messagesArray.length - 1].content += `\n\n${message}`;
    } else {
      messagesArray.push({ role: 'user', content: message });
    }

    let response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: "You are Telos, a professional Web3 trading assistant on the X Layer network. Your job is to help the user execute trades. For spot swaps, if the user doesn't provide Input Token, Output Token, and Amount, ask for them. For perpetuals, if the user doesn't provide the Asset, Margin Amount, Leverage, and Direction (Long/Short), ask for them. DO NOT GUESS. If the user asks to trade an obscure token or memecoin (not a major asset like BTC, ETH, USDC), politely ask them to provide its 0x contract address to ensure accuracy, unless they already provided it. CRITICAL: Review the ENTIRE conversation history. If the user has already provided a parameter (like asset, leverage, margin, or direction) in a previous message, remember it and DO NOT ask for it again! Once you have gathered all required parameters, IMMEDIATELY call the appropriate transaction tool. If the user asks about market trends, use the fetch_trending_markets tool.",
      messages: messagesArray,
      tools: tools as any,
    });

    let replyText = "";
    let isTransaction = false;
    let transactionData = null;

    for (const block of response.content) {
      if (block.type === 'text') {
        replyText += block.text;
      } else if (block.type === 'tool_use' && block.name === 'build_x_layer_transaction') {
        const args = block.input as any;
        
        try {
          const tokenInInfo = await resolveToken(args.tokenIn);
          const tokenOutInfo = await resolveToken(args.tokenOut);
          
          const amountInWei = parseUnits(args.amount.toString() || '0', tokenInInfo.decimals);

          const data = encodeFunctionData({
            abi: ALGEBRA_ROUTER_ABI,
            functionName: 'exactInputSingle',
            args: [{
              tokenIn: tokenInInfo.address as `0x${string}`,
              tokenOut: tokenOutInfo.address as `0x${string}`,
              recipient: (address as `0x${string}`) || '0x0000000000000000000000000000000000000000',
              deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 20),
              amountIn: amountInWei,
              amountOutMinimum: BigInt(0),
              limitSqrtPrice: BigInt(0)
            }]
          });

          const txData = {
            type: 'SPOT',
            to: QUICKSWAP_V3_ROUTER,
            data: data,
            value: args.tokenIn.toUpperCase() === 'OKB' ? amountInWei.toString() : "0", 
            display: {
              tokenIn: args.tokenIn,
              tokenOut: args.tokenOut,
              amount: args.amount,
              tokenInAddress: tokenInInfo.address
            }
          };

          transactionData = JSON.stringify(txData);
          isTransaction = true;
          
          if (!replyText) {
            replyText = "I have prepared the spot swap transaction for you using QuickSwap V3. Please review and execute below.";
          }
        } catch (e: any) {
          replyText += `\n\nI couldn't prepare the swap: ${e.message}`;
          isTransaction = false;
        }
      } else if (block.type === 'tool_use' && block.name === 'build_x_layer_perps_transaction') {
        const args = block.input as any;
        
        try {
          const assetToken = await resolveToken(args.asset);



          const marginTokenInfo = await resolveToken(args.marginToken || 'USDC');
          
          const marginWei = parseUnits(args.marginAmt.toString() || '0', marginTokenInfo.decimals);
            
          const leverageInt = BigInt(Math.floor(Number(args.leverage)));

          const data = encodeFunctionData({
            abi: TELOS_PERPS_ABI,
            functionName: 'openPosition',
            args: [
              assetToken.address as `0x${string}`,
              marginTokenInfo.address as `0x${string}`,
              marginWei,
              leverageInt,
              args.isLong
            ]
          });

          const txData = {
            type: 'PERPS',
            to: process.env.NEXT_PUBLIC_TELOS_PERPS_ADDRESS || TELOS_PERPS_ADDRESS,
            data: data,
            value: "0",
            display: {
              asset: args.asset,
              marginAmt: args.marginAmt,
              marginToken: args.marginToken || 'USDC',
              leverage: leverageInt.toString(),
              isLong: args.isLong,
              tokenInAddress: marginTokenInfo.address,
              assetAddress: assetToken.address
            }
          };

          transactionData = JSON.stringify(txData);
          isTransaction = true;
          
          if (!replyText) {
            replyText = `I have prepared your ${leverageInt.toString()}x ${args.isLong ? 'Long' : 'Short'} position on ${args.asset.toUpperCase()}. Please review and execute below.`;
          }
        } catch (e: any) {
          replyText += `\n\nI couldn't prepare the perpetual trade: ${e.message}`;
          isTransaction = false;
        }
      } else if (block.type === 'tool_use' && block.name === 'fetch_trending_markets') {
        try {
          const apiKey = process.env.OKX_API_KEY || '';
          const secret = process.env.OKX_API_SECRET || '';
          const passphrase = process.env.OKX_API_PASSPHRASE || '';

          if (!apiKey || !secret || !passphrase) {
            throw new Error("Missing OKX API credentials in environment variables.");
          }

          const timestamp = new Date().toISOString();
          const method = 'GET';
          const requestPath = '/api/v5/market/tickers?instType=SWAP';
          const signStr = timestamp + method + requestPath;
          const sign = crypto.createHmac('sha256', secret).update(signStr).digest('base64');

          const okxResponse = await fetch('https://www.okx.com' + requestPath, {
            method: 'GET',
            headers: {
              'OK-ACCESS-KEY': apiKey,
              'OK-ACCESS-SIGN': sign,
              'OK-ACCESS-TIMESTAMP': timestamp,
              'OK-ACCESS-PASSPHRASE': passphrase,
              'User-Agent': 'Mozilla/5.0'
            },
            next: { revalidate: 30 } // Cache for 30s
          });

          if (!okxResponse.ok) {
             throw new Error(`OKX API Error: ${okxResponse.status}`);
          }
          const okxData = await okxResponse.json();
          
          if (okxData.code !== "0") {
             throw new Error(okxData.msg);
          }

          // Sort by 24h volume descending and take top 5
          const sortedTickers = okxData.data.sort((a: any, b: any) => parseFloat(b.volCcy24h) - parseFloat(a.volCcy24h)).slice(0, 5);
          
          const marketDataStr = sortedTickers.map((t: any) => 
            `Token: ${t.instId.replace('-USDT-SWAP', '')} | Price: $${parseFloat(t.last).toFixed(4)} | 24h Vol: $${(parseFloat(t.volCcy24h)/1000000).toFixed(2)}M`
          ).join('\\n');

          messagesArray.push({ role: 'assistant', content: response.content });
          messagesArray.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: block.id, content: `Real OKX Futures Top Volume:\\n${marketDataStr}` }]
          });

          const secondResponse = await anthropic.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 1024,
            system: "You are Telos. Present the real OKX trending futures data to the user naturally and concisely. Suggest they can execute a demo perp trade on these assets via our smart contract.",
            messages: messagesArray,
            tools: tools as any,
          });

          for (const secondBlock of secondResponse.content) {
            if (secondBlock.type === 'text') replyText += secondBlock.text;
          }
        } catch (e: any) {
          replyText = `I couldn't fetch live market data from OKX right now (${e.message}). You can still trade major assets like WBTC or WETH directly!`;
        }
      }
    }

    return NextResponse.json({
      content: replyText,
      isTransaction,
      transactionData
    });
  } catch (error: any) {
    console.error('Anthropic API Error:', JSON.stringify({
      message: error.message,
      status: error.status,
      code: error.code,
      type: error?.error?.type,
    }));
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
