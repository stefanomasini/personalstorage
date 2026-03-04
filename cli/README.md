# storage-cli

CLI for managing custom metadata on Dropbox folders/files.

## Setup

### 1. Create a Dropbox App

1. Go to https://www.dropbox.com/developers/apps
2. Click **Create app**
3. Choose **Scoped access**, **Full Dropbox**
4. Name it whatever you like
5. In the app's **Permissions** tab, enable:
   - `files.metadata.read`
   - `files.metadata.write`
6. Click **Submit** to save permissions
7. Note the **App key** and **App secret** from the **Settings** tab

### 2. Store App Credentials

```bash
envchain personalstorage set DROPBOX_APP_KEY
envchain personalstorage set DROPBOX_APP_SECRET
```

### 3. Authorize and Get a Refresh Token

```bash
./storage-cli auth
```

This opens an OAuth flow: follow the URL, authorize, paste the code back. You'll get a long-lived refresh token.

### 4. Store the Refresh Token

```bash
envchain personalstorage set DROPBOX_REFRESH_TOKEN
```

## Usage

```bash
# Create the property template (one-time)
./storage-cli init

# Set metadata on a path
./storage-cli set /some/folder --usage "Project archives"
./storage-cli set /some/folder --ignore

# Get metadata for a path
./storage-cli get /some/folder
```
