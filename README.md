# Taldium API Engine

NestJS-based API engine for the Taldium platform.

## Tech Stack

- **NestJS** - Progressive Node.js framework
- **PostgreSQL** - Database
- **Prisma** - ORM
- **Swagger** - API documentation
- **JWT** - Authentication

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

Update the `.env` file with your database credentials:
```
DATABASE_URL="postgresql://user:password@localhost:5432/taldium?schema=public"
JWT_SECRET="your-secret-key-change-in-production"
JWT_EXPIRES_IN="3600"
REFRESH_TOKEN_SECRET="your-refresh-secret-key-change-in-production"
REFRESH_TOKEN_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=development
```

3. Set up the database:
```bash
npx prisma generate
npx prisma migrate dev
```

4. Start the development server:
```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`
Swagger documentation will be available at `http://localhost:3000/docs`

## API Endpoints

All endpoints are prefixed with `/v1`

### Authentication
- `POST /v1/auth/register` - Register as professional
- `POST /v1/auth/createbusiness` - Register as organisation
- `POST /v1/auth/login` - Login
- `POST /v1/auth/forgot-password` - Request password reset
- `POST /v1/auth/reset-password` - Reset password
- `GET /v1/auth/verify-email?token=...` - Verify email

### Admin
- `POST /v1/admin/users/invite` - Invite admin (Super Admin only)
- `POST /v1/admin/onboarding/complete` - Complete admin onboarding

### Organisations
- `PUT /v1/organisations/:orgId/setup` - Complete organisation setup
- `POST /v1/organisations/:orgId/verification/request` - Request verification

### Professionals
- `POST /v1/professionals/:profId/identity/verify` - Verify identity
- `POST /v1/professionals/:profId/education` - Add education
- `POST /v1/professionals/:profId/experience` - Add work experience
- `GET /v1/professionals/:profId/setup/status` - Get profile completion status

### Jobs
- `POST /v1/jobs/draft?organisationId=...` - Create job draft
- `GET /v1/jobs` - List all jobs
- `GET /v1/jobs/:jobId` - Get job details
- `POST /v1/jobs/:jobId/apply` - Apply to job
- `PUT /v1/jobs/:jobId/publish` - Publish job

## Folder Structure

```
src/
├── admin/          # Admin module
├── app/            # Application modules
│   ├── auth/       # Authentication
│   ├── organisation/
│   ├── professional/
│   └── job/
└── utility/        # Shared utilities
    ├── prisma/
    └── jwt/
```

