import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("src/posters/fonts");
const destination = resolve("dist/posters/fonts");

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
