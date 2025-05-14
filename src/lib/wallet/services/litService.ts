import * as LitJsSdk from "@lit-protocol/lit-node-client";
import { initializeLitClient } from "../lit-connect";
import {
    PKP_HELPER_CONTRACT_ADDRESS,
    PKP_HELPER_ABI,
    PKP_NFT_CONTRACT_ADDRESS,
    PKP_PERMISSIONS_CONTRACT_ADDRESS,
    PKP_PERMISSIONS_ABI,
    RATE_LIMIT_NFT_CONTRACT_ADDRESS,
    RATE_LIMIT_NFT_ABI,
    currentChain
} from "../config";
import type { Address, Hex, WalletClient, PublicClient } from "viem";
import { createPublicClient, http, keccak256, toBytes, bytesToHex as viemBytesToHex } from 'viem';
import { utils as ethersUtils } from 'ethers'; // For base58 decoding if needed, or can use a modern library
import * as ipfsOnlyHash from 'ipfs-only-hash';
import { Buffer } from 'buffer';

// --- Lit Client Singleton ---
let litNodeClient: LitJsSdk.LitNodeClient | null = null;
let isConnecting = false;
let connectionPromise: Promise<LitJsSdk.LitNodeClient> | null = null;

/**
 * Gets a connected LitNodeClient instance.
 * Handles singleton pattern and connection logic.
 */
export async function getLitClient(): Promise<LitJsSdk.LitNodeClient> {
    if (litNodeClient && litNodeClient.ready) {
        return litNodeClient;
    }

    if (isConnecting && connectionPromise) {
        return connectionPromise;
    }

    isConnecting = true;
    connectionPromise = initializeLitClient().then(client => {
        litNodeClient = client;
        isConnecting = false;
        return client;
    }).catch(error => {
        isConnecting = false;
        connectionPromise = null;
        console.error("Failed to initialize Lit Client in litService:", error);
        throw error;
    });

    return connectionPromise;
}

// --- PKP Minting (Placeholder - to be implemented based on plan) ---

export interface MintPkpResponse {
    tokenId: string;
    publicKey: string;
    ethAddress: Address;
    txHash: Hex;
}

/**
 * Mints a new Programmable Key Pair (PKP) with specified authentication methods.
 * This is a placeholder and will require detailed implementation for auth methods,
 * especially for passkey-based EIP-1271 verifiers.
 */
export async function mintPKPWithAuthMethods(
    // Parameters will include auth method details (e.g., EIP-1271 verifier address)
    // and potentially capacity credit NFT details if needed for minting.
): Promise<MintPkpResponse | null> {
    console.log("Placeholder for mintPKPWithAuthMethods - to be implemented.");
    // Actual implementation will involve:
    // 1. Preparing authMethod objects (e.g., { authMethodType: 6, authMethodId: <verifier_address_bytes> } for EIP-1271)
    // 2. Calling client.mintPKP() or similar SDK function.
    // 3. Handling response and errors.
    return null;
}

// --- Response Interface for PKP Minting ---
export interface MintPKPWithLitActionAuthResponse {
    pkpTokenId: string;
    pkpPublicKey: Hex;
    pkpEthAddress: Address;
    pkpMintTxHash: Hex;
    capacityTokenId: string;
    capacityMintTxHash: Hex;
    capacityTransferTxHash: Hex;
}

