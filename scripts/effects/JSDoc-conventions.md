# Effect-Based Service JSDoc Conventions

This file documents the standard JSDoc patterns used across all services
in the scripts/ directory. Follow these patterns when adding new services.

## Pattern 1: Service Class Header

Every service class should start with a JSDoc block explaining:

- What the service does
- Why it exists (benefits vs. direct use)
- The DI pattern it demonstrates
- How it's used

Template:

````typescript
/**
 * ServiceName — Brief description of what this service does.
 *
 * ## Dependency Injection Pattern
 *
 * This class demonstrates the DI pattern for effects-based services:
 * - **Service Interface**: Provides X operations compatible with Y
 * - **Testability**: Tests inject this mock instead of the real version
 * - **Effect Context**: Implementations are composed via Effect.provide()
 *
 * Example:
 * ```typescript
 * // In production:
 * const Service = new RealServiceName()
 *
 * // In tests:
 * const Service = new MockServiceName()
 *
 * // Orchestrator uses Either, doesn't know which is real:
 * const result = service.doSomething()
 * ```
 *
 * ## Context Shape
 *
 * Services export a Context tag for use in Effect layers:
 * ```typescript
 * export const ServiceTag = Context.Tag<MockServiceName>()
 * ```
 */
export class ServiceName { ... }
````

## Pattern 2: Method Headers

Every public method should have JSDoc explaining:

- What it does (one-line summary)
- Parameters and their types
- Return value and its type
- Any side effects
- Exceptions it might throw

Template:

```typescript
/**
 * Short description of what this method does.
 * Additional context if needed.
 *
 * @param paramName — Description of the parameter
 * @returns Description of the return value
 * @throws ErrorType if [condition]
 */
methodName(paramName: Type): ReturnType {
  // implementation
}
```

## Pattern 3: Service Composition Documentation

When a file creates or composes multiple services, include a section
explaining the architecture:

````typescript
/**
 * Service Composition and Dependency Injection Layer
 *
 * This file demonstrates the Effect-based DI pattern.
 *
 * ## Architecture Overview
 *
 * ```
 * CLI Layer (entry points: sync.ts, check.ts, etc.)
 *   ↓
 * Orchestrators Layer (orchestration logic)
 *   ↓
 * Effects Layer (services) ← YOU ARE HERE
 *   ↓
 * Core Layer (primitives, no Effect dependencies)
 * ```
 */
````

## Pattern 4: Context Tag Documentation

When exporting Context tags, explain their purpose:

```typescript
/**
 * Context tags for dependency injection.
 * Used with Effect.service() in orchestrators to request a service.
 * This allows swapping test doubles for real implementations.
 */
export const ServiceTag = Context.Tag<ServiceImpl>('ServiceName')
```

## Checklist for New Services

When adding a new service (e.g., Logger, FileSystem, GitOps):

- [ ] Create class with header JSDoc explaining DI pattern
- [ ] Add `@param` and `@returns` JSDoc for all public methods
- [ ] Create Context.Tag with matching name
- [ ] Add `getTest*` factory function in services.ts
- [ ] Add corresponding test file (mock-servicename.test.ts)
- [ ] Document in services.ts under "Service Definition Pattern"
- [ ] Run `pnpm typecheck` to verify
- [ ] Run `pnpm test` to verify

## Example: Complete Service

See scripts/effects/mock-fs.ts for a complete example with:

- Service class with full DI pattern documentation
- Public methods with parameter/return documentation
- Context tag for dependency injection
