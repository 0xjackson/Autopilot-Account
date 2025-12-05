import { createPublicClient, http, encodeFunctionData, concat, pad, toHex, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { CONTRACTS, KERNEL_EXECUTE_ABI, AUTO_YIELD_MODULE_ABI, EXEC_MODE_DEFAULT } from './src/bundler/constants';

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

async function main() {
  const wallet = '0x8C561f25AA1d665D17fEAE3F05D085a88F659Cac' as Address;
  const entryPoint = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as Address;
  
  // Build the exact callData
  const moduleCallData = encodeFunctionData({
    abi: AUTO_YIELD_MODULE_ABI,
    functionName: 'rebalance',
    args: [CONTRACTS.USDC],
  });
  
  const executionCalldata = concat([
    CONTRACTS.MODULE,
    pad(toHex(0n), { size: 32 }),
    moduleCallData,
  ]);
  
  const callData = encodeFunctionData({
    abi: KERNEL_EXECUTE_ABI,
    functionName: 'execute',
    args: [EXEC_MODE_DEFAULT, executionCalldata],
  });
  
  console.log('Simulating call to wallet...');
  console.log('Wallet:', wallet);
  console.log('CallData:', callData);
  
  // Simulate as if EntryPoint is calling
  try {
    const result = await client.call({
      to: wallet,
      data: callData,
      account: entryPoint,
    });
    console.log('SUCCESS! Result:', result);
  } catch (e: any) {
    console.log('FAILED:', e.shortMessage || e.message);
    if (e.data) console.log('Error data:', e.data);
  }
  
  // Also try simulating from zero address
  console.log('\nSimulating from zero address...');
  try {
    const result = await client.call({
      to: wallet,
      data: callData,
      account: '0x0000000000000000000000000000000000000000' as Address,
    });
    console.log('SUCCESS! Result:', result);
  } catch (e: any) {
    console.log('FAILED:', e.shortMessage || e.message);
    if (e.data) console.log('Error data:', e.data);
  }
}

main().catch(console.error);
