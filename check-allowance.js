const { createPublicClient, http, parseAbi } = require('viem');
const { xlayer } = require('viem/chains');

const client = createPublicClient({
  chain: xlayer,
  transport: http('https://rpc.xlayer.tech')
});

async function main() {
  const allowance = await client.readContract({
    address: '0xB6CEceAB302E2E4948951eE7843FC24E92933061', // USDC
    abi: parseAbi(['function allowance(address owner, address spender) view returns (uint256)']),
    functionName: 'allowance',
    args: ['0x9AB3A5913251e6DBd10Fdc44CbdB102005aA6AFa'.toLowerCase(), '0x87132b407eee4ce072fe1f160c469bac601360ac'.toLowerCase()] // user, perps contract
  });
  console.log('Allowance:', allowance.toString());
}

main().catch(console.error);
