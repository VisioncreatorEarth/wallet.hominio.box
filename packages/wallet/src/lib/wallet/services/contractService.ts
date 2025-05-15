import { createPublicClient, http, getAddress, type Address, type Hex, hexToBigInt, keccak256, toBytes, type WalletClient, type PublicClient, bytesToHex, encodeAbiParameters, parseAbiParameters } from 'viem';
import { gnosis } from 'viem/chains'; // Import Gnosis chain config from viem
import { currentChain, FACTORY_ADDRESS, FCL_VERIFIER_ADDRESS, EIP1271ABI, FACTORY_ABI } from '../config';

// --- Viem Clients ---
// This public client is for general use with the dApp's currentChain (e.g., Datil)
const APP_RPC_URL = currentChain.rpcUrls.default.http[0] || 'https://rpc.gnosischain.com'; // Fallback for safety
export const appPublicClient: PublicClient = createPublicClient({
    chain: currentChain,
    transport: http(APP_RPC_URL)
});

// Dedicated Public Client for Gnosis Chain interactions (EIP-1271 Factory)
const GNOSIS_RPC_URL = gnosis.rpcUrls.default.http[0]; // Use Gnosis RPC from viem
const gnosisPublicClient: PublicClient = createPublicClient({
    chain: gnosis,
    transport: http(GNOSIS_RPC_URL)
});

// EIP-1271 Magic Value
export const EIP_1271_MAGIC_VALUE = '0x1626ba7e';

// Constant for P256 precompile short address (used in verifier calculation)
// This needs to be the one relevant for the chain where the factory is (Gnosis)
const P256_PRECOMPILE_SHORT_ADDRESS_GNOSIS = 0x000a; // Common for Gnosis/Arbitrum EIP-7212

// Types from legacy passkeySigner.ts, ensure they are consistent
// These might be better placed in a central types file if shared across services.
export type StoredPasskeyData = {
    rawId: Hex;
    pubkeyCoordinates: {
        x: Hex;
        y: Hex;
    };
    username: string;
    passkeyVerifierContractAddress?: string;
};

/**
 * Predicts the EIP-1271 signer contract address for the given public key coordinates.
 * Adapted from legacy hominio/src/lib/wallet/passkeySigner.ts
 * Uses the FACTORY_ADDRESS and FCL_VERIFIER_ADDRESS from the central configuration.
 */
export async function getPasskeySignerContractAddress(
    pubkeyCoordinates: { x: Hex; y: Hex }
): Promise<Address | null> {
    if (!pubkeyCoordinates || !pubkeyCoordinates.x || !pubkeyCoordinates.y) {
        console.error("Public key coordinates (x,y) are required to predict the signer address.");
        return null;
    }

    try {
        const x = hexToBigInt(pubkeyCoordinates.x);
        const y = hexToBigInt(pubkeyCoordinates.y);
        const verifiersValue = (BigInt(P256_PRECOMPILE_SHORT_ADDRESS_GNOSIS) << 160n) + BigInt(FCL_VERIFIER_ADDRESS);

        console.log(`(Gnosis) Calling getSigner with x=${x}, y=${y}, verifiers=${verifiersValue}`);
        // Use gnosisPublicClient for this read
        const signerAddress = await gnosisPublicClient.readContract({
            address: FACTORY_ADDRESS, // This is the Gnosis factory address
            abi: FACTORY_ABI,
            functionName: 'getSigner',
            args: [x, y, verifiersValue]
        });

        console.log('(Gnosis) Predicted Signer Address:', signerAddress);
        return signerAddress;
    } catch (error) {
        console.error("(Gnosis) Error predicting signer address:", error);
        return null;
    }
}

/**
 * Deploys the EIP-1271 signer contract via the factory ON GNOSIS CHAIN.
 * Requires a connected & funded EOA wallet (passed as walletClient and eoaAddress).
 * Uses FACTORY_ADDRESS, FCL_VERIFIER_ADDRESS from central configuration (assumed to be for Gnosis).
 * Returns the transaction hash and deployed signerAddress (passkeyVerifierContractAddress).
 */
