# Database Schema vs Migrations

## Prisma Schema (`database/schema.prisma`)

The **schema** defines what your data looks like:
- `User` model: email, name, password, subscription
- `Resume` model: filename, content, versions
- `ResumeVersion` model: optimized content, scores, changes
- And so on...

**Think of it like**: "Here's what fields exist in our database"

## Prisma Migrations (`database/migrations/`)

**Migrations** are the actual SQL commands that change the database:
- `migration1.sql`: "Create users table with these columns"
- `migration2.sql`: "Add subscription_id column to users"
- `migration3.sql`: "Create resume table with these columns"
- And so on...

**Think of it like**: "Here's the step-by-step SQL changes to make"

## How They Work Together

```
You edit schema.prisma
        ↓
You run: prisma migrate dev
        ↓
Prisma generates SQL migration file
        ↓
Migration runs automatically
        ↓
Database is updated
        ↓
@prisma/client is regenerated
```

## Why Prisma Migrations?

✅ **Version Control**: Track every database change
✅ **Consistency**: Same migrations run everywhere (local, staging, prod)
✅ **Rollback**: Can revert migrations if needed
✅ **Team Sync**: Everyone gets the same database changes
✅ **Safety**: Migrations have checks (can't delete live data without explicit migration)

## First Migration (When We Run)

When you run `npm run db:migrate` for the first time:

1. Prisma reads `database/schema.prisma`
2. Creates initial migration folder: `database/migrations/0_init/`
3. Generates SQL to create all tables
4. Runs the migration
5. Database is ready to use!

## Example: When We Add a New Field

```prisma
// Edit schema.prisma - add phoneNumber to User model
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  phoneNumber String? // ← NEW FIELD
  ...
}
```

Then:
```bash
npm run db:migrate
```

Prisma will:
1. Create a new migration: `002_add_phone_to_user.sql`
2. Run it automatically
3. Add the phoneNumber column to the database

That's it! No manual SQL needed.

## Current Status

**schema.prisma**: ✅ Created (defines 8 models)
**Migrations**: ⏳ Will run when Docker starts or when you run `npm run db:migrate`

Next: Database will auto-migrate when backend starts!
