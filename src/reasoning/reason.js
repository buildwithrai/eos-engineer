import { normalizeJson } from "../runtime/context.js";

export async function reason({
  messages,
  chatFn,
  iteration,
}) {
  const response = await chatFn(messages);

  console.log(`\n=== EOS ITERATION ${iteration} MODEL RESPONSE ===`);
  console.log(response?.content ?? "(empty)");

  try {
    return {
      ok: true,
      response,
      parsed: JSON.parse(normalizeJson(response?.content ?? "")),
    };
  } catch {
    return {
      ok: false,
      response,
      parsed: null,
      error: "Invalid JSON",
    };
  }
}
