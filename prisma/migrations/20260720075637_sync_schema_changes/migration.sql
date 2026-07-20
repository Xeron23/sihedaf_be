-- AlterTable
ALTER TABLE `Device` ADD COLUMN `batteryLevel` INTEGER NULL;

-- AlterTable
ALTER TABLE `Measurement` ADD COLUMN `confidenceLevel` DOUBLE NULL,
    ADD COLUMN `resultClass` INTEGER NULL,
    ADD COLUMN `resultLabel` VARCHAR(191) NULL;
