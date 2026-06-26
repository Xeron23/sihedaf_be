/*
  Warnings:

  - You are about to alter the column `isVerified` on the `gym` table. The data in that column could be lost. The data in that column will be cast from `TinyInt` to `Enum(EnumId(1))`.

*/
-- AlterTable
ALTER TABLE `Gym` MODIFY `isVerified` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING';
