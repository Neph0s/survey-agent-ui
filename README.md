# ChatDoc WebUI

A chat interface, forked from [huggingface/chat-ui](https://github.com/huggingface/chat-ui).

1. [Setup](#setup)
2. [Launch](#launch)
3. [Building](#building)

## Setup

The default config for Chat UI is stored in the `.env` file. You will need to override some values to get Chat UI to run locally. This is done in `.env.local`.

Start by creating a `.env.local` file in the root of the repository. The bare minimum config you need to get Chat UI to run locally is the following:

```bash
MONGODB_URL=<the URL to your mongoDB instance>
HF_ACCESS_TOKEN=<your access token>
OPENAI_API_KEY=<your openai API key>
```

### Database

The chat history is stored in a MongoDB instance, and having a DB instance available is needed for Chat UI to work.

You can use a local MongoDB instance. The easiest way is to spin one up using docker:

```bash
docker run -d -p 27017:27017 --name mongo-chatui mongo:latest
```

In which case the url of your DB will be `MONGODB_URL=mongodb://localhost:27017`.

### Hugging Face Access Token

You will need a Hugging Face access token to run Chat UI locally, using the remote inference endpoints. You can get one from [your Hugging Face profile](https://huggingface.co/settings/tokens).

## Launch

After you're done with the `.env.local` file you can run Chat UI locally. However, you need to configure the runtime first.

### Install Bun

This project is powered by [Bun](https://bun.sh/). You can install it with the following command on macOS, Linux or WSL:

```bash
curl -fsSL https://bun.sh/install | bash
```

If you're on Windows, note that you can choose to use WSL, or install the *limited*, *experimental* native build for Windows following the instructions [here](https://bun.sh/docs/installation).

### Run

You can then run Chat UI with:

```bash
bun install # install dependencies
bun run dev
```

## Building

To create a production version of your app:

```bash
bun run build
```

You can preview the production build with `bun run preview`.
