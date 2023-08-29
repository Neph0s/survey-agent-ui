export type ActionMessageUpdate = {
	type: "update";
	message: string;
	args?: string[];
};

export type ActionMessageError = {
	type: "error";
	message: string;
	args?: string[];
};

export type ActionMessageResult = {
	type: "result";
	message: string;
};

export type ActionMessage =
	| ActionMessageUpdate
	| ActionMessageError
	| ActionMessageResult;

export type Action = {
	name: string;
	messages: ActionMessage[];
};