# Frontmatter Templates

> Reference for `issue-tracker` frontmatter blocks. Consult when writing a new ticket file.

### Basic ticket (issue)

```yaml
---
tags: [task]
task_ticket_id: 1
task_labels:
  - ticket
task_status: needs-triage
task_priority: none
task_blocked_by: []
task_projects: []
---
```

### Bug ticket (triaged)

```yaml
---
tags: [task]
task_ticket_id: 2
task_labels:
  - ticket
  - bug
task_status: ready-for-agent
task_priority: high
task_blocked_by: []
task_projects: []
raised_by: user@example.com
---
```

### Enhancement ticket

```yaml
---
tags: [task]
task_ticket_id: 3
task_labels:
  - ticket
  - enhancement
  - feature
task_status: needs-info
task_priority: normal
task_blocked_by: []
task_projects: []
---
```

### Spec

```yaml
---
tags: [task]
task_ticket_id: 4
task_labels:
  - spec
task_status: ready-for-agent
task_priority: none
task_blocked_by: []
task_projects: []
---
```

### Wayfinder map

```yaml
---
tags: [task]
task_ticket_id: 5
task_labels:
  - wayfinder:map
task_status: none
task_priority: none
task_blocked_by: []
task_projects: []
---
```

### Wayfinder research ticket (child of map above)

```yaml
---
tags: [task]
task_ticket_id: 6
task_labels:
  - wayfinder:research
task_status: needs-triage
task_priority: none
task_blocked_by: []
task_projects:
  - '[[TICKET-000005-sale-pipeline-spec]]'
---
```

### Ticket with blockers

```yaml
---
tags: [task]
task_ticket_id: 7
task_labels:
  - ticket
  - bug
task_status: needs-triage
task_priority: none
task_blocked_by:
  - 'TICKET-04-'
task_projects: []
---
```

### Closed (completed)

```yaml
---
tags: [task]
task_ticket_id: 8
task_labels:
  - ticket
  - bug
task_status: done
task_priority: none
task_blocked_by: []
task_projects: []
task_completed: 2026-07-09
---
```

### Closed (abandoned)

```yaml
---
tags: [task]
task_ticket_id: 9
task_labels:
  - ticket
task_status: canceled
task_priority: none
task_blocked_by: []
task_projects: []
---
```
