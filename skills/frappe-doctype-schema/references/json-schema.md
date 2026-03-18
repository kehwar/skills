# DocType JSON Schema Reference

## Field Types

### Data Fields (stored in DB)

| fieldtype | Notes | Extra properties |
|-----------|-------|-----------------|
| `Data` | Single-line text, varchar | `length` (default 140), `translatable` |
| `Small Text` | Multi-line, ~1000 chars | — |
| `Text` | Multi-line, medium | — |
| `Long Text` | Multi-line, unlimited | — |
| `Text Editor` | Rich text (HTML via Quill) | — |
| `Markdown Editor` | Markdown input | — |
| `HTML Editor` | Raw HTML input | — |
| `Code` | Mono code editor | `options` (language hint) |
| `Int` | Integer | — |
| `Long Int` | 64-bit integer | — |
| `Float` | Decimal | `precision` |
| `Currency` | Decimal (currency display) | `precision`, `options` (currency fieldname) |
| `Percent` | 0–100 decimal | `precision` |
| `Check` | Boolean (0/1) | — |
| `Date` | Date only | — |
| `Datetime` | Date + time | — |
| `Time` | Time only | — |
| `Duration` | Time duration | — |
| `Rating` | 0–5 stars | — |
| `Color` | Hex colour picker | — |
| `Password` | Stored encrypted | — |
| `Barcode` | Barcode value + display | — |
| `Geolocation` | JSON geometry | — |
| `Signature` | Base64 signature | — |
| `Phone` | Phone number | — |
| `JSON` | Raw JSON blob | — |
| `Read Only` | Computed/fetched display | `fetch_from`, `fetch_if_empty` |
| `Attach` | File attachment URL | — |
| `Attach Image` | Image attachment URL | — |
| `Autocomplete` | Text with suggestions | `options` (list of values, newline-separated) |
| `Icon` | Icon picker | — |

### Link / Relationship Fields

| fieldtype | Notes | Extra properties |
|-----------|-------|-----------------|
| `Link` | FK to another DocType | `options` = target DocType name (required) |
| `Dynamic Link` | FK where type is in another field | `options` = fieldname of the type field (required) |
| `Select` | Dropdown from fixed list | `options` = newline-separated values (required) |
| `Table` | Embedded child table | `options` = child DocType name (required) |
| `Table MultiSelect` | Multi-select from child table | `options` = child DocType name (required) |

### Layout Fields (no DB column, no value stored)

| fieldtype | Notes |
|-----------|-------|
| `Section Break` | Starts a new section; optional `label` becomes section heading |
| `Column Break` | Starts a new column within the current section |
| `Tab Break` | Starts a new tab; `label` becomes tab name |
| `HTML` | Static HTML snippet, `options` = HTML content |
| `Heading` | Bold heading row, `label` = heading text |
| `Button` | Clickable button (triggers JS) |
| `Image` | Displays an image from another field, `options` = fieldname |
| `Fold` | Collapses everything below it until end of form |

---

## Field Properties

All properties are optional unless marked **required**.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `fieldname` | string | **required** | Snake_case identifier. Must be unique within doctype. |
| `fieldtype` | string | **required** | One of the types above. |
| `label` | string | **required** (except layout) | Human-readable label shown in UI. |
| `options` | string | — | For `Link`: target DocType. For `Select`/`Autocomplete`: newline-separated values. For `Table`/`Table MultiSelect`: child DocType name. |
| `reqd` | 0/1 | `0` | Make field mandatory. |
| `hidden` | 0/1 | `0` | Hide from form UI (still in DB). |
| `read_only` | 0/1 | `0` | Non-editable in form. |
| `bold` | 0/1 | `0` | Show in bold in list/form. |
| `in_list_view` | 0/1 | `0` | Show column in list view and child table grid. |
| `in_standard_filter` | 0/1 | `0` | Show as filter in list view. |
| `in_global_search` | 0/1 | `0` | Include in global search index. |
| `search_index` | 0/1 | `0` | Add a DB index for this column (improves filter performance). |
| `unique` | 0/1 | `0` | Enforce unique constraint in DB. |
| `no_copy` | 0/1 | `0` | Do not copy this field when duplicating a document. |
| `default` | string | — | Default value as string (e.g. `"0"`, `"Today"`, `"Administrator"`). |
| `description` | string | — | Help text shown below the field. |
| `length` | int | `140` | Max length for `Data` fields (varchar size). |
| `precision` | string | — | Decimal places for `Float`/`Currency`/`Percent` (e.g. `"2"`). |
| `depends_on` | string | — | JS eval expression; field shown only when truthy. e.g. `"eval:doc.is_active"` |
| `mandatory_depends_on` | string | — | JS eval expression; field is mandatory only when truthy. |
| `read_only_depends_on` | string | — | JS eval expression; field is read-only only when truthy. |
| `collapsible` | 0/1 | `0` | Section Break only: section starts collapsed. |
| `collapsible_depends_on` | string | — | Section Break only: collapse condition expression. |
| `fetch_from` | string | — | Read Only only: `"link_fieldname.target_fieldname"` to auto-fetch value. |
| `fetch_if_empty` | 0/1 | `0` | Only fetch if field is currently empty. |
| `allow_in_quick_entry` | 0/1 | `0` | Include in Quick Entry dialog for this DocType. |
| `print_hide` | 0/1 | `0` | Hide in print formats. |
| `report_hide` | 0/1 | `0` | Hide in reports. |
| `translatable` | 0/1 | `0` | `Data` fields only: mark for translation. |
| `ignore_user_permissions` | 0/1 | `0` | `Link` fields: ignore user-level permission filters. |
| `remember_last_selected_value` | 0/1 | `0` | `Link`/`Select`: restore last selected value for new docs. |
| `show_days` | 0/1 | `1` | `Duration`: show days component. |
| `show_seconds` | 0/1 | `1` | `Duration`: show seconds component. |
| `permlevel` | int | `0` | Permission level (0 = normal; 1+ = protected; requires matching role permission). |

