# Architecture Audit

## Verified repository map

```text
ResumeIQ/
├── backend/                         Express/TypeScript API
│   ├── src/
│   │   ├── app.ts, index.ts          middleware, routes, startup
│   │   ├── modules/auth/             registration/login/refresh/logout/profile
│   │   ├── modules/uploads/          upload/list/get/delete/quota
│   │   ├── middleware/               JWT, errors, request logging
│   │   └── services/                 local storage, parser, Winston logging
│   ├── prisma/schema.prisma          schema used by backend Prisma commands
│   ├── tests/                        16 test/fixture/script files
│   └── Dockerfile
├── frontend/                         package.json and empty src/ only
├── database/                         second, divergent Prisma schema; empty migrations/
├── .github/workflows/                empty
├── docker-compose.yml                PostgreSQL, Redis, backend development services
├── .env / .env.example               runtime configuration
└── historical root documentation and ad-hoc JS test scripts
```

## Runtime topology

```text
Client -> Express :3000 -> Prisma -> PostgreSQL
                  -> local filesystem (/app/storage)
                  -> Winston console/files (logs/)
```

Redis is provisioned in Compose but no source code connects to it. The declared Gemini and AWS variables have no implementation in `backend/src`. The storage interface is local-only; selecting S3 throws an error.

## API inventory

| Method | Endpoint | Auth | Validation | Status |
|---|---|---:|---|---|
| GET | `/health` | No | none | Implemented; shallow liveness only |
| POST | `/api/auth/register` | No | Zod | Partial |
| POST | `/api/auth/login` | No | Zod | Partial |
| POST | `/api/auth/refresh-token` | No | Zod | Partial |
| POST | `/api/auth/logout` | No | Zod | Partial; not authenticated |
| GET | `/api/auth/profile` | JWT | token | Partial |
| POST | `/api/resumes/upload` | JWT | size/MIME/name/header | Partial; stores only |
| GET | `/api/resumes` | JWT | query values manually coerced | Partial |
| GET | `/api/resumes/:resumeId` | JWT | none | Partial; ownership check present |
| DELETE | `/api/resumes/:resumeId` | JWT | none | Partial; ownership check present |
| GET | `/api/resumes/quota/info` | JWT | none | Broken: registered after `/:resumeId` |

## Architecture conclusions

Implemented routing follows a recognisable controller/service/repository pattern, but the boundaries are incomplete. Each module instantiates its own `PrismaClient`; upload writes a file before it creates database rows and has no compensating cleanup. Parsing is not invoked by upload, no background job exists, and resume deletion does not delete the file. Documentation describes a broader SaaS design than the code implements.

The two schema files have different hashes and models. `backend/prisma/schema.prisma` is the only schema verified by `npx prisma validate`; `database/schema.prisma` and `database/seed.ts` are not connected to any package script. No migration SQL was found in `database/migrations/`.
