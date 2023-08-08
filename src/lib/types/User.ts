import type { ObjectId } from "mongodb";
import type { Timestamps } from "./Timestamps";

export interface User extends Timestamps {
	_id: ObjectId;

	username: string;
	passwordDigest: string;
	salt: string;
}
