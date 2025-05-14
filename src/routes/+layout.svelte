<script lang="ts">
	import '../app.css';
	import { authClient } from '$lib/client/betterauth-client';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

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

		if (currentUser && currentPath !== '/me') {
			console.log('User logged in, redirecting to /me');
			goto('/me', { replaceState: true });
		} else if (!currentUser && currentPath === '/me') {
			// If somehow on /me page while logged out (e.g. after session expiry), redirect to root
			console.log('User not logged in, on /me, redirecting to /');
			goto('/', { replaceState: true });
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

<div class="relative flex min-h-screen flex-col">
	{#if $session.data?.user}
		<!-- Optional: Header for logged-in users -->
		<header class="z-10 w-full bg-blue-600 p-4 text-white shadow-md">
			<nav class="container mx-auto flex items-center justify-between">
				<a href="/" class="text-xl font-bold hover:text-blue-200">Hominio Wallet</a>
				<div>
					<span class="mr-4">{$session.data.user.email || $session.data.user.name || 'User'}</span>
					{#if window.location.pathname !== '/me'}
						<a href="/me" class="mr-2 rounded px-3 py-2 hover:bg-blue-700">Profile</a>
					{/if}
					<button
						onclick={handleSignOut}
						disabled={signOutLoading}
						class="rounded bg-red-500 px-4 py-2 font-bold text-white hover:bg-red-700 disabled:opacity-50"
					>
						{signOutLoading ? 'Signing out...' : 'Sign Out'}
					</button>
				</div>
			</nav>
		</header>
	{/if}

	<main class="container mx-auto flex-grow p-4">
		{@render children()}
	</main>

	{#if !$session.data?.user}
		<div class="fixed inset-x-0 bottom-0 z-20 flex justify-center p-6">
			<button
				onclick={handleGoogleSignIn}
				disabled={loadingGoogleSignIn}
				class="flex items-center space-x-2 rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 shadow-md transition duration-150 ease-in-out hover:bg-gray-100 disabled:opacity-60"
			>
				<svg class="h-5 w-5" viewBox="0 0 48 48">
					<path
						fill="#EA4335"
						d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
					></path>
					<path
						fill="#4285F4"
						d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
					></path>
					<path
						fill="#FBBC05"
						d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
					></path>
					<path
						fill="#34A853"
						d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
					></path>
					<path fill="none" d="M0 0h48v48H0z"></path>
				</svg>
				<span>Sign in with Google</span>
			</button>
			{#if signInError}
				<p class="fixed bottom-20 rounded bg-white p-2 text-sm text-red-500 shadow">
					{signInError}
				</p>
			{/if}
		</div>
	{/if}
</div>
