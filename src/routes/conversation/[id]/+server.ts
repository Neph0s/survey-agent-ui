import { RATE_LIMIT } from "$env/static/private";
import { PUBLIC_SEP_TOKEN } from "$lib/constants/publicSepToken";
import { abortedGenerations } from "$lib/server/abortedGenerations";
import { authCondition } from "$lib/server/auth";
import { collections } from "$lib/server/database";
import { models } from "$lib/server/models";
import { queryModel } from "$lib/server/queryModel";
import { ERROR_MESSAGES } from "$lib/stores/errors.js";
import type { Action } from "$lib/types/Action";
import type { Message } from "$lib/types/Message";
import { concatUint8Arrays } from "$lib/utils/concatUint8Arrays";
import { serializeStreamOutput } from "$lib/utils/parseStreamOutput.js";
import { streamToAsyncIterable } from "$lib/utils/streamToAsyncIterable";
import { trimPrefix } from "$lib/utils/trimPrefix";
import { trimSuffix } from "$lib/utils/trimSuffix";
import type { TextGenerationStreamOutput } from "@huggingface/inference";
import { error } from "@sveltejs/kit";
import { ObjectId } from "mongodb";
import { z } from "zod";

export async function POST({ request, fetch, locals, params }) {
	const id = z.string().parse(params.id);
	const convId = new ObjectId(id);
	const date = new Date();

	const userId = locals.user?._id ?? locals.sessionId;

	if (!userId) {
		throw error(401, "Unauthorized");
	}

	const conv = await collections.conversations.findOne({
		_id: convId,
		...authCondition(locals),
	});

	if (!conv) {
		throw error(404, "Conversation not found");
	}

	const nEvents = await collections.messageEvents.countDocuments({ userId });

	if (RATE_LIMIT != "" && nEvents > parseInt(RATE_LIMIT)) {
		throw error(429, ERROR_MESSAGES.rateLimited);
	}

	const model = models.find((m) => m.id === conv.model);

	if (!model) {
		throw error(410, "Model not available anymore");
	}

	const json = await request.json();
	const {
		inputs: newPrompt,
		options: { id: messageId, is_retry, response_id: responseId },
	} = z
		.object({
			inputs: z.string().trim().min(1),
			options: z.object({
				id: z.optional(z.string().uuid()),
				response_id: z.optional(z.string().uuid()),
				is_retry: z.optional(z.boolean()),
			}),
		})
		.parse(json);

	const messages = (() => {
		if (is_retry && messageId) {
			let retryMessageIdx = conv.messages.findIndex((message) => message.id === messageId);
			if (retryMessageIdx === -1) {
				retryMessageIdx = conv.messages.length;
			}
			return [
				...conv.messages.slice(0, retryMessageIdx),
				{ content: newPrompt, from: "user", id: messageId as Message["id"] },
			];
		}
		return [
			...conv.messages,
			{ content: newPrompt, from: "user", id: (messageId as Message["id"]) || crypto.randomUUID() },
		];
	})() satisfies Message[];

	const abortController = new AbortController();

	const [generator, status, statusText] = await queryModel(
		model,
		messages,
		fetch,
		abortController.signal,
	);

	async function saveMessage(generated_text: string, actions: Action[]) {
		if (model?.type === "huggingface") {
			generated_text = trimSuffix(
				trimPrefix(generated_text, "<|startoftext|>"),
				PUBLIC_SEP_TOKEN
			).trimEnd();

			for (const stop of [...(model?.parameters?.stop ?? []), "<|endoftext|>"]) {
				if (generated_text.endsWith(stop)) {
					generated_text = generated_text.slice(0, -stop.length).trimEnd();
				}
			}
		}

		messages.push({
			from: "assistant",
			content: generated_text,
			id: (responseId as Message["id"]) || crypto.randomUUID(),
			actions
		});

		await collections.messageEvents.insertOne({
			userId: userId,
			createdAt: new Date(),
		});

		await collections.conversations.updateOne(
			{
				_id: convId,
			},
			{
				$set: {
					messages,
					updatedAt: new Date(),
				},
			}
		);
	}

	const stream = new ReadableStream({
		async start(controller) {
			const textChunks: string[] = [];
			const actions: Action[] = [];
			for await (const response of generator) {
				const abortDate = abortedGenerations.get(convId.toString());
				if (abortDate && abortDate > date) {
					abortController.abort("Cancelled by user");
					await saveMessage(textChunks.join(""), actions);
					controller.enqueue(new TextEncoder().encode("error: Cancelled by user\n"));
					break;
				}

				if (response.type === "action") {
					const action = actions.find((a) => a.name === response.name);
					if (action) {
						action.messages.push(response.message);
					} else {
						actions.push({
							name: response.name,
							messages: [response.message],
						});
					}
				} else if (response.type === "text") {
					textChunks.push(response.data.token.text);

					if (response.data.generated_text) {
						await saveMessage(response.data.generated_text, actions);
					}
				}

				controller.enqueue(new TextEncoder().encode(serializeStreamOutput(response) + "\n"));
			}
			controller.close();
		},
	});

	// Todo: maybe we should wait for the message to be saved before ending the response - in case of errors
	return new Response(stream, {
		status,
		statusText,
	});
}

