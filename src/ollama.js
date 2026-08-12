const EOS_RESPONSE_SCHEMA = {
oneOf: [
{
type: "object",
properties: {
type: { const: "tool" },
tool: {
type: "string",
enum: ["read_file", "read_files"]
},
input: {
type: "object"
}
},
required: ["type", "tool", "input"],
additionalProperties: false
},
{
type: "object",
properties: {
type: { const: "judgment" },
judgment: {
type: "array",
items: {
type: "object",
properties: {
claim: { type: "string" },
type: {
type: "string",
enum: ["declared", "candidate", "blocked"]
},
confidence: {
type: "string",
enum: ["high", "medium", "low"]
},
evidence_refs: {
type: "array",
items: { type: "string" }
}
},
required: [
"claim",
"type",
"confidence",
"evidence_refs"
],
additionalProperties: false
}
},
restrictions: {
type: "array",
items: { type: "string" }
}
},
required: ["type", "judgment", "restrictions"],
additionalProperties: false
}
]
};

export async function chat(
  messages,
  model = process.env.EOS_MODEL || "qwen2.5-coder:7b"
) {
  const res = await fetch(
    "http://localhost:11434/api/chat",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        format: EOS_RESPONSE_SCHEMA,
        options: {
          temperature: 0
        }
      })
    }
  );

  if (!res.ok) {
    throw new Error(`ollama error ${res.status}`);
  }

  const data = await res.json();
  return data.message;
}
