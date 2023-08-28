export const GET = async ({ locals, fetch }) => {
    const user = locals.user;
    const avatarInitials = user ? user.username[0] : "Anonymous"
    const image = await fetch(`https://ui-avatars.com/api/?name=${avatarInitials}&background=0D8ABC&color=fff&size=128&font-size=0.5&bold=true&length=1&rounded=true&uppercase=true&format=svg`)
    return new Response(image.body, {
        headers: {
            "Content-Type": "image/svg+xml",
        }
    })
}