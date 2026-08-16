import { chat as ollamaChat } from "./ollama.js";

export async function chat(
  messages,
  model = process.env.EOS_MODEL || "qwen2.5-coder:7b"
) {
  return ollamaChat(messages, model);
}