// --- Lit Action Code for Passkey EIP-1271 Verification ---
// This action is executed by Lit Protocol nodes. It verifies a passkey signature 
// by calling the isValidSignature function on a deployed EIP-1271 verifier contract.
export const passkeyVerifierLitActionCode = `
const go = async () => {
  // Ensure essential Lit and ethers objects are available in the Lit Action environment
  if (typeof ethers === 'undefined') { 
    throw new Error("ethers.js is not available in the Lit Action execution environment."); 
  }
  if (!Lit || !Lit.Actions || !Lit.Actions.getRpcUrl || !Lit.Actions.setResponse) { 
    throw new Error("Lit.Actions API is not available in the Lit Action execution environment."); 
  }

  // These jsParams must be passed by the client when executing the Lit Action:
  // - messageHash: The Keccak-256 hash of the message that was signed by the passkey.
  // - formattedSignature: The passkey signature, formatted according to EIP-1271 requirements (typically ABI encoded r, s, authenticatorData, clientDataJSON).
  // - eip1271ContractAddress: The blockchain address of the deployed EIP-1271 verifier contract for the passkey.
  // - EIP1271_MAGIC_VALUE: The expected 'magic' return value (bytes4) from a successful isValidSignature call.
  // - chainRpcUrl: The RPC URL for the blockchain where the eip1271ContractAddress is deployed.

  if (!messageHash || !formattedSignature || !eip1271ContractAddress || !EIP1271_MAGIC_VALUE || !chainRpcUrl) {
    throw new Error("Missing one or more required jsParams for the passkey verification Lit Action: messageHash, formattedSignature, eip1271ContractAddress, EIP1271_MAGIC_VALUE, or chainRpcUrl.");
  }
  if (eip1271ContractAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
    throw new Error("Invalid eip1271ContractAddress (null address) provided to the Lit Action.");
  }

  let verified = false;
  const provider = new ethers.providers.JsonRpcProvider(chainRpcUrl);
  const magicValueLower = EIP1271_MAGIC_VALUE.toLowerCase();
  let contractCallResult;

  try {
    // Minimal ABI for the EIP-1271 isValidSignature function
    const eip1271Interface = new ethers.utils.Interface([
      "function isValidSignature(bytes32 _hash, bytes _signature) view returns (bytes4 magicValue)"
    ]);
    // Encode the function call data
    const calldata = eip1271Interface.encodeFunctionData("isValidSignature", [messageHash, formattedSignature]);
    
    // Make the read-only contract call to the EIP-1271 verifier
    contractCallResult = await provider.call({ to: eip1271ContractAddress, data: calldata });

    // Check if the returned magic value matches the expected one
    if (contractCallResult && typeof contractCallResult === 'string' && contractCallResult.toLowerCase().startsWith(magicValueLower)) {
      verified = true;
    }
  } catch (e) {
    console.error("Error during EIP-1271 isValidSignature call within Lit Action:", e);
    // Do not re-throw here, let the final check handle the response
  }
  
  // Set the Lit Action response based on verification status
  if (verified) {
    Lit.Actions.setResponse({ response: JSON.stringify({ verified: true, message: 'Signature verified successfully.' }) });
  } else {
    let errMsg = "EIP-1271 signature verification failed within Lit Action. Contract: " + eip1271ContractAddress + ", RPC: " + chainRpcUrl;
    if (contractCallResult !== undefined) { 
        errMsg += ". Contract call result: " + contractCallResult;
    } else {
        errMsg += ". Contract call did not return a result or threw an error.";
    }
    // For production, consider using Lit.Actions.throwError for more structured error reporting from actions.
    // Lit.Actions.throwError({ message: errMsg, errorType: 'EIP1271VerificationError' }); 
    throw new Error(errMsg); // This will be caught by the client executing the Lit Action
  }
};
go();
`;


/**
 * Mints a PKP, configures a Lit Action for passkey auth, mints and transfers capacity credits.
 * This function mirrors the logic from the legacy `mintPKPWithPasskeyAndAction`.
 */
