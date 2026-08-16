import { runEos } from "./src/runtime/run.js";

const workspace = process.argv[2] || process.cwd();
const input = process.argv[3];

if (!input) {
  console.error("usage: node eos-run.js <workspace> <request>");
  process.exit(1);
}

try {
  const surface = await runEos(input, { workspace });
  console.log("\n=== EOS JUDGMENT SURFACE ===");
  console.log(JSON.stringify(surface, null, 2));
} catch (err) {
  console.error("EOS error:", err.message);
  process.exit(1);
}
