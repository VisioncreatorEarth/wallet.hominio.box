import { createAuthClient } from "better-auth/svelte"
import { PUBLIC_BASE_URL } from '$env/static/public';
import { pkpPasskeyClientPlugin } from './pkp-passkey-plugin';

export const authClient = createAuthClient({
    baseURL: PUBLIC_BASE_URL,
    plugins: [
        pkpPasskeyClientPlugin(),
    ]
})