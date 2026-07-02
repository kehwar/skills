# safe_exec API Reference

Complete catalog of globals available inside the **System Console** (`frappe.utils.safe_exec`). This covers the **base Frappe** namespace only. Custom apps extend this via the `safe_exec_globals` hook — see [APP-EXTENSIONS.md](APP-EXTENSIONS.md) for the scanning workflow.

## frappe namespace

### Document operations

| API | Description |
|-----|-------------|
| `frappe.new_doc(doctype, **kwargs)` | Create new document |
| `frappe.get_doc(doctype, name)` | Fetch existing document |
| `frappe.get_doc(dict)` | Create document from dict |
| `frappe.get_last_doc(doctype, filters, order_by)` | Get most recent document |
| `frappe.get_cached_doc(doctype, name)` | Fetch with caching |
| `frappe.get_meta(doctype)` | Get DocType metadata |
| `frappe.copy_doc(doc)` | Deep-copy a document |
| `frappe.get_list(doctype, filters, fields, order_by, limit_page_length, ...)` | List documents (respects permissions) |
| `frappe.get_all(doctype, ...)` | List documents (ignores permissions) |
| `frappe.get_all_docs(doctype, ...)` | Like `get_all`, but yields full Document instances instead of dicts |
| `frappe.rename_doc(doctype, old, new, ...)` | Rename document |
| `frappe.delete_doc(doctype, name, ...)` | Delete document |
| `frappe.get_mapped_doc(from_doctype, from_name, table_maps, ...)` | Map doc to another doctype |

### Messaging

| API | Description |
|-----|-------------|
| `frappe.msgprint(msg, title, ...)` | Show message in UI |
| `frappe.throw(msg, exc, title)` | Raise and show error |
| `frappe.errprint(msg)` | Print to browser devtools console |
| `frappe.log(msg)` | Append to `frappe.debug_log` |
| `frappe.sendmail(recipients, subject, message, ...)` | Send email |
| `frappe.get_print(doctype, name, print_format, ...)` | Get print HTML |
| `frappe.attach_print(doctype, name, ...)` | Get print as attachment dict |

### Formatting

| API | Description |
|-----|-------------|
| `frappe.format_value(value, df)` | Format value per field definition |
| `frappe.bold(text)` | Wrap in `<b>` tags |
| `frappe.render_template(template_string, context)` | Jinja render |
| `frappe.date_format` | Current date format string |
| `frappe.time_format` | Current time format string |

### HTTP requests (external)

| API | Description |
|-----|-------------|
| `frappe.make_get_request(url, **kwargs)` | HTTP GET |
| `frappe.make_post_request(url, **kwargs)` | HTTP POST |
| `frappe.make_put_request(url, **kwargs)` | HTTP PUT |
| `frappe.make_patch_request(url, **kwargs)` | HTTP PATCH |
| `frappe.make_delete_request(url, **kwargs)` | HTTP DELETE |

### Other frappe

| API | Description |
|-----|-------------|
| `frappe.call(function, **kwargs)` | Call a whitelisted function by dotted path |
| `frappe.enqueue(function, **kwargs)` | Enqueue background job (calls whitelisted function) |
| `frappe.get_hooks(hook, default, app_name)` | Read hooks (deep-copied) |
| `frappe.log_error(title, message)` | Create Error Log document |
| `frappe.sanitize_html(html)` | Sanitize HTML |
| `frappe.get_url()` | Site URL |
| `frappe.qb` | PyPika query builder |
| `frappe.flags` | Empty `_dict` for script-local flags |
| `frappe.user` | Current user email |
| `frappe.session.user` | Current user email |
| `frappe.session.csrf_token` | CSRF token |
| `frappe.full_name` | Current user full name |
| `frappe.request` | HTTP request object (if available) |
| `frappe.response` | Response dict (if available) |
| `frappe.form_dict` | Request form data |
| `frappe.lang` | Current language code |
| `frappe.socketio_port` | SocketIO port |
| `frappe.get_system_settings(key)` | Get System Settings value |
| `frappe.<ExceptionClass>` | All exception classes from `frappe.exceptions` |

## frappe.db

| API | Description |
|-----|-------------|
| `frappe.db.get_value(doctype, filters, fieldname, ...)` | Get field value(s) |
| `frappe.db.set_value(doctype, name, fieldname, value, ...)` | Set field value |
| `frappe.db.get_single_value(doctype, fieldname)` | Get Single doctype value |
| `frappe.db.get_default(key)` | Get default value |
| `frappe.db.get_list(doctype, ...)` | Alias for `frappe.get_list` |
| `frappe.db.get_all(doctype, ...)` | Alias for `frappe.get_all` |
| `frappe.db.exists(doctype, filters)` | Check existence |
| `frappe.db.count(doctype, filters)` | Count documents |
| `frappe.db.escape(value)` | Escape SQL value |
| `frappe.db.sql(query, values, as_dict)` | Execute **SELECT/EXPLAIN only** |
| `frappe.db.commit()` | Commit transaction |
| `frappe.db.rollback()` | Rollback transaction |
| `frappe.db.after_commit(fn)` | Register post-commit callback |
| `frappe.db.before_commit(fn)` | Register pre-commit callback |
| `frappe.db.after_rollback(fn)` | Register post-rollback callback |
| `frappe.db.before_rollback(fn)` | Register pre-rollback callback |
| `frappe.db.add_index(doctype, fields)` | Add DB index |

