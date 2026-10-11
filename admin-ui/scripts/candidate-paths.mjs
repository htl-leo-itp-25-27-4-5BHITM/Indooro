import path from "node:path";
import { fileURLToPath } from "node:url";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repository = path.resolve(workspace, "..");

export const dist = path.join(workspace, "dist");
export const adminResources = path.join(repository, "backend/indooro_server/src/main/resources/META-INF/resources/admin");
export const candidate = path.join(adminResources, "next");
export const nestedEntries = ["stores", "stores/detail", "editor", "regions"];
