---
name: frappe-app-include-js
description: Expert guidance for writing always-loaded desk JavaScript in Frappe apps — utilities and controllers that are available across every desk page. Use when adding a reusable JS namespace, wrapping frappe.call in a utility function, registering app_include_js in hooks.py, or writing shared logic that multiple doctypes or pages need. NOT for per-doctype form/list JS (use frappe-doctype-form-view or frappe-doctype-list-view instead).
---

# frappe-app-include-js

Covers the **always-loaded desk layer** — JS that registers once via `app_include_js` and is available globally throughout the desk session. Do **not** use this for doctype-specific JS:

| What you're writing | Skill to use |
|---|---|
| Shared utility, always available on desk | **this skill** |
| Doctype form hooks (`refresh`, `validate`, …) | `frappe-doctype-form-view` |
| List view buttons / indicators | `frappe-doctype-list-view` |
| Script Report filters / formatter | `frappe-standard-script-report-view` |

---

## 1 — Registering your bundle in hooks.py

```python
# <app>/hooks.py
app_include_js = "<app_name>.bundle.js"   # string, or list of strings
```

`app_include_js` loads on **every desk page** (i.e. `/app/*`). The value is the **dist filename** produced by the Frappe asset pipeline — not a source path.

A single entry point is the norm. Multiple entries are only needed when you must split load order explicitly.

---

## 2 — Bundle entry file

Create one entry file at `<app>/public/js/<app_name>.bundle.js`. Its job is to import source modules and call their patch/setup functions. Nothing else belongs here.

```js
// <app>/public/js/<app_name>.bundle.js
import { applyFooBatches } from '../custom/utils/foo'
import { applyBarPatches } from '../custom/utils/bar'

applyFooPatches()
applyBarPatches()
```

Each imported module runs its `frappe.provide` call and attaches to the global namespace as a side-effect of `apply*()` being called.

> For simpler apps: the import itself can be the side effect — if the file does not export anything, just `import './tweaks/async_tasks'` is fine and the `frappe.provide + $.extend` block runs on load.

---

## 3 — Namespace naming rule

Always namespace under `<app_name>.<feature>`:

```
soldamundo.pricing   ← soldamundo app, pricing feature
tweaks.async_tasks   ← tweaks app, async_tasks feature
myapp.shipping       ← myapp, shipping feature
```

Never extend `frappe.*` from a custom app (that is reserved for the framework).

---

## 4 — Pattern A: Stateless utility namespace (`frappe.provide` + `$.extend`)

Use for a collection of stateless functions that any form, report, or page can call.

```js
// <app>/public/js/<app>/utils/pricing.js

frappe.provide('<app_name>.pricing')

$.extend(<app_name>.pricing, {
    format_price: function (value, currency) {
        return frappe.format(value, { fieldtype: 'Currency', options: currency })
    },

    get_price: function (item_code, price_list, callback) {
        frappe.call({
            method: '<app_name>.api.pricing.get_price',
            args: { item_code, price_list },
            callback: (r) => callback(r.message),
        })
    },
})
```

Called from anywhere on the desk:

```js
<app_name>.pricing.format_price(1500, 'PEN')
<app_name>.pricing.get_price('ITEM-001', 'Standard', (price) => console.log(price))
```

---

## 5 — Pattern B: Stateful controller (`frappe.provide` + class)

Use when the utility needs to hold instance state (e.g. wraps a `frm` or `dialog`).

```js
// <app>/public/js/<app>/utils/form_utils.js

frappe.provide('<app_name>.form')

<app_name>.form.Utils = class Utils {
    constructor(source) {
        this.source = source
        this.is_form = !!(source.doctype && source.docname)
        this.is_dialog = !this.is_form
    }

    async set_values(values, { if_missing = false } = {}) {
        if (this.is_form) {
            return this.source.set_value(values, null, if_missing)
        }
        return this.source.set_values(values)
    }
}
```

