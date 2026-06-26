import prisma from "../src/config/db.js";
import { hashPassword } from "../src/utils/passwordConfig.js";

async function main() {
console.log('🌱 Starting database seed...');

  const checkAdmin = await prisma.user.findFirst({
    where: {
      email: "admin@test.com"
    }
  });
  if(checkAdmin){
    await prisma.user.delete({
      where: {
        email: "admin@test.com"
      }
    })

  }

  await prisma.user.create({
    data: {
      username: "admin123",
      name: "admin",
      password: await hashPassword("Admin123!"),
      email: "admin@test.com",
      role: "ADMIN"
    }
  })
}

main()
  .catch((e) => console.error("❌ Error seeding quotes data:", e))
  .finally(async () => await prisma.$disconnect());
