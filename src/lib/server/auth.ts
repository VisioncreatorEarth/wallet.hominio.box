import { env } from '$env/dynamic/private';
import { PUBLIC_BASE_URL } from '$env/static/public';
import { betterAuth } from "better-auth";
import pkg from 'pg';
import { pkpPasskeyServerPlugin } from './pkp-passkey-plugin';
const { Pool } = pkg;

export const auth = betterAuth({
    database: new Pool({
        connectionString: env.SECRET_DATABASE_URL_AUTH
    }),
    socialProviders: {
        google: {
            clientId: env.SECRET_GOOGLE_CLIENT_ID,
            clientSecret: env.SECRET_GOOGLE_CLIENT_SECRET,
            redirectUri: `${PUBLIC_BASE_URL}/auth/callback/google`
        },
    },
    trustedOrigins: [
        PUBLIC_BASE_URL
    ],
    plugins: [
        pkpPasskeyServerPlugin(),
    ]
});
