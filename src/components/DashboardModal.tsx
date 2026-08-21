'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWalletClient } from 'wagmi';
import { formatEther, formatUnits, parseUnits } from 'viem';
import { X, Settings2, Briefcase, Activity, ExternalLink, RefreshCw } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import toast from 'react-hot-toast';

import TelosPerpsABI from '@/lib/TelosPerpsABI.json';
import OKXOracleABI from '@/lib/OKXOracleABI.json';

const TELOS_PERPS_ADDRESS = '0x4f6974794b5912becac93c659ec2ffe73976161f';

const MOCK_TOKEN_NAMES: Record<string, string> = {
  '0x5a77f1443d16ee5761d310e38b62f77f726bc71c': 'WETH',
  '0x814041eaec55b8ef2f056dcd69651bf279e8cd5e': 'WBTC',
  '0xe538905cf8410324e03a5a23c1c177a474d59b2b': 'WOKB',
  '0xa8ce8aee21bc2a48a5ef670afcc9274c7bbbc035': 'USDC.e',
  '0xb6ceceab302e2e4948951ee7843fc24e92933061': 'USDC',
  '0x1e4a5963ab6d7679c5300684f5599b1099bfd975': 'USDT',
  '0x1111111111111111111111111111111111111111': 'RTX',
  '0x2222222222222222222222222222222222222222': 'X'
};

const MOCK_TOKEN_DECIMALS: Record<string, number> = {
  '0xa8ce8aee21bc2a48a5ef670afcc9274c7bbbc035': 6,
  '0xb6ceceab302e2e4948951ee7843fc24e92933061': 6,
  '0x1e4a5963ab6d7679c5300684f5599b1099bfd975': 6,
};

