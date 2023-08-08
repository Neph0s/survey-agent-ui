<script lang="ts">
	import { browser } from "$app/environment";
	import { base } from "$app/paths";
	import { PUBLIC_APP_NAME, PUBLIC_VERSION } from "$env/static/public";
	import Modal from "$lib/components/Modal.svelte";
	import { createEventDispatcher } from "svelte";
	import Logo from "./icons/Logo.svelte";
	import CarbonClose from "~icons/carbon/close";
	import { generateSalt } from "$lib/utils/generateSalt";
	import { sha256 } from "$lib/utils/sha256";

	const isIframe = browser && window.self !== window.parent;

	const dispatch = createEventDispatcher<{ close: void }>();

	const handleSignInOrUp = async (e: Event) => {
		const form = e.target as HTMLFormElement;
		const username = form.username.value;
		const password = form.password.value;
		if (username && password) {
			const saltResponse = await fetch(`${base}/login/salt`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ username }),
			});
			const salt = saltResponse.ok ? (await saltResponse.json()).salt : await generateSalt();
			const saltedPassword = password + salt;
			const passwordDigest = await sha256(saltedPassword);
			const response = await fetch(`${base}/login`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ username, passwordDigest, salt }),
			});
			if (response.ok) {
				dispatch("close");
				location.replace(`${base}/`);
			} else {
				const { message } = await response.json();
				alert(message);
			}
		} else {
			alert("Please fill in your username and password.");
		}
	};
</script>

<Modal width="max-w-lg">
	<div
		class="flex w-full flex-col items-center gap-6 bg-gradient-to-t from-primary-500/40 via-primary-500/10 to-primary-500/0 px-8 pb-10 pt-9 text-center"
	>
		<div class="flex w-full items-start justify-between text-xl font-semibold text-gray-800">
			<h2 class="flex items-center text-2xl">
				<Logo classNames="mr-1" />
				{PUBLIC_APP_NAME}
				<div
					class="ml-3 flex h-6 items-center rounded-lg border border-gray-100 bg-gray-50 px-2 text-base text-gray-400"
				>
					v{PUBLIC_VERSION}
				</div>
			</h2>
			<button type="button" class="group" on:click={() => dispatch("close")}>
				<CarbonClose class="text-gray-900 group-hover:text-gray-500" />
			</button>
		</div>
		<form
			action="{base}/login"
			target={isIframe ? "_blank" : ""}
			method="POST"
			class="flex w-full flex-col items-center gap-2"
			on:submit|preventDefault={handleSignInOrUp}
		>
			<div class="mb-4 grid w-full grid-cols-1 gap-3">
				<!-- Username -->
				<div class="flex w-full flex-col items-start gap-1">
					<p class="text-lg text-gray-800">Username</p>
					<div
						class="flex w-full max-w-4xl flex-1 items-center rounded-xl border bg-gray-100 focus-within:border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:focus-within:border-gray-500 lg:min-w-[350px]"
					>
						<div class="flex w-full flex-1 border-none bg-transparent">
							<div class="min-w-0 flex-1">
								<input
									class="w-full resize-none scroll-p-3 overflow-x-hidden overflow-y-scroll border-0 bg-transparent p-3 outline-none focus:ring-0 focus-visible:ring-0"
									placeholder="Your Username"
									name="username"
								/>
							</div>
						</div>
					</div>
				</div>
				<!-- Password -->
				<div class="flex w-full flex-col items-start gap-1">
					<p class="text-lg text-gray-800">Password</p>
					<div
						class="flex w-full max-w-4xl flex-1 items-center rounded-xl border bg-gray-100 focus-within:border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:focus-within:border-gray-500 lg:min-w-[350px]"
					>
						<div class="flex w-full flex-1 border-none bg-transparent">
							<div class="min-w-0 flex-1">
								<input
									class="w-full resize-none scroll-p-3 overflow-x-hidden overflow-y-scroll border-0 bg-transparent p-3 outline-none focus:ring-0 focus-visible:ring-0"
									placeholder="Your Password"
									type="password"
									name="password"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
			<p class="self-start text-sm text-gray-500">
				The account will be auto-created if it doesn't exist.
			</p>
			<button
				type="submit"
				class="mt-2 flex items-center whitespace-nowrap rounded-full bg-black px-5 py-2 text-lg font-semibold text-gray-100 transition-colors hover:bg-primary-500"
			>
				Sign in/up
			</button>
		</form>
	</div>
</Modal>