export async function deployPasskeySignerContract(
    walletClient: WalletClient, // Viem WalletClient from the connected EOA
    eoaAddress: Address,       // Address of the EOA that will pay for the transaction
    pubkeyCoordinates: { x: Hex; y: Hex }
): Promise<{ txHash: Hex; signerAddress?: Address } | null> {
    if (!pubkeyCoordinates || !pubkeyCoordinates.x || !pubkeyCoordinates.y) {
        throw new Error('Public key coordinates (x, y) are required to deploy the signer contract.');
    }
    if (!walletClient || !eoaAddress) {
        throw new Error('Wallet client and EOA address are required to deploy the signer contract.');
    }

    try {
        // Network Switch Logic: Force wallet to Gnosis Chain for this operation
        let currentWalletChainId = await walletClient.getChainId();
        if (currentWalletChainId !== gnosis.id) { // Target Gnosis Chain
            console.log(`Requesting wallet switch to Gnosis Chain (ID: ${gnosis.id})...`);
            try {
                await walletClient.switchChain({ id: gnosis.id });
                currentWalletChainId = await walletClient.getChainId(); // Re-check
                if (currentWalletChainId !== gnosis.id) {
                    throw new Error(`Wallet switch to Gnosis Chain failed. Please manually switch. (ID: ${gnosis.id}).`);
                }
                console.log(`Wallet switched to Gnosis Chain.`);
            } catch (switchError: unknown) {
                let message = 'Unknown switch error';
                if (switchError instanceof Error) message = switchError.message;
                else if (typeof switchError === 'string') message = switchError;
                if (message.includes('rejected') || (typeof switchError === 'object' && switchError && 'code' in switchError && switchError.code === 4001)) {
                    throw new Error('User rejected the network switch request to Gnosis Chain.');
                }
                throw new Error(`Failed to switch wallet to Gnosis Chain: ${message}`);
            }
        }

        // Compute Verifiers value for Gnosis Chain
        const verifiersBigInt =
            (BigInt(P256_PRECOMPILE_SHORT_ADDRESS_GNOSIS) << 160n) + BigInt(FCL_VERIFIER_ADDRESS);

        console.log('(Gnosis) Deploying EIP-1271 signer contract with:');
        console.log('  Public Key X:', pubkeyCoordinates.x);
        console.log('  Public Key Y:', pubkeyCoordinates.y);
        console.log('  Verifiers (BigInt):', verifiersBigInt);
        console.log('  Factory Address:', FACTORY_ADDRESS); // Assumed to be Gnosis Factory
        console.log('  Deploying Account:', eoaAddress);
        console.log('  Target Chain: Gnosis Chain');

        const txHash = await walletClient.writeContract({
            address: FACTORY_ADDRESS, // Gnosis Factory
            abi: FACTORY_ABI,
            functionName: 'createSigner',
            args: [
                hexToBigInt(pubkeyCoordinates.x),
                hexToBigInt(pubkeyCoordinates.y),
                verifiersBigInt
            ],
            account: eoaAddress,
            chain: gnosis // Explicitly specify Gnosis chain for Viem
        });

        console.log('(Gnosis) Deployment transaction sent:', txHash);
        console.log('(Gnosis) Waiting for transaction receipt...');
        // Use gnosisPublicClient to wait for receipt on Gnosis chain
        const receipt = await gnosisPublicClient.waitForTransactionReceipt({ hash: txHash });
        console.log('(Gnosis) Transaction receipt:', receipt);

        if (receipt.status !== 'success') {
            throw new Error(`(Gnosis) EIP-1271 signer deployment transaction failed. Status: ${receipt.status}`);
        }

        // Attempt to parse the 'Created' event log to get the signer address
        let signerAddress: Address | undefined = undefined;
        const createdEventSignature = keccak256(toBytes('Created(address,uint256,uint256,uint176)'));

        for (const log of receipt.logs) {
            if (log.address.toLowerCase() === FACTORY_ADDRESS.toLowerCase() &&
                log.topics[0]?.toLowerCase() === createdEventSignature.toLowerCase() &&
                log.topics.length > 1 && log.topics[1]) {
                try {
                    const topicValue = log.topics[1];
                    const potentialAddress = `0x${topicValue.slice(-40)}` as Address;
                    signerAddress = getAddress(potentialAddress); // Validates and checksums
                    console.log("(Gnosis) Successfully extracted EIP-1271 signer address from logs:", signerAddress);
                    break;
                } catch (parseError) {
                    console.error("(Gnosis) Error parsing or checksumming address from 'Created' event log topic:", log.topics[1], parseError);
                    signerAddress = undefined;
                }
            }
        }

        if (!signerAddress) {
            console.warn('(Gnosis) Could not determine deployed signer address from transaction logs. Predicting instead...');
            signerAddress = await getPasskeySignerContractAddress(pubkeyCoordinates) ?? undefined;
            if (signerAddress) {
                console.log('(Gnosis) Predicted signer address as fallback:', signerAddress);
            } else {
                console.error('(Gnosis) Failed to determine deployed signer address from logs and prediction also failed.');
                return { txHash, signerAddress: undefined };
            }
        }

        return { txHash, signerAddress };

    } catch (error: unknown) {
        console.error('(Gnosis) Error deploying EIP-1271 signer contract:', error);
        let errorMessage = 'An unknown deployment error occurred.';
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }

        if (errorMessage?.includes('User rejected')) {
            throw new Error('User rejected the transaction/switch request for Gnosis Chain.');
        }
        throw new Error(`(Gnosis) Failed to deploy EIP-1271 signer: ${errorMessage}`);
    }
}