export function DashboardModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [tokenNames, setTokenNames] = useState<Record<string, string>>(MOCK_TOKEN_NAMES);
  const [tokenDecimals, setTokenDecimals] = useState<Record<string, number>>(MOCK_TOKEN_DECIMALS);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [priceHistories, setPriceHistories] = useState<Record<string, any[]>>({});
  const [syncedAssets, setSyncedAssets] = useState<Record<string, boolean>>({});
  const [isSyncing, setIsSyncing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/okx/xlayer-tokenlist/main/xlayer.tokenlist.json')
      .then(res => res.json())
      .then(data => {
        const names = { ...MOCK_TOKEN_NAMES };
        const decimals = { ...MOCK_TOKEN_DECIMALS };
        data.tokens.forEach((t: any) => {
          names[t.address.toLowerCase()] = t.symbol;
          decimals[t.address.toLowerCase()] = t.decimals;
        });
        setTokenNames(names);
        setTokenDecimals(decimals);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    
    const fetchLivePrices = async () => {
      // Check BTC and ETH for now as they are most common
      const assetsToCheck = ['BTC-USDT', 'ETH-USDT', 'OKB-USDT'];
      const newPrices: Record<string, number> = {};
      
      for (const symbol of assetsToCheck) {
        try {
          const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}`);
          const json = await res.json();
          if (json.data && json.data.length > 0) {
            newPrices[symbol.split('-')[0]] = parseFloat(json.data[0].last);
          }
        } catch (e) {}
      }

      setLivePrices(prev => {
        const updated = { ...prev };
        // Map back to addresses
        for (const [addr, name] of Object.entries(tokenNames)) {
          for (const s of Object.keys(newPrices)) {
            if (name.includes(s)) updated[addr.toLowerCase()] = newPrices[s];
          }
        }
        
        setPriceHistories(hist => {
          const newHist = { ...hist };
          for (const asset of Object.keys(updated)) {
            const arr = [...(newHist[asset] || Array.from({length: 20}).map(() => ({ price: updated[asset] * (1 + (Math.random()*0.002 - 0.001)) })))];
            arr.push({ price: updated[asset] });
            if (arr.length > 20) arr.shift();
            newHist[asset] = arr;
          }
          return newHist;
        });
        
        return updated;
      });
    };

    fetchLivePrices();
    const interval = setInterval(fetchLivePrices, 2500);
    return () => clearInterval(interval);
  }, [isOpen, tokenNames]);
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { writeContract, isPending: isClosing } = useWriteContract();

  const { data: oracleAddress } = useReadContract({
    address: TELOS_PERPS_ADDRESS,
    abi: TelosPerpsABI,
    functionName: 'oracle',
  });

  const handleClosePosition = (positionId: bigint) => {
    writeContract({
      address: TELOS_PERPS_ADDRESS,
      abi: TelosPerpsABI,
      functionName: 'closePosition',
      args: [positionId]
    });
  };

  const syncOraclePrice = async (assetAddress: string, symbol: string) => {
    if (!walletClient || !oracleAddress || !address) {
      toast.error("Wallet not connected");
      return;
    }
    
    setIsSyncing(prev => ({ ...prev, [assetAddress]: true }));
    try {
      const tickerSymbol = symbol === 'WBTC' ? 'BTC-USDT' : (symbol === 'WETH' ? 'ETH-USDT' : `${symbol}-USDT`);
      const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${tickerSymbol}`);
      const json = await res.json();
      
      if (!json.data || json.data.length === 0) throw new Error("Failed to fetch from OKX API");
      
      const priceFloat = parseFloat(json.data[0].last);
      const scaledPrice = parseUnits(priceFloat.toFixed(6), 18);
      
      toast.loading("Syncing Oracle...", { id: `sync-${assetAddress}` });
      const hash = await walletClient.writeContract({
        address: oracleAddress as `0x${string}`,
        abi: OKXOracleABI,
        functionName: 'updatePrice',
        args: [assetAddress, scaledPrice],
        account: address
      });
      
      toast.success("Oracle synced!", { id: `sync-${assetAddress}` });
      setSyncedAssets(prev => ({ ...prev, [assetAddress]: true }));
    } catch (e: any) {
      toast.error(`Sync failed: ${e.message}`, { id: `sync-${assetAddress}` });
    } finally {
      setIsSyncing(prev => ({ ...prev, [assetAddress]: false }));
    }
  };

  const { data: positionIdsData, isLoading: isLoadingIds } = useReadContract({
    address: TELOS_PERPS_ADDRESS,
    abi: TelosPerpsABI as any,
    functionName: 'getUserPositions',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isOpen,
    }
  });
  const positionIds = positionIdsData as readonly bigint[] | undefined;

  // 2. Fetch details for each position ID
  const contracts = useMemo(() => {
    return (positionIds as readonly bigint[] || []).map((id) => ({
      address: TELOS_PERPS_ADDRESS as `0x${string}`,
      abi: TelosPerpsABI as any,
      functionName: 'positions',
      args: [id]
    }));
  }, [positionIds]);

  const { data: positionsData, isLoading: isLoadingPositions } = useReadContracts({
    contracts,
    query: {
      enabled: !!positionIds && positionIds.length > 0 && isOpen,
    }
  });

  // 3. Fetch latest prices for the assets in the positions
  const priceContracts = useMemo(() => {
    if (!positionsData) return [];
    return positionsData.map((res: any) => {
      if (!res.result || !res.result[7]) return null; // !isOpen
      return {
        address: TELOS_PERPS_ADDRESS as `0x${string}`,
        abi: TelosPerpsABI as any,
        functionName: 'getLatestPrice',
        args: [res.result[1]] // asset
      };
    }).filter(Boolean);
  }, [positionsData]);

  const { data: pricesData, isLoading: isLoadingPrices } = useReadContracts({
    contracts: priceContracts as any,
    query: {
      enabled: !!(priceContracts as any[]).length && isOpen,
    }
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-8 h-full overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
              <Activity className="w-6 h-6 text-[#CDFF00]" />
              Active Positions
            </h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300">
            <div>
              {!address ? (
                  <div className="p-8 text-center border border-zinc-200 dark:border-zinc-800 border-dashed rounded-2xl text-zinc-500">
                    Connect your wallet to view on-chain positions.
                  </div>
                ) : isLoadingIds || (positionIds && positionIds.length > 0 && (isLoadingPositions || isLoadingPrices) && !positionsData) ? (
                  <div className="space-y-3">
                    <div className="h-24 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl animate-pulse"></div>
                    <div className="h-24 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl animate-pulse"></div>
                  </div>
                ) : !positionsData || !positionsData.some((res: any) => res.result && res.result[7]) ? (
                  <div className="p-8 text-center border border-zinc-200 dark:border-zinc-800 border-dashed rounded-2xl text-zinc-500">
                    No active positions found on X Layer.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {positionsData.map((res: any, i: number) => {
                      if (!res.result) return null;
                      
                      const positionId = positionIds?.[i];
                      const [user, asset, marginToken, marginAmt, leverage, isLong, entryPrice, isOpen] = res.result;
                      
                      if (!isOpen) return null;

                      const assetName = tokenNames[asset.toLowerCase()] || `UNKNOWN`;
                      const marginTokenName = tokenNames[marginToken.toLowerCase()] || `USDC`;
                      const decimals = tokenDecimals[marginToken.toLowerCase()] || 18;
                      const marginNumber = Number(formatUnits(marginAmt, decimals));
                      const leverageNumber = Number(leverage);
                      const sizeNumber = marginNumber * leverageNumber;
                      const entryPriceNumber = Number(formatUnits(entryPrice, 18));
                      
                      const oraclePriceNumber = pricesData?.[i]?.result ? Number(formatUnits(pricesData[i].result as bigint, 18)) : entryPriceNumber;
                      const currentPriceNumber = livePrices[asset.toLowerCase()] || oraclePriceNumber;
                      const historyData = priceHistories[asset.toLowerCase()] || [];

                      let pnl = 0;
                      let isProfit = false;

                      if (currentPriceNumber > 0) {
                        if (isLong) {
                          if (currentPriceNumber > entryPriceNumber) {
                            pnl = (sizeNumber * (currentPriceNumber - entryPriceNumber)) / entryPriceNumber;
                            isProfit = true;
                          } else {
                            pnl = (sizeNumber * (entryPriceNumber - currentPriceNumber)) / entryPriceNumber;
                          }
                        } else {
                          if (currentPriceNumber < entryPriceNumber) {
                            pnl = (sizeNumber * (entryPriceNumber - currentPriceNumber)) / entryPriceNumber;
                            isProfit = true;
                          } else {
                            pnl = (sizeNumber * (currentPriceNumber - entryPriceNumber)) / entryPriceNumber;
                          }
                        }
                      }

                      const displayPnl = pnl.toFixed(2);
                      const chartColor = isProfit ? '#10b981' : '#f43f5e';
                      
                      return (
                        <div key={i} className="flex flex-col p-5 bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-2xl gap-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-sm relative overflow-hidden">


                          <div className="flex flex-col md:flex-row justify-between gap-6">
                            <div className="flex items-start gap-4 w-full md:w-auto z-10">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isLong ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                <Activity className="w-6 h-6" />
                              </div>
                              <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-3 mb-1">
                                  <span className="font-bold text-zinc-900 dark:text-white text-lg">
                                    {assetName} / USD
                                  </span>
                                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${isLong ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                    {isLong ? 'LONG' : 'SHORT'} {leverageNumber}x
                                  </span>
                                  
                                  <div className="flex items-center gap-2 ml-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500">Live</span>
                                  </div>
                                </div>
                                <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 flex flex-col sm:flex-row gap-2 sm:gap-4">
                                  <div className="flex items-center gap-1.5">
                                    <span>Entry:</span>
                                    <span className="text-zinc-900 dark:text-white font-medium">${entryPriceNumber.toFixed(2)}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span>Margin:</span>
                                    <span className="text-zinc-900 dark:text-white font-medium">{marginNumber.toFixed(2)} {marginTokenName}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span>Live Price:</span>
                                    <span className="text-zinc-900 dark:text-white font-medium transition-colors duration-300">${currentPriceNumber.toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col md:items-end z-10 min-w-[120px]">
                              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Unrealized PnL</div>
                              <div className={`text-2xl font-black flex items-center gap-1 transition-all duration-300 ${isProfit ? 'text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.3)]'}`}>
                                {isProfit ? '+' : '-'}${displayPnl}
                              </div>
                            </div>
                          </div>

                          <div className="w-full flex items-center gap-6 mt-2">
                            <div className="flex-1 h-[60px] opacity-70">
                              {historyData.length > 0 && (
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={historyData}>
                                    <YAxis domain={['auto', 'auto']} hide />
                                    <Line 
                                      type="monotone" 
                                      dataKey="price" 
                                      stroke={chartColor} 
                                      strokeWidth={2} 
                                      dot={false}
                                      isAnimationActive={true}
                                      animationDuration={300}
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              )}
                            </div>
                            
                            {!syncedAssets[asset.toLowerCase()] ? (
                                    <button 
                                      onClick={() => syncOraclePrice(asset.toLowerCase(), assetName)}
                                      disabled={isSyncing[asset.toLowerCase()]}
                                      className="px-4 py-2 bg-[#CDFF00] hover:bg-[#b3df00] text-zinc-900 text-sm font-bold rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2 shadow-[0_0_10px_rgba(205,255,0,0.2)]"
                                    >
                                      {isSyncing[asset.toLowerCase()] ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                      Sync Oracle
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => positionId !== undefined && handleClosePosition(positionId)}
                                      disabled={isClosing}
                                      className="px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
                                    >
                                      {isClosing ? 'Closing...' : 'Close Position'}
                                    </button>
                                  )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
