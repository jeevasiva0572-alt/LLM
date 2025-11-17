// server.js
import 'dotenv/config';
import OpenAI from "openai";
import express from "express";
import cors from "cors";
import fs from "fs";
import csv from "csv-parser";

const app = express();
app.use(cors());
app.use(express.json());

// =====================
// OPENAI CLIENT
// =====================
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =====================
// LOAD CSV FILE
// =====================
let data = [];

fs.createReadStream("C:/Users/HP/PycharmProjects/PythonProject/data_search/data/sales_data_part_1.csv")
  .pipe(csv())
  .on("data", (row) => data.push(row))
  .on("end", () => console.log("CSV Loaded:", data.length))
  .on("error", (err) => console.log("CSV Load Error:", err));

// =====================
// NLP → JSON FILTER
// =====================
async function englishToFilter(query) {
  const prompt = `
Convert this user query into pure JSON filters.
Return ONLY JSON. No backticks.

Example outputs:
{"Category":"Electronics"}
{"Region":"North"}
{"Profit_gt":5000}
{"Total_Sales_lt":20000}

User Query: "${query}"
`;

  const res = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  let text = res.output_text.trim();

  // 🔥 Remove ```json and ```
  text = text.replace(/```json/g, "")
             .replace(/```/g, "")
             .trim();

  return JSON.parse(text);
}

// =====================
// NORMALIZE KEYS
// =====================
function normalizeKey(key) {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

// =====================
// FILTER API
// =====================
app.post("/filter", async (req, res) => {
  try {
    const filters = await englishToFilter(req.body.query);

    console.log("🔍 Query:", req.body.query);
    console.log("🔧 Filters:", filters);

    let result = data;

    for (let key of Object.keys(filters)) {
      const cleanKey = normalizeKey(key);
      const rawValue = filters[key];
      const value = rawValue.toString().toLowerCase();

      // Numeric >
      if (cleanKey.endsWith("_gt")) {
        const col = cleanKey.replace("_gt", "");
        result = result.filter(r => Number(r[col]) > Number(rawValue));
        continue;
      }

      // Numeric <
      if (cleanKey.endsWith("_lt")) {
        const col = cleanKey.replace("_lt", "");
        result = result.filter(r => Number(r[col]) < Number(rawValue));
        continue;
      }

      // String match
      result = result.filter(r => {
        const rowVal = r[cleanKey]?.toString().toLowerCase();
        return rowVal?.includes(value);
      });
    }

    console.log("📌 Result Count:", result.length);
    res.json(result);

  } catch (err) {
    console.log("❌ FILTER ERROR:", err);
    res.json([]);
  }
});

// =====================
// START SERVER
// =====================
app.listen(5000, () => console.log("🔥 API running on port 5000"));
