# Setup & Administration

## 1. Create a Dropbox App

1. Go to https://www.dropbox.com/developers/apps
2. Click **Create app**
3. Choose **Scoped access**, **Full Dropbox**
4. Name it whatever you like
5. In the app's **Permissions** tab, enable:
   - `files.metadata.read`
   - `files.metadata.write`
6. Click **Submit** to save permissions
7. Note the **App key** and **App secret** from the **Settings** tab

## 2. Store App Credentials

Securely store the following environment variables in (`personalstorage` key in wellkept):

```bash
DROPBOX_APP_KEY
DROPBOX_APP_SECRET
```

## 3. Authorize and Get a Refresh Token

```bash
./storage-cli auth
```

This opens an OAuth flow: follow the URL, authorize, paste the code back. You'll get a long-lived refresh token.

## 4. Store the Refresh Token

```bash
DROPBOX_REFRESH_TOKEN
```

## 5. Create the Property Template

Register the metadata template with Dropbox (creates or updates):

```bash
./storage-cli init
```

## 6. MCP Server for Claude Code

```bash
claude mcp add personalstorage /Users/stefano/projects/personalstorage/cli/storage-cli -- mcp
```

The `storage-cli` wrapper loads Dropbox credentials automatically via wellkept.

## 7. Set Up Pinecone Vector Database

Required for the `embed` command (semantic search).

1. Create a free account at [pinecone.io](https://www.pinecone.io/) (Starter plan allows up to 5 serverless indexes)
2. Create a serverless index:
   - Name: `personalstorage`
   - Configuration: **Manual** (not "Model" — we use OpenAI embeddings externally)
   - Vector type: **Dense**
   - Dimensions: `1536`
   - Metric: `cosine`
   - Cloud: AWS, Region: `us-east-1`
3. Copy the API key from the "API Keys" section in the left sidebar

## 8. Store Pinecone & OpenAI Keys

```bash
wellkept set personalstorage PINECONE_API_KEY "your-pinecone-api-key"
wellkept set personalstorage OPENAI_API_KEY "sk-your-openai-api-key"
```

The OpenAI key is used for generating embeddings via `text-embedding-3-small`. Create one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

Estimated cost: ~$0.02 per million tokens — embedding a few thousand files costs fractions of a cent.

## Admin Commands Reference

| Command | Description                                             |
| ------- | ------------------------------------------------------- |
| `auth`  | Run the OAuth flow and obtain a refresh token           |
| `init`  | Create the Dropbox property template (create or update) |
