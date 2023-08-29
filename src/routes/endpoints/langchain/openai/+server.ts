import { z } from "zod";

import { ChatOpenAI } from "langchain/chat_models/openai";
import { HumanMessage, AIMessage, SystemMessage } from "langchain/schema";
import type { TextGenerationStreamOutput } from "@huggingface/inference";
import { OPENAI_API_KEY } from "$env/static/private";

export async function POST({ request }) {
	const json = await request.json();

	const { stream, parameters, messages } = z
		.object({
			stream: z.boolean().default(true),
			parameters: z
				.object({
					modelName: z.string().optional(),
					temperature: z.number().min(0).max(1).default(0.9),
					maxTokens: z.number().int().positive().default(100),
				})
				.passthrough()
				.optional(),
			messages: z.array(
				z.object({
					from: z.enum(["user", "assistant", "system"]),
					content: z.string(),
				})
			),
		})
		.parse(json);

	const model = new ChatOpenAI(
		{
			...parameters,
			streaming: stream,
			openAIApiKey: OPENAI_API_KEY,
		},
		{ basePath: "https://api.op-enai.com/v1" }
	);

	const chatMessages = messages.map(({ from, content }) => {
		switch (from) {
			case "user":
				return new HumanMessage(content);
			case "assistant":
				return new AIMessage(content);
			case "system":
				return new SystemMessage(content);
		}
	});

	const retStream = new ReadableStream({
		async start(controller) {
			controller.enqueue(
				new TextEncoder().encode(
					"action:" + JSON.stringify({
						name: "Retrieval",
						message: {
							type: "update",
							message: "Begin retrieving with query: " + chatMessages[chatMessages.length - 1].content,
						}
					}) + "\n"
				)
			);
			controller.enqueue(
				new TextEncoder().encode(
					"action:" + JSON.stringify({
						name: "Retrieval",
						message: {
							type: "result",
							message: "Lorum ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum"
						}
					}) + "\n"
				)
			);
			const response = await model.call(chatMessages, {
				callbacks: [
					{
						handleLLMNewToken(token: string) {
							const textGenerationStreamOutput: TextGenerationStreamOutput = {
								token: {
									id: -1,
									text: token,
									special: false,
									logprob: 0,
								},
								generated_text: null,
								details: null,
							};
							controller.enqueue(
								new TextEncoder().encode(
									"data:" + JSON.stringify(textGenerationStreamOutput) + "\n"
								)
							);
						},
						handleLLMError(err, runId, parentRunId, tags) {
							console.error(err, runId, parentRunId, tags);
							controller.error(new TextEncoder().encode("error:" + err.error.message + "\n"));
							controller.close();
						},
					},
				],
			});
			const textGenerationStreamOutput: TextGenerationStreamOutput = {
				token: {
					id: -1,
					text: "",
					special: false,
					logprob: 0,
				},
				generated_text: response.content,
				details: null,
			};
			controller.enqueue(
				new TextEncoder().encode("data:" + JSON.stringify(textGenerationStreamOutput) + "\n")
			);
			controller.close();
		},
	});

	return new Response(retStream);
}
