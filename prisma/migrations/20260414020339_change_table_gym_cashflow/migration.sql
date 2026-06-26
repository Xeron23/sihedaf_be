/*
  Warnings:

  - You are about to drop the column `jumlah` on the `gymcashflow` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `gymcashflow` table. All the data in the column will be lost.
  - Added the required column `amount` to the `GymCashflow` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cashflowType` to the `GymCashflow` table without a default value. This is not possible if the table is not empty.
  - Added the required column `date` to the `GymCashflow` table without a default value. This is not possible if the table is not empty.
  - Added the required column `gymId` to the `GymCashflow` table without a default value. This is not possible if the table is not empty.
  - Added the required column `transactionType` to the `GymCashflow` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `GymCashflow` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `GymCashflow` DROP COLUMN `jumlah`,
    DROP COLUMN `type`,
    ADD COLUMN `amount` DECIMAL(12, 2) NOT NULL,
    ADD COLUMN `cashflowType` ENUM('CASH', 'CASHLESS') NOT NULL,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `date` DATETIME(3) NOT NULL,
    ADD COLUMN `gymId` INTEGER NOT NULL,
    ADD COLUMN `note` VARCHAR(191) NULL,
    ADD COLUMN `transactionType` ENUM('PENDAPATAN', 'PENGELUARAN') NOT NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- CreateIndex
CREATE INDEX `GymCashflow_gymId_idx` ON `GymCashflow`(`gymId`);

-- CreateIndex
CREATE INDEX `GymCashflow_date_idx` ON `GymCashflow`(`date`);

-- AddForeignKey
ALTER TABLE `GymCashflow` ADD CONSTRAINT `GymCashflow_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
