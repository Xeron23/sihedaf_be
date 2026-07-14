const fs = require('fs');
const filePath = '/opt/projects/sihedaf_be/src/domains/measurement/measurement.service.js';

let code = fs.readFileSync(filePath, 'utf8');

// Replace part:
const oldPart = `        // [PROTOTYPE MODE]
        // Jika sedang presentasi dan hanya ada 1 jam fisik, kita "memaafkan" kalau akun B 
        // merebut jam milik akun A.
        if (existingUser && existingUser.id !== userId) {
            // Nanti kalau production, UNCOMMENT line di bawah ini:
            // throw BaseError.badRequest("This device is already registered by another account.");
        }

        // Bind device ke User
        await prisma.user.update({
            where: { id: userId },
            data: { deviceId: device.id }
        });`;

const newPart = `        // Cek apakah perangkat sedang melakukan pengukuran (IN_PROGRESS)
        const activeMeasurement = await prisma.measurement.findFirst({
            where: { deviceId: device.id, status: "IN_PROGRESS" }
        });

        if (activeMeasurement) {
            throw BaseError.badRequest("Jam sedang digunakan untuk pengukuran oleh pengguna lain. Harap tunggu hingga selesai.");
        }

        // [PROTOTYPE MODE]
        // Jika sedang presentasi dan hanya ada 1 jam fisik, kita mengizinkan akun B 
        // merebut jam milik akun A. Kita harus melepas jam dari akun A terlebih dahulu.
        if (existingUser && existingUser.id !== userId) {
            // Nanti kalau production, GANTI blok ini dengan:
            // throw BaseError.badRequest("This device is already registered by another account.");
            
            await prisma.user.update({
                where: { id: existingUser.id },
                data: { deviceId: null }
            });
        }

        // Bind device ke User saat ini
        await prisma.user.update({
            where: { id: userId },
            data: { deviceId: device.id }
        });`;

if (code.includes('// [PROTOTYPE MODE]')) {
    code = code.replace(oldPart, newPart);
    fs.writeFileSync(filePath, code);
    console.log("SUCCESS");
} else {
    console.log("NOT FOUND");
}
