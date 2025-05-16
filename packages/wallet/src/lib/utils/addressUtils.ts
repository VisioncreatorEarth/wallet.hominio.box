import { getAddress, type Hex, type Address } from 'viem';
import { publicKeyToAddress } from 'viem/utils';

/**
 * Shortens an Ethereum address for display.
 * @param addr The address string.
 * @param startChars Number of characters to show from the start.
 * @param endChars Number of characters to show from the end.
 * @returns Shortened address string or a placeholder if input is invalid.
 */
export function shortAddress(addr: string | undefined | null, startChars = 6, endChars = 4): string {
    if (!addr || typeof addr !== 'string') return 'N/A';
    const effectiveStartChars = addr.startsWith('0x') ? startChars + 2 : startChars;
    if (addr.length <= effectiveStartChars + endChars - 2) return addr; // -2 because of "0x" and "..."
    return `${addr.slice(0, effectiveStartChars)}...${addr.slice(addr.length - endChars)}`;
}


/**
 * Converts a given public key (hex string, typically uncompressed) to its corresponding Ethereum address.
 * @param publicKey The public key as a hex string (e.g., "0x04...").
 * @returns The Ethereum address (checksummed) or null if conversion fails.
 */
export function publicKeyToEthAddress(publicKey: Hex | string | undefined | null): Address | null {
    if (!publicKey || typeof publicKey !== 'string' || !publicKey.startsWith('0x')) {
        // console.error('[publicKeyToEthAddress] Invalid public key input. Must be a hex string starting with 0x.');
        return null;
    }
    try {
        const address = publicKeyToAddress(publicKey as Hex);
        return getAddress(address); // Return checksummed address
    } catch {
        // Error occurred, but we don't use the error object itself for this function's logic
        // console.error('[publicKeyToEthAddress] Error converting public key to address');
        return null;
    }
}

// Minimal types to represent necessary parts of session data for the utility
interface SessionPkpPasskey {
    pkpEthAddress?: Address | string | null; // Can be string from some sources initially
}
interface SessionUser {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    pkp_passkey?: SessionPkpPasskey | string | null; // pkp_passkey can be object or string from session
}
export interface MinimalSessionData {
    user?: SessionUser | null;
}

export interface PkpIdentityInfo {
    address: Address;
    shortAddress: string;
    name?: string;
    imageUrl?: string;
    isCurrentUserPrimaryPkp: boolean;
    displayName: string;
}

export function resolvePkpIdentityInfo(
    identifier: Hex | Address | string,
    identifierType: 'publicKey' | 'ethAddress',
    sessionData?: MinimalSessionData | null
): PkpIdentityInfo | null {
    let ethAddress: Address | null = null;

    if (identifierType === 'publicKey') {
        ethAddress = publicKeyToEthAddress(identifier as Hex);
    } else {
        try {
            ethAddress = getAddress(identifier as Address); // Checksums and validates
        } catch {
            console.error(`[resolvePkpIdentityInfo] Invalid ETH address provided: ${identifier}`);
            return null;
        }
    }

    if (!ethAddress) {
        // console.error(`[resolvePkpIdentityInfo] Could not derive ETH address from identifier: ${identifier}`);
        return null;
    }

    const result: PkpIdentityInfo = {
        address: ethAddress,
        shortAddress: shortAddress(ethAddress),
        isCurrentUserPrimaryPkp: false,
        displayName: shortAddress(ethAddress) // Default before checking session
    };

    const userPkpPasskeyData = sessionData?.user?.pkp_passkey;
    if (sessionData?.user && userPkpPasskeyData && typeof userPkpPasskeyData === 'object' && userPkpPasskeyData.pkpEthAddress) {
        try {
            const sessionPkpEthAddress = getAddress(userPkpPasskeyData.pkpEthAddress as Address);
            if (sessionPkpEthAddress === result.address) {
                result.isCurrentUserPrimaryPkp = true;
                const userNameFromSession = sessionData.user.name || sessionData.user.email;
                result.name = userNameFromSession || undefined;
                result.imageUrl = sessionData.user.image || undefined;
                result.displayName = userNameFromSession || `You (${result.shortAddress})`;
            }
        } catch (e) {
            console.error("[resolvePkpIdentityInfo] Error processing user's session PKP address:", e);
        }
    }

    // If not current user's primary PKP (or no session), ensure a generic display name
    if (!result.isCurrentUserPrimaryPkp) {
        result.displayName = `PKP (${result.shortAddress})`;
    }

    return result;
} 