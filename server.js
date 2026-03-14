import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => {
  res.send("Roblox AI Plugin backend is running with OpenRouter.");
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

  if (Array.isArray(data?.choices) && data.choices[0]?.message?.content) {
    const content = data.choices[0].message.content;
    if (typeof content === "string" && content.trim() !== "") {
      return content;
    }
  }

  if (Array.isArray(data?.choices) && Array.isArray(data.choices[0]?.message?.content)) {
    const parts = [];
    for (const item of data.choices[0].message.content) {
      if (item?.type === "text" && typeof item?.text === "string") {
        parts.push(item.text);
      }
    }
    const joined = parts.join("\n").trim();
    if (joined) return joined;
  }

  return "";
}

async function callOpenRouter(systemPrompt, userPrompt, model = "openrouter/free") {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://render.com",
      "X-Title": "Roblox AI Plugin Backend"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      data?.message ||
      `OpenRouter request failed with status ${response.status}`
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

    const systemPrompt = `
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

    const userPrompt = `
User request:
${prompt}

Extra context:
${context}
`.trim();

    const code = await callOpenRouter(systemPrompt, userPrompt);

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

    const systemPrompt = `
You are an expert Roblox Luau debugger.

Rules:
- Fix the code for Roblox Studio.
- Return the corrected Luau code first.
- After the code, add a short section starting with EXPLANATION:
- Do not use markdown fences.
- Preserve behavior unless the bug requires changing it.
`.trim();

    const userPrompt = `
Broken code:
${code}

Error message:
${error || "No error message provided."}

Extra context:
${context}
`.trim();

    const fixed = await callOpenRouter(systemPrompt, userPrompt);

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

    const systemPrompt = `
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

    const userPrompt = `
Project type:
${projectType}

User request:
${prompt}

Extra context:
${context}
`.trim();

    const raw = await callOpenRouter(systemPrompt, userPrompt);

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
