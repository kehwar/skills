# App Extensions via safe_exec_globals Hook

Custom Frappe apps extend the safe_exec namespace using the `safe_exec_globals` hook. These additions vary per workspace, so **you must scan the workspace** to discover what's available.

## How the hook works

```python
# In hooks.py
safe_exec_globals = ["myapp.utils.safe_exec.safe_exec_globals"]

# In myapp/utils/safe_exec.py
def safe_exec_globals(out):
    """out is the current globals dict. Return a dict to merge, or mutate out directly."""
    out.update({"my_function": my_function})
    # and/or
    return {"another_function": another_function}
```

The function receives the current globals dict (`out`). It can:
- **Mutate `out` directly** (e.g., `out.frappe.update({...})`, `out.update({...})`)
- **Return a dict** that gets merged into globals
- **Both** — mutate nested namespaces AND return top-level additions

## Scanning workflow

Before writing console code that uses app-specific APIs, scan the workspace:

1. **Find all apps that register the hook:**
   Search for `safe_exec_globals` in `hooks.py` files across the `apps/` directory. Each match gives you the dotted path to the hook function.

2. **Read each hook function** to catalog what it adds. Look for:
   - `out.frappe.update({...})` — additions to `frappe.*` namespace
   - `out.frappe.db.update({...})` — additions to `frappe.db.*`
   - `out.frappe.utils.update({...})` — additions to `frappe.utils.*`
   - `out.update({...})` or `return {...}` — top-level globals
   - `NamespaceDict(...)` wrappers — nested namespace objects (accessed with dot notation)

3. **Follow the imports** in the hook file to understand each function's signature and purpose.

## Common patterns in hook functions

### Extending frappe sub-namespaces

```python
def safe_exec_globals(out):
    out.frappe.update({"get_roles": frappe.get_roles})
    out.frappe.db.update({"unsafe_sql": admin_sql})
    out.frappe.utils.update({"getseries": getseries})
```

### Adding top-level namespaces

```python
def safe_exec_globals(out):
    return {
        "re": NamespaceDict(match=re.match, search=re.search, ...),
        "yaml": NamespaceDict(load=yaml.safe_load, dump=yaml.safe_dump),
        "myapp": NamespaceDict(my_func=my_func),
    }
```

### Mixed approach

```python
def safe_exec_globals(out):
    # Mutate existing namespaces
    out.frappe.update({"cache": get_cache_module()})
    # Return new top-level globals
    return {"my_helper": helper_func}
```
