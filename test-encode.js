import { encodeFunctionData, maxUint256 } from 'viem';

try {
  const approveData = encodeFunctionData({
    abi: [{ "name": "approve", "type": "function", "inputs": [{ "name": "spender", "type": "address" }, { "name": "amount", "type": "uint256" }], "outputs": [{ "name": "", "type": "bool" }] }],
    functionName: 'approve',
    args: ['0xd3b57ebb4f40eac24a530b07cdd1eb358e7ba6d1', BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')]
  });
  console.log("Success with hex string BigInt:", approveData);
} catch(e) {
  console.log("Error with hex string BigInt:", e.message);
}

try {
  const approveData2 = encodeFunctionData({
    abi: [{ "name": "approve", "type": "function", "inputs": [{ "name": "spender", "type": "address" }, { "name": "amount", "type": "uint256" }], "outputs": [{ "name": "", "type": "bool" }] }],
    functionName: 'approve',
    args: ['0xd3b57ebb4f40eac24a530b07cdd1eb358e7ba6d1', maxUint256]
  });
  console.log("Success with maxUint256:", approveData2);
} catch(e) {
  console.log("Error with maxUint256:", e.message);
}
