import type { Hex, Address, TransactionSerializable, Signature } from 'viem';
import type { ExecuteJsResponse } from '@lit-protocol/types';

export type ActionType = 'signMessage' | 'executeLitAction' | 'signTransaction';

// Base parameters including PKP details, prepared by the layout/orchestrator
export interface BaseActionParams {
    pkpPublicKey: Hex;
    passkeyRawId: Hex;
    passkeyVerifierContractAddress: Address;
    pkpTokenId: string;
}

export interface SignMessageActionParams extends BaseActionParams {
    messageToSign: string;
}

export interface ExecuteLitActionParams extends BaseActionParams {
    litActionCid: string;
    jsParams: Record<string, unknown>;
}

export interface SignTransactionActionParams extends BaseActionParams {
    transaction: TransactionSerializable;
    transactionDisplayInfo?: {
        description?: string;
        tokenSymbol?: string;
        amount?: string;
        recipient?: string;
    };
}

// The comprehensive request detail passed to the SignMessage/Action modal component
export type ActionParams = SignMessageActionParams | ExecuteLitActionParams | SignTransactionActionParams;
export interface RequestActionDetail {
    type: ActionType;
    params: ActionParams; // Contains full BaseActionParams + specific params
}


export interface SimplifiedSignMessageUiParams {
    messageToSign: string;
}

export interface SimplifiedExecuteLitActionUiParams {
    litActionCode: string;
    jsParams: Record<string, unknown>;
}

export interface SimplifiedSignTransactionUiParams {
    transaction: TransactionSerializable;
}

export type ExecuteEventUiParams = SimplifiedSignMessageUiParams | SimplifiedExecuteLitActionUiParams | SimplifiedSignTransactionUiParams;

export interface ExecuteEventDetail {
    type: ActionType;
    uiParams: ExecuteEventUiParams;
}
// ----------------------------------------------------------------------

// Dispatch details from the modal/component for the RESULT/ERROR
export interface SignMessageResultDetail {
    type: 'signMessage';
    signature?: Hex;
    error?: string;
}

export interface ExecuteLitActionResultDetail {
    type: 'executeLitAction';
    result?: ExecuteJsResponse;
    error?: string;
}

export interface SignTransactionActionResultDetail {
    type: 'signTransaction';
    signature?: Signature;
    transactionHash?: Hex;
    transactionReceipt?: import('viem').TransactionReceipt;
    error?: string;
}

export type ActionResultDetail = SignMessageResultDetail | ExecuteLitActionResultDetail | SignTransactionActionResultDetail; 