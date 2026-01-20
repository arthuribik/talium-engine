import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.log('Usage: ts-node create-admin.ts <firstName> <lastName> <email> <password> [role]');
    console.log('Role options: super_admin, admin, support, auditor (default: admin)');
    process.exit(1);
  }

  const [firstName, lastName, email, password, role = 'admin'] = args;

  try {
    // Check if email exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      console.error('Error: Email already exists');
      process.exit(1);
    }

    // Check if super_admin exists (if creating super_admin)
    if (role === 'super_admin') {
      const existingSuperAdmin = await prisma.admin.findFirst({
        where: { role: 'super_admin' },
      });

      if (existingSuperAdmin) {
        console.error('Error: Super admin already exists. Use invite endpoint instead.');
        process.exit(1);
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        userType: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        firstLogin: false,
      },
    });

    // Create admin profile
    const admin = await prisma.admin.create({
      data: {
        userId: user.id,
        role: role as any,
      },
    });

    console.log('✅ Admin user created successfully!');
    console.log(`   User ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Status: ${user.status}`);
    console.log('\n📧 Login credentials:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
  } catch (error) {
    console.error('Error creating admin:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();

