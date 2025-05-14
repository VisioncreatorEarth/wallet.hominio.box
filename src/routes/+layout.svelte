<script lang="ts">
	import '../app.css';
	import { authClient } from '$lib/client/betterauth-client';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';

	let { children } = $props();

	const session = authClient.useSession();

	let loadingGoogleSignIn = $state(false);
	let signInError = $state<string | null>(null);
	let signOutLoading = $state(false);

	// Reactive effect to handle redirection based on session state
	$effect(() => {
		if (!browser) return;

		const currentUser = $session.data?.user;
		const currentPath = window.location.pathname;
		// Allow auth callback paths (e.g., /auth/callback/google) to proceed without user session initially
		const isAuthCallbackPath = currentPath.startsWith('/auth/callback/');

		if (currentUser) {
			// If user is logged in and on the root path, redirect to /me
			if (currentPath === '/') {
				console.log('[Layout Effect] User logged in, on root. Redirecting to /me.');
				goto('/me', { replaceState: true });
			}
		} else {
			// If user is NOT logged in, and they are on a path that is NOT the root
			// AND is NOT an authentication callback path, redirect to root.
			if (currentPath !== '/' && !isAuthCallbackPath) {
				console.log(
					`[Layout Effect] User not logged in, on protected path ${currentPath}. Redirecting to /.`
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

	async function handleSignOut() {
		if (!browser) return;
		signOutLoading = true;
		try {
			await authClient.signOut();
			// After sign out, redirect to root
			console.log('User signed out, redirecting to /');
			goto('/', { replaceState: true });
		} catch (e: any) {
			console.error('Sign out error:', e);
		} finally {
			signOutLoading = false;
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

<div class="bg-linen font-ibm-plex-sans text-prussian-blue h-screen w-screen">
	{#if $session.data?.user}
		<!-- Header for logged-in users -->
		<header class="bg-linen w-full p-4 shadow-md">
			<nav class="container mx-auto flex items-center justify-between">
				<a
					href="/"
					class="font-playfair-display text-prussian-blue hover:text-persian-orange text-2xl font-bold"
				>
					Hominio Wallet
				</a>
				<div class="flex items-center space-x-4">
					<span class="text-prussian-blue/90 text-sm"
						>{$session.data.user.email || $session.data.user.name || 'User'}</span
					>
					{#if typeof window !== 'undefined' && window.location.pathname !== '/me'}
						<a
							href="/me"
							class="text-prussian-blue hover:bg-timberwolf-1/50 hover:text-persian-orange rounded-md px-3 py-2 text-sm font-medium"
						>
							Profile
						</a>
					{/if}
					<button
						onclick={handleSignOut}
						disabled={signOutLoading}
						class="focus:ring-opacity-60 flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:outline-none disabled:opacity-50"
						title="Sign out"
					>
						{#if signOutLoading}
							<svg
								class="h-5 w-5 animate-spin"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
							>
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path>
							</svg>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
								/>
							</svg>
						{/if}
					</button>
				</div>
			</nav>
		</header>
	{/if}

	<main class="h-full w-full">
		{@render children()}
		{#if !$session.data?.user}
			<div class="fixed bottom-4 left-1/2 z-50 mb-4 flex -translate-x-1/2 flex-col items-center">
				<button
					onclick={handleGoogleSignIn}
					disabled={loadingGoogleSignIn}
					class="inline-flex items-center justify-center gap-2 rounded-full border border-transparent bg-[#1a365d] px-5 py-2 text-sm font-medium text-white shadow-md transition-all hover:bg-[#174C6B] hover:text-white disabled:opacity-50"
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
					<p class="mt-2 text-xs text-red-400">Error: {signInError}</p>
				{/if}
			</div>
		{/if}
	</main>
</div>