// --- Signature Formatting Helpers (adapted from legacy passkeySigner.ts) ---

/**
 * Extracts the R and S values from a DER-encoded signature.
 * This is a low-level parsing helper for WebAuthn signatures.
 */
function extractSignatureRS(signature: ArrayBuffer): [bigint, bigint] {
    const view = new DataView(signature);
    const check = (condition: boolean, msg: string) => { if (!condition) throw new Error(msg); };

    check(view.byteLength > 2, 'Signature too short');
    check(view.getUint8(0) === 0x30, 'Invalid DER sequence header');
    // check(view.getUint8(1) <= view.byteLength - 2, 'Invalid DER sequence length'); // Length check can be tricky with indefinite length forms not used here.

    const readInt = (offset: number): [bigint, number] => {
        check(offset + 1 < view.byteLength, 'Offset out of bounds for reading int header');
        check(view.getUint8(offset) === 0x02, 'Invalid DER integer header');
        const len = view.getUint8(offset + 1);
        const start = offset + 2;
        const end = start + len;
        check(end <= view.byteLength, 'Integer length out of bounds');

        const bytes = new Uint8Array(view.buffer.slice(start, end));
        let hex = bytesToHex(bytes); // viem's bytesToHex
        if (bytes.length > 1 && bytes[0] === 0x00 && (bytes[1] & 0x80) !== 0) {
            hex = bytesToHex(bytes.slice(1));
        }
        const n = hexToBigInt(hex);

        // Basic sanity check for P-256 curve order can be added here if strict validation is needed
        // const curveOrder = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n;
        // check(n > 0 && n < curveOrder, 'Signature R/S value out of P-256 curve order range');

        return [n, end];
    };

    try {
        const [r, sOffset] = readInt(2); // r starts after sequence header and length (first 2 bytes)
        const [s] = readInt(sOffset);
        return [r, s];
    } catch (e: unknown) {
        console.error("Error parsing DER signature:", e);
        if (e instanceof Error) {
            throw new Error(`Failed to parse DER signature: ${e.message}`);
        }
        throw new Error('Failed to parse DER signature due to an unknown error.');
    }
}

/**
 * Extracts the non-standard fields from clientDataJSON as per Safe contracts expectation.
 * This is specific to how some EIP-1271 verifiers might process clientData.
 */
function extractClientDataFields(clientDataJSON: ArrayBuffer): Hex {
    const clientDataString = new TextDecoder('utf-8').decode(clientDataJSON);
    // This regex is specific to 'webauthn.get' and might need adjustment if other types are used.
    // It aims to capture everything after the "challenge" field.
    const match = clientDataString.match(/^\{"type":"webauthn\.get","challenge":"[A-Za-z0-9\-_]{43}",(.*)\}$/);

    if (!match || match.length < 2) {
        console.warn('Could not extract partial client data fields from:', clientDataString);
        // Returning the full clientDataJSON as bytes if specific parsing fails.
        // The contract might handle full or partial data.
        // This behavior should be verified against the target EIP-1271 contract.
        return bytesToHex(new TextEncoder().encode(clientDataString));
    }

    const fields = match[1]; // The captured group with the remaining fields
    return bytesToHex(new TextEncoder().encode(fields));
}