export async function DELETE({ locals, params }) {
	const convId = new ObjectId(params.id);

	const conv = await collections.conversations.findOne({
		_id: convId,
		...authCondition(locals),
	});

	if (!conv) {
		throw error(404, "Conversation not found");
	}

	await collections.conversations.deleteOne({ _id: conv._id });

	return new Response();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function parseGeneratedText(
	stream: ReadableStream,
	conversationId: ObjectId,
	promptedAt: Date,
	abortController: AbortController
): Promise<string> {
	const inputs: Uint8Array[] = [];
	for await (const input of streamToAsyncIterable(stream)) {
		inputs.push(input);

		const date = abortedGenerations.get(conversationId.toString());

		if (date && date > promptedAt) {
			abortController.abort("Cancelled by user");
			const completeInput = concatUint8Arrays(inputs);

			const lines = new TextDecoder()
				.decode(completeInput)
				.split("\n")
				.filter((line) => line.startsWith("data:"));

			const tokens = lines.map((line) => {
				try {
					const json: TextGenerationStreamOutput = JSON.parse(line.slice("data:".length));
					return json.token.text;
				} catch {
					return "";
				}
			});
			return tokens.join("");
		}
	}

	// Merge inputs into a single Uint8Array
	const completeInput = concatUint8Arrays(inputs);

	// Get last line starting with "data:" and parse it as JSON to get the generated text
	const message = new TextDecoder().decode(completeInput);

	let lastIndex = message.lastIndexOf("\ndata:");
	if (lastIndex === -1) {
		lastIndex = message.indexOf("data");
	}

	if (lastIndex === -1) {
		console.error("Could not parse last message", message);
	}

	let lastMessage = message.slice(lastIndex).trim().slice("data:".length);
	if (lastMessage.includes("\n")) {
		lastMessage = lastMessage.slice(0, lastMessage.indexOf("\n"));
	}

	const lastMessageJSON = JSON.parse(lastMessage);

	if (lastMessageJSON.error) {
		throw new Error(lastMessageJSON.error);
	}

	const res = lastMessageJSON.generated_text;

	if (typeof res !== "string") {
		throw new Error("Could not parse generated text");
	}

	return res;
}

export async function PATCH({ request, locals, params }) {
	const { title } = z
		.object({ title: z.string().trim().min(1).max(100) })
		.parse(await request.json());

	const convId = new ObjectId(params.id);

	const conv = await collections.conversations.findOne({
		_id: convId,
		...authCondition(locals),
	});

	if (!conv) {
		throw error(404, "Conversation not found");
	}

	await collections.conversations.updateOne(
		{
			_id: convId,
		},
		{
			$set: {
				title,
			},
		}
	);

	return new Response();
}
