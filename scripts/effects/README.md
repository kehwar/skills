# Effects Layer

The Effects layer provides all externally-facing services (filesystem, git, logging)
that orchestrators depend on. This layer is built on the Effect library for
composable error handling and dependency injection.

## Quick Start

### Using Services in an Orchestrator

An orchestrator depends on services and uses them to accomplish its goal:

```typescript
// scripts/orchestrators/my-orchestrator.ts
import { MockFileSystem } from '../effects/mock-fs.js'
import { MockGitOps } from '../effects/mock-git-ops.js'

export function myOrchestrator(fs: MockFileSystem, git: MockGitOps) {
  fs.writeFileSync('/config.json', '{"branch": "main"}')
  const config = fs.readFileSync('/config.json', 'utf8')
  git.execSync('git status')
  return { config }
}
```

### Testing an Orchestrator

Tests inject mock services instead of real ones:

```typescript
// scripts/orchestrators/my-orchestrator.test.ts
import { MockFileSystem } from '../effects/mock-fs.js'
import { MockGitOps } from '../effects/mock-git-ops.js'
import { myOrchestrator } from './my-orchestrator.js'

it('should write config and run git', () => {
  const fs = new MockFileSystem()
  const git = new MockGitOps()

  // Set up mocks
  git.setCommandResult('git status', {
    stdout: 'On branch main',
    exitCode: 0
  })

  // Run orchestrator with mocks
  const result = myOrchestrator(fs, git)

  // Verify behavior
  expect(result.config).toBe('{"branch": "main"}')
})
```

### Running an Orchestrator in Production

CLI entry points compose real services and run orchestrators:

```typescript
// scripts/sync.ts entry point
import { createTestFileSystemLayer } from './effects/services.js'
import { createTestGitOpsLayer } from './effects/services.js'
import { myOrchestrator } from './orchestrators/my-orchestrator.js'

function main() {
  // In production, use real services here
  const fs = createTestFileSystemLayer() // TODO: Replace with RealFileSystem
  const git = createTestGitOpsLayer() // TODO: Replace with RealGitOps

  const result = myOrchestrator(fs, git)
  console.log(result)
}

main()
```

## Architecture

```
CLI Entrypoint (sync.ts, check.ts, etc.)
  ↓ composes services via Effect.provide()
Orchestrators (orchestrators/sync-all-upstreams.ts, orchestrators/check.ts, etc.)
  ↓ uses
Services/Effects (mock-fs.ts, mock-git-ops.ts, mock-logger.ts)
  ↓ calls
Core Primitives (no Effect dependencies)
```

## Services

Each service is:

- **A class** with methods for domain operations
- **Mockable** — tests inject MockXxx instead of RealXxx
- **Type-safe** — TypeScript enforces interface contracts
- **Composable** — orchestrators don't care which implementation

### MockFileSystem

In-memory filesystem for testing without disk I/O.

```typescript
const fs = new MockFileSystem()
fs.writeFileSync('/path/file.txt', 'content')
const content = fs.readFileSync('/path/file.txt', 'utf8')
```

### MockGitOps

Mock git command executor for testing without real git calls.

```typescript
const git = new MockGitOps()
git.setCommandResult('git fetch', { stdout: '...', exitCode: 0 })
const result = git.execSync('git fetch')
```

## Adding a New Service

1. **Create the service class** in `mock-servicename.ts`

   ```typescript
   /**
    * MockServiceName — Does something important.
    * [Include DI pattern docs...]
    */
   export class MockServiceName { ... }
   ```

2. **Create a test** in `mock-servicename.test.ts`
   - RED: Test fails (service not implemented)
   - GREEN: Minimal implementation to pass test
   - REFACTOR: Extract duplication

3. **Update services.ts**
   - Export Context tag
   - Add to `getTestServices()` factory
   - Document in the service definition section

4. **Run checks**
   ```bash
   pnpm typecheck  # verify types
   pnpm test       # verify tests pass
   pnpm lint:fix   # fix style issues
   ```

See [JSDoc-conventions.md](JSDoc-conventions.md) for documentation patterns.

## Files in This Layer

- `mock-fs.ts` — In-memory filesystem
- `mock-fs.test.ts` — FileSystem tests
- `mock-git-ops.ts` — Mock git executor
- `mock-git-ops.test.ts` — GitOps tests
- `services.ts` — Service composition and factories
- `service-composition.test.ts` — DI pattern tests
- `JSDoc-conventions.md` — Documentation patterns to follow

## Benefits of This Architecture

**Testability** — No global mocks. Inject test doubles via function parameters.

**Composability** — Services can be combined. New workflows reuse existing services.

**Clarity** — Data flow is explicit: services are parameters, not hidden globals.

**Type Safety** — TypeScript verifies all services exist at compile time.

**Observability** — Each service can add logging/tracing transparently.

**Recovery** — Service implementations can retry, timeout, and handle errors.

## Future Slices

Planned services to add in future slices:

- `real-fs.ts` — Real filesystem (production)
- `real-git-ops.ts` — Real git executor (production)
- `mock-logger.ts` — Mock logger for structured logging
- `real-logger.ts` — Real logger with file/console output
- `process.ts` — Subprocess execution
- `retry.ts` — Retry logic with exponential backoff
