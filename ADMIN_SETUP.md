# Admin Setup Guide

## Creating the First Super Admin

To create the first super admin account, use the following endpoint or the frontend interface:

### Option 1: Using Frontend
1. Navigate to: `http://localhost:5173/admin/create-super-admin`
2. Fill in the form with:
   - First Name
   - Last Name
   - Email
   - Password (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char)
   - Confirm Password

### Option 2: Using API
```bash
POST http://localhost:5103/v1/admin/create-super-admin
Content-Type: application/json

{
  "firstName": "Admin",
  "lastName": "User",
  "email": "admin@taldium.com",
  "password": "AdminPass123!",
  "confirmPassword": "AdminPass123!"
}
```

## Admin Login

### Frontend
1. Navigate to: `http://localhost:5173/admin/login`
2. Enter admin email and password
3. You'll be redirected to the admin dashboard

### API
```bash
POST http://localhost:5103/v1/auth/login
Content-Type: application/json

{
  "email": "admin@taldium.com",
  "password": "AdminPass123!"
}
```

## Admin Dashboard Features

Once logged in, admins can access:

1. **Dashboard** - Overview statistics
   - Total users, organisations, professionals
   - Total jobs and applications
   - Verification status counts

2. **Users** - Manage all users
   - View all users
   - Activate/Suspend users
   - View user details

3. **Organisations** - Manage organisations
   - View all organisations
   - Approve organisation verifications
   - View organisation details

4. **Professionals** - Manage professionals
   - View all professionals
   - View verification status
   - View profile completeness

5. **Jobs** - Manage job postings
   - View all jobs
   - See applicants count
   - View job details

## Admin Endpoints

All admin endpoints require authentication (Bearer token):

- `POST /v1/admin/create-super-admin` - Create first super admin (no auth required)
- `POST /v1/admin/users/invite` - Invite new admin (Super Admin only)
- `POST /v1/admin/onboarding/complete` - Complete admin onboarding
- `GET /v1/admin/dashboard/stats` - Get dashboard statistics
- `GET /v1/admin/users` - Get all users (paginated)
- `GET /v1/admin/organisations` - Get all organisations (paginated)
- `GET /v1/admin/professionals` - Get all professionals (paginated)
- `GET /v1/admin/jobs` - Get all jobs (paginated)
- `PUT /v1/admin/users/:userId/activate` - Activate a user
- `PUT /v1/admin/users/:userId/suspend` - Suspend a user
- `PUT /v1/admin/organisations/:orgId/verify` - Approve organisation verification
- `PUT /v1/admin/professionals/:profId/verify/:type/:verificationId` - Approve professional verification

## Admin Roles

- **super_admin** - Full system access, can invite other admins
- **admin** - Standard admin access
- **support** - Limited support access
- **auditor** - Read-only access to audit logs

