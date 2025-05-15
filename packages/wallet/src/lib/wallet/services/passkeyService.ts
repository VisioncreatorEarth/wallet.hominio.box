import { bytesToHex, /* hexToBigInt, keccak256, */ type Hex /*, toBytes */ } from 'viem';

// --- Constants ---
const RP_NAME = 'Hominio Passkey Signer'; // Consider making this configurable or moving to a central config if used elsewhere
const USER_DISPLAY_NAME = 'Hominio User'; // Same as above

// --- Types ---
// Re-defined from legacy passkeySigner.ts. Ensure these are compatible with WebAuthn browser APIs.
export type PublicKeyCredential = Credential & {
    rawId: ArrayBuffer;
    response: {
        clientDataJSON: ArrayBuffer;
        attestationObject?: ArrayBuffer; // Optional as per WebAuthn Level 2 for 'none' attestation
        authenticatorData?: ArrayBuffer;
        signature?: ArrayBuffer;
        userHandle?: ArrayBuffer;
        getPublicKey(): ArrayBuffer;
        getPublicKeyAlgorithm(): number;
    };
};

export type StoredPasskeyData = {
    rawId: Hex; // hex format (prefixed 0x)
    pubkeyCoordinates: {
        x: Hex; // hex format (prefixed 0x)
        y: Hex; // hex format (prefixed 0x)
    };
    username: string;
    passkeyVerifierContractAddress?: string; // Will be populated after EIP-1271 contract deployment
};

// Copied from legacy passkeySigner.ts, might be needed for signature verification later.
// This can be moved to a more general types file or contractService if it's used more broadly.
export declare interface AuthenticatorAssertionResponse extends AuthenticatorResponse {
    readonly authenticatorData: ArrayBuffer;
    readonly signature: ArrayBuffer;
    readonly userHandle?: ArrayBuffer | null | undefined;
}

// Helper function to convert base64url to Uint8Array without Buffer (from legacy passkeySigner.ts)
const base64UrlToUint8Array = (base64urlString: string): Uint8Array => {
    const base64 = base64urlString.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - base64.length % 4) % 4);
    const base64Padded = base64 + padding;
    const binaryString = atob(base64Padded);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

/**
 * Creates a new passkey credential and extracts public key coordinates.
 * Adapted from legacy hominio/src/lib/wallet/passkeySigner.ts
 */
export async function createPasskeyCredential(username: string): Promise<{ credential: PublicKeyCredential, coordinates: { x: Hex, y: Hex } } | null> {
    try {
        const passkeyCredential = await navigator.credentials.create({
            publicKey: {
                pubKeyCredParams: [
                    {
                        alg: -7, // ES256 (ECDSA with P-256)
                        type: 'public-key'
                    },
                    {
                        alg: -257, // RS256 (RSA PKCS#1 v1.5 with SHA-256)
                        type: 'public-key' // Note: While RS256 is an option, most passkeys will be ES256.
                    }
                ],
                challenge: crypto.getRandomValues(new Uint8Array(32)), // Secure random challenge
                rp: {
                    name: RP_NAME
                },
                user: {
                    displayName: USER_DISPLAY_NAME,
                    id: crypto.getRandomValues(new Uint8Array(32)), // User ID, should be stable if linking accounts
                    name: username
                },
                timeout: 60_000, // 60 seconds
                attestation: 'none' // Prefer 'none' for privacy and simplicity unless attestation is strictly required
            }
        }) as PublicKeyCredential | null;

        if (!passkeyCredential) {
            throw Error('Passkey creation failed: No credential was returned by the browser.');
        }

        const pubKey = passkeyCredential.response.getPublicKey();
        if (!pubKey) {
            throw new Error('Could not get public key from credential response.');
        }

        // Import the public key in SPKI format to use with WebCrypto API
        const key = await crypto.subtle.importKey(
            'spki',
            pubKey,
            {
                name: 'ECDSA',
                namedCurve: 'P-256', // Must match the curve of ES256
            },
            true, // exportable
            ['verify'] // key usages
        );

        // Export the key in JWK format to extract x and y coordinates
        const jwk = await crypto.subtle.exportKey('jwk', key);
        if (!jwk.x || !jwk.y) {
            throw new Error('Failed to retrieve x and y coordinates from exported JWK.');
        }

        // Convert base64url encoded x and y coordinates to Hex
        const xBytes = base64UrlToUint8Array(jwk.x);
        const yBytes = base64UrlToUint8Array(jwk.y);

        const coordinates = {
            x: bytesToHex(xBytes),
            y: bytesToHex(yBytes),
        };

        return { credential: passkeyCredential, coordinates };

    } catch (error) {
        console.error('Error creating passkey credential:', error);
        // Propagate a user-friendly error or a more specific error type
        if (error instanceof Error) {
            // Handle specific DOMExceptions like 'NotAllowedError' (user cancellation)
            if (error.name === 'NotAllowedError') {
                throw new Error('Passkey creation was cancelled by the user.');
            }
            throw new Error(`Passkey creation failed: ${error.message}`);
        } else {
            throw new Error('Passkey creation failed due to an unknown error.');
        }
    }
}

/**
 * Generates passkey material (rawId, public key coordinates) for a given username.
 * This function does not store the material; storage is handled by the caller or orchestration service.
 * Adapted from legacy hominio/src/lib/wallet/passkeySigner.ts
 */
export async function generatePasskeyMaterial(username: string): Promise<StoredPasskeyData | null> {
    try {
        const result = await createPasskeyCredential(username);
        if (!result) return null; // createPasskeyCredential will throw an error if it fails internally

        const { credential, coordinates } = result;

        const passkeyRawIdBytes = new Uint8Array(credential.rawId);
        const passkeyRawIdHex = bytesToHex(passkeyRawIdBytes);

        const passkeyMaterial: StoredPasskeyData = {
            rawId: passkeyRawIdHex,
            pubkeyCoordinates: coordinates,
            username: username,
            // passkeyVerifierContractAddress is intentionally undefined here.
            // It will be populated later in the wallet setup flow after contract deployment.
        };

        console.log('Generated Passkey Material:', passkeyMaterial);
        return passkeyMaterial;
    } catch (error) {
        // Error is already logged by createPasskeyCredential if it originated there.
        // Re-throw to allow the caller to handle it.
        console.error('Error generating passkey material:', error);
        throw error;
    }
}
