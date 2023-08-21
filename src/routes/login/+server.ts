import { z } from "zod";
import * as jwt from "jsonwebtoken";
import { collections } from "$lib/server/database";
import { ObjectId } from "mongodb";
import type { User } from "$lib/types/User.js";
import { error, redirect } from "@sveltejs/kit";
import { JWT_SECRET } from "$env/static/private";
import { base } from "$app/paths";

export const POST = async ({ request, cookies }) => {
	const { username, passwordDigest, salt } = z
		.object({
			username: z.string().min(1).max(100),
			passwordDigest: z.string().min(1).max(100),
			salt: z.string().min(1).max(100),
		})
		.parse(await request.json());

	let user = await collections.users.findOne({
		username,
	});

	if (!user) {
		// Create user
		const newUser: User = {
			_id: new ObjectId(),
			username,
			passwordDigest,
			salt,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		await collections.users.insertOne(newUser);

		user = newUser;
	}

	if (user.passwordDigest !== passwordDigest) {
		throw error(401, "Incorrect password");
	}

	const accessToken = jwt.sign(
		{
			username,
			refresh: false,
		},
		JWT_SECRET,
		{
			expiresIn: "1d",
		}
	);

	const refreshToken = jwt.sign(
		{
			username,
			refresh: true,
		},
		JWT_SECRET,
		{
			expiresIn: "7d",
		}
	);

	cookies.set("access_token", accessToken, {
		path: "/",
		maxAge: 60 * 60 * 24,
	});

	cookies.set("refresh_token", refreshToken, {
		path: "/",
		maxAge: 60 * 60 * 24 * 7,
	});

	throw redirect(303, `${base}/`);
};
