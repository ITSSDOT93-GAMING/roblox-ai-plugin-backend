import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => {
  res.send("Roblox AI Plugin backend is running.");
});

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({
    ok: false,
    error: message,
    ...extra,
  });
}

function extractTextFromResponse(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim() !== "") {
    return data.output_text;
  }

  if (Array.isArray(data?.output)) {
    const parts = [];

    for (const item of data.output) {
      if (!Array.isArray(item?.content)) continue;

      for (const content of item.content) {
        if (content?.type === "output_text" && typeof content?.text === "string") {
          parts.push(content.text);
        }
      }
    }

    const joined = parts.join("\n").trim();
    if (joined) return joined;
  }

  return "";
}

async function callOpenAI(instructions, input) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4",
      instructions,
      input,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || `OpenAI request failed with status ${response.status}`
    );
  }

  const text = extractTextFromResponse(data);

  if (!text) {
    throw new Error(
      `Model returned no text. Raw response: ${JSON.stringify(data).slice(0, 3000)}`
    );
  }

  return text;
}

app.post("/ai/run", async (req, res) => {
  try {
    const prompt = req.body?.prompt || "";
    const mode = req.body?.mode || "generate";
    const scriptType = req.body?.scriptType || "Script";
    const context = req.body?.context || "";

    if (!prompt.trim()) {
      return jsonError(res, 400, "Missing prompt");
    }

    const instructions = `
You are an expert Roblox Luau coding assistant.

Rules:
- Write only valid Roblox Luau code.
- Target script type: ${scriptType}
- Mode: ${mode}
- Prefer clean, production-ready Roblox patterns.
- Use Roblox services correctly.
- Return code only.
- Do not use markdown fences.
`.trim();

    const input = `
User request:
${prompt}

Extra context:
${context}
`.trim();

    const code = await callOpenAI(instructions, input);

    res.json({
      ok: true,
      mode,
      code,
    });
  } catch (err) {
    console.error("/ai/run failed:", err);
    jsonError(res, 500, "Generation failed", { details: String(err) });
  }
});

app.post("/ai/fix", async (req, res) => {
  try {
    const code = req.body?.code || "";
    const error = req.body?.error || "";
    const context = req.body?.context || "";

    if (!code.trim()) {
      return jsonError(res, 400, "Missing code");
    }

    const instructions = `
You are an expert Roblox Luau debugger.

Rules:
- Fix the code for Roblox Studio.
- Return the corrected Luau code first.
- After the code, add a short section starting with EXPLANATION:
- Do not use markdown fences.
- Preserve behavior unless the bug requires changing it.
`.trim();

    const input = `
Broken code:
${code}

Error message:
${error || "No error message provided."}

Extra context:
${context}
`.trim();

    const fixed = await callOpenAI(instructions, input);

    res.json({
      ok: true,
      fixed,
    });
  } catch (err) {
    console.error("/ai/fix failed:", err);
    jsonError(res, 500, "Fix failed", { details: String(err) });
  }
});

app.post("/ai/multifile", async (req, res) => {
  try {
    const prompt = req.body?.prompt || "";
    const projectType = req.body?.projectType || "Roblox system";
    const context = req.body?.context || "";

    if (!prompt.trim()) {
      return jsonError(res, 400, "Missing prompt");
    }

    const instructions = `
You are an expert Roblox architecture generator.

Return a JSON object with this exact shape:
{
  "files": [
    {
      "name": "FileName.lua",
      "path": "ServerScriptService/FileName.lua",
      "code": "-- Luau code here"
    }
  ],
  "notes": "short explanation"
}

Rules:
- Output valid JSON only.
- Generate realistic Roblox multi-file structure.
- Use Luau code in each file.
- Prefer ServerScriptService, StarterPlayer, ReplicatedStorage, and ModuleScripts when appropriate.
`.trim();

    const input = `
Project type:
${projectType}

User request:
${prompt}

Extra context:
${context}
`.trim();

    const raw = await callOpenAI(instructions, input);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return jsonError(res, 500, "Model returned invalid JSON", { raw });
    }

    res.json({
      ok: true,
      ...parsed,
    });
  } catch (err) {
    console.error("/ai/multifile failed:", err);
    jsonError(res, 500, "Multi-file generation failed", { details: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
