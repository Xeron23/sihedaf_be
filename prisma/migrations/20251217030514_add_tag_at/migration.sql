-- AlterTable
ALTER TABLE `Equipment` ADD COLUMN `jumlah` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Gym` ADD COLUMN `tag` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `MembershipPackage` ADD COLUMN `benefit` JSON NULL;
