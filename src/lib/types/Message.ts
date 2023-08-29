import type { Action } from "./Action";

export interface Message {
	from: "user" | "assistant" | "system";
	id: ReturnType<typeof crypto.randomUUID>;
	content: string;
	actions?: Action[];
	score?: -1 | 0 | 1;
}
