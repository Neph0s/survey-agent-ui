import { authCondition } from "$lib/server/auth";
import { collections } from "$lib/server/database";
import { defaultModel, turboModel } from "$lib/server/models";
import { queryModelNoStreaming } from "$lib/server/queryModel.js";
import type { Message } from "$lib/types/Message.js";
import { error } from "@sveltejs/kit";
import { ObjectId } from "mongodb";

export async function POST({ params, locals, fetch }) {
	const convId = new ObjectId(params.id);

	const conversation = await collections.conversations.findOne({
		_id: convId,
		...authCondition(locals),
	});

	if (!conversation) {
		throw error(404, "Conversation not found");
	}

	const firstMessage = conversation.messages.find((m) => m.from === "user");

	const userPrompt =
		`Please summarize the following message as a single sentence of less than 5 words:\n` +
		firstMessage?.content;

	const [generated_text, status, statusText] = await queryModelNoStreaming(
		turboModel ?? defaultModel,
		[{ from: "user", content: userPrompt } as Message],
		fetch
	);

	if (generated_text) {
		await collections.conversations.updateOne(
			{
				_id: convId,
				...authCondition(locals),
			},
			{
				$set: { title: generated_text },
			}
		);
	}

	return new Response(
		JSON.stringify(
			generated_text
				? {
					title: generated_text,
				}
				: {}
		),
		{
			headers: { "Content-Type": "application/json" },
			status: status,
			statusText: statusText,
		}
	);
}