## frappe.utils (data utilities)

### Date/time

`DATE_FORMAT`, `TIME_FORMAT`, `DATETIME_FORMAT`, `is_invalid_date_string`, `getdate`, `get_datetime`, `to_timedelta`, `get_timedelta`, `add_to_date`, `add_days`, `add_months`, `add_years`, `date_diff`, `month_diff`, `time_diff`, `time_diff_in_seconds`, `time_diff_in_hours`, `now_datetime`, `get_timestamp`, `get_eta`, `get_system_timezone`, `convert_utc_to_timezone`, `convert_timezone_to_utc`, `convert_utc_to_system_timezone`, `now`, `nowdate`, `today`, `nowtime`, `get_first_day`, `get_quarter_start`, `get_quarter_ending`, `get_first_day_of_week`, `get_year_start`, `get_last_day_of_week`, `get_last_day`, `get_time`, `get_datetime_in_timezone`, `get_datetime_str`, `get_date_str`, `get_time_str`, `get_user_date_format`, `get_user_time_format`, `format_date`, `format_time`, `format_datetime`, `format_duration`, `get_weekdays`, `get_weekday`, `get_timespan_date_range`, `global_date_format`, `formatdate`

### Numbers

`flt`, `cint`, `floor`, `ceil`, `cstr`, `rounded`, `remainder`, `safe_div`, `round_based_on_smallest_currency_fraction`, `fmt_money`, `get_number_format_info`, `money_in_words`, `in_words`

### Strings and HTML

`encode`, `parse_val`, `is_html`, `is_image`, `strip_html`, `escape_html`, `pretty_date`, `comma_or`, `comma_and`, `comma_sep`, `new_line_sep`, `filter_strip_join`, `scrub_urls`, `expand_relative_urls`, `quoted`, `quote_urls`, `unique`, `strip`, `to_markdown`, `md_to_html`, `markdown`, `get_abbr`

### URLs

`get_url`, `get_host_name_from_request`, `url_contains_port`, `get_host_name`, `get_link_to_form`, `get_link_to_report`, `get_absolute_url`, `get_url_to_form`, `get_url_to_list`, `get_url_to_report`, `get_url_to_report_with_filters`

### Filters and comparison

`evaluate_filters`, `compare`, `get_filter`, `make_filter_tuple`, `make_filter_dict`, `sanitize_column`, `has_common`, `is_subset`

### Images and files

`get_thumbnail_base64_for_image`, `image_to_base64`, `pdf_to_base64`

### Other

`generate_hash`, `sha256_hash`, `get_user_info_for_avatar`, `get_month`, `get_fullname`, `get_gravatar`

## Top-level globals

| Global | Type | Description |
|--------|------|-------------|
| `json` | namespace | `json.loads(s)`, `json.dumps(obj)` |
| `as_json` | function | `frappe.as_json` |
| `dict` | type | Python `dict` |
| `_dict` | type | `frappe._dict` (dot-access dict) |
| `log` | function | `frappe.log` |
| `args` | dict | `frappe.local.form_dict` |
| `FrappeClient` | class | `frappe.frappeclient.FrappeClient` |
| `scrub` | function | `frappe.modules.scrub` |
| `html2text` | function | Convert HTML to plain text |
| `guess_mimetype` | function | `mimetypes.guess_type` |
| `run_script` | function | Run another Server Script by name |
| `is_job_queued` | function | Check if a job is queued |
| `get_visible_columns` | function | Get visible print columns |
| `get_toc` | function | Table of contents for web pages |
| `get_next_link` | function | Next page link for web pages |
| `_` | function | Translation function |
| `dev_server` | bool | Whether running in dev mode |
| `style.border_color` | string | `"#d1d8dd"` |
| `print()` | function | Collected output (shown as console result) |

## Python builtins

### From RestrictedPython safe_globals

These are always available (provided by RestrictedPython's `safe_globals`):

`None`, `False`, `True`, `abs`, `bool`, `bytes`, `callable`, `chr`, `complex`, `divmod`, `float`, `hash`, `hex`, `id`, `int`, `isinstance`, `issubclass`, `len`, `oct`, `ord`, `pow`, `range`, `repr`, `round`, `slice`, `sorted`, `str`, `tuple`, `zip`, plus all built-in exception classes (`ValueError`, `TypeError`, `KeyError`, etc.).

### Added by Frappe on top

`abs`, `all`, `any`, `bool`, `dict`, `enumerate`, `isinstance`, `issubclass`, `list`, `max`, `min`, `range`, `set`, `sorted`, `sum`, `tuple`

### Not available

`map`, `filter`, `reversed`, `next`, `bytearray`, `memoryview`, `frozenset`, `property`, `classmethod`, `staticmethod`, `super`, `type`, `object`, `getattr`, `setattr`, `delattr`, `hasattr`, `input`, `open`, `exec`, `eval`, `compile`, `globals`, `locals`, `vars`, `dir`, `breakpoint`, `__import__`

## SQL restrictions

`frappe.db.sql()` is wrapped by `read_sql()` which only allows:
- Queries starting with `SELECT`
- Queries starting with `EXPLAIN`
- CTE queries starting with `WITH` (MariaDB only)

All other SQL (INSERT, UPDATE, DELETE, DROP, etc.) raises `frappe.PermissionError`.


