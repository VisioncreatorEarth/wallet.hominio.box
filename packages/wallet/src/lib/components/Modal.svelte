<script lang="ts">
	let {
		isOpen = false,
		title = 'Modal Title',
		onClose = () => {},
		children
	} = $props<{
		isOpen: boolean;
		title?: string;
		onClose?: () => void;
		children: any;
	}>();

	// Optional: Add escape key listener to close modal
	import { onMount, onDestroy } from 'svelte';
	onMount(() => {
		const handleKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && isOpen) {
				onClose?.();
			}
		};
		window.addEventListener('keydown', handleKeydown);
		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm transition-opacity duration-300 ease-in-out sm:p-4 {isOpen
			? 'opacity-100'
			: 'pointer-events-none opacity-0'}"
		onclick={(event) => {
			if (event.target === event.currentTarget) {
				onClose?.();
			}
		}}
		onkeydown={(event: KeyboardEvent) => {
			if (
				event.target === event.currentTarget &&
				(event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')
			) {
				onClose?.();
			}
		}}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="-1"
	>
		<div
			class="bg-background-surface w-full transform rounded-t-3xl p-6 shadow-2xl transition-all duration-300 ease-in-out sm:max-w-lg sm:rounded-3xl {isOpen
				? 'translate-y-0 opacity-100 sm:scale-100'
				: 'translate-y-full opacity-0 sm:scale-95'}"
		>
			<div class="mb-4 flex items-center justify-between">
				<h3 id="modal-title" class="text-prussian-blue text-xl font-semibold">
					{title}
				</h3>
			</div>
			<div>
				{@render children()}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Styles can remain minimal as Tailwind handles most of it */
</style>