---

## DocType-Level Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | string | **required** | DocType name (title case, spaces allowed). |
| `module` | string | **required** | Module name (must exist in `tabModule Def`). |
| `doctype` | string | `"DocType"` | Always `"DocType"`. |
| `fields` | array | `[]` | Array of field definition objects. |
| `permissions` | array | `[]` | Array of permission objects (omit for `istable`). |
| `istable` | 0/1 | `0` | Child table. No permissions. No standalone form/list. |
| `issingle` | 0/1 | `0` | Singleton. No DB table rows. Stored in `tabSingles`. |
| `is_submittable` | 0/1 | `0` | Enables Submit/Cancel/Amend. Auto-adds `amended_from`. |
| `is_tree` | 0/1 | `0` | Hierarchical nested set (adds `lft`, `rgt`, `is_group`, parent field). |
| `is_virtual` | 0/1 | `0` | No DB table. Controller must implement data retrieval. |
| `custom` | 0/1 | `0` | Custom doctype (created via UI). Do not set for app-shipped doctypes. |
| `editable_grid` | 0/1 | `0` | Enables inline editing in child table grid view. |
| `grid_page_length` | int | `20` | Rows per page in child table grid. |
| `rows_threshold_for_grid_search` | int | `20` | Rows before search bar appears in grid. |
| `track_changes` | 0/1 | `0` | Enable document version history tracking. |
| `track_views` | 0/1 | `0` | Track which users viewed this document. |
| `title_field` | string | — | Fieldname to use as display title (shown in breadcrumb, link search). |
| `image_field` | string | — | Fieldname of an image to show as document thumbnail. |
| `search_fields` | string | — | Comma-separated fieldnames shown in Link search results. |
| `sort_field` | string | `"modified"` | Default sort column in list view. |
| `sort_order` | string | `"DESC"` | Default sort direction (`"ASC"` or `"DESC"`). |
| `default_print_format` | string | — | Name of the default print format. |
| `allow_import` | 0/1 | `0` | Allow data import via CSV. |
| `allow_copy` | 0/1 | `1` | Allow duplicating documents. |
| `allow_rename` | 0/1 | `0` | Allow renaming document name (changing primary key). |
| `in_create` | 0/1 | `0` | Show in the workspace "Create" shortcut menu. |
| `document_type` | string | `""` | UI classification: `"Document"`, `"Setup"`, `"Transaction"`, `"Other"`. |
| `naming_rule` | string | `"Random"` | See naming rules table. |
| `autoname` | string | — | Naming expression. See naming rules table. |
| `name_case` | string | — | `"Title Case"` or `"UPPER CASE"` — transforms the name on save. |
| `description` | string | — | Description shown in doctype list/documentation. |
| `icon` | string | — | Icon name (e.g. `"fa fa-user"` or Frappe icon). |
| `engine` | string | `"InnoDB"` | MariaDB storage engine. Almost always `"InnoDB"`. |
| `row_format` | string | `"Dynamic"` | MariaDB row format: `"Dynamic"`, `"Compressed"`, `"Redundant"`, `"Compact"`. |
| `max_attachments` | int | `0` | Max number of file attachments (0 = unlimited). |
| `hide_toolbar` | 0/1 | `0` | Hide the form toolbar (Customize, Print, etc.). |
| `index_web_pages_for_search` | 0/1 | `0` | Index for website search (requires `has_web_view` or website routes). |

