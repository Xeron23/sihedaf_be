/*
  Warnings:

  - Added the required column `latitude` to the `Gym` table without a default value. This is not possible if the table is not empty.
  - Added the required column `longitude` to the `Gym` table without a default value. This is not possible if the table is not empty.
  - Made the column `maxCapacity` on table `gym` required. This step will fail if there are existing NULL values in that column.
  - Made the column `address` on table `gym` required. This step will fail if there are existing NULL values in that column.
  - Made the column `jamOperasional` on table `gym` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `Gym` ADD COLUMN `latitude` DECIMAL(65, 30) NOT NULL,
    ADD COLUMN `longitude` DECIMAL(65, 30) NOT NULL,
    MODIFY `maxCapacity` INTEGER NOT NULL,
    MODIFY `address` VARCHAR(191) NOT NULL,
    MODIFY `jamOperasional` VARCHAR(191) NOT NULL;
