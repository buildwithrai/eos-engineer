export async function chat(messages, model = process.env.EOS_MODEL || "qwen2.5-coder:7b") {
  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      format: "json",
    }),
  });

  if (!res.ok) {
    throw new Error(`ollama error ${res.status}`);
  }

  const data = await res.json();
  return data.message;
}