export async function mintPKPWithLitActionAuthAndCapacity({
    walletClient,
    eoaAddress,
    litActionCodeToUse = passkeyVerifierLitActionCode,
    actionIpfsCid: precomputedActionIpfsCid,
    pkpKeyType = 2n, // ECDSA
    pkpPermittedIpfsCIDScopes = [[1n]], // SignAnything for the action
    pkpAddPkpEthAddressAsPermittedAddress = false,
    pkpSendPkpToItself = true,
    pkpHelperMintGasValue = 1n, // Value for PKP minting (e.g., testnet Chronicle)
    capacityRequestsPerKilosecond = 100n,
    capacityDurationDays = 1,
    // This service does not directly take eip1271ContractAddress to add as type 6 auth.
    // That address is used by the litActionCodeToUse's jsParams when executing the action.
}: {
    walletClient: WalletClient;
    eoaAddress: Address;
    litActionCodeToUse?: string;
    actionIpfsCid?: Hex;
    pkpKeyType?: bigint;
    pkpPermittedIpfsCIDScopes?: bigint[][];
    pkpAddPkpEthAddressAsPermittedAddress?: boolean;
    pkpSendPkpToItself?: boolean;
    pkpHelperMintGasValue?: bigint;
    capacityRequestsPerKilosecond?: bigint;
    capacityDurationDays?: number;
}): Promise<MintPKPWithLitActionAuthResponse> {
    console.log(`Initiating PKP mint with Lit Action Auth and Capacity Credits on chain ${currentChain.name}...`);
    if (!walletClient || !eoaAddress) throw new Error('WalletClient and EOA Address are required.');
    if (!litActionCodeToUse.trim()) throw new Error('Lit Action code cannot be empty.');

    const currentWalletChainId = await walletClient.getChainId();
    if (currentWalletChainId !== currentChain.id) {
        console.log(`Requesting wallet switch to ${currentChain.name} (ID: ${currentChain.id})...`);
        try {
            await walletClient.switchChain({ id: currentChain.id });
            if (await walletClient.getChainId() !== currentChain.id) {
                throw new Error(`Wallet switch to ${currentChain.name} failed or was not completed.`);
            }
            console.log(`Wallet switched to ${currentChain.name}.`);
        } catch (switchError: unknown) {
            throw new Error(`Network switch to ${currentChain.name} failed or was rejected: ${(switchError instanceof Error ? switchError.message : String(switchError)) || 'Unknown switch error'}`);
        }
    }

    const publicClient: PublicClient = createPublicClient({ chain: currentChain, transport: http() });
    let finalActionIpfsCidHex: Hex;

    if (precomputedActionIpfsCid) {
        finalActionIpfsCidHex = precomputedActionIpfsCid;
        console.log('Using pre-computed Lit Action IPFS CID (Hex):', finalActionIpfsCidHex);
    } else {
        console.log('Computing IPFS CID for Lit Action code...');
        const ipfsCidBase58 = await ipfsOnlyHash.of(Buffer.from(litActionCodeToUse));
        const cidBytes = ethersUtils.base58.decode(ipfsCidBase58);
        finalActionIpfsCidHex = viemBytesToHex(cidBytes);
        console.log(`Computed Lit Action IPFS CID: ${ipfsCidBase58} (Base58) => ${finalActionIpfsCidHex} (Hex)`);
    }

    try {
        // 2. Prepare arguments for PKPHelper.mintNextAndAddAuthMethodsWithTypes
        const pkpHelperArgs = [
            pkpKeyType,
            [finalActionIpfsCidHex], // permittedIpfsCIDs (for the Lit Action)
            pkpPermittedIpfsCIDScopes,
            [] as Address[], // permittedAddresses (empty for this call)
            [] as bigint[][], // permittedAddressScopes (empty)
            [] as bigint[],   // permittedAuthMethodTypes (empty, only adding Lit Action via IPFS)
            [] as Hex[],      // permittedAuthMethodIds (empty)
            [] as Hex[],      // permittedAuthMethodPubkeys (empty)
            [] as bigint[][], // permittedAuthMethodScopes (empty)
            pkpAddPkpEthAddressAsPermittedAddress,
            pkpSendPkpToItself
        ] as const;
        console.log("Args for PKPHelper.mintNextAndAddAuthMethodsWithTypes:", pkpHelperArgs);

        // 3. Mint PKP using PKPHelper contract
        const pkpMintTxHash = await walletClient.writeContract({
            address: PKP_HELPER_CONTRACT_ADDRESS,
            abi: PKP_HELPER_ABI,
            functionName: 'mintNextAndAddAuthMethodsWithTypes',
            args: pkpHelperArgs,
            account: eoaAddress,
            chain: currentChain,
            value: pkpHelperMintGasValue
        });
        console.log('PKP Mint transaction sent, hash:', pkpMintTxHash);
        const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: pkpMintTxHash });
        if (mintReceipt.status !== 'success') {
            throw new Error(`PKP minting transaction failed. Status: ${mintReceipt.status}. TxHash: ${pkpMintTxHash}`);
        }
        console.log('PKP Mint transaction successful.');

        // 4. Extract PKP Token ID from mint transaction logs
        let pkpTokenId: string | null = null;
        const transferEventSignature = keccak256(toBytes("Transfer(address,address,uint256)"));
        const zeroAddressPaddedHex = ethersUtils.hexZeroPad('0x0', 32).toLowerCase() as Hex;

        for (const log of mintReceipt.logs) {
            if (log.address.toLowerCase() === PKP_NFT_CONTRACT_ADDRESS.toLowerCase() &&
                log.topics[0]?.toLowerCase() === transferEventSignature.toLowerCase() &&
                log.topics[1]?.toLowerCase() === zeroAddressPaddedHex.toLowerCase() &&
                log.topics.length > 3) {
                try {
                    pkpTokenId = BigInt(log.topics[3] as Hex).toString();
                    console.log("Extracted PKP Token ID from PKP_NFT_CONTRACT event:", pkpTokenId);
                    break;
                } catch (e: unknown) { console.warn("Error parsing PKP tokenId from log:", (e instanceof Error ? e.message : String(e))); }
            }
        }
        if (!pkpTokenId) {
            // Fallback: Check logs from PKP_HELPER_CONTRACT_ADDRESS if the event is emitted by the helper
            for (const log of mintReceipt.logs) {
                if (log.address.toLowerCase() === PKP_HELPER_CONTRACT_ADDRESS.toLowerCase() &&
                    log.topics[0]?.toLowerCase() === transferEventSignature.toLowerCase() &&
                    log.topics[1]?.toLowerCase() === zeroAddressPaddedHex.toLowerCase() &&
                    log.topics.length > 3) {
                    try {
                        pkpTokenId = BigInt(log.topics[3] as Hex).toString();
                        console.log("Extracted PKP Token ID from PKP_HELPER_CONTRACT event:", pkpTokenId);
                        break;
                    } catch (e: unknown) { console.warn("Error parsing PKP tokenId from helper log:", (e instanceof Error ? e.message : String(e))); }
                }
            }
        }
        if (!pkpTokenId) {
            console.error("PKP Transfer event log not found in mint receipt. Logs:", mintReceipt.logs);
            throw new Error('Could not extract PKP Token ID from mint transaction logs.');
        }

        // 5. Fetch PKP Public Key and ETH Address
        // Using Lit SDK is preferred if available and reliable for this version.
        // Fallback to direct contract reads if necessary.
        let pkpPublicKey: Hex;
        let pkpEthAddress: Address;
        try {
            // Assuming getPKPInformation is the correct method. Adjust if SDK has a different API.
            // Some SDK versions might use litClient.pkpNftContract.getPubkey(pkpTokenId)
            // COMMENTING OUT problematic line to fix linter error and use fallback:
            // const pkpInfo = await litClient.getPKPInformation({ tokenId: pkpTokenId });
            // if (!pkpInfo || !pkpInfo.publicKey || !pkpInfo.ethAddress) {
            //     throw new Error('Lit SDK getPKPInformation did not return expected data.');
            // }
            // pkpPublicKey = pkpInfo.publicKey as Hex;
            // pkpEthAddress = pkpInfo.ethAddress as Address;
            // console.log('Fetched PKP info via Lit SDK:', { pkpPublicKey, pkpEthAddress });

            // Force use of fallback due to uncertainty with getPKPInformation
            throw new Error("Skipping Lit SDK getPKPInformation, using direct contract read fallback.");

        } catch (sdkError: unknown) {
            console.warn('Failed to get PKP info via Lit SDK or deliberately skipping, attempting direct contract read. SDK Error:', (sdkError instanceof Error ? sdkError.message : String(sdkError)));
            // Fallback to direct contract read using PKPPermissions contract
            pkpPublicKey = await publicClient.readContract({
                address: PKP_PERMISSIONS_CONTRACT_ADDRESS,
                abi: PKP_PERMISSIONS_ABI,
                functionName: 'getPubkey',
                args: [BigInt(pkpTokenId)]
            }) as Hex;
            pkpEthAddress = await publicClient.readContract({
                address: PKP_PERMISSIONS_CONTRACT_ADDRESS,
                abi: PKP_PERMISSIONS_ABI,
                functionName: 'getEthAddress',
                args: [BigInt(pkpTokenId)]
            }) as Address;
            console.log('Fetched PKP info via direct contract read:', { pkpPublicKey, pkpEthAddress });
        }
        if (!pkpPublicKey || !pkpEthAddress) {
            throw new Error(`Could not retrieve PKP public key and ETH address for token ID ${pkpTokenId}.`);
        }

        console.log("PKP Minted & Info Retrieved:", { pkpTokenId, pkpPublicKey, pkpEthAddress });

        // --- Capacity Credit NFT Minting & Transfer ---
        console.log("\n--- Capacity Credit NFT Provisioning ---");
        const expiresAtDate = new Date();
        expiresAtDate.setUTCHours(0, 0, 0, 0);
        expiresAtDate.setUTCDate(expiresAtDate.getUTCDate() + capacityDurationDays);
        const capacityExpiresAtTimestamp = BigInt(Math.floor(expiresAtDate.getTime() / 1000));

        const capacityMintCost = await publicClient.readContract({
            address: RATE_LIMIT_NFT_CONTRACT_ADDRESS,
            abi: RATE_LIMIT_NFT_ABI,
            functionName: 'calculateCost',
            args: [capacityRequestsPerKilosecond, capacityExpiresAtTimestamp]
        }) as bigint;
        console.log(`Calculated Capacity NFT mint cost: ${capacityMintCost} wei`);

        const capacityMintTxHash = await walletClient.writeContract({
            address: RATE_LIMIT_NFT_CONTRACT_ADDRESS,
            abi: RATE_LIMIT_NFT_ABI,
            functionName: 'mint',
            args: [capacityExpiresAtTimestamp],
            account: eoaAddress,
            chain: currentChain,
            value: capacityMintCost
        });
        console.log('Capacity Credit NFT mint transaction sent, hash:', capacityMintTxHash);
        const capacityMintReceipt = await publicClient.waitForTransactionReceipt({ hash: capacityMintTxHash });
        if (capacityMintReceipt.status !== 'success') {
            throw new Error(`Capacity Credit NFT minting failed. TxHash: ${capacityMintTxHash}`);
        }
        console.log('Capacity Credit NFT mint successful.');

        let capacityTokenId: string | null = null;
        const eoaAddressPaddedHex = ethersUtils.hexZeroPad(eoaAddress, 32).toLowerCase() as Hex;

        for (const log of capacityMintReceipt.logs) {
            if (log.address.toLowerCase() === RATE_LIMIT_NFT_CONTRACT_ADDRESS.toLowerCase() &&
                log.topics[0]?.toLowerCase() === transferEventSignature.toLowerCase() &&
                log.topics[1]?.toLowerCase() === zeroAddressPaddedHex.toLowerCase() &&
                log.topics[2]?.toLowerCase() === eoaAddressPaddedHex.toLowerCase() &&
                log.topics.length > 3) {
                try {
                    capacityTokenId = BigInt(log.topics[3] as Hex).toString();
                    console.log("Extracted Capacity Credit NFT Token ID:", capacityTokenId);
                    break;
                } catch (e: unknown) { console.warn("Error parsing Capacity NFT tokenId:", (e instanceof Error ? e.message : String(e))); }
            }
        }
        if (!capacityTokenId) {
            throw new Error('Could not extract Capacity Credit NFT Token ID from mint logs.');
        }

        // Transfer capacity NFT to PKP's ETH address
        const capacityTransferTxHash = await walletClient.writeContract({
            address: RATE_LIMIT_NFT_CONTRACT_ADDRESS,
            abi: RATE_LIMIT_NFT_ABI,
            functionName: 'safeTransferFrom',
            args: [eoaAddress, pkpEthAddress, BigInt(capacityTokenId)],
            account: eoaAddress,
            chain: currentChain
        });
        console.log('Capacity Credit NFT transfer transaction sent, hash:', capacityTransferTxHash);
        const capacityTransferReceipt = await publicClient.waitForTransactionReceipt({ hash: capacityTransferTxHash });
        if (capacityTransferReceipt.status !== 'success') {
            throw new Error(`Capacity Credit NFT transfer to PKP failed. TxHash: ${capacityTransferTxHash}`);
        }
        console.log(`Capacity Credit NFT ${capacityTokenId} transferred to PKP ${pkpEthAddress}.`);

        return {
            pkpTokenId,
            pkpPublicKey,
            pkpEthAddress,
            pkpMintTxHash,
            capacityTokenId,
            capacityMintTxHash,
            capacityTransferTxHash
        };

    } catch (error: unknown) {
        console.error('Error during PKP minting with Lit Action Auth and Capacity Provisioning:', error);
        let message: string;
        if (error instanceof Error) {
            message = error.message;
            // Check for shortMessage property safely
            if (typeof error === 'object' && error !== null && 'shortMessage' in error && typeof (error as { shortMessage?: unknown }).shortMessage === 'string') {
                message = (error as { shortMessage: string }).shortMessage;
            }
        } else {
            message = String(error);
        }
        throw new Error(`PKP Minting/Capacity Provisioning Failed: ${message}`);
    }
}

