import type { StoredPasskeyData, PublicKeyCredential } from './passkeyService';
import { generatePasskeyMaterial } from './passkeyService';
import { deployPasskeySignerContract } from './contractService';
import {
    mintPKPWithLitActionAuthAndCapacity,
    type MintPKPWithLitActionAuthResponse
} from './litService';
import type { Address, Hex, WalletClient } from 'viem';
import { authClient } from '$lib/client/betterauth-client';
import type { ClientPkpPasskey } from '$lib/client/pkp-passkey-plugin';


export interface WalletSetupState {
    step: string;
    status: 'idle' | 'pending' | 'success' | 'error';
    message?: string;
    passkeyData?: StoredPasskeyData;
    passkeyCredential?: PublicKeyCredential;
    eip1271ContractAddress?: Address;
    deploymentTxHash?: Hex;
    pkpInfo?: MintPKPWithLitActionAuthResponse;
    error?: Error | unknown;
}

export interface CreateNewWalletParameters {
    username: string;
    eoaWalletClient: WalletClient;
    eoaAddress: Address;
    onStateUpdate?: (newState: WalletSetupState) => void;
}

const initialOrchestrationState: WalletSetupState = {
    step: 'idle',
    status: 'idle',
};

/**
 * Orchestrates the full passkey-based wallet creation flow.
 * 1. Generates passkey material.
 * 2. Deploys an EIP-1271 verifier contract for the passkey.
 * 3. Mints a Lit PKP using a Lit Action (for passkey verification) as an auth method, and provisions capacity credits.
 */
export async function createNewPasskeyWallet({
    username,
    eoaWalletClient,
    eoaAddress,
    onStateUpdate
}: CreateNewWalletParameters): Promise<WalletSetupState> {
    let currentState: WalletSetupState = { ...initialOrchestrationState, step: 'start', status: 'pending' };
    const updateState = (newState: Partial<WalletSetupState>) => {
        currentState = { ...currentState, ...newState };
        onStateUpdate?.(currentState);
    };

    try {
        // Step 1: Generate Passkey Material
        updateState({ step: 'Generating Passkey', message: 'Creating your secure passkey locally...', status: 'pending' });
        const passkeyMaterial = await generatePasskeyMaterial(username);
        if (!passkeyMaterial) {
            throw new Error('Failed to generate passkey material.');
        }
        updateState({ step: 'Passkey Generated', message: 'Passkey material created.', status: 'success', passkeyData: passkeyMaterial });

        // Step 2: Deploy EIP-1271 Verifier Contract
        updateState({ step: 'Deploying Verifier Contract', message: 'Preparing your on-chain verifier... (requires EOA confirmation)', status: 'pending' });
        const deploymentResult = await deployPasskeySignerContract(
            eoaWalletClient,
            eoaAddress,
            passkeyMaterial.pubkeyCoordinates
        );
        if (!deploymentResult?.signerAddress || !deploymentResult.txHash) {
            throw new Error('Failed to deploy EIP-1271 verifier contract or get its address.');
        }
        const eip1271ContractAddress = deploymentResult.signerAddress;
        updateState({
            step: 'Verifier Contract Deployed',
            message: `Verifier deployed at: ${eip1271ContractAddress}`,
            status: 'success',
            eip1271ContractAddress: eip1271ContractAddress,
            deploymentTxHash: deploymentResult.txHash
        });

        if (currentState.passkeyData) {
            currentState.passkeyData.passkeyVerifierContractAddress = eip1271ContractAddress;
            updateState({ passkeyData: currentState.passkeyData });
        }

        // Step 3: Mint PKP with Lit Action Auth & Capacity Credits
        updateState({ step: 'Minting PKP Wallet', message: 'Minting your Hominio Wallet with Lit Action & capacity... (requires EOA confirmation)', status: 'pending' });
        const pkpMintingResult = await mintPKPWithLitActionAuthAndCapacity({
            walletClient: eoaWalletClient,
            eoaAddress: eoaAddress,
        });
        if (!pkpMintingResult || !pkpMintingResult.pkpEthAddress || !pkpMintingResult.pkpPublicKey || !pkpMintingResult.pkpTokenId) {
            throw new Error('Failed to mint PKP or retrieve essential PKP details (EthAddress, PublicKey, TokenId).');
        }
        updateState({
            step: 'PKP Wallet Minted',
            message: `Hominio Wallet minted: ${pkpMintingResult.pkpEthAddress}`,
            status: 'success',
            pkpInfo: pkpMintingResult
        });

        // Step 4: Persist Wallet Information to DB via BetterAuth Plugin
        updateState({ step: 'Persisting Wallet Info', message: 'Saving your new wallet details securely...', status: 'pending' });
        if (!currentState.passkeyData || !currentState.passkeyData.rawId || !currentState.passkeyData.pubkeyCoordinates) {
            throw new Error('Passkey data (rawId, coordinates) not available for DB persistence.');
        }
        if (!currentState.pkpInfo || !currentState.pkpInfo.pkpEthAddress || !currentState.pkpInfo.pkpPublicKey || !currentState.pkpInfo.pkpTokenId) {
            throw new Error('PKP info (EthAddress, PublicKey, TokenId) not available for DB persistence.');
        }

        const pkpDataToPersist: ClientPkpPasskey = {
            rawId: currentState.passkeyData.rawId,
            pubKey: currentState.pkpInfo.pkpPublicKey,
            pkpEthAddress: currentState.pkpInfo.pkpEthAddress,
            username: username,
            pubkeyCoordinates: currentState.passkeyData.pubkeyCoordinates,
            pkpTokenId: currentState.pkpInfo.pkpTokenId,
            passkeyVerifierContract: currentState.eip1271ContractAddress,
        };

        try {
            const persistenceResult = await authClient.pkpPasskeyPlugin.updateUserPasskeyInfo({ body: pkpDataToPersist });
            if (!persistenceResult || persistenceResult.error || !persistenceResult.data?.user?.pkp_passkey) {
                const pluginErrorMsg = persistenceResult?.error?.message || 'Unknown error or missing user data from pkpPasskeyPlugin';
                console.error('Failed to persist PKP passkey info to DB:', pluginErrorMsg, persistenceResult);
                throw new Error(`Failed to save wallet details: ${pluginErrorMsg}`);
            }
            updateState({ step: 'Wallet Info Saved', message: 'Wallet details saved to your account.', status: 'success' });
        } catch (dbError: unknown) {
            console.error('Error calling updateUserPasskeyInfo plugin:', dbError);
            const dbErrorMessage = dbError instanceof Error ? dbError.message : 'An unknown error occurred during DB update.';
            throw new Error(`Database persistence failed: ${dbErrorMessage}`);
        }

        updateState({
            step: 'Wallet Creation Complete',
            message: 'Your Hominio Wallet is ready!',
            status: 'success'
        });
        console.log('New Hominio Wallet created and persisted successfully:', {
            passkeyRawId: currentState.passkeyData.rawId,
            eip1271ContractAddress: currentState.eip1271ContractAddress,
            pkpTokenId: currentState.pkpInfo.pkpTokenId,
            pkpEthAddress: currentState.pkpInfo.pkpEthAddress,
            pkpPublicKey: currentState.pkpInfo.pkpPublicKey,
        });
        return currentState;

    } catch (error: unknown) {
        console.error('Error in wallet creation flow:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        updateState({
            step: `Error during: ${currentState.step}`,
            status: 'error',
            message: errorMessage,
            error: error
        });
        return currentState;
    }
}
