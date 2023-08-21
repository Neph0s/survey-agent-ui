import { base } from "$app/paths";
import { redirect } from "@sveltejs/kit";

export const actions = {
	default: async function ({ cookies }) {
		cookies.delete("access_token", {
			path: "/",
		});
		cookies.delete("refresh_token", {
			path: "/",
		});
		throw redirect(303, `${base}/`);
	},
};
