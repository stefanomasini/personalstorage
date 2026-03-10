# storage-cli

CLI for managing custom metadata on Dropbox folders/files.

- [Setup & Administration](SETUP_AND_ADMIN.md) — Dropbox app creation, credentials, auth, and admin commands
- [Usage](USAGE.md) — all operative commands and options

## Gemini API Key

The `analyze` and `decide-location` commands use Google's Gemini API for document analysis. To set it up:

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account and click **Create API key**
3. Copy the key and make it available as an environment variable:
    ```bash
    export GOOGLE_API_KEY=your-key-here
    ```
    Add this to your shell profile (`~/.zshrc` or `~/.bashrc`) so it persists across sessions.
4. Verify it works:
    ```bash
    storage-cli analyze /path/to/any/file.pdf
    ```

The free tier includes a generous quota. Token usage and costs are printed after each operation.
