// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session?: import('better-auth').Session & { user?: import('better-auth').User };
			user?: import('better-auth').User;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export { };
