# Tooling: Dropbox API access via Maestral

[Maestral](https://maestral.app/) is installed (`pip install maestral`) and linked to Stefano's Dropbox account. It provides API access without triggering local sync, which is important because Dropbox smart sync means many directories are cloud-only.

## Usage

```python
from maestral.main import Maestral
m = Maestral('maestral', log_to_stderr=False)
```

## Key operations

**List folder contents** (returns `FolderMetadata` / `FileMetadata` objects with `.name`, `.path_lower`, `.path_display`):
```python
items = m.list_folder('/')
for item in items:
    is_dir = 'Folder' in type(item).__name__
    print(item.name, item.path_lower)
```

**List shared links** (returns `SharedLinkMetadata` with `.url`, `.path_lower`, `.name`, `.expires`, `.link_permissions`):
```python
links = m.list_shared_links()           # all links
links = m.list_shared_links('/some/path')  # links for a specific path
for link in links:
    print(link.path_lower, link.url)
    print(link.link_permissions.effective_audience.value)  # 'public', 'team', etc.
    print(link.link_permissions.link_access_level.value)   # 'viewer', 'editor'
```

**List shared folders with members** (uses the underlying Dropbox SDK):
```python
dbx = m.client.dbx
result = dbx.sharing_list_folders()
entries = list(result.entries)
while result.cursor:
    result = dbx.sharing_list_folders_continue(result.cursor)
    entries.extend(result.entries)

for folder in entries:
    print(folder.name, folder.path_lower, str(folder.access_type))
    members = dbx.sharing_list_folder_members(folder.shared_folder_id)
    for u in members.users:
        print(f"  {u.user.display_name} ({u.user.email}) {str(u.access_type)}")
```

**Other useful Maestral methods**: `m.client.get_metadata('/path')`, `m.client.list_revisions('/path')`, `m.create_shared_link('/path')`, `m.revoke_shared_link(url)`.

**Full Dropbox SDK** is available at `m.client.dbx` for any operation not directly exposed by Maestral.

## Important notes
- Do NOT use `find`, `ls`, or `cat` on `~/Dropbox` for cloud-only content — it will trigger Dropbox sync and download files. Use the Maestral API instead.
- The Maestral daemon does NOT need to be running for API calls. Just instantiate `Maestral('maestral')` in Python.
- Auth tokens are stored in the macOS Keychain under the `maestral` config name.
