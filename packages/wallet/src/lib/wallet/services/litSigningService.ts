import { LitPKPResource, LitActionResource } from "@lit-protocol/auth-helpers";
import { getLitClient } from './litService'; // Assuming filename is litService.ts (lowercase)
import { passkeyVerifierLitActionCode } from "../lit-actions/passkeyVerifier";
// ADD: Import for example Lit Action if its code is to be directly used or referenced by CID
// import { example42LitActionCode } from "../lit-actions/example-42";
import { EIP_1271_MAGIC_VALUE, formatSignatureForEIP1271 } from './contractService';
import { gnosis } from 'viem/chains';
import { type Hex, type Address, hashMessage, toBytes, bytesToHex, serializeTransaction, keccak256, type TransactionSerializable, type Signature as ViemSignature } from 'viem';
import { publicKeyToAddress } from 'viem/utils'; // Added for deriving address
import { Buffer } from 'buffer';
// import * as ipfsOnlyHash from 'ipfs-only-hash'; // Removed as unused

import type {
    // AuthSig, // Assuming AuthSig is not directly used here now, review if needed
    // SessionSigsMap, // REMOVED as no longer used
    // PKPSignShare, // If used by pkpSign or related calls - REMOVED AS UNUSED
    // JsonExecutionRequest, // If used by executeJs or related calls - REMOVED AS UNUSED
    LitResourceAbilityRequest,
    AuthSig, // Added AuthSig type
    SessionSigsMap, // Added SessionSigsMap for clarity, though getPkpSessionSigs/getLitActionSessionSigs return it
    ExecuteJsResponse, // ADDED for executeLitActionWithPkp
    SigResponse // Import for pkpSign result
} from '@lit-protocol/types';

const LIT_WALLET_SIG_STORAGE_KEY = 'lit-wallet-sig'; // Key used by Lit SDK

/**
 * Prepares the jsParams object required for executing the passkey verifier Lit Action.
 * This function will perform a passkey assertion (navigator.credentials.get).
 */
