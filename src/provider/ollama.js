export const EOS_RESPONSE_SCHEMA = {
oneOf: [
{
type: "object",
properties: {
type: { const: "tool" },
tool: { const: "read_file" },
input: {
type: "object",
properties: {
path: { type: "string" }
},
required: ["path"],
additionalProperties: false
}
},
required: ["type", "tool", "input"],
additionalProperties: false
},
{
type: "object",
properties: {
type: { const: "tool" },
tool: { const: "read_files" },
input: {
type: "object",
properties: {
paths: {
type: "array",
items: { type: "string" }
}
},
required: ["paths"],
additionalProperties: false
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
change: {
type: "object",
properties: {
target: { type: "string" },
objective: { type: "string" },
scope: {
type: "object",
properties: {
changed: {
type: "array",
items: { type: "string" }
},
created: {
type: "array",
items: { type: "string" }
},
unchanged: {
type: "array",
items: { type: "string" }
}
},
required: ["changed", "created", "unchanged"],
additionalProperties: false
},
predicates: {
type: "array",
items: {
type: "object",
properties: {
path: { type: "string" },
contains: { type: "string" }
},
required: ["path", "contains"],
additionalProperties: false
}
},
restrictions: {
type: "array",
items: { type: "string" }
},
requested_actor: { type: "string" }
},
required: ["target", "objective", "scope"],
additionalProperties: false
},
restrictions: {
type: "array",
items: { type: "string" }
}
},
required: ["type", "judgment", "restrictions"],
additionalProperties: false
},
{
type: "object",
properties: {
type: { const: "plan" },
adopt: {
type: "array",
items: { type: "string" }
},
waive: {
type: "array",
items: {
type: "object",
properties: {
path: { type: "string" },
reason: { type: "string" }
},
required: ["path", "reason"],
additionalProperties: false
}
}
},
required: ["type"],
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
      })    }
  );

  if (!res.ok) {
    throw new Error(`ollama error ${res.status}`);
  }

  const data = await res.json();
  return data.message;
}
