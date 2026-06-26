/*
  Warnings:

  - You are about to drop the column `isVerified` on the `gym` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Gym` DROP COLUMN `isVerified`,
    ADD COLUMN `verified` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING';
