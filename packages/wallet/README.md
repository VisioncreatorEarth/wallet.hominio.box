# wallet.hominio.box

## Development

### Exposing Local Server for Webhooks (e.g., Polar)

To test services that require a public webhook endpoint during local development, you can use `localtunnel`.

Ensure your SvelteKit development server is running (typically on port 3000):

```bash
bun run dev
```

Then, in a new terminal, run the following command to expose your local server on port 3000 with the subdomain `hominio-wallet`:

```bash
npx localtunnel --port 3000 --subdomain hominio-wallet
```

This will output a public URL (e.g., `https://hominio-wallet.loca.lt`) that you can use to configure webhook endpoints in services like Polar. The webhook path for Polar with BetterAuth will typically be `/polar/webhooks`, so your full webhook URL would be `https://hominio-wallet.loca.lt/polar/webhooks`.