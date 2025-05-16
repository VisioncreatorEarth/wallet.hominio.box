<script lang="ts">
	import '../app.css';
	import { authClient } from '$lib/client/betterauth-client';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores'; // Import page store

	let { children } = $props();

	const session = authClient.useSession();
	// $session properties based on Better Auth docs: { data: { user: ..., session: ... } | null, isPending: boolean, error: ... }

	let loadingGoogleSignIn = $state(false);
	let signInError = $state<string | null>(null);

	// Reactive effect to handle redirection based on session state
	$effect(() => {
		if (!browser || $session.isPending) {
			if ($session.isPending && browser)
				console.log(
					'[Layout Effect - Redirect] Waiting for session to load (isPending is true)...'
				);
			return; // Wait for session status to be determined (isPending is false)
		}

		const currentUser = $session.data?.user;
		const currentPath = $page.url.pathname; // Use $page store for pathname
		const isAuthCallbackPath = currentPath.startsWith('/auth/callback/');
		const isRootPath = currentPath === '/';

		if (currentUser) {
			// If user is logged in and on the root path, redirect to /me
			if (isRootPath) {
				console.log('[Layout Effect - Redirect] User logged in, on root. Redirecting to /me.');
				goto('/me', { replaceState: true });
			}
		} else {
			// User is not authenticated (currentUser is null/undefined) and session is NOT pending
			// If they are on a path that is NOT the root AND is NOT an authentication callback path, redirect to root.
			if (!isRootPath && !isAuthCallbackPath) {
				console.log(
					`[Layout Effect - Redirect] User not logged in (session loaded), on protected path ${currentPath}. Redirecting to /.`
				);
				goto('/', { replaceState: true });
			}
		}
	});

	async function handleGoogleSignIn() {
		if (!browser) return;
		loadingGoogleSignIn = true;
		signInError = null;
		try {
			const result = await authClient.signIn.social({ provider: 'google' });
			if (result?.error) {
				throw new Error(result.error.message || 'Google Sign-In failed');
			}
			// Redirection will be handled by the $effect above
		} catch (e: any) {
			console.error('Google sign-in error:', e);
			signInError = e.message;
		} finally {
			loadingGoogleSignIn = false;
		}
	}
</script>

<svelte:head>
	<title>Hominio Wallet</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

{#if $session.isPending && browser}
	<div class="bg-background-app fixed inset-0 z-[9999] flex items-center justify-center">
		<div class="flex flex-col items-center">
			<svg
				class="text-prussian-blue mb-4 h-12 w-12 animate-spin"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
			>
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
				></circle>
				<path
					class="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
				></path>
			</svg>
			<p class="text-prussian-blue text-lg">Loading session...</p>
		</div>
	</div>
{:else}
	{@const isProtectedPath = $page.url.pathname.startsWith('/me')}
	{@const isUnauthenticated = !$session.data?.user}
	{@const shouldHideChildrenTemporarily = isUnauthenticated && isProtectedPath}

	{#if shouldHideChildrenTemporarily}
		<!--
      User is unauthenticated on a protected path. Session is loaded (not pending).
      The redirect effect will navigate them away soon.
      Render a blank page or minimal content to prevent FOUC from child routes.
    -->
		<div class="bg-background-app fixed inset-0 z-[9999]"></div>
	{:else}
		<!--
      Render content if:
      1. User is authenticated (any path) OR
      2. User is unauthenticated AND on a public path (e.g., / or /auth/callback/*)
    -->
		<div class="bg-background-app font-ibm-plex-sans text-prussian-blue h-full w-full">
			<main class="h-full w-full">
				{@render children()}
				{#if isUnauthenticated && $page.url.pathname === '/'}
					<div
						class="fixed bottom-4 left-1/2 z-50 mb-4 flex -translate-x-1/2 flex-col items-center"
					>
						<button
							onclick={handleGoogleSignIn}
							disabled={loadingGoogleSignIn}
							class="bg-prussian-blue inline-flex items-center justify-center gap-2 rounded-full border border-transparent px-5 py-2 text-sm font-medium text-white shadow-md transition-all hover:bg-[#174C6B] hover:text-white disabled:opacity-50"
						>
							<svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
								<path
									d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
									fill="#4285F4"
								/>
								<path
									d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
									fill="#34A853"
								/>
								<path
									d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
									fill="#FBBC05"
								/>
								<path
									d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
									fill="#EA4335"
								/>
							</svg>
							{loadingGoogleSignIn ? 'Processing...' : 'Continue with Google'}
						</button>
						{#if signInError}
							<p class="text-persian-orange mt-2 text-xs">Error: {signInError}</p>
						{/if}
					</div>
				{/if}
			</main>
		</div>
	{/if}
{/if}
