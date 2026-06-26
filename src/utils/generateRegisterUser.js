export function generatePassword() {
  // minimal 8, ada 1 huruf besar, ada 1 special
  // contoh: "Abcdef!1" (panjang 8)
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digit = "0123456789";
  const special = "!@#$%^&*";

  const pick = (s) => s[Math.floor(Math.random() * s.length)];

  // Susunan dijamin memenuhi regex:
  // 1 upper + 5 lower + 1 special + 1 digit = 8 char
  return (
    pick(upper) +
    pick(lower) + pick(lower) + pick(lower) + pick(lower) + pick(lower) +
    pick(special) +
    pick(digit)
  );
}

export function usernameFromEmail(email) {
  return String(email).split("@")[0];
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}