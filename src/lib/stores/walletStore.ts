import { writable } from 'svelte/store';
import type { WalletClient, PublicClient } from 'viem';

export const chainNameStore = writable<string | null>(null);
export const viemPublicClientStore = writable<PublicClient | null>(null);
export const viemWalletClientStore = writable<WalletClient | null>(null);
export const connectedAccountStore = writable<string | null>(null);
export const walletConnectionErrorStore = writable<string | null>(null); 