-- CreateTable
CREATE TABLE `GymCashflow` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `jumlah` DECIMAL(12, 2) NOT NULL,
    `type` ENUM('CASH', 'CASHLESS') NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
