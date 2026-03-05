# Usage

All commands are run from the `cli/` directory using the `./storage-cli` wrapper, which loads credentials automatically via `wellkept`:

```bash
cd cli
./storage-cli <command> [options]
```

## `set <path>`

Set metadata on a Dropbox path.

```bash
./storage-cli set /some/folder --usage "Project archives"
./storage-cli set /some/folder --ignore
./storage-cli set /some/folder --no-ignore
./storage-cli set /some/folder --leaf
./storage-cli set /some/folder --no-leaf
./storage-cli set /some/folder --template mytemplate Docs "Documentation files"
./storage-cli set /some/folder --remove-template mytemplate
./storage-cli set /some/folder --remove-template-entry mytemplate Docs
./storage-cli set /Projects/Alpha --apply-template standard
./storage-cli set /Projects/Alpha --no-apply-template
```

| Option                                       | Description                             |
| -------------------------------------------- | --------------------------------------- |
| `--usage <text>`                             | Storage usage description               |
| `--ignore`                                   | Mark path as ignored in storage reports |
| `--no-ignore`                                | Unmark path as ignored                  |
| `--leaf`                                     | Mark folder as a leaf node              |
| `--no-leaf`                                  | Unmark folder as leaf                   |
| `--template <name> <subfolder> <usage>`      | Add a template entry                    |
| `--remove-template <name>`                   | Remove an entire template               |
| `--remove-template-entry <name> <subfolder>` | Remove a subfolder from a template      |
| `--apply-template <name>`                    | Apply a template from the parent folder |
| `--no-apply-template`                        | Remove the applied template             |

### Templates

Templates define reusable usage descriptions for grandchild folders (two levels down from where the template is defined). When multiple direct children of a folder share the same internal structure, a template avoids duplicating usage metadata across each one.

A template is defined on a folder with a name and a set of entries, where each entry maps a subfolder name to a usage description. The template can then be applied to the folder's direct children (level +1), so that their own children (level +2) inherit consistent usage strings.

**Example:** `/Projects` defines a template called `standard`:

```bash
./storage-cli set /Projects --template standard Docs "Documentation files"
./storage-cli set /Projects --template standard Assets "Media and design assets"
```

To apply the template to a child folder:

```bash
./storage-cli set /Projects/Alpha --apply-template standard
./storage-cli set /Projects/Beta --apply-template standard
```

When `list /Projects/Alpha` is called, the template is looked up from the parent (`/Projects`), and children of `Alpha` matching template subfolders (`Docs`, `Assets`) automatically show the template's usage strings. A child's own `--usage` takes precedence over the template.

The `check` command also respects applied templates: children matching template subfolders are treated as annotated. If a child has its own usage that differs from the template, `check` reports the inconsistency.

## `get <path>`

Read metadata for a path.

```bash
./storage-cli get /some/folder
```

## `list <path>`

List child folders with their usage metadata.

```bash
./storage-cli list /some/folder
./storage-cli list /some/folder --markdown
```

| Option       | Description                                    |
| ------------ | ---------------------------------------------- |
| `--markdown` | Force markdown output (default when not a TTY) |

## `analyze <local-path>`

Analyze a local file using Claude AI and store the analysis as Dropbox metadata.

```bash
./storage-cli analyze /Users/you/Dropbox/Documents/report.pdf
```

The command:
1. Derives the Dropbox path from the local path (looks for `Dropbox` in the path segments)
2. Calls Claude CLI to analyze the file and produce a JSON with `name`, `description`, and optionally `detail`
3. Stores the result in the `document_contents` metadata field on the Dropbox path

## `check`

Find terminal folders not marked as leaf. Use this tool to identify folders that may need metadata updates.

```bash
./storage-cli check
./storage-cli check --markdown
./storage-cli check --verbose
```

| Option       | Description                                    |
| ------------ | ---------------------------------------------- |
| `--markdown` | Force markdown output (default when not a TTY) |
| `--verbose`  | Print each API call to stderr                  |
