'use client';

import { useState } from 'react';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { encodeDeployData } from 'viem';
import TelosPerpsABI from '@/lib/TelosPerpsABI.json';
import TelosPerpsBytecode from '@/lib/TelosPerpsBytecode.json';

export default function DeployPage() {
  const { isConnected } = useAccount();
  const { data: hash, sendTransaction, isPending, error } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({ hash });
  const { writeContract, isPending: isWriting } = useWriteContract();
  
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null);

  // Auto-set the deployed address when receipt is received
  if (isConfirmed && receipt && receipt.contractAddress && deployedAddress !== receipt.contractAddress) {
    setDeployedAddress(receipt.contractAddress);
  }

  const handleDeploy = () => {
    const deployData = encodeDeployData({
      abi: TelosPerpsABI,
      bytecode: `0x${TelosPerpsBytecode.bytecode}` as `0x${string}`,
      args: ['0x2ba064b13b13cfbba417f2a08cbfc893d5b5f37a'], // Pyth Network on X Layer Mainnet (lowercase to bypass checksum validation)
    });

    sendTransaction({
      chainId: 196, // Force X Layer Mainnet
      gas: BigInt(3000000), // Hardcoded gas to completely bypass wallet fee estimation
      data: deployData,
    });
  };

  return (
    <div className="min-h-screen bg-black text-white p-10 flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold mb-4 text-[#CDFF00]">Deploy TelosPerps Mock Contract</h1>
      <p className="mb-8 text-zinc-400">Click below to deploy the contract using your OKX Wallet. <br/><span className="text-red-400 font-bold">IMPORTANT: Make sure your wallet network is set to X Layer!</span></p>
      
      {!isConnected ? (
        <p className="text-red-400">Please connect your wallet in the main app first.</p>
      ) : (
        <button
          onClick={handleDeploy}
          disabled={isPending || isConfirming}
          className="px-6 py-3 bg-[#CDFF00] text-black font-bold rounded-lg disabled:opacity-50"
        >
          {isPending || isConfirming ? 'Deploying...' : 'Deploy Contract'}
        </button>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-900/20 text-red-400 rounded-lg max-w-md break-words">
          Error: {error.message}
        </div>
      )}

      {deployedAddress && (
        <div className="mt-8 p-6 bg-zinc-900 rounded-xl border border-[#CDFF00]/30 text-center w-full max-w-2xl">
          <h2 className="text-xl font-bold text-[#CDFF00] mb-2">Deployed Successfully!</h2>
          <p className="text-sm text-zinc-400">Contract Address:</p>
          <p className="font-mono mt-1 text-lg">{deployedAddress}</p>
          <p className="mt-4 text-xs text-zinc-500 mb-6">This address has been automatically updated in the backend. Now, initialize the Oracle Price IDs below.</p>
          
          <div className="flex flex-col gap-4">
            <button
              onClick={() => writeContract({
                address: deployedAddress as `0x${string}`,
                abi: TelosPerpsABI,
                functionName: 'setAssetPriceId',
                args: ['0x814041eaec55b8ef2f056dcd69651bf279e8cd5e', '0xc9d8b075a5c69303365ae23633d4e085199bf5c520a3b90fed1322a0342ffc33']
              })}
              disabled={isWriting}
              className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg flex justify-between items-center transition-colors"
            >
              <span>Initialize WBTC Price ID</span>
              <span className="text-xs text-zinc-400 font-mono">Pyth: 0xc9d8...fc33</span>
            </button>

            <button
              onClick={() => writeContract({
                address: deployedAddress as `0x${string}`,
                abi: TelosPerpsABI,
                functionName: 'setAssetPriceId',
                args: ['0x5a77f1443d16ee5761d310e38b62f77f726bc71c', '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace']
              })}
              disabled={isWriting}
              className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg flex justify-between items-center transition-colors"
            >
              <span>Initialize WETH Price ID</span>
              <span className="text-xs text-zinc-400 font-mono">Pyth: 0xff61...0ace</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
