import { useState, useEffect } from 'react';
import { ArrowRightLeft, Loader2, CheckCircle2, AlertCircle, ExternalLink, ShieldCheck, Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAccount, useReadContract, useSendTransaction, useWaitForTransactionReceipt, useWalletClient, useSwitchChain } from 'wagmi';
import { encodeFunctionData, parseEther, maxUint256, parseUnits } from 'viem';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

import TelosPerpsABI from '@/lib/TelosPerpsABI.json';
import TelosPerpsBytecode from '@/lib/TelosPerpsBytecode.json';
import OKXOracleABI from '@/lib/OKXOracleABI.json';
import OKXOracleBytecode from '@/lib/OKXOracleBytecode.json';
import { createPublicClient, http } from 'viem';
import { xLayer } from 'viem/chains';

const ERC20_ABI = [
  {
    "constant": true,
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "name": "", "type": "uint256" }],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export function TransactionPreview({ data }: { data?: string }) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [isApproving, setIsApproving] = useState(false);
  const [tradeSuccessful, setTradeSuccessful] = useState(false);
  const [livePrice, setLivePrice] = useState<number>(0);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [entryPriceMock, setEntryPriceMock] = useState<number>(0);
  const { chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  


  let parsedData: any = null;
  if (data) {
    try {
      parsedData = JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse transaction data', e);
    }
  }

  const txType = parsedData?.type || 'SPOT';
  const displayData = parsedData?.display || { tokenIn: 'Unknown', tokenOut: 'Unknown', amount: '0' };
  
  // For SPOT
  const { tokenIn, tokenOut, amount, tokenInAddress } = displayData;
  // For PERPS
  const { asset, marginAmt, leverage, isLong, marginToken, assetAddress } = displayData;

  const targetAddress = parsedData?.to;
  
  const isPerps = txType === 'PERPS';
  const requiresApproval = isPerps ? true : (tokenIn !== 'OKB' && tokenInAddress);
  
  // Use the marginToken for Perps UI display, fallback to USDC
  const [forceAllowance, setForceAllowance] = useState(false);

  // Reset bypass if the token changes (e.g. user starts a new chat)
  useEffect(() => {
    setForceAllowance(false);
  }, [tokenInAddress]);

  const displayMarginToken = marginToken || 'USDC';

  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: tokenInAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && targetAddress ? [address, targetAddress as `0x${string}`] : undefined,
    query: {
      enabled: !!(address && targetAddress && requiresApproval && tokenInAddress),
      refetchInterval: 3000,
    }
  });

  const { sendTransaction, data: hash, isPending: isSigning, error: sendError, reset: resetTx } = useSendTransaction();
  const { isLoading: isMining, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess && isApproving) {
      setIsApproving(false);
      refetchAllowance();
      resetTx();
    } else if (isSuccess && !isApproving && receipt?.status === 'success') {
      setTradeSuccessful(true);
    }
  }, [isSuccess, isApproving, receipt, refetchAllowance, resetTx]);

  useEffect(() => {
    if (!tradeSuccessful || !isPerps || !asset) return;
    const tickerSymbol = asset === 'WBTC' ? 'BTC-USDT' : (asset === 'WETH' ? 'ETH-USDT' : `${asset}-USDT`);
    const fetchLivePrice = async () => {
      try {
        const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${tickerSymbol}`);
        const json = await res.json();
        if (json.data && json.data.length > 0) {
          const price = parseFloat(json.data[0].last);
          setLivePrice(price);
          setPriceHistory(hist => {
            const arr = [...(hist.length > 0 ? hist : Array.from({length: 20}).map(() => ({ price: price * (1 + (Math.random()*0.002 - 0.001)) })))];
            arr.push({ price });
            if (arr.length > 20) arr.shift();
            return arr;
          });
          setEntryPriceMock(prev => prev === 0 ? price : prev);
        }
      } catch (e) {}
    };
    fetchLivePrice();
    const interval = setInterval(fetchLivePrice, 2500);
    return () => clearInterval(interval);
  }, [tradeSuccessful, isPerps, asset]);

  const getRequiredAllowance = () => {
    const amtStr = isPerps ? (marginAmt || '0') : (amount || '0');
    const symbol = isPerps ? displayMarginToken : tokenIn;
    if (symbol.toUpperCase() === 'USDC' || symbol.toUpperCase() === 'USDT') {
      return parseUnits(amtStr, 6);
    }
    return parseEther(amtStr);
  };
  
  const requiredAllowance = getRequiredAllowance();
  const hasAllowance = forceAllowance || !requiresApproval || (allowanceData !== undefined && (allowanceData as bigint) >= requiredAllowance);

  // Failsafe: If the allowance updates on-chain but the transaction receipt is stuck, unlock the UI
  useEffect(() => {
    if (isApproving && hasAllowance) {
      setIsApproving(false);
      resetTx();
    }
  }, [hasAllowance, isApproving, resetTx]);

  const { data: oracleAddress } = useReadContract({
    address: parsedData?.to as `0x${string}`,
    abi: TelosPerpsABI,
    functionName: 'oracle',
    query: {
      enabled: isPerps && !!parsedData?.to
    }
  });

  const [isSyncingOracle, setIsSyncingOracle] = useState(false);

  const syncOraclePrice = async () => {
    if (!walletClient || !address || !oracleAddress || !isPerps) return;
    
    try {
      if (chainId !== 196 && switchChain) {
        switchChain({ chainId: 196 });
        return;
      }
      setIsSyncingOracle(true);
      const tickerSymbol = asset === 'WBTC' ? 'BTC-USDT' : (asset === 'WETH' ? 'ETH-USDT' : `${asset}-USDT`);
      const response = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${tickerSymbol}`);
      const apiData = await response.json();
      
      if (!apiData.data || apiData.data.length === 0) {
        throw new Error('Failed to fetch price from OKX API');
      }

      const priceStr = apiData.data[0].last;
      const priceFloat = parseFloat(priceStr);
      const scaledPrice = parseUnits(priceFloat.toFixed(6), 18);

      toast.success(`Fetched OKX DEX price: $${priceFloat}. Sign to update Oracle!`, { duration: 4000 });

      const hash = await walletClient.writeContract({
        address: oracleAddress as `0x${string}`,
        abi: OKXOracleABI,
        functionName: 'updatePrice',
        account: address as `0x${string}`,
        args: [assetAddress as `0x${string}`, scaledPrice]
      });

      toast.success(`Oracle Updating! Tx: ${hash.slice(0,10)}... Wait 5 seconds before trading.`, { duration: 5000 });
    } catch (e: any) {
      console.error(e);
      toast.error(`Oracle Sync failed: ${e.message}`, { duration: 4000 });
    } finally {
      setIsSyncingOracle(false);
    }
  };

  const handleApprove = () => {
    if (chainId !== 196 && switchChain) {
      switchChain({ chainId: 196 });
      return;
    }
    setIsApproving(true);
    setForceAllowance(false);
    
    const targetAddress = isPerps ? parsedData?.to : '0x62fCaa21e25D4166DEf7202157A3C8B7DEdDB87a'; // Spot uses aggregator

    const approveData = encodeFunctionData({
      abi: [{
        "constant": false,
        "inputs": [
          { "name": "spender", "type": "address" },
          { "name": "amount", "type": "uint256" }
        ],
        "name": "approve",
        "outputs": [{ "name": "", "type": "bool" }],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
      }],
      args: [targetAddress as `0x${string}`, maxUint256]
    });

    sendTransaction({
      chainId: 196,
      to: tokenInAddress as `0x${string}`,
      data: approveData,
    }, {
      onError: () => setIsApproving(false)
    });
  };

  const executeTrade = () => {
    if (!parsedData || !parsedData.to) return;
    if (chainId !== 196 && switchChain) {
      switchChain({ chainId: 196 });
      return;
    }
    setIsApproving(false);
    
    sendTransaction({
      chainId: 196,
      to: parsedData.to,
      data: parsedData.data,
      value: BigInt(parsedData.value || '0'),
    });
  };

  let status = 'idle';
  if (isSuccess && receipt?.status === 'success') status = 'success';
  else if (isSuccess && receipt?.status === 'reverted') status = 'error';
  else if (isMining) status = 'mining';
  else if (isSigning) status = 'signing';
  else if (sendError) status = 'error';

  if (tradeSuccessful) {
    if (isPerps) {
      const sizeNumber = Number(marginAmt) * Number(leverage);
      let pnl = 0;
      let isProfit = false;
      
      if (livePrice > 0 && entryPriceMock > 0) {
        if (isLong) {
          if (livePrice > entryPriceMock) {
            pnl = (sizeNumber * (livePrice - entryPriceMock)) / entryPriceMock;
            isProfit = true;
          } else {
            pnl = (sizeNumber * (entryPriceMock - livePrice)) / entryPriceMock;
          }
        } else {
          if (livePrice < entryPriceMock) {
            pnl = (sizeNumber * (entryPriceMock - livePrice)) / entryPriceMock;
            isProfit = true;
          } else {
            pnl = (sizeNumber * (livePrice - entryPriceMock)) / entryPriceMock;
          }
        }
      }
      
      const displayPnl = pnl.toFixed(2);
      const chartColor = isProfit ? '#10b981' : '#f43f5e';
      
      return (
        <div className="bg-white dark:bg-zinc-900/80 backdrop-blur-md border border-[#CDFF00]/50 rounded-xl p-5 w-full max-w-sm shadow-[0_0_15px_rgba(205,255,0,0.15)] overflow-hidden relative">
        <div className="flex flex-col mb-4">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#CDFF00]" />
              Position Opened!
            </h3>
            <div className="flex items-center gap-2 ml-auto bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500">Live</span>
            </div>
          </div>
        </div>

          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isLong ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-zinc-900 dark:text-white">{asset}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isLong ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  {isLong ? 'LONG' : 'SHORT'} {leverage}x
                </span>
              </div>
              <div className="text-xs text-zinc-500">
                Entry: ${entryPriceMock.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between mb-2">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Unrealized PnL</div>
            <div className={`text-2xl font-black flex items-center gap-1 transition-all duration-300 ${isProfit ? 'text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.3)]'}`}>
              {isProfit ? '+' : '-'}${displayPnl}
            </div>
          </div>

          <div className="w-full h-[60px] opacity-80 mb-4 -mx-2">
            {priceHistory.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceHistory}>
                  <YAxis domain={['auto', 'auto']} hide />
                  <Line type="monotone" dataKey="price" stroke={chartColor} strokeWidth={2} dot={false} isAnimationActive={true} animationDuration={300} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          
          {hash && (
            <a href={`https://www.oklink.com/xlayer/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-xs text-[#CDFF00] hover:text-[#b3df00] transition-colors font-medium">
              View on Explorer <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      );
    } else {
      return (
        <div className="bg-white dark:bg-zinc-900/80 backdrop-blur-md border border-[#CDFF00]/50 rounded-xl p-5 w-full max-w-sm shadow-[0_0_15px_rgba(205,255,0,0.15)]">
          <div className="flex flex-col items-center justify-center py-6">
            <div className="w-16 h-16 bg-[#CDFF00]/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-[#CDFF00]" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Swap Successful!</h3>
            <p className="text-sm text-zinc-400 mb-6 text-center">
              Successfully swapped {amount} {tokenIn} for {tokenOut}
            </p>
            {hash && (
              <a href={`https://www.oklink.com/xlayer/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-sm text-[#CDFF00] hover:text-[#b3df00] transition-colors font-medium">
                View on Explorer <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      );
    }
  }

  return (
    <div className="bg-white dark:bg-black/80 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 w-full max-w-sm shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
          {isPerps ? <Activity className="w-4 h-4 text-purple-400" /> : <ArrowRightLeft className="w-4 h-4 text-emerald-500" />}
          {isPerps ? 'Perpetual Trade' : 'Spot Swap'}
        </h3>
        <span className="text-xs bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800">X Layer</span>
      </div>
      
      <div className="space-y-3 mb-6">
        {isPerps ? (
          <>
            <div className="flex justify-between items-start gap-4 p-3 bg-zinc-50 dark:bg-zinc-900/30 rounded-lg border border-zinc-200 dark:border-zinc-800/50">
              <span className="text-zinc-500 dark:text-zinc-400 text-sm shrink-0">Action</span>
              <span className={`font-bold text-sm text-right break-all ${isLong ? 'text-green-500' : 'text-red-500'}`}>
                {isLong ? 'LONG' : 'SHORT'} {asset}
              </span>
            </div>
            <div className="flex justify-between p-3 bg-zinc-50 dark:bg-zinc-900/30 rounded-lg border border-zinc-200 dark:border-zinc-800/50">
              <span className="text-zinc-500 dark:text-zinc-400 text-sm">Leverage</span>
              <span className="text-zinc-900 dark:text-white font-medium text-sm">{leverage}x</span>
            </div>
            <div className="flex justify-between p-3 bg-zinc-50 dark:bg-zinc-900/30 rounded-lg border border-zinc-200 dark:border-zinc-800/50">
              <span className="text-zinc-500 dark:text-zinc-400 text-sm">Margin</span>
              <span className="text-zinc-900 dark:text-white font-medium text-sm">{marginAmt} {displayMarginToken}</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-start gap-4 p-3 bg-zinc-50 dark:bg-zinc-900/30 rounded-lg border border-zinc-200 dark:border-zinc-800/50">
              <span className="text-zinc-500 dark:text-zinc-400 text-sm shrink-0">Action</span>
              <span className="text-zinc-900 dark:text-white font-medium text-sm text-right break-all">Swap {tokenIn} for {tokenOut}</span>
            </div>
            <div className="flex justify-between p-3 bg-zinc-50 dark:bg-zinc-900/30 rounded-lg border border-zinc-200 dark:border-zinc-800/50">
              <span className="text-zinc-500 dark:text-zinc-400 text-sm">Amount</span>
              <span className="text-zinc-900 dark:text-white font-medium text-sm">{amount} {tokenIn}</span>
            </div>
          </>
        )}
      </div>

      {status === 'idle' && !hasAllowance && (
        <button 
          onClick={handleApprove}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer mb-3"
        >
          <ShieldCheck className="w-4 h-4" />
          Approve {isPerps ? displayMarginToken : tokenIn}
        </button>
      )}

      {status === 'idle' && hasAllowance && (
        <div className="flex flex-col gap-2">
          {isPerps && (
            <button 
              onClick={syncOraclePrice}
              disabled={isSyncingOracle}
              className="w-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer border border-blue-500/30"
            >
              {isSyncingOracle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
              {isSyncingOracle ? 'Syncing...' : '1. Sync OKX Real Price'}
            </button>
          )}
          <button 
            onClick={executeTrade}
            className={`w-full ${isPerps ? 'bg-purple-500 hover:bg-purple-600' : 'bg-white hover:bg-zinc-200'} ${isPerps ? 'text-white' : 'text-black'} font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer`}
          >
            {isPerps ? <CheckCircle2 className="w-4 h-4" /> : <ArrowRightLeft className="w-4 h-4" />}
            {isPerps ? '2. Execute Trade' : 'Execute Trade'}
          </button>
        </div>
      )}

      {status === 'signing' && (
        <button disabled className="w-full bg-zinc-900 text-zinc-400 font-medium py-3 rounded-lg flex items-center justify-center gap-2 border border-zinc-800">
          <Loader2 className="w-4 h-4 animate-spin" />
          Awaiting Signature...
        </button>
      )}

      {status === 'mining' && (
        <div className="w-full flex flex-col gap-2">
          <button disabled className="w-full bg-zinc-900 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 border border-zinc-800">
            <Loader2 className="w-4 h-4 animate-spin text-[#CDFF00]" />
            {isApproving ? 'Approving...' : 'Mining Transaction...'}
          </button>
          {isApproving && (
            <button 
              onClick={() => {
                setForceAllowance(true);
                setIsApproving(false);
                resetTx();
              }}
              className="text-xs text-zinc-500 hover:text-zinc-400 underline py-1"
            >
              Already confirmed in wallet? Click here to continue
            </button>
          )}
        </div>
      )}

      {/* Remove the unused status === 'success' && isApproving block since we reset to idle */}
      {status === 'success' && !isApproving && (
        <div className="w-full space-y-3">
          <div className="w-full bg-[#CDFF00]/10 border border-[#CDFF00]/20 text-[#CDFF00] font-medium py-3 rounded-lg flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            {isPerps ? 'Position Opened!' : 'Swap Successful!'}
          </div>
          {hash && (
            <a 
              href={`https://www.oklink.com/xlayer/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              View on Explorer <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {status === 'error' && (
        <>
          <div className="w-full bg-red-500/10 text-red-400 font-medium py-3 px-4 rounded-lg flex flex-col items-center justify-center gap-2 border border-red-500/20 mb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Transaction Failed
            </div>
            {sendError && (
              <span className="text-xs text-red-400/80 text-center break-words w-full overflow-hidden">
                {sendError.message.split('\n')[0]}
              </span>
            )}
            {isSuccess && receipt?.status === 'reverted' && (
              <span className="text-xs text-red-400/80 text-center break-words w-full overflow-hidden mt-1">
                Execution reverted on-chain (e.g. Price ID not set)
              </span>
            )}
          </div>
          <button 
            onClick={() => {
              // Reset status if possible, or just let them try clicking again
              // Wagmi handles retry naturally if we just call sendTransaction again
            }}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-3 rounded-lg transition-colors border border-zinc-800"
          >
            Try Again
          </button>
        </>
      )}



    </div>
  );
}
