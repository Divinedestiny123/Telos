import { NextResponse } from 'next/server';
import { createWalletClient, http, publicActions, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayer } from 'viem/chains';
import OKXOracleABI from '@/lib/OKXOracleABI.json';

export async function POST(req: Request) {
  try {
    const { oracleAddress, privateKey, assetAddress, symbol } = await req.json();

    if (!oracleAddress || !privateKey || !assetAddress || !symbol) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // 1. Fetch real price from OKX Public API (or DEX API)
    // For memecoins on X Layer, you'd use OKX DEX API or similar. 
    // Here we use the public ticker API for simplicity in the hackathon.
    const tickerSymbol = symbol === 'WBTC' ? 'BTC-USDT' : (symbol === 'WETH' ? 'ETH-USDT' : `${symbol}-USDT`);

    const response = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${tickerSymbol}`);
    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch price from OKX' }, { status: 500 });
    }

    const priceStr = data.data[0].last; // The latest price
    const priceFloat = parseFloat(priceStr);

    // Convert to 18 decimals (e.g. 60000.50 -> 60000500000000000000000)
    // To avoid precision loss, we stringify it to fixed 6 decimals before parsing
    const scaledPrice = parseUnits(priceFloat.toFixed(6), 18);

    // 2. Push price on-chain via our OKXOracle!
    const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
    const client = createWalletClient({
      account,
      chain: xLayer,
      transport: http()
    }).extend(publicActions);

    const hash = await client.writeContract({
      address: oracleAddress,
      abi: OKXOracleABI,
      functionName: 'updatePrice',
      args: [assetAddress, scaledPrice]
    });

    const receipt = await client.waitForTransactionReceipt({ hash });

    return NextResponse.json({
      success: true,
      symbol,
      price: priceFloat,
      txHash: hash,
      status: receipt.status
    });

  } catch (error: any) {
    console.error('Oracle Update Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
