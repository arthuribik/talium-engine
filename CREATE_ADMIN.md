# How to Create an Admin User

## Method 1: Using the Script (Recommended)

Run the script from the `api-engine` directory:

```bash
cd api-engine
npm run create-admin "John" "Doe" "admin@taldium.com" "AdminPass123!" "admin"
```

**Parameters:**
1. First Name
2. Last Name
3. Email
4. Password
5. Role (optional, default: "admin")
   - Options: `super_admin`, `admin`, `support`, `auditor`

**Example:**
```bash
npm run create-admin "Jane" "Smith" "jane@taldium.com" "SecurePass123!" "super_admin"
```

## Method 2: Using the Frontend

### Step 1: Create First Super Admin
1. Visit: `http://localhost:5173/admin/create-super-admin`
2. Fill in the form and create the first super admin

### Step 2: Login as Super Admin
1. Visit: `http://localhost:5173/admin/login`
2. Login with your super admin credentials

### Step 3: Invite New Admin
1. Go to Admin Dashboard
2. Click "Invite New Admin" button
3. Fill in the invitation form
4. The new admin will receive an invitation (currently logged to console)
5. They can complete onboarding at `/admin/onboarding/complete`

## Method 3: Using API Directly

### Create Super Admin (First Time Only)
```bash
curl -X POST http://localhost:5103/v1/admin/create-super-admin \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Admin",
    "lastName": "User",
    "email": "admin@taldium.com",
    "password": "AdminPass123!",
    "confirmPassword": "AdminPass123!"
  }'
```

### Invite Admin (Requires Super Admin Auth)
```bash
curl -X POST http://localhost:5103/v1/admin/users/invite \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@taldium.com",
    "role": "admin"
  }'
```

## Quick Start Example

```bash
# Create first super admin
cd api-engine
npm run create-admin "Super" "Admin" "superadmin@taldium.com" "SuperAdmin123!" "super_admin"

# Create regular admin
npm run create-admin "Regular" "Admin" "admin@taldium.com" "AdminPass123!" "admin"
```

## Login After Creation

Visit: `http://localhost:5173/admin/login`

Use the email and password you created.

