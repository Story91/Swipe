/**
 * The only file in the routine that signs. Everything else takes this as an
 * injected dependency and is tested against a fake.
 *
 * The signer is REGISTRAR_PRIVATE_KEY, the dedicated operational key: it can
 * register and resolve and nothing else. The address it writes to always comes
 * from getWritableMarket and is re-checked with isWritableMarket, per the rule
 * in lib/chains: a write path must verify the address it is about to write to.
 */

import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  getChainConfig,
  createChainPublicClient,
  getWritableMarket,
  isWritableMarket,
  type ChainKey,
} from '@/lib/chains';
import { USDG_DUALPOOL_ABI } from '@/lib/contract';

export interface OnChainPrediction {
  registered: boolean;
  creator: string;
  deadline: number;
  resolved: boolean;
  cancelled: boolean;
  outcome: boolean;
  refundable: boolean;
}

export interface RoutineChainWriter {
  address: string;
  readPrediction(id: number): Promise<OnChainPrediction>;
  registerPrediction(id: number, creator: string, deadline: number): Promise<string>;
  resolvePrediction(id: number, outcome: boolean): Promise<string>;
}

export function makeChainWriter(chainKey: ChainKey): RoutineChainWriter {
  const key = process.env.REGISTRAR_PRIVATE_KEY;
  if (!key) throw new Error('REGISTRAR_PRIVATE_KEY is not set');

  const market = getWritableMarket(chainKey);
  if (!market || !isWritableMarket(chainKey, market)) {
    throw new Error(`No writable market on ${chainKey}`);
  }

  const config = getChainConfig(chainKey);
  const account = privateKeyToAccount(
    (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`
  );
  const publicClient = createChainPublicClient(chainKey);
  const walletClient = createWalletClient({
    account,
    chain: config.viemChain,
    transport: http(config.rpcUrl),
  });

  async function write(
    functionName: 'registerPrediction' | 'resolvePrediction',
    args: readonly unknown[]
  ): Promise<string> {
    const hash = await walletClient.writeContract({
      address: market as `0x${string}`,
      abi: USDG_DUALPOOL_ABI,
      functionName,
      args,
      chain: config.viemChain,
      account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new Error(`${functionName} reverted in ${hash}`);
    }
    return hash;
  }

  return {
    address: account.address.toLowerCase(),

    async readPrediction(id: number): Promise<OnChainPrediction> {
      const out = (await publicClient.readContract({
        address: market as `0x${string}`,
        abi: USDG_DUALPOOL_ABI,
        functionName: 'getPrediction',
        args: [BigInt(id)],
      })) as readonly [
        boolean, string, bigint, bigint, bigint, boolean, boolean, boolean, boolean, bigint
      ];
      return {
        registered: out[0],
        creator: (out[1] as string).toLowerCase(),
        deadline: Number(out[2]),
        resolved: out[5],
        cancelled: out[6],
        outcome: out[7],
        refundable: out[8],
      };
    },

    registerPrediction(id, creator, deadline) {
      return write('registerPrediction', [
        BigInt(id),
        creator as `0x${string}`,
        BigInt(deadline),
      ]);
    },

    resolvePrediction(id, outcome) {
      return write('resolvePrediction', [BigInt(id), outcome]);
    },
  };
}
