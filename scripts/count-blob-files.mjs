import path from "node:path";
import dotenv from "dotenv";
import { list } from "@vercel/blob";

const ROOT_DIR = process.cwd();

dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });

async function main() {
  let cursor;
  let total = 0;

  do {
    const page = await list({
      cursor,
      limit: 1000,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    total += Array.isArray(page.blobs) ? page.blobs.length : 0;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  console.log(total);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
