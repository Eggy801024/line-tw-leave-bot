# Database Schema

PostgreSQL schema for the future LINE Bot employee side, Web App manager backend, and database version of the leave system.

## Tables

```text
teams
employees
employee_line_users
leave_types
leave_requests
leave_attachments
admins
audit_logs
```

## Key Rules

- `teams` stores the four classes and shift hours.
- `employees` stores worker ID, name, class, shift, and optional LINE user ID.
- `employee_line_users` allows one LINE account to be associated with multiple employees.
- `leave_requests` stores the actual leave records used by the Web App.
- `leave_attachments` stores sick-leave proof links.
- `admins` stores Web App and LINE manager access.

## First Migration Order

Run in order:

```text
db/migrations/001_init.sql
db/migrations/002_updated_at_triggers.sql
```

## Render PostgreSQL

After creating a Render PostgreSQL database, Render will provide:

```text
DATABASE_URL
```

Keep the current Google Sheets bot running while this database is built and tested.