/**
 * Formats the WebAuthn assertion response into the ABI-encoded structure expected by EIP-1271 verifier contracts.
 * (Specifically, those following a common pattern like Safe{WebAuthn}Signer)
 * Requires AuthenticatorAssertionResponse from passkeyService or similar.
 */
export function formatSignatureForEIP1271(assertionResponse: {
    authenticatorData: ArrayBuffer;
    clientDataJSON: ArrayBuffer;
    signature: ArrayBuffer;
}): Hex {
    const [r, s] = extractSignatureRS(assertionResponse.signature);
    // The clientDataBytes sent to the contract might be the full clientDataJSON or a specific part.
    // Legacy code used extractClientDataFields, which tries to get a partial set.
    const clientDataBytes = extractClientDataFields(assertionResponse.clientDataJSON);
    // const fullClientDataBytes = bytesToHex(new Uint8Array(assertionResponse.clientDataJSON));

    // The ABI parameters for encoding should match the `isValidSignature` or equivalent function
    // on the target EIP-1271 verifier contract.
    // This is a common pattern: (bytes authenticatorData, bytes clientDataJSON, uint256 r, uint256 s)
    // or (bytes authenticatorData, bytes clientDataJSON, uint256[2] rs)
    // The legacy passkeySigner used: parseAbiParameters('bytes authenticatorData, bytes clientDataJSON, uint256[2] rs')
    // Ensure this matches the deployed EIP-1271 verifier.
    return encodeAbiParameters(
        parseAbiParameters('bytes authenticatorData, bytes clientDataJSON, uint256[2] rs'),
        [
            bytesToHex(new Uint8Array(assertionResponse.authenticatorData)),
            clientDataBytes,
            [r, s]
        ]
    );
}


/**
 * Verifies a passkey signature for a message hash using a deployed EIP-1271 proxy/signer contract.
 * Adapted from legacy hominio/src/lib/wallet/passkeySigner.ts verifySignatureWithProxy.
 */
export async function verifySignatureWithDeployedContract(
    message: string, // The original message that was signed, not the hash
    passkeyRawId: Hex, // Hex string of the passkey's rawId
    passkeyCredentialPublicKeyCoordinates: { x: Hex; y: Hex }, // For potential future use or different verifiers
    passkeyVerifierContract: Address, // Address of the deployed EIP-1271 signer contract
    authenticatorAssertionResponse: {
        authenticatorData: ArrayBuffer;
        clientDataJSON: ArrayBuffer;
        signature: ArrayBuffer;
    } // The full assertion response from navigator.credentials.get()
): Promise<{ isCorrect: boolean; error?: string }> {
    if (!passkeyVerifierContract) {
        return { isCorrect: false, error: "Passkey verifier contract address is missing." };
    }
    if (!passkeyRawId) {
        return { isCorrect: false, error: "Passkey rawId is required." };
    }

    try {
        const messageHash = keccak256(new TextEncoder().encode(message));
        console.log(`(EIP-1271 Check) Verifying signature for message: "${message}" (hash: ${messageHash}) via contract: ${passkeyVerifierContract}`);

        const formattedSignature = formatSignatureForEIP1271(authenticatorAssertionResponse);
        console.log("(EIP-1271 Check) Formatted Signature for Contract:", formattedSignature);

        // IMPORTANT: Determine which public client to use based on the chain of passkeyVerifierContract
        // Assuming passkeyVerifierContract is on Gnosis if deployed by this service.
        const clientToUse = gnosisPublicClient; // Or a more dynamic way to choose client

        const result = await clientToUse.readContract({
            address: passkeyVerifierContract,
            abi: EIP1271ABI, // Standard EIP-1271 ABI fragment
            functionName: 'isValidSignature',
            args: [messageHash, formattedSignature]
        });
        console.log("(EIP-1271 Check) Verification Result (bytes4 from isValidSignature):", result);

        const isValid = result.toLowerCase() === EIP_1271_MAGIC_VALUE.toLowerCase();
        return { isCorrect: isValid };

    } catch (error) {
        console.error("(EIP-1271 Check) Error verifying signature with deployed contract:", error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown verification error.';
        return { isCorrect: false, error: `(EIP-1271 Check) ${errorMsg}` };
    }
}

// TODO: Add other contract interaction functions (for PKP, permissions etc.)
