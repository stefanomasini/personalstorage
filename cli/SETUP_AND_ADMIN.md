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

## Admin Commands Reference

| Command | Description                                             |
| ------- | ------------------------------------------------------- |
| `auth`  | Run the OAuth flow and obtain a refresh token           |
| `init`  | Create the Dropbox property template (create or update) |
