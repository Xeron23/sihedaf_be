import fs from 'fs';
import path from 'path';

function generateEmailIndoTemplate(verificationUrl) {
    return `
      <!DOCTYPE html>
      <html lang="id">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Verifikasi Akun</title>
              <style>
                  body {
                      font-family: 'Poppins', sans-serif;
                      background-color: #f4f4f4;
                      text-align: center;
                  }
                  .container {
                      width: 500px;
                      background: #144B75;
                      padding: 20px;
                      margin: 30px auto;
                      border-radius: 10px;
                      box-shadow: 0px 4px 10px rgba(0,0,0,0.2);
                      color: white;
                  }
                  .logo {
                      width: 150px;
                      margin-bottom: 20px;
                  }
                  .btn {
                      display: inline-block;
                      background: #2196F3;
                      padding: 12px 24px;
                      text-decoration: none;
                      color: white;
                      border-radius: 5px;
                      margin-top: 20px;
                      font-weight: bold;
                  }
                  .btn:hover {
                      background: #1E88E5;
                  }
              </style>
          </head>
          <body>
              <div class="container">
                //   <img src="${process.env.BE_URL}/assets/images/logo.png" class="logo" alt="Logo">
                  <h2>Verifikasi Akun Anda</h2>
                  <p>Silakan klik tombol di bawah ini untuk memverifikasi email Anda dan mulai menggunakan layanan kami.</p>
                  <a href="${verificationUrl}" class="btn">Verifikasi Sekarang</a>
                  <p>Jika Anda tidak meminta ini, abaikan email ini.</p>
              </div>
          </body>
      </html>
    `;
}

function generateEmailEnglishTemplate(verificationUrl) {
    return `
      <!DOCTYPE html>
      <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Verify Your Account</title>
              <style>
                  body {
                      font-family: 'Arial', sans-serif;
                      background-color: #eef2f3;
                      text-align: center;
                  }
                  .container {
                      width: 480px;
                      background: #061525;
                      padding: 20px;
                      margin: 30px auto;
                      border-radius: 10px;
                      box-shadow: 0px 4px 10px rgba(0,0,0,0.2);
                      color: white;
                  }
                  .logo {
                      width: 140px;
                      margin-bottom: 20px;
                  }
                  .btn {
                      display: inline-block;
                      background: #ff9800;
                      padding: 12px 24px;
                      text-decoration: none;
                      color: white;
                      border-radius: 5px;
                      margin-top: 20px;
                      font-weight: bold;
                  }
                  .btn:hover {
                      background: #fb8c00;
                  }
              </style>
          </head>
          <body>
              <div class="container">
                  <img src="${logo}" class="logo" alt="Logo">
                  <h2>Verify Your Email</h2>
                  <p>Please click the button below to verify your email and start using our services.</p>
                  <a href="${verificationUrl}" class="btn">Verify Now</a>
                  <p>If you did not request this, please ignore this email.</p>
              </div>
          </body>
      </html>
    `;
}

function generateVerifEmail(verificationUrl) {
    return `
      <!DOCTYPE html>
      <html lang="id">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Email Verifikasi</title>
              <style>
                  body {
                      font-family: 'Roboto', sans-serif;
                      background-color: #e3f2fd;
                      text-align: center;
                  }
                  .container {
                      width: 500px;
                      background: #0d47a1;
                      padding: 25px;
                      margin: 40px auto;
                      border-radius: 12px;
                      box-shadow: 0px 4px 12px rgba(0,0,0,0.3);
                      color: white;
                  }
                  .logo {
                      width: 160px;
                      margin-bottom: 20px;
                  }
                  .btn {
                      display: inline-block;
                      background: #ff3d00;
                      padding: 14px 28px;
                      text-decoration: none;
                      color: white;
                      border-radius: 6px;
                      margin-top: 20px;
                      font-weight: bold;
                  }
                  .btn:hover {
                      background: #d32f2f;
                  }
              </style>
          </head>
          <body>
              <div class="container">
                  <img src="/public/assets/images/logo.png" class="logo" alt="Logo">
                  <h2>Email Verification</h2>
                  <p>We are excited to have you on board! Please verify your email to activate your account.</p>
                  <a href="${verificationUrl}" class="btn">Verify Email</a>
                  <p>This link will expired on 5 minute</p>
                  <p>If you didn’t request this, you can safely ignore this email.</p>
              </div>
          </body>
      </html>
    `;
}

export {
    generateEmailIndoTemplate,
    generateEmailEnglishTemplate,
    generateVerifEmail,
};
