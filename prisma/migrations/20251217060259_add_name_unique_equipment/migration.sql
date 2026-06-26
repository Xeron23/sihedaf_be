/*
  Warnings:

  - A unique constraint covering the columns `[gymId,name]` on the table `Equipment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Equipment_gymId_name_key` ON `Equipment`(`gymId`, `name`);