async function prepareLitActionJsParams(
    passkeyRawId: Hex, // Hex string of the passkey's rawId
    passkeyVerifierContractAddress: Address,
    challenge: Uint8Array // The challenge to be signed by the passkey
): Promise<{ jsParams: object } | { error: string }> {
    try {
        // 1. Perform passkey assertion
        const hexRawId = passkeyRawId.startsWith('0x') ? passkeyRawId.substring(2) : passkeyRawId;
        const rawIdBuffer = Buffer.from(hexRawId, 'hex');
        const allowCredentials: PublicKeyCredentialDescriptor[] = [
            {
                type: 'public-key',
                // Ensure this is a plain ArrayBuffer for the navigator.credentials.get API
                id: rawIdBuffer.buffer.slice(rawIdBuffer.byteOffset, rawIdBuffer.byteOffset + rawIdBuffer.byteLength),
            },
        ];

        const assertion = (await navigator.credentials.get({
            publicKey: {
                challenge: challenge,
                allowCredentials: allowCredentials,
                userVerification: 'preferred',
                timeout: 60000, // 60 seconds
            },
        })) as PublicKeyCredential | null;

        if (!assertion || !assertion.rawId || !assertion.response) {
            return { error: 'Passkey assertion failed or was cancelled by the user.' };
        }

        const response = assertion.response as AuthenticatorAssertionResponse;
        if (!response.clientDataJSON || !response.authenticatorData || !response.signature) {
            return { error: 'Passkey assertion response is missing required fields.' };
        }

        const clientDataString = new TextDecoder().decode(response.clientDataJSON);
        const clientData = JSON.parse(clientDataString);
        const signedChallengeString = clientData.challenge;

        if (!signedChallengeString || typeof signedChallengeString !== 'string') {
            return { error: 'Could not extract signed challenge from clientDataJSON.' };
        }

        // Convert base64url to standard base64
        let standardBase64 = signedChallengeString.replace(/-/g, '+').replace(/_/g, '/');
        while (standardBase64.length % 4) {
            standardBase64 += '=';
        }

        const actualChallengeBytes = Buffer.from(standardBase64, 'base64');
        const messageHashForLitAction = bytesToHex(actualChallengeBytes);

        const formattedSignature = formatSignatureForEIP1271({
            authenticatorData: response.authenticatorData,
            clientDataJSON: response.clientDataJSON,
            signature: response.signature,
        });

        console.log('[litSigningService] Value of EIP_1271_MAGIC_VALUE constant before creating jsParams:', EIP_1271_MAGIC_VALUE);

        const jsParams = {
            messageHash: messageHashForLitAction,
            formattedSignature: formattedSignature,
            eip1271ContractAddress: passkeyVerifierContractAddress,
            JS_EIP_1271_MAGIC_VALUE: EIP_1271_MAGIC_VALUE,
            chainRpcUrl: gnosis.rpcUrls.default.http[0],
        };

        console.log('[litSigningService] Prepared jsParams for Lit Action:', jsParams);

        return { jsParams };

    } catch (error: unknown) {
        console.error('Error preparing Lit Action JS params:', error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred during passkey assertion or processing.';
        if (error instanceof Error && error.name === 'NotAllowedError') {
            return { error: 'Passkey assertion was cancelled by the user.' };
        }
        return { error: `Failed to prepare JS params: ${message}` };
    }
}

// Type for PublicKeyCredential (already in passkeyService.ts, re-declare or import if necessary)
// Assuming PublicKeyCredential and AuthenticatorAssertionResponse types are available from global scope or imported from passkeyService.ts
interface PublicKeyCredentialDescriptor {
    type: PublicKeyCredentialType;
    id: ArrayBuffer;
    transports?: AuthenticatorTransport[];
}

interface AuthenticatorAssertionResponse extends AuthenticatorResponse {
    readonly authenticatorData: ArrayBuffer;
    readonly signature: ArrayBuffer;
    readonly userHandle?: ArrayBuffer | null | undefined;
}

// Helper to parse the expiration from a SIWE message
function getExpirationFromSiweMessage(message: string): Date | null {
    const expirationMatch = message.match(/Expiration Time: (.*)/);
    if (expirationMatch && expirationMatch[1]) {
        return new Date(expirationMatch[1]);
    }
    return null;
}

/**
 * INTERNAL: Acquires PKP Session Signatures.
 * Attempts to use a stored AuthSig first, then falls back to Lit Action (passkey prompt).
 */
async function _acquirePkpSessionSigs(
    pkpPublicKey: Hex,
    passkeyRawId: Hex,
    passkeyVerifierContractAddress: Address,
    resourceAbilityRequests: LitResourceAbilityRequest[]
): Promise<SessionSigsMap | { error: string }> {
    const litNodeClient = await getLitClient();
    if (!litNodeClient.ready) {
        return { error: 'Lit Client not ready when trying to acquire session sigs.' };
    }
    console.log('[litSigningServiceInternal] _acquirePkpSessionSigs called.');

    // Attempt 1: Try to use stored AuthSig (lit-wallet-sig)
    console.log('[litSigningServiceInternal] Attempt 1: Trying to use stored AuthSig.');
    try {
        const storedAuthSigString = localStorage.getItem(LIT_WALLET_SIG_STORAGE_KEY);
        if (storedAuthSigString) {
            const authSig: AuthSig = JSON.parse(storedAuthSigString);
            console.log('[litSigningServiceInternal] Found stored AuthSig:', authSig);

            const authSigExpiration = getExpirationFromSiweMessage(authSig.signedMessage);
            if (authSigExpiration && authSigExpiration < new Date()) {
                console.warn('[litSigningServiceInternal] Stored AuthSig has expired. Proceeding to fallback.');
            } else {
                const currentPkpEthAddress = publicKeyToAddress(pkpPublicKey);
                if (authSig.address.toLowerCase() !== currentPkpEthAddress.toLowerCase()) {
                    console.warn(`[litSigningServiceInternal] Stored AuthSig address (${authSig.address}) does not match current PKP ETH address (${currentPkpEthAddress}). Proceeding to fallback.`);
                } else {
                    console.log('[litSigningServiceInternal] Calling getPkpSessionSigs with stored AuthSig.');
                    const sessionSigs = await litNodeClient.getPkpSessionSigs({
                        pkpPublicKey: pkpPublicKey,
                        authMethods: [{
                            authMethodType: 1, // AuthSig
                            accessToken: storedAuthSigString as any,
                        }],
                        resourceAbilityRequests,
                        expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24hr session
                    });
                    console.log('[litSigningServiceInternal] Successfully obtained SessionSigs using stored AuthSig.');
                    return sessionSigs;
                }
            }
        } else {
            console.log('[litSigningServiceInternal] No stored AuthSig found.');
        }
    } catch (e: unknown) {
        console.warn(`[litSigningServiceInternal] Attempt 1 failed (using stored AuthSig): ${e instanceof Error ? e.message : String(e)}. Proceeding to fallback.`);
    }

    // Attempt 2 (Fallback/Initial Run): Use Lit Action for authentication
    console.log('[litSigningServiceInternal] Attempt 2 (Fallback): Using Lit Action for authentication (will prompt passkey).');
    try {
        const passkeyChallenge = crypto.getRandomValues(new Uint8Array(32));
        const paramsResult = await prepareLitActionJsParams(
            passkeyRawId,
            passkeyVerifierContractAddress,
            passkeyChallenge
        );

        if ('error' in paramsResult) {
            return { error: `Fallback: Failed to prepare Lit Action JS params: ${paramsResult.error}` };
        }
        const { jsParams } = paramsResult;

        console.log('[litSigningServiceInternal] Fallback: Calling getLitActionSessionSigs...');
        const sessionSigs = await litNodeClient.getLitActionSessionSigs({
            pkpPublicKey,
            litActionCode: Buffer.from(passkeyVerifierLitActionCode).toString('base64'), // REINSTATED Base64 encoding
            jsParams,
            resourceAbilityRequests, // Use the provided resourceAbilityRequests
            authMethods: [],
            expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            chain: 'ethereum',
        });
        console.log('[litSigningServiceInternal] Fallback: Successfully obtained SessionSigs via Lit Action.');
        // SDK should have stored/updated lit-wallet-sig at this point if successful
        return sessionSigs;
    } catch (fallbackError: unknown) {
        console.error('[litSigningServiceInternal] Error in fallback (getLitActionSessionSigs):', fallbackError);
        const message = fallbackError instanceof Error ? fallbackError.message : 'Unknown error during Lit Action fallback.';
        return { error: `Failed to obtain session sigs via Lit Action fallback: ${message}` };
    }
}

/**
 * Signs a message using the user's PKP.
 * Attempts to use a stored AuthSig first, falls back to Lit Action (passkey prompt).
 */
export async function signMessageWithPkp(
    messageToSign: string,
    pkpTokenId: string, // Retained for context, though pkpPublicKey is primary for sessionSigs
    pkpPublicKey: Hex,
    passkeyRawId: Hex,
    passkeyVerifierContractAddress: Address
): Promise<{ signature: Hex } | { error: string }> {
    console.log('[litSigningService] signMessageWithPkp called.');
    const digestToSign = toBytes(hashMessage(messageToSign));

    const resourceAbilityRequests: LitResourceAbilityRequest[] = [
        {
            resource: new LitPKPResource('*'), // Or specific: new LitPKPResource(pkpTokenId)
            ability: 'pkp-signing',
        },
    ];

    const sessionSigsResult = await _acquirePkpSessionSigs(
        pkpPublicKey,
        passkeyRawId,
        passkeyVerifierContractAddress,
        resourceAbilityRequests
    );

    if ('error' in sessionSigsResult) {
        return { error: sessionSigsResult.error };
    }
    const sessionSigs = sessionSigsResult;

    // If we have sessionSigs, proceed to sign
    if (sessionSigs) {
        const litNodeClient = await getLitClient(); // Ensure client is still accessible
        if (!litNodeClient.ready) return { error: "Lit Client became not ready before pkpSign." }
        try {
            console.log('[litSigningService] Calling pkpSign with obtained SessionSigs for message...');
            const pkpSignResult: SigResponse = await litNodeClient.pkpSign({
                sessionSigs: sessionSigs,
                toSign: digestToSign, // This is Uint8Array for message hash
                pubKey: pkpPublicKey,
            });

            console.log("[litSigningService] PKP Sign Result (message):", pkpSignResult);
            if (!pkpSignResult || !pkpSignResult.r || !pkpSignResult.s || pkpSignResult.recid === undefined) {
                return { error: "Failed to sign message with PKP or signature components missing." };
            }
            // For a standard message signature, typically an EIP-191 signed message, the signature is usually concatenated r, s, v.
            // The 'v' value (recid + 27) is common.
            const r = `0x${pkpSignResult.r}`;
            const s = `0x${pkpSignResult.s}`;
            const v = (pkpSignResult.recid + 27).toString(16); // Convert v to hex
            const combinedSignature = `${r}${s.substring(2)}${v.length === 1 ? '0' + v : v}` as Hex;

            return { signature: combinedSignature };
        } catch (signError: unknown) {
            console.error('[litSigningService] Error during final pkpSign call (message):', signError);
            const message = signError instanceof Error ? signError.message : 'Unknown error during pkpSign.';
            return { error: `Failed to sign message: ${message}` };
        }
    } else {
        // This case should ideally be caught by checks within _acquirePkpSessionSigs
        return { error: "Failed to obtain session signatures for message signing (unexpected state)." };
    }
}

/**
 * Signs a transaction hash using the user's PKP.
 * Acquires session signatures, then signs the hash of the serialized transaction.
 */
export async function signTransactionWithPkp(
    transactionToSign: TransactionSerializable,
    pkpTokenId: string, // Retained for context
    pkpPublicKey: Hex,
    passkeyRawId: Hex,
    passkeyVerifierContractAddress: Address
): Promise<{ signature: ViemSignature } | { error: string }> {
    console.log('[litSigningService] signTransactionWithPkp called for transaction:', transactionToSign);

    let serializedTx: Hex;
    try {
        serializedTx = serializeTransaction(transactionToSign);
        console.log('[litSigningService] Serialized Transaction:', serializedTx);
    } catch (serializeError: unknown) {
        const message = serializeError instanceof Error ? serializeError.message : 'Unknown serialization error.';
        console.error('[litSigningService] Error serializing transaction:', message);
        return { error: `Failed to serialize transaction: ${message}` };
    }

    const digestToSign = toBytes(keccak256(serializedTx)); // Hash the serialized transaction
    console.log('[litSigningService] Digest to sign (transaction hash):', bytesToHex(digestToSign));

    const resourceAbilityRequests: LitResourceAbilityRequest[] = [
        {
            resource: new LitPKPResource('*'), // Or specific: new LitPKPResource(pkpTokenId)
            ability: 'pkp-signing',
        },
    ];

    const sessionSigsResult = await _acquirePkpSessionSigs(
        pkpPublicKey,
        passkeyRawId,
        passkeyVerifierContractAddress,
        resourceAbilityRequests
    );

    if ('error' in sessionSigsResult) {
        return { error: sessionSigsResult.error };
    }
    const sessionSigs = sessionSigsResult;

    if (sessionSigs) {
        const litNodeClient = await getLitClient();
        if (!litNodeClient.ready) return { error: "Lit Client became not ready before pkpSign for transaction." };
        try {
            console.log('[litSigningService] Calling pkpSign with obtained SessionSigs for transaction hash...');
            const pkpSignResult: SigResponse = await litNodeClient.pkpSign({
                sessionSigs: sessionSigs,
                toSign: digestToSign, // This is Uint8Array of the transaction hash
                pubKey: pkpPublicKey,
            });

            console.log("[litSigningService] PKP Sign Result (transaction):", pkpSignResult);

            if (!pkpSignResult || !pkpSignResult.r || !pkpSignResult.s || pkpSignResult.recid === undefined) {
                return { error: "Failed to sign transaction with PKP or signature components missing." };
            }

            // Convert Lit's SigResponse to Viem's Signature type
            // recid is yParity (0 or 1).
            const signature: ViemSignature = {
                r: `0x${pkpSignResult.r}` as Hex,
                s: `0x${pkpSignResult.s}` as Hex,
                yParity: pkpSignResult.recid as 0 | 1,
            };
            // For EIP-1559 transactions, yParity is preferred over v.
            // Some wallets/systems might still expect v. Viem's serializeTransaction & signTransaction handle this.
            // Here we provide both for flexibility, but yParity is key for EIP-155.

            console.log("[litSigningService] Formatted Viem Signature:", signature);
            return { signature };

        } catch (signError: unknown) {
            console.error('[litSigningService] Error during final pkpSign call (transaction):', signError);
            const message = signError instanceof Error ? signError.message : 'Unknown error during pkpSign for transaction.';
            return { error: `Failed to sign transaction: ${message}` };
        }
    } else {
        return { error: "Failed to obtain session signatures for transaction signing (unexpected state)." };
    }
}

/**
 * Executes a Lit Action using the user's PKP.
 * Acquires session signatures, then executes the action.
 */
export async function executeLitActionWithPkp(
    pkpTokenId: string, // Retained for context, pkpPublicKey primary for sessionSigs
    pkpPublicKey: Hex,
    passkeyRawId: Hex,
    passkeyVerifierContractAddress: Address,
    litActionCode: string, // The JS code for the Lit Action
    jsParams: Record<string, unknown> // Parameters to pass to the Lit Action
): Promise<ExecuteJsResponse | { error: string }> {
    console.log('[litSigningService] executeLitActionWithPkp called.');

    const resourceAbilityRequests: LitResourceAbilityRequest[] = [
        {
            resource: new LitPKPResource('*'), // Or specific: new LitPKPResource(pkpTokenId)
            ability: 'pkp-signing', // Actions might need to sign
        },
        {
            resource: new LitActionResource('*'), // Or specific CID: new LitActionResource(computedCidString)
            ability: 'lit-action-execution',
        }
    ];

    const sessionSigsResult = await _acquirePkpSessionSigs(
        pkpPublicKey,
        passkeyRawId,
        passkeyVerifierContractAddress,
        resourceAbilityRequests
    );

    if ('error' in sessionSigsResult) {
        return { error: sessionSigsResult.error };
    }
    const sessionSigs = sessionSigsResult;

    if (sessionSigs) {
        const litNodeClient = await getLitClient();
        if (!litNodeClient.ready) return { error: "Lit Client became not ready before executeJs." }
        try {
            console.log('[litSigningService] Calling executeJs with obtained SessionSigs...');
            const actionResult = await litNodeClient.executeJs({
                sessionSigs,
                code: litActionCode as string, // Explicitly cast to string
                jsParams,
            });
            console.log("[litSigningService] Lit Action Execution Result:", actionResult);
            return actionResult as ExecuteJsResponse; // Assuming result is ExecuteJsResponse
        } catch (execError: unknown) {
            console.error('[litSigningService] Error during executeJs call:', execError);
            const message = execError instanceof Error ? execError.message : 'Unknown error during executeJs.';
            return { error: `Failed to execute Lit Action: ${message}` };
        }
    } else {
        return { error: "Failed to obtain session signatures for Lit Action execution (unexpected state)." };
    }
}