// --- NEW TYPE DEFINITIONS (Ported from legacy) ---
export interface CapacityCredit {
    tokenId: string;
    requestsPerKilosecond: bigint;
    expiresAt: bigint;
}

export interface PermittedAuthMethod {
    authMethodType: bigint;
    id: Hex; // This can be an IPFS CID for actions, or other identifiers
    userPubkey: Hex; // For passkeys, this is the pubkey on the verifier contract. For others, could be 0x0.
}

/**
 * Fetches all permitted authentication methods for a given PKP Token ID using direct Viem read.
 * (Ported from legacy hominio/src/lib/wallet/lit.ts)
 * @param pkpTokenId The Token ID of the PKP to query.
 * @returns A promise that resolves to an array of permitted auth methods.
 */
export const getPermittedAuthMethodsForPkp = async (
    pkpTokenId: string
): Promise<PermittedAuthMethod[]> => {
    if (!pkpTokenId || typeof pkpTokenId !== 'string' || !pkpTokenId.trim()) {
        console.error("[litService] PKP Token ID is invalid or empty for getPermittedAuthMethodsForPkp:", pkpTokenId);
        throw new Error("PKP Token ID cannot be empty or invalid.");
    }

    console.log(`[litService] Fetching permitted auth methods for PKP Token ID: ${pkpTokenId} via direct Viem read on chain ${currentChain.name} (ID: ${currentChain.id})`);

    try {
        const publicClient: PublicClient = createPublicClient({
            chain: currentChain,
            transport: http()
        });

        const permittedMethodsRaw = await publicClient.readContract({
            address: PKP_PERMISSIONS_CONTRACT_ADDRESS,
            abi: PKP_PERMISSIONS_ABI,
            functionName: 'getPermittedAuthMethods',
            args: [BigInt(pkpTokenId)]
        });

        console.log("[litService] Raw result from getPermittedAuthMethods:", permittedMethodsRaw);

        if (!Array.isArray(permittedMethodsRaw)) {
            console.error("[litService] Unexpected result format from getPermittedAuthMethods:", permittedMethodsRaw);
            throw new Error('Contract read for permitted auth methods returned unexpected format.');
        }

        return permittedMethodsRaw.map(method => ({
            authMethodType: method.authMethodType,
            id: method.id,
            userPubkey: method.userPubkey
        }));

    } catch (error: unknown) {
        console.error('[litService] Error fetching permitted auth methods via Viem read:', error);
        let message = 'Unknown error fetching permitted auth methods';
        if (error instanceof Error) {
            message = error.message;
        }
        throw new Error(`[litService] Failed to fetch permitted auth methods: ${message}`);
    }
};