Instantiated from a form controller:

```js
// inside a doctype .js file
const utils = new <app_name>.form.Utils(frm)
await utils.set_values({ status: 'Approved' })
```

---

## 6 — Hybrid: ES module export + internal `frappe.provide`

When using a Vite/esbuild bundle, combine ES module exports (for tree-shaking) with `frappe.provide` (for global access). This is the pattern used in soldamundo.

```js
// <app>/custom/utils/pricing.js

frappe.provide('<app_name>.pricing')

$.extend(<app_name>.pricing, {
    format_price(value, currency) { ... },
    get_price(item_code, price_list, cb) { ... },
})

// Named export so the bundle entry can call it
export function applyPricingPatches() {
    // frappe.provide + $.extend already ran at module evaluation time.
    // This function exists only so the bundle entry has an explicit call to check.
}
```

```js
// <app>/public/js/<app_name>.bundle.js
import { applyPricingPatches } from '../../custom/utils/pricing'
applyPricingPatches()
```

---

## 7 — Wrapping `frappe.call` inside a namespace function

**Always wrap `frappe.call` in a named function** rather than inlining the method path at the call site. This:
- centralises the whitelisted method string in one place
- lets callers stay ignorant of the server module path
- makes the usage readable (`<app>.shipping.get_rates(...)` vs raw `frappe.call(...)`)

```js
frappe.provide('<app_name>.shipping')

$.extend(<app_name>.shipping, {
    // Convention: one function per whitelisted server method.
    // The method string is a constant – never duplicate it.
    get_rates: function (args, callback) {
        return frappe.call({
            method: '<app_name>.api.shipping.get_rates',
            args: args,
            callback: callback,
        })
    },

    // For async/await callers, return the frappe.call promise directly.
    fetch_carriers: function (country) {
        return frappe.call({
            method: '<app_name>.api.shipping.get_carriers',
            args: { country },
        })
        // caller: const r = await <app_name>.shipping.fetch_carriers('PE')
    },
})
```

---

## 8 — `frappe.realtime` listeners in a namespace

When a utility subscribes to realtime events, always clean up inside the same wrapper so the listener is co-located with the subscription:

```js
$.extend(<app_name>.tasks, {
    watch: function (task_name, handler) {
        const _handler = ({ name, status }) => {
            if (name !== task_name) return
            handler({ name, status })
            if (['Finished', 'Failed', 'Canceled'].includes(status)) {
                frappe.realtime.off('<app_name>_event', _handler)
            }
        }
        frappe.realtime.on('<app_name>_event', _handler)
    },
})
```

---

## 9 — File & directory layout

```
<app>/
  hooks.py                          ← app_include_js registered here
  public/
    js/
      <app_name>.bundle.js          ← single bundle entry point
  custom/                           ← (or public/js/<app>/)
    utils/
      foo.js                        ← frappe.provide('<app>.<foo>') + $.extend
      bar.js                        ← frappe.provide('<app>.<bar>') + class
```

One file per feature namespace. One `frappe.provide` call per file.

---

## 10 — Checklist for a new shared utility

- [ ] Create `custom/utils/<feature>.js` (or `public/js/<app>/<feature>.js`)
- [ ] `frappe.provide('<app_name>.<feature>')` at the top of the file
- [ ] Attach methods via `$.extend(<app_name>.<feature>, { ... })`  
      — or assign a class: `<app_name>.<feature>.Controller = class { ... }`
- [ ] Wrap every `frappe.call` in a named function; keep the method string as a constant
- [ ] Export `export function apply<Feature>Patches() {}` if using the hybrid pattern
- [ ] Import and call `apply<Feature>Patches()` from `<app_name>.bundle.js`
- [ ] Verify `app_include_js = "<app_name>.bundle.js"` is in `hooks.py`
- [ ] Run `bench build --app <app_name>` to compile and test
