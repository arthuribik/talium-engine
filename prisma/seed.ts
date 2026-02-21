import { AdminRole, PrismaClient, UserStatus, UserType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seeding...');

  try {
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123';
    const email = 'admin@taldium.com';
    const role = 'super_admin';

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
        console.error(
          'Error: Super admin already exists. Use invite endpoint instead.',
        );
        process.exit(1);
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create super admin
    console.log(`🌱 Creating super admin...`);

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          password: hashedPassword,
          firstName: 'Super',
          lastName: 'Admin',
          status: UserStatus.ACTIVE,
          userType: UserType.ADMIN,
          emailVerified: true,
          firstLogin: false,
        },
      });

      await tx.admin.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          role: AdminRole.super_admin,
        },
      });
    });
    console.log('✅ Super admin created');
  } catch (error) {
    console.error('Error running seeding:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
