# Translation Reference

## Validation

```bash
cd apps/<app>

# Verify PO file syntax
msgfmt --check <app>/locale/es_PE.po

# Check for fuzzy translations (need review)
grep -c '#, fuzzy' <app>/locale/es_PE.po

# Find fuzzy entries
grep -B 2 '#, fuzzy' <app>/locale/es_PE.po | grep msgid
```

## Find untranslated by source file

```bash
grep -A 2 "path/to/file.py" <app>/locale/es_PE.po | grep -A 1 'msgstr ""$'
```

## Force recompile

```bash
bench compile-po-to-mo --app <app> --locale es_PE --force
```

## Migrate from legacy CSV

```bash
bench migrate-csv-to-po --app <app> --locale es_PE
```

## Create a new locale

```bash
bench create-po-file es_PE --app <app>
```

## Key notes

- `msgstr ""` — string exists but untranslated
- Missing entry — string not extracted yet; regenerate POT first
- MO files land in `sites/assets/locale/<locale>/LC_MESSAGES/<app>.mo`, not inside the app
- `build-message-files` is for the legacy CSV translation system; do **not** run it after `compile-po-to-mo`
- `--site` is only needed when omitting `--app` (Frappe needs a site to discover installed apps)
- PO files must be UTF-8; raw UTF-8 characters preferred over escape sequences
