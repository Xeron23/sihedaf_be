-- AlterTable
ALTER TABLE `GymCashflow` ADD COLUMN `deletedById` INTEGER NULL,
    ADD COLUMN `updatedById` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `GymCashflow` ADD CONSTRAINT `GymCashflow_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GymCashflow` ADD CONSTRAINT `GymCashflow_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