/**
 * Fetches all Capacity Credit NFTs owned by a specific address.
 * (Ported from legacy hominio/src/lib/wallet/lit.ts)
 * @param ownerAddress The address of the owner.
 * @param publicClientInput Optional Viem PublicClient configured for the current chain.
 * @returns A promise that resolves to an array of owned capacity credits with their details.
 */
export const getOwnedCapacityCredits = async (
    ownerAddress: Address,
    publicClientInput?: PublicClient
): Promise<CapacityCredit[]> => {
    if (!ownerAddress) {
        throw new Error("[litService] Owner address cannot be empty for getOwnedCapacityCredits.");
    }

    const client = publicClientInput || createPublicClient({ chain: currentChain, transport: http() });

    console.log(`[litService] Fetching Capacity Credit NFTs for owner: ${ownerAddress} on chain ${currentChain.name} (ID: ${currentChain.id})`);

    try {
        const balance = await client.readContract({
            address: RATE_LIMIT_NFT_CONTRACT_ADDRESS,
            abi: RATE_LIMIT_NFT_ABI,
            functionName: 'balanceOf',
            args: [ownerAddress]
        }) as bigint;

        console.log(`[litService] Owner ${ownerAddress} has ${balance} Capacity Credit NFT(s).`);

        if (balance === 0n) {
            return [];
        }

        const ownedCredits: CapacityCredit[] = [];
        for (let i = 0n; i < balance; i++) {
            try {
                const tokenIdBigInt = await client.readContract({
                    address: RATE_LIMIT_NFT_CONTRACT_ADDRESS,
                    abi: RATE_LIMIT_NFT_ABI,
                    functionName: 'tokenOfOwnerByIndex',
                    args: [ownerAddress, i]
                }) as bigint;
                const tokenId = tokenIdBigInt.toString();

                const capacityDetails = await client.readContract({
                    address: RATE_LIMIT_NFT_CONTRACT_ADDRESS,
                    abi: RATE_LIMIT_NFT_ABI,
                    functionName: 'capacity',
                    args: [tokenIdBigInt]
                }) as { requestsPerKilosecond: bigint; expiresAt: bigint };

                ownedCredits.push({
                    tokenId,
                    requestsPerKilosecond: capacityDetails.requestsPerKilosecond,
                    expiresAt: capacityDetails.expiresAt
                });
                console.log(`[litService] Fetched capacity details for token ID: ${tokenId}`, capacityDetails);
            } catch (loopError) {
                console.error(`[litService] Error fetching capacity details for token at index ${i}:`, loopError);
            }
        }
        return ownedCredits;

    } catch (error: unknown) {
        console.error('[litService] Error fetching owned Capacity Credits:', error);
        let message = 'Unknown error fetching owned Capacity Credits';
        if (error instanceof Error) {
            message = error.message;
        }
        throw new Error(`[litService] Failed to fetch owned Capacity Credits: ${message}`);
    }
};
