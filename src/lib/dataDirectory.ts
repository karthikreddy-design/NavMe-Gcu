import "server-only";
import path from "node:path";

export const dataDirectory = process.env.NAVME_DATA_DIR || path.join(process.cwd(), ".data");
