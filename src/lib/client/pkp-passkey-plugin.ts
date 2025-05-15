import type { BetterAuthClientPlugin } from 'better-auth';
import type { BetterFetch } from '@better-fetch/fetch';
import type { pkpPasskeyServerPlugin } from '../server/pkp-passkey-plugin'; // Adjusted import path

// --- CLIENT PLUGIN ---
// Interface for the pkp_passkey object (matches server PkpPasskey)
export interface ClientPkpPasskey {
    rawId: string;
    pubKey: string;
    pkpEthAddress: string; // ADDED: The ETH address derived from the PKP public key
    passkeyVerifierContract?: string; // RENAMED
    username: string; // Added username
    pubkeyCoordinates: { // Added passkey public key coordinates
        x: string; // hex format
        y: string; // hex format
    };
    pkpTokenId: string; // Added pkpTokenId
}

// Args for updateUserPasskeyInfo - This defines the structure of the 'data' argument for the action
export interface UpdatePasskeyInfoClientArgs {
    pkp_passkey: ClientPkpPasskey;
}

// Expected response from updateUserPasskeyInfo
export interface UpdatePasskeyInfoClientResponse {
    user: {
        id: string;
        pkp_passkey: ClientPkpPasskey; // This will now include pkpEthAddress
    };
    // Include other potential fields from APIError if $fetch handles errors this way
    error?: { message: string; code?: string; status?: number };
}

// Expected response from getUserPasskeyInfo
export interface GetUserPasskeyInfoClientResponse {
    pkp_passkey: ClientPkpPasskey | null; // This will now include pkpEthAddress if not null
    error?: { message: string; code?: string; status?: number };
}

// Args for checkRawIdExists
export interface CheckRawIdExistsClientArgs {
    rawId: string;
}

// Expected response from checkRawIdExists
export interface CheckRawIdExistsClientResponse {
    exists: boolean;
    userId?: string;
    pkpPublicKey?: string;
    pkpEthAddress?: string; // ADDED
    passkeyVerifierContract?: string; // RENAMED
    pkpTokenId?: string; // Added pkpTokenId
    error?: { message: string; code?: string; status?: number };
}

export interface CheckRawIdExistsClientResponseSuccess {
    exists: boolean;
    pkpPublicKey?: string;          // PKP Public Key (hex format, 0x prefixed)
    pkpEthAddress?: string; // ADDED
    userId?: string;                // User ID if exists
    passkeyVerifierContract?: string; // Address of the deployed EIP-1271 signer (0x prefixed)
    pkpTokenId?: string; // Added pkpTokenId
}

export const pkpPasskeyClientPlugin = () => ({
    id: 'pkpPasskeyPlugin',
    $InferServerPlugin: {} as ReturnType<typeof pkpPasskeyServerPlugin>,
    pathMethods: {
        '/pkp-passkey-plugin/get-user-passkey-info': 'GET',
        '/pkp-passkey-plugin/update-user-passkey-info': 'POST',
        '/pkp-passkey-plugin/check-rawid-exists': 'POST' // Added new endpoint
    },
    getActions: ($fetch: BetterFetch) => {
        return {
            updateUserPasskeyInfo: async (data: UpdatePasskeyInfoClientArgs): Promise<UpdatePasskeyInfoClientResponse> => {
                // 'data' is UpdatePasskeyInfoClientArgs, which is { pkp_passkey: ClientPkpPasskey }.
                // This is sent as the body, matching server expectation.
                return $fetch('/pkp-passkey-plugin/update-user-passkey-info', {
                    method: 'POST',
                    body: data,
                });
            },
            getUserPasskeyInfo: async (): Promise<GetUserPasskeyInfoClientResponse> => {
                return $fetch('/pkp-passkey-plugin/get-user-passkey-info', {
                    method: 'GET',
                });
            },
            checkRawIdExists: async (data: CheckRawIdExistsClientArgs): Promise<CheckRawIdExistsClientResponse> => {
                return $fetch('/pkp-passkey-plugin/check-rawid-exists', {
                    method: 'POST',
                    body: data,
                });
            }
        };
    }
} satisfies BetterAuthClientPlugin); 