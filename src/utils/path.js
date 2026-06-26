import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

// Fallback untuk runtime yang tidak mendukung import.meta.url
export const __filename = process.cwd();
export const __dirname = dirname(__filename);
