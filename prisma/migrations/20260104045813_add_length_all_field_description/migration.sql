-- AlterTable
ALTER TABLE `Equipment` MODIFY `description` MEDIUMTEXT NULL;

-- AlterTable
ALTER TABLE `EquipmentHistory` MODIFY `description` MEDIUMTEXT NULL;

-- AlterTable
ALTER TABLE `Gym` MODIFY `description` MEDIUMTEXT NOT NULL;
