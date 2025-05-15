import { LitPKPResource, LitActionResource } from "@lit-protocol/auth-helpers";
import { getLitClient } from './litService'; // Assuming filename is litService.ts (lowercase)
import { passkeyVerifierLitActionCode } from "../lit-actions/passkeyVerifier";
import { EIP_1271_MAGIC_VALUE, formatSignatureForEIP1271 } from './contractService';
import { gnosis } from 'viem/chains';
import { type Hex, type Address, hashMessage, toBytes, bytesToHex } from 'viem';
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
    SessionSigsMap // Added SessionSigsMap for clarity, though getPkpSessionSigs/getLitActionSessionSigs return it
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
 * Signs a message using the user's PKP.
 * Attempts to use a stored AuthSig first, falls back to Lit Action (passkey prompt).
 */
export async function signMessageWithPkp(
    messageToSign: string,
    pkpTokenId: string,
    pkpPublicKey: Hex,
    passkeyRawId: Hex,
    passkeyVerifierContractAddress: Address
): Promise<{ signature: Hex } | { error: string }> {
    const litNodeClient = await getLitClient();
    if (!litNodeClient.ready) {
        return { error: 'Lit Client not ready when starting signMessageWithPkp.' };
    }

    console.log('[litSigningService] signMessageWithPkp called.');
    const digestToSign = toBytes(hashMessage(messageToSign));
    let sessionSigs: SessionSigsMap | undefined = undefined;

    // Attempt 1: Try to use stored AuthSig (lit-wallet-sig) with getPkpSessionSigs
    console.log('[litSigningService] Attempt 1: Trying to use stored AuthSig (lit-wallet-sig).');
    try {
        const storedAuthSigString = localStorage.getItem(LIT_WALLET_SIG_STORAGE_KEY);
        if (storedAuthSigString) {
            const authSig: AuthSig = JSON.parse(storedAuthSigString);
            console.log('[litSigningService] Found stored AuthSig:', authSig);

            // Optional: Check expiration of the AuthSig itself
            const authSigExpiration = getExpirationFromSiweMessage(authSig.signedMessage);
            if (authSigExpiration && authSigExpiration < new Date()) {
                console.warn('[litSigningService] Stored AuthSig has expired. Proceeding to fallback.');
            } else {
                // Derive Ethereum address from the current PKP public key for comparison
                const currentPkpEthAddress = publicKeyToAddress(pkpPublicKey);

                // Ensure pkpPublicKey matches the address in the AuthSig for safety
                if (authSig.address.toLowerCase() !== currentPkpEthAddress.toLowerCase()) {
                    console.warn(`[litSigningService] Stored AuthSig address (${authSig.address}) does not match current PKP ETH address (${currentPkpEthAddress}). Proceeding to fallback.`);
                } else {
                    const resourceAbilityRequests: LitResourceAbilityRequest[] = [
                        {
                            resource: new LitPKPResource('*'), // Or use pkpTokenId for specificity: new LitPKPResource(pkpTokenId)
                            ability: 'pkp-signing',
                        },
                    ];

                    console.log('[litSigningService] Calling getPkpSessionSigs with stored AuthSig.');
                    sessionSigs = await litNodeClient.getPkpSessionSigs({
                        pkpPublicKey: pkpPublicKey, // Must match the PKP this AuthSig is for
                        authMethods: [{
                            authMethodType: 1, // AuthSig
                            accessToken: storedAuthSigString, // The stringified AuthSig object
                        }],
                        resourceAbilityRequests,
                        // Expiration for the new SessionSigs we are generating NOW
                        expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    });
                    console.log('[litSigningService] Successfully obtained SessionSigs using stored AuthSig.');
                }
            }
        } else {
            console.log('[litSigningService] No stored AuthSig found.');
        }
    } catch (e: unknown) {
        console.warn(`[litSigningService] Attempt 1 failed (using stored AuthSig): ${e instanceof Error ? e.message : String(e)}. Proceeding to fallback.`);
        sessionSigs = undefined; // Ensure sessionSigs is undefined if this attempt fails
    }


    // Attempt 2 (Fallback/Initial Run): Use Lit Action for authentication if Attempt 1 failed
    if (!sessionSigs) {
        console.log('[litSigningService] Attempt 2 (Fallback/Initial Run): Using Lit Action for authentication.');
        try {
            // const actionCodeBuffer = Buffer.from(passkeyVerifierLitActionCode); // Removed as unused
            // const computedCidString = await ipfsOnlyHash.of(actionCodeBuffer); // Not strictly needed if using litActionCode directly

            const passkeyChallenge = crypto.getRandomValues(new Uint8Array(32));
            console.log('[litSigningService] Fallback: Preparing Lit Action JS Params (will prompt passkey)...');
            const paramsResult = await prepareLitActionJsParams(
                passkeyRawId,
                passkeyVerifierContractAddress,
                passkeyChallenge
            );

            if ('error' in paramsResult) {
                return { error: `Fallback: Failed to prepare Lit Action JS params: ${paramsResult.error}` };
            }
            const { jsParams } = paramsResult;

            const resourceAbilityRequests: LitResourceAbilityRequest[] = [
                {
                    resource: new LitPKPResource('*'),
                    ability: 'pkp-signing'
                },
                {
                    // resource: new LitActionResource(computedCidString), // Use CID if action is pre-registered & referred by CID
                    resource: new LitActionResource('*'), // Or wildcard if action code is passed directly & not pre-registered for specific CID scoping here
                    ability: 'lit-action-execution'
                }
            ];

            console.log('[litSigningService] Fallback: Calling getLitActionSessionSigs...');
            sessionSigs = await litNodeClient.getLitActionSessionSigs({
                pkpPublicKey,
                litActionCode: Buffer.from(passkeyVerifierLitActionCode).toString('base64'),
                jsParams,
                resourceAbilityRequests,
                authMethods: [], // AuthMethods for inside the Lit Action, not for the session sigs themselves here
                expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Expiration for the SessionSigs
                chain: 'ethereum', // Or your target chain
            });
            console.log('[litSigningService] Fallback: Successfully obtained SessionSigs via Lit Action.');
            // At this point, if successful, the SDK should have stored/updated lit-wallet-sig
        } catch (fallbackError: unknown) {
            console.error('[litSigningService] Error in fallback signing mechanism (getLitActionSessionSigs):', fallbackError);
            const message = fallbackError instanceof Error ? fallbackError.message : 'An unknown error occurred during fallback Lit Action authentication.';
            return { error: `Sign message failed via Lit Action fallback: ${message}` };
        }
    }

    // If we have sessionSigs (from either attempt), proceed to sign
    if (sessionSigs) {
        try {
            console.log('[litSigningService] Calling pkpSign with obtained SessionSigs...');
            const pkpSignResult = await litNodeClient.pkpSign({
                sessionSigs: sessionSigs,
                toSign: digestToSign,
                pubKey: pkpPublicKey,
            });

            console.log("[litSigningService] PKP Sign Result:", pkpSignResult);
            if (!pkpSignResult || !pkpSignResult.signature) {
                return { error: "Failed to sign message with PKP or signature missing from result." };
            }
            return { signature: pkpSignResult.signature as Hex };
        } catch (signError: unknown) {
            console.error('[litSigningService] Error during final pkpSign call:', signError);
            const message = signError instanceof Error ? signError.message : 'An unknown error occurred during pkpSign.';
            return { error: `Failed to sign: ${message}` };
        }
    } else {
        return { error: "Failed to obtain session signatures through any method." };
    }
}
