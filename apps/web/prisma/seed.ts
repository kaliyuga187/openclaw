import { PrismaClient, ProjectStatus, TaskStatus, TaskPriority, InvoiceStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('changeme123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin',
      role: 'ADMIN',
      passwordHash,
    },
  });

  const project = await prisma.project.upsert({
    where: { id: 'seed-project-1' },
    update: {},
    create: {
      id: 'seed-project-1',
      name: 'Sample Website Build',
      description: 'Marketing site redesign for Acme Co.',
      status: ProjectStatus.ACTIVE,
      client: 'Acme Co.',
      hourlyRate: 12500,
      ownerId: admin.id,
    },
  });

  await prisma.task.createMany({
    data: [
      {
        title: 'Design homepage hero',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        projectId: project.id,
        assigneeId: admin.id,
      },
      {
        title: 'Set up CI pipeline',
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        projectId: project.id,
        assigneeId: admin.id,
      },
      {
        title: 'Write contact form copy',
        status: TaskStatus.DONE,
        priority: TaskPriority.LOW,
        projectId: project.id,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.invoice.upsert({
    where: { number: 'INV-0001' },
    update: {},
    create: {
      number: 'INV-0001',
      ownerId: admin.id,
      projectId: project.id,
      client: 'Acme Co.',
      email: 'billing@acme.example',
      status: InvoiceStatus.DRAFT,
      currency: 'usd',
      amountCents: 250000,
      items: {
        create: [
          { description: 'Design — 10h', quantity: 10, unitCents: 12500 },
          { description: 'Development — 10h', quantity: 10, unitCents: 12500 },
        ],
      },
    },
  });

  console.log('Seed complete. Login: admin@example.com / changeme123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
