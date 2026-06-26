import admin from "firebase-admin";

function getFirebaseServiceAccount() {
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!serviceAccountBase64) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH is missing");
  }

  return JSON.parse(
    Buffer.from(serviceAccountBase64.trim(), "base64").toString("utf8")
  );
}

const serviceAccount = getFirebaseServiceAccount();

if (!admin.apps.length) {
    admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;