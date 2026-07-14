const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
      const user = await prisma.user.findFirst();
      console.log(user);
  } catch(e) { console.error(e); }
}
run();
