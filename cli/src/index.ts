import { Command } from "commander";
import { auth } from "./commands/auth.js";
import { initTemplate } from "./commands/init.js";
import { setMetadata } from "./commands/set.js";
import { getMetadata } from "./commands/get.js";

const program = new Command();

program
  .name("storage-cli")
  .description("Manage custom metadata on Dropbox folders/files")
  .version("0.1.0");

program
  .command("auth")
  .description("Authorize with Dropbox and obtain a refresh token")
  .action(async () => {
    await auth();
  });

program
  .command("init")
  .description("Create the property template (one-time setup)")
  .action(async () => {
    await initTemplate();
  });

program
  .command("set <path>")
  .description("Set metadata on a Dropbox path")
  .option("--usage <string>", "Storage usage description")
  .option("--ignore", "Mark path as ignored in storage reports")
  .option("--no-ignore", "Unmark path as ignored")
  .action(async (filePath: string, options: { usage?: string; ignore?: boolean }) => {
    await setMetadata(filePath, options);
  });

program
  .command("get <path>")
  .description("Get metadata for a Dropbox path")
  .action(async (filePath: string) => {
    await getMetadata(filePath);
  });

program.parse();
