import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Roblox AI Plugin backend is running.");
});

app.post("/generate", async (req, res) => {
  try {
    const prompt = req.body.prompt || "";

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.1",
        input: `Write Roblox Luau code for this request:\n${prompt}`
      })
    });

    const data = await response.json();
    const output = data.output_text || "-- no code generated";

    res.json({ code: output });

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
