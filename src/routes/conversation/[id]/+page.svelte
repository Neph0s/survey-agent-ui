<script lang="ts">
	import ChatWindow from "$lib/components/chat/ChatWindow.svelte";
	import { pendingMessage } from "$lib/stores/pendingMessage";
	import { pendingMessageIdToRetry } from "$lib/stores/pendingMessageIdToRetry";
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	// import { textGenerationStream, type Options } from "@huggingface/inference";
	import { invalidate } from "$app/navigation";
	import { base } from "$app/paths";
	import { shareConversation } from "$lib/shareConversation";
	import { UrlDependency } from "$lib/types/UrlDependency";
	import { ERROR_MESSAGES, error } from "$lib/stores/errors";
	import { randomUUID } from "$lib/utils/randomUuid";
	import { findCurrentModel } from "$lib/utils/models";
	import type { Message } from "$lib/types/Message";
	import { browser } from "$app/environment";
	import { streamToAsyncIterable } from "$lib/utils/streamToAsyncIterable.js";
	import { pipe, filter, map, flatMap } from "iter-ops";
	import { canParseStreamOutput, parseStreamOutput } from "$lib/utils/parseStreamOutput.js";

	export let data;

	let messages = data.messages;
	let lastLoadedMessages = data.messages;
	let isAborted = false;

	// Since we modify the messages array locally, we don't want to reset it if an old version is passed
	$: if (data.messages !== lastLoadedMessages) {
		messages = data.messages;
		lastLoadedMessages = data.messages;
	}

	let loading = false;
	let pending = false;

	async function getTextGenerationStream(inputs: string, messageId: string, isRetry = false) {
		let conversationId = $page.params.id;
		const responseId = randomUUID();

		const response = await fetch($page.url.href, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				inputs,
				parameters: {
					...data.models.find((m) => m.id === data.model)?.parameters,
					return_full_text: false,
				},
				options: {
					id: messageId,
					response_id: responseId,
					is_retry: isRetry,
					use_cache: false,
				},
				stream: true,
			}),
		});

		if (!response.body) {
			$error = "No response body";
			console.error("No response body");
			return;
		}

		const generator = pipe(
			streamToAsyncIterable(response.body),
			map((chunk) => new TextDecoder().decode(chunk)),
			flatMap((chunk) => chunk.split("\n")),
			filter((chunk) => chunk.trim() !== ""),
			map((chunk, index, state) => {
				if (!state["pastOutput"]) state["pastOutput"] = "";
				if (canParseStreamOutput(state["pastOutput"] + chunk)) {
					const output = state["pastOutput"] + chunk;
					state["pastOutput"] = "";
					return output;
				} else {
					state["pastOutput"] += chunk;
					state["pastOutput"] = state["pastOutput"].trim();
					return "";
				}
			}),
			filter((chunk) => chunk.trim() !== ""),
			map((chunk) => parseStreamOutput(chunk))
		);

		for await (const chunk of generator) {
			if (chunk.type === "error") {
				console.error(chunk.message);
				$error = chunk.message;
				break;
			}

			const lastMessage = messages[messages.length - 1];
			if (lastMessage?.from !== "assistant") {
				// First token has a space at the beginning, trim it
				messages = [
					...messages,
					// id doesn't match the backend id but it's not important for assistant messages
					{
						from: "assistant",
						content: "",
						id: responseId,
						actions: [],
					},
				];
			}

			pending = false;

			if (conversationId !== $page.params.id) {
				fetch(`${base}/conversation/${conversationId}/stop-generating`, {
					method: "POST",
				}).catch(console.error);
				break;
			}

			if (isAborted) {
				isAborted = false;
				fetch(`${base}/conversation/${conversationId}/stop-generating`, {
					method: "POST",
				}).catch(console.error);
				break;
			}

			if (chunk.type === "text") {
				const output = chunk.data;

				// final message
				if (output.generated_text) {
					lastMessage.content = output.generated_text;
					messages = [...messages];
					break;
				}

				if (!output.token.special) {
					lastMessage.content += output.token.text;
					messages = [...messages];
				}
			} else if (chunk.type === "action") {
				if (!lastMessage.actions) {
					lastMessage.actions = [];
				}
				const action = lastMessage.actions.find((a) => a.name === chunk.name);
				if (action) {
					action.messages.push(chunk.message);
				} else {
					lastMessage.actions.push({
						name: chunk.name,
						messages: [chunk.message],
					});
				}
			}
		}
	}

	async function summarizeTitle(id: string) {
		await fetch(`${base}/conversation/${id}/summarize`, {
			method: "POST",
		});
	}

	async function writeMessage(message: string, messageId = randomUUID()) {
		if (!message.trim()) return;

		try {
			isAborted = false;
			loading = true;
			pending = true;

			let retryMessageIndex = messages.findIndex((msg) => msg.id === messageId);
			const isRetry = retryMessageIndex !== -1;
			if (!isRetry) {
				retryMessageIndex = messages.length;
			}

			messages = [
				...messages.slice(0, retryMessageIndex),
				{ from: "user", content: message, id: messageId },
			];

			await getTextGenerationStream(message, messageId, isRetry);

			if (browser) invalidate(UrlDependency.Conversation);

			if (messages.filter((m) => m.from === "user").length === 1) {
				summarizeTitle($page.params.id)
					.then(() => invalidate(UrlDependency.ConversationList))
					.catch(console.error);
			} else {
				await invalidate(UrlDependency.ConversationList);
			}
		} catch (err) {
			if (err instanceof Error && err.message.includes("overloaded")) {
				$error = "Too much traffic, please try again.";
			} else if (err instanceof Error && err.message.includes("429")) {
				$error = ERROR_MESSAGES.rateLimited;
			} else if (err instanceof Error) {
				$error = err.message;
			} else {
				$error = ERROR_MESSAGES.default;
			}
			console.error(err);
		} finally {
			loading = false;
			pending = false;
		}
	}

	async function voteMessage(score: Message["score"], messageId: string) {
		let conversationId = $page.params.id;
		let oldScore: Message["score"] | undefined;

		// optimistic update to avoid waiting for the server
		messages = messages.map((message) => {
			if (message.id === messageId) {
				oldScore = message.score;
				return { ...message, score: score };
			}
			return message;
		});

		try {
			await fetch(`${base}/conversation/${conversationId}/message/${messageId}/vote`, {
				method: "POST",
				body: JSON.stringify({ score }),
			});
		} catch {
			// revert score on any error
			messages = messages.map((message) => {
				return message.id !== messageId ? message : { ...message, score: oldScore };
			});
		}
	}

	onMount(async () => {
		if ($pendingMessage) {
			const val = $pendingMessage;
			const messageId = $pendingMessageIdToRetry || undefined;
			$pendingMessage = "";
			$pendingMessageIdToRetry = null;

			writeMessage(val, messageId);
		}
	});
	$: $page.params.id, (isAborted = true);
	$: title = data.conversations.find((conv) => conv.id === $page.params.id)?.title ?? data.title;
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<ChatWindow
	{loading}
	{pending}
	{messages}
	on:message={(event) => writeMessage(event.detail)}
	on:retry={(event) => writeMessage(event.detail.content, event.detail.id)}
	on:vote={(event) => voteMessage(event.detail.score, event.detail.id)}
	on:share={() => shareConversation($page.params.id, data.title)}
	on:stop={() => (isAborted = true)}
	models={data.models}
	currentModel={findCurrentModel([...data.models, ...data.oldModels], data.model)}
	settings={data.settings}
/>
