export interface VendorSkillMeta {
  /** GitHub HTTPS clone URL */
  source: string
  /** Map of path-within-submodule to output skill name in skills/ */
  skills: Record<string, string>
}

/**
 * Raw documentation repos. Submoduled under sources/<name>.
 * Skills are generated manually (LLM + instructions/<name>.md) and committed to skills/.
 */
export const sources: Record<string, string> = {}

/**
 * Pre-built skill repos. Submoduled under vendor/<name>.
 * The sync script copies specified skill folders into skills/.
 */
export const vendors: Record<string, VendorSkillMeta> = {
  antfu: {
    source: 'https://github.com/antfu/skills',
    skills: {
      'skills/antfu': 'antfu',
      'skills/nuxt': 'nuxt',
      'skills/pinia': 'pinia',
      'skills/pnpm': 'pnpm',
      'skills/vite': 'vite',
      'skills/vitest': 'vitest',
      'skills/vue': 'vue',
    },
  },
  mattpocock: {
    source: 'https://github.com/mattpocock/skills',
    skills: {
      'skills/productivity/caveman': 'caveman',
      'skills/engineering/diagnose': 'diagnose',
      'skills/productivity/grill-me': 'grill-me',
      'skills/engineering/grill-with-docs': 'grill-with-docs',
      'skills/engineering/improve-codebase-architecture': 'improve-codebase-architecture',
      'skills/engineering/tdd': 'tdd',
      'skills/engineering/to-issues': 'to-issues',
      'skills/engineering/to-prd': 'to-prd',
      'skills/productivity/write-a-skill': 'write-a-skill',
      'skills/engineering/zoom-out': 'zoom-out',
      'skills/engineering/triage': 'triage',
    },
  },
  anthropics: {
    source: 'https://github.com/anthropics/skills',
    skills: {
      'skills/pdf': 'pdf',
    },
  },
  lucifer1004: {
    source: 'https://github.com/lucifer1004/claude-skill-typst',
    skills: {
      'skills/typst': 'typst',
    },
  },
  noartem: {
    source: 'https://github.com/noartem/laravel-vue-skills',
    skills: {
      'skills/shadcn-vue': 'shadcn-vue',
    },
  },
  silvainfm: {
    source: 'https://github.com/silvainfm/claude-skills',
    skills: {
      'duckdb': 'duckdb',
    },
  },
  'vuejs-ai': {
    source: 'https://github.com/vuejs-ai/skills',
    skills: {
      'skills/vue-best-practices': 'vue-best-practices',
      'skills/vue-testing-best-practices': 'vue-testing-best-practices',
    },
  },
  vueuse: {
    source: 'https://github.com/vueuse/skills',
    skills: {
      'skills/vueuse-functions': 'vueuse-functions',
    },
  },
}

/**
 * Manually authored skills committed directly in skills/.
 * Never overwritten by the sync process.
 */
export const manual: string[] = [
  'dev-log',
  'frappe-app-include-js',
  'frappe-customizations-baker',
  'frappe-customizations-writer',
  'frappe-dev-debugger',
  'frappe-doctype-controller',
  'frappe-doctype-form-view',
  'frappe-doctype-list-view',
  'frappe-doctype-schema',
  'frappe-doctype-tests',
  'frappe-js-api',
  'frappe-live-code-extractor',
  'frappe-restore-latest-backup-task',
  'frappe-run-tests',
  'frappe-standard-script-report-controller',
  'frappe-standard-script-report-schema',
  'frappe-standard-script-report-view',
  'frappe-system-console',
  'frappe-translations-writer',
  'sap-di-api-expert',
  'sap-dtw-expert',
  'sap-schema-expert',
  'sap-service-layer-expert',
  'sap-transaction-notifications',
  'typst-syntax-expert',
]
