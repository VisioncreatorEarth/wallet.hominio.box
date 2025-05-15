import { LitPKPResource, LitActionResource } from "@lit-protocol/auth-helpers";
import { getLitClient } from './LitService'; // Ensure correct casing
import { passkeyVerifierLitActionCode } from "../lit-actions/passkeyVerifier";
import { EIP_1271_MAGIC_VALUE, formatSignatureForEIP1271 } from './contractService';
import { gnosis } from 'viem/chains';
import { type Hex, type Address, hashMessage, toBytes, bytesToHex } from 'viem';
import { Buffer } from 'buffer';
import * as ipfsOnlyHash from 'ipfs-only-hash';

import type {

    LitResourceAbilityRequest // This type IS used for resourceAbilityRequests array
} from '@lit-protocol/types';

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

/**
 * Signs a message using the user's PKP, authorized by a passkey-verifying Lit Action.
 */
export async function signMessageWithPkp(
    messageToSign: string,
    pkpTokenId: string,
    pkpPublicKey: Hex,
    passkeyRawId: Hex,
    passkeyVerifierContractAddress: Address
    // capacityDelegationAuthSig: AuthSig // REMOVED
): Promise<{ signature: Hex } | { error: string }> {
    const litNodeClient = await getLitClient();
    if (!litNodeClient.ready) {
        return { error: 'Lit Client not ready when starting signMessageWithPkp.' };
    }

    console.log('[litSigningService] signMessageWithPkp called with pkpTokenId:', pkpTokenId);

    try {
        // 0. Compute IPFS CID (Qm... string) of the Lit Action code
        const actionCodeBuffer = Buffer.from(passkeyVerifierLitActionCode);
        const computedCidString = await ipfsOnlyHash.of(actionCodeBuffer);
        console.log('[litSigningService] Computed IPFS CID string (Qm... format):', computedCidString);
        console.log('[litSigningService] Expected authorized Action IPFS CID (Hex from UI):', "0x1220f3cc29834a0a64849c9e6c0f52ec2261433e3d7bf0d199d90087d018d49fac1c");

        // 1. Generate a challenge for passkey assertion
        const passkeyChallenge = crypto.getRandomValues(new Uint8Array(32));

        // 2. Prepare jsParams for the Lit Action
        const paramsResult = await prepareLitActionJsParams(
            passkeyRawId,
            passkeyVerifierContractAddress,
            passkeyChallenge
        );

        if ('error' in paramsResult) {
            return { error: `Failed to prepare Lit Action JS params: ${paramsResult.error}` };
        }
        const { jsParams } = paramsResult;

        // 3. Define Resource Ability Requests for the Session Sigs
        const currentPkpResource = new LitPKPResource('*'); // Use wildcard for PKP resource
        const currentActionResource = new LitActionResource(computedCidString);

        const resourceAbilityRequests: LitResourceAbilityRequest[] = [
            {
                resource: currentPkpResource,
                ability: 'pkp-signing'
            },
            {
                resource: currentActionResource,
                ability: 'lit-action-execution'
            }
        ];

        // 4. Get Session Sigs using the Lit Action as the authentication method
        console.log('[litSigningService] Getting session sigs with PKP:', pkpPublicKey, 'Action IPFS ID:', computedCidString);

        const sessionSigs = await litNodeClient.getLitActionSessionSigs({
            pkpPublicKey,
            litActionCode: Buffer.from(passkeyVerifierLitActionCode).toString('base64'),
            jsParams,
            resourceAbilityRequests,
            authMethods: [],
            capabilityAuthSigs: [], // CHANGED: No explicit capacity delegation AuthSig for now
            expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            chain: 'ethereum',
        });

        console.log('[litSigningService] Successfully obtained SessionSigs:', sessionSigs);

        // 5. Prepare the message digest for pkpSign
        const messageDigest = hashMessage(messageToSign);
        const digestToSign = toBytes(messageDigest);

        // 6. Sign the digest with the PKP
        const pkpSignResult = await litNodeClient.pkpSign({
            sessionSigs: sessionSigs,
            toSign: digestToSign,
            pubKey: pkpPublicKey,
        });

        console.log("[litSigningService] PKP Sign Result:", pkpSignResult);

        if (!pkpSignResult || !pkpSignResult.signature) {
            return { error: "Failed to sign message with PKP or signature missing in result." };
        }

        return { signature: pkpSignResult.signature as Hex };

    } catch (error: unknown) {
        console.error('[litSigningService] Error in signMessageWithPkp:', error);
        let message = 'An unknown error occurred during message signing.';
        if (error instanceof Error) {
            message = error.message;
            type LitErrorWithCode = Error & { errorCode?: string | number };
            const litError = error as LitErrorWithCode;
            if (litError.errorCode) {
                message = `Lit SDK Error (${litError.errorCode}): ${litError.message}`;
            }
        }
        return { error: `Sign message failed: ${message}` };
    }
}
