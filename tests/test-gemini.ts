import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

async function test() {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
        console.log("Generating...");
        await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: 'Hello'
        });
        console.log("SUCCESS text");
    } catch (e) {
        console.error("Error text:", (e as Error).message);
    }
}
test();
