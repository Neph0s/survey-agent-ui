export interface Message {
	from: "user" | "assistant" | "system";
	id: ReturnType<typeof crypto.randomUUID>;
	content: string;
	webSearchId?: string;
	score?: -1 | 0 | 1;
}
