import { DropboxAuth } from "dropbox";
import * as readline from "node:readline/promises";

const REDIRECT_URI = ""; // empty string = no redirect, user copies code manually

export async function auth(): Promise<void> {
  const clientId = process.env.DROPBOX_APP_KEY;
  const clientSecret = process.env.DROPBOX_APP_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      "Missing DROPBOX_APP_KEY or DROPBOX_APP_SECRET.\n" +
        "Store them securely first:\n" +
        "  DROPBOX_APP_KEY\n" +
        "  DROPBOX_APP_SECRET",
    );
    process.exit(1);
  }

  const dbxAuth = new DropboxAuth({ clientId, clientSecret });

  const authUrl = await dbxAuth.getAuthenticationUrl(
    REDIRECT_URI,
    undefined, // state
    "code", // authType
    "offline", // tokenAccessType — gives us a refresh token
  );

  console.log("1. Open this URL in your browser:\n");
  console.log(`   ${authUrl}\n`);
  console.log("2. Authorize the app and copy the authorization code.\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const code = (await rl.question("3. Paste the code here: ")).trim();
  rl.close();

  if (!code) {
    console.error("No code provided.");
    process.exit(1);
  }

  const response = await dbxAuth.getAccessTokenFromCode(REDIRECT_URI, code);
  const result = response.result as { refresh_token?: string };

  if (!result.refresh_token) {
    console.error(
      "No refresh token in response. Make sure token_access_type is 'offline'.",
    );
    process.exit(1);
  }

  console.log("\nRefresh token obtained. Store it securely:\n");
  console.log(`  DROPBOX_REFRESH_TOKEN`);
  console.log(`\nValue: ${result.refresh_token}`);
}
