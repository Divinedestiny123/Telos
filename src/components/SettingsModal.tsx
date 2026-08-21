'use client';

import { X, Settings2, History, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState, useMemo } from 'react';
import { useAccount, useReadContracts, useReadContract, useWriteContract } from 'wagmi';
import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem';
import { xLayer } from 'viem/chains';
import TelosPerpsABI from '@/lib/TelosPerpsABI.json';

const TELOS_PERPS_ADDRESS = '0x4f6974794b5912becac93c659ec2ffe73976161f';

const MOCK_TOKEN_NAMES: Record<string, string> = {
  '0x5a77f1443d16ee5761d310e38b62f77f726bc71c': 'WETH',
  '0x814041eaec55b8ef2f056dcd69651bf279e8cd5e': 'WBTC',
  '0xe538905cf8410324e03a5a23c1c177a474d59b2b': 'WOKB',
  '0xa8ce8aee21bc2a48a5ef670afcc9274c7bbbc035': 'USDC.e',
  '0xb6ceceab302e2e4948951ee7843fc24e92933061': 'USDC',
  '0x1e4a5963ab6d7679c5300684f5599b1099bfd975': 'USDT',
};

export function SettingsModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { address } = useAccount();
  const [closedLogs, setClosedLogs] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!address || !isOpen) return;
    const fetchLogs = async () => {
      setIsLoadingHistory(true);
      try {
        const client = createPublicClient({ chain: xLayer, transport: http() });
        const latestBlock = await client.getBlockNumber();
        const allLogs: any[] = [];
        let currentToBlock = latestBlock;
        
        // Loop backwards in chunks of 99 blocks, up to ~2000 blocks ago
        for (let i = 0; i < 20; i++) {
          if (currentToBlock < BigInt(0)) break;
          const currentFromBlock = currentToBlock - BigInt(99) > BigInt(0) ? currentToBlock - BigInt(99) : BigInt(0);
          
          try {
            const logsChunk = await client.getLogs({
              address: TELOS_PERPS_ADDRESS,
              event: parseAbiItem('event PositionClosed(uint256 indexed positionId, address indexed user, uint256 pnl, bool isProfit)'),
              args: { user: address },
              fromBlock: currentFromBlock,
              toBlock: currentToBlock
            });
            allLogs.push(...logsChunk);
          } catch (e) {
            console.error('Error fetching log chunk', e);
          }
          currentToBlock = currentFromBlock - BigInt(1);
        }

        setClosedLogs(allLogs.map(l => l.args));
      } catch (e) {
        console.error("Failed to fetch history logs", e);
      } finally {
        setIsLoadingHistory(false);
      }
    };
    fetchLogs();
  }, [address, isOpen]);

  const contracts = useMemo(() => {
    return closedLogs.map(log => ({
      address: TELOS_PERPS_ADDRESS as `0x${string}`,
      abi: TelosPerpsABI as any,
      functionName: 'positions',
      args: [log.positionId]
    }));
  }, [closedLogs]);

  const { data: positionsData } = useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0 && isOpen
    }
  });

  // Admin capabilities
  const { data: ownerAddress } = useReadContract({
    address: TELOS_PERPS_ADDRESS,
    abi: TelosPerpsABI as any,
    functionName: 'owner',
  });

  const isOwner = Boolean(address && ownerAddress && address.toLowerCase() === (ownerAddress as string).toLowerCase());

  const { data: usdcBalance, refetch: refetchUsdc } = useReadContract({
    address: '0xb6ceceab302e2e4948951ee7843fc24e92933061', // USDC
    abi: [parseAbiItem('function balanceOf(address owner) view returns (uint256)')],
    functionName: 'balanceOf',
    args: [TELOS_PERPS_ADDRESS],
  });

  const { writeContract, isPending: isWithdrawing } = useWriteContract();

  const handleAdminWithdraw = () => {
    if (!usdcBalance || (usdcBalance as bigint) === BigInt(0)) return;
    writeContract({
      address: TELOS_PERPS_ADDRESS,
      abi: TelosPerpsABI as any,
      functionName: 'adminWithdraw',
      args: ['0xb6ceceab302e2e4948951ee7843fc24e92933061', usdcBalance],
    }, {
      onSuccess: () => {
        setTimeout(refetchUsdc, 2000);
      }
    });
  };

  if (!isOpen || !mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-8 h-full overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
              <Settings2 className="w-6 h-6 text-[#CDFF00]" />
              App Settings
            </h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300">
            <div>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">Configure your trading interface and network preferences.</p>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <div>
                    <div className="text-zinc-900 dark:text-white font-medium">Network RPC</div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">Connected to X Layer Mainnet</div>
                  </div>
                  <div className="px-3 py-1 bg-[#CDFF00]/10 text-[#CDFF00] text-sm font-medium rounded-full flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-[#CDFF00] rounded-full animate-pulse"></div>
                    Active
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <div>
                    <div className="text-zinc-900 dark:text-white font-medium">AI Model</div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">Current active assistant model</div>
                  </div>
                  <select className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white text-sm rounded-lg px-3 py-1.5 outline-none focus:border-[#CDFF00]">
                    <option>Claude 3.5 Haiku</option>
                    <option>Claude 3.5 Sonnet</option>
                  </select>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <div>
                    <div className="text-zinc-900 dark:text-white font-medium">Theme</div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">Appearance settings</div>
                  </div>
                  <div className="flex bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg p-0.5">
                    <button 
                      onClick={() => setTheme('dark')}
                      className={`px-3 py-1 text-sm rounded-md transition-colors ${theme === 'dark' ? 'text-white bg-zinc-800' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'}`}
                    >
                      Dark
                    </button>
                    <button 
                      onClick={() => setTheme('light')}
                      className={`px-3 py-1 text-sm rounded-md transition-colors ${theme === 'light' ? 'text-zinc-900 bg-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'}`}
                    >
                      Light
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {isOwner && (
              <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4">
                  <Settings2 className="w-5 h-5 text-red-500" />
                  Admin Panel
                </h3>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="text-zinc-900 dark:text-white font-medium">Contract Liquidity</div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      {usdcBalance !== undefined ? formatUnits(usdcBalance as bigint, 6) : '0'} USDC
                    </div>
                  </div>
                  <button 
                    onClick={handleAdminWithdraw}
                    disabled={isWithdrawing || !usdcBalance || (usdcBalance as bigint) === BigInt(0)}
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
                  >
                    {isWithdrawing ? 'Withdrawing...' : 'Withdraw All'}
                  </button>
                </div>
              </div>
            )}

            <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4">
                <History className="w-5 h-5 text-[#CDFF00]" />
                Trading History
              </h3>
              
              {!address ? (
                <div className="p-6 text-center border border-zinc-200 dark:border-zinc-800 border-dashed rounded-xl text-zinc-500 text-sm">
                  Connect your wallet to view trading history.
                </div>
              ) : isLoadingHistory ? (
                <div className="p-6 text-center border border-zinc-200 dark:border-zinc-800 border-dashed rounded-xl text-zinc-500 text-sm animate-pulse">
                  Loading on-chain history...
                </div>
              ) : closedLogs.length === 0 ? (
                <div className="p-6 text-center border border-zinc-200 dark:border-zinc-800 border-dashed rounded-xl text-zinc-500 text-sm">
                  No closed positions found.
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {closedLogs.map((log, i) => {
                    const posDetails = positionsData?.[i]?.result as any;
                    if (!posDetails) return <div key={i} className="h-16 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl animate-pulse" />;
                    
                    const [user, asset, marginToken, marginAmt, leverage, isLong, entryPrice, isOpenPos] = posDetails;
                    const assetName = MOCK_TOKEN_NAMES[asset.toLowerCase()] || 'UNKNOWN';
                    
                    const pnlFormatted = Number(formatUnits(log.pnl, 18)).toFixed(2);
                    
                    return (
                      <div key={i} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${log.isProfit ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                            <Activity className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-bold text-zinc-900 dark:text-white text-sm">{assetName} / USD</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isLong ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                {isLong ? 'LONG' : 'SHORT'} {Number(leverage)}x
                              </span>
                            </div>
                            <div className="text-xs text-zinc-500">
                              ID: #{Number(log.positionId)}
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-0.5">Realized PnL</div>
                          <div className={`font-bold flex items-center justify-end gap-1 ${log.isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {log.isProfit ? '+' : '-'}${pnlFormatted}
                            {log.isProfit ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                          </div>
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