---

## Permissions Object

```json
{
  "role": "System Manager",
  "permlevel": 0,
  "read": 1,
  "write": 1,
  "create": 1,
  "delete": 1,
  "submit": 0,
  "cancel": 0,
  "amend": 0,
  "email": 1,
  "print": 1,
  "report": 1,
  "export": 1,
  "import": 0,
  "share": 1,
  "if_owner": 0
}
```

| Property | Notes |
|----------|-------|
| `role` | **Required.** Role name (must exist in `tabRole`). |
| `permlevel` | `0` = document-level. `1`+ = field-level (matches field's `permlevel`). |
| `submit`, `cancel`, `amend` | Only meaningful when `is_submittable = 1`. |
| `if_owner` | Permission applies only when current user is the document owner. |
| `import` | Allow importing via Data Import. |

Multiple entries for the same role are allowed (e.g. one for permlevel 0, one for permlevel 1).

---

## Naming Rules

| `naming_rule` | `autoname` | When to use |
|---|---|---|
| `"Set by user"` | *(omit)* | Name is a visible, user-editable field (like a code or ID). |
| `"By fieldname"` | `"field:fieldname"` | Name equals the value of a specific field. |
| `"By script"` | *(omit or `"naming_series:"`)* | Controller sets `self.name` in `autoname()` hook. |
| `"Random"` | `"hash"` | Internal docs where name doesn't matter to users. |
| `"Autoincrement"` | `"autoincrement"` | Sequential integer IDs (name stored as bigint). |
| `"Expression (old style)"` | e.g. `"PROJ-.####"` | Legacy pattern-based naming. |
| `"Expression"` | e.g. `"format:PROJ-{YYYY}-{MM}-{####}"` | Modern expression-based naming. |

For `naming_series:` autoname, add a `naming_series` field (`fieldtype: "Select"`) with the series options.

---

## Common Patterns

### Link field pointing to another DocType
```json
{
  "fieldname": "customer",
  "fieldtype": "Link",
  "label": "Customer",
  "options": "Customer",
  "reqd": 1
}
```

### Select dropdown
```json
{
  "fieldname": "status",
  "fieldtype": "Select",
  "label": "Status",
  "options": "Draft\nActive\nClosed",
  "default": "Draft"
}
```

### Conditional visibility
```json
{
  "fieldname": "rejection_reason",
  "fieldtype": "Small Text",
  "label": "Rejection Reason",
  "depends_on": "eval:doc.status === 'Rejected'"
}
```

### Read Only fetched from Link
```json
{
  "fieldname": "customer_name",
  "fieldtype": "Read Only",
  "label": "Customer Name",
  "fetch_from": "customer.customer_name",
  "fetch_if_empty": 0
}
```

### Child table embedded in parent
```json
{
  "fieldname": "items",
  "fieldtype": "Table",
  "label": "Items",
  "options": "My Child DocType"
}
```

The child DocType must have `"istable": 1`.

### Section with columns
```json
{ "fieldname": "section_details", "fieldtype": "Section Break", "label": "Details" },
{ "fieldname": "column_break_left", "fieldtype": "Column Break" },
{ "fieldname": "field_a", "fieldtype": "Data", "label": "Field A" },
{ "fieldname": "column_break_right", "fieldtype": "Column Break" },
{ "fieldname": "field_b", "fieldtype": "Data", "label": "Field B" }
```

---

## Notes

- `field_order` in exported JSON is auto-generated from `fields` array order — do not set manually.
- Layout fields (`Section Break`, `Column Break`, `Tab Break`) must have **unique fieldnames** — use a suffix like `section_abc` or `column_break_xyz`. Frappe generates random suffixes when saving via UI; agents should choose descriptive names.
- Integer flags (`reqd`, `hidden`, `bold`, etc.) use `0`/`1`, not `true`/`false`.
- `null` values are stripped from exported JSON — omit properties you don't need rather than setting them to `null`.
- When `is_submittable = 1`, Frappe auto-adds an `amended_from` Link field pointing to the same DocType — do not add it manually.
- When `is_tree = 1`, Frappe auto-adds `lft`, `rgt`, `is_group`, and the parent field — do not add them manually.
