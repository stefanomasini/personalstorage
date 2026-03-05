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

### Templates

Templates define reusable usage descriptions for grandchild folders (two levels down from where the template is defined). When multiple direct children of a folder share the same internal structure, a template avoids duplicating usage metadata across each one.

A template is defined on a folder with a name and a set of entries, where each entry maps a subfolder name to a usage description. The template can then be applied to the folder's direct children (level +1), so that their own children (level +2) inherit consistent usage strings.

**Example:** `/Projects` defines a template called `standard`:

```bash
./storage-cli set /Projects --template standard Docs "Documentation files"
./storage-cli set /Projects --template standard Assets "Media and design assets"
```

This template can be applied to `/Projects/Alpha` and `/Projects/Beta`, so both get the same usage descriptions for `Docs` and `Assets` without setting them individually.

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

## `check`

Find terminal folders not marked as leaf.

```bash
./storage-cli check
./storage-cli check --markdown
./storage-cli check --verbose
```

| Option       | Description                                    |
| ------------ | ---------------------------------------------- |
| `--markdown` | Force markdown output (default when not a TTY) |
| `--verbose`  | Print each API call to stderr                  |
