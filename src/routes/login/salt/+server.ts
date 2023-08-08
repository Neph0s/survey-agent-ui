import { collections } from '$lib/server/database';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

export const POST = async ({ request }) => {
    const { username } = z.object({
        username: z.string().min(1).max(100),
    }).parse(await request.json());

    const user = await collections.users.findOne({
        username,
    });

    if (!user) {
        throw error(404, 'User not found');
    }

    return new Response(JSON.stringify({
        salt: user.salt,
    }), {
        headers: {
            'Content-Type': 'application/json',
        },
        status: 200,
    });
}