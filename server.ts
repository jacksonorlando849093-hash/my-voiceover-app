import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

// Ensure the API key helper
let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment variables. Please add it via the Settings menu.");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// WAV header encoder for raw PCM 16-bit linear audio data
function pcmToWav(pcmBuffer: Buffer, sampleRate: number = 24000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const fileSize = 36 + dataSize;

  const header = Buffer.alloc(44);

  // RIFF identifier
  header.write("RIFF", 0);
  // file length
  header.writeUInt32LE(fileSize, 4);
  // RIFF type
  header.write("WAVE", 8);
  // format chunk identifier
  header.write("fmt ", 12);
  // format chunk length
  header.writeUInt32LE(16, 16);
  // sample format (1 for raw PCM)
  header.writeUInt16LE(1, 20);
  // channel count
  header.writeUInt16LE(numChannels, 22);
  // sample rate
  header.writeUInt32LE(sampleRate, 24);
  // byte rate
  header.writeUInt32LE(byteRate, 28);
  // block align
  header.writeUInt16LE(blockAlign, 32);
  // bits per sample
  header.writeUInt16LE(bitsPerSample, 34);
  // data chunk identifier
  header.write("data", 36);
  // data chunk length
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API router - check health
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", apiKeyConfigured: !!process.env.GEMINI_API_KEY });
  });

  // API: AI Dialogue Generator
  app.post("/api/generate-script", async (req, res) => {
    try {
      const { description, speakerCount } = req.body;
      if (!description) {
        return res.status(400).json({ error: "Script prompt/description is required." });
      }

      console.log(`Generating script dialogue for prompt: "${description}" with speakers: ${speakerCount || 2}`);

      const userPrompt = `
Generate a dialogue script based on the following:
Description/Topic: "${description}"
Approximate Speaker Count: ${speakerCount || 2}

Please structure the dialgoue to have multiple exchanges. Include descriptive emotional settings for each speaker's line so that text-to-speech rendering is lively.
Return a structured JSON object containing a title, of character objects with an id, a name, a recommended prebuilt voice (must be one of: Puck, Charon, Kore, Fenrir, Zephyr), a descriptive avatarSeed, and a short description. Explain the character style as well. Then a list of chronological dialogue line objects that reference characterId, text, and emotion.
`;

      const response = await getAIClient().models.generateContent({
        model: "gemini-3.5-flash",
        contents: userPrompt,
        config: {
          systemInstruction: "You are an expert dramatic playwright and script editor. Always structure emotional cues clearly and cleanly.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              characters: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: "Uniquely identifying string (e.g. speaker_A, speaker_B)" },
                    name: { type: Type.STRING, description: "The name of the character" },
                    voice: { type: Type.STRING, description: "The vocal persona to use. Must be EXACTLY one of: Puck, Charon, Kore, Fenrir, Zephyr. Assign them diverse voices!" },
                    avatarSeed: { type: Type.STRING, description: "A seed word to generate a unique visual avatar (e.g. gamer, builder, scientist)" },
                    description: { type: Type.STRING, description: "A short context description about this person's role or style." }
                  },
                  required: ["id", "name", "voice", "avatarSeed", "description"]
                }
              },
              lines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    characterId: { type: Type.STRING, description: "The id of the character speaking" },
                    text: { type: Type.STRING, description: "The dialogue text to speak" },
                    emotion: { type: Type.STRING, description: "A short emotional tone cue for speech synthesis (e.g., Excited, Angry, Fearful, Melancholy, Confident, Whispering, Warm)" }
                  },
                  required: ["characterId", "text", "emotion"]
                }
              }
            },
            required: ["title", "characters", "lines"]
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No response text returned from script generation.");
      }

      const scriptJson = JSON.parse(responseText.trim());
      res.json(scriptJson);
    } catch (error: any) {
      console.error("Script generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate AI script." });
    }
  });

  // API: AI Auto-Assign Character Voices based on Prompt guidelines
  app.post("/api/auto-assign-voices", async (req, res) => {
    try {
      const { characters, prompt, availableVoices } = req.body;
      if (!characters || !Array.isArray(characters)) {
        return res.status(400).json({ error: "Characters list is required for auto-assigning voices." });
      }
      if (!prompt) {
        return res.status(400).json({ error: "Casting prompt guideline is required." });
      }

      console.log(`Auto-assigning voices for ${characters.length} character(s) with prompt: "${prompt}"`);

      const voicesData = (availableVoices || []).map((v: any) => ({
        id: v.id,
        name: v.name,
        gender: v.gender,
        category: v.category,
        subCategory: v.subCategory,
        description: v.description,
        tags: v.tags
      }));

      const userPrompt = `
We have a movie/podcast casting script containing the following characters:
${JSON.stringify(characters, null, 2)}

The user has provided the following creative casting guidelines and instructions:
"${prompt}"

We have the following rich global directory of available prebuilt voices for selection:
${JSON.stringify(voicesData, null, 2)}

Instructions:
1. For each character, analyze their name, description, gender, and current attributes.
2. Carefully read the user's casting guidelines. If they specify certain voices or accents (for example: Nigerian accents like Chidi, Amina, Yomi, Zainab), prioritize selecting those matching options from the directory.
3. Assign the absolute best-matching voice to each character. The assigned voice 'name' MUST exist exactly in the provided available prebuilt voices list (e.g. "Chidi (Lagos Gentleman)", "Amina (Abuja Professional)", "Zephyr", etc.).
4. Return a structured JSON containing a list of 'assignments'. Each assignment must contain 'characterId' and the matched 'voice' name. ALL characterId values from the characters list must have an assignment.
`;

      const response = await getAIClient().models.generateContent({
        model: "gemini-3.5-flash",
        contents: userPrompt,
        config: {
          systemInstruction: "You are an elite Hollywood casting director and vocal supervisor. You perfectly understand accents, moods, character archetypes, and voice characteristics.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              assignments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    characterId: { type: Type.STRING, description: "The ID of the character" },
                    voice: { type: Type.STRING, description: "The EXACT 'name' parameter value of the chosen PrebuiltVoice" }
                  },
                  required: ["characterId", "voice"]
                }
              }
            },
            required: ["assignments"]
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No response returned from voice assignment generator.");
      }

      res.json(JSON.parse(responseText.trim()));
    } catch (error: any) {
      console.error("AI auto-assign-voices error:", error);
      res.status(500).json({ error: error.message || "Failed to auto-assign voice profiles." });
    }
  });

  // API: AI Realistic Cinematic Character Portrait Generator
  app.post("/api/generate-portrait", async (req, res) => {
    try {
      const { name, avatarSeed, voice } = req.body;
      
      // Map vocal genders to guide photorealism portrait prompt
      const isVoiceMale = ["Fenrir", "Charon"].includes(voice || "");
      const genderTerm = isVoiceMale ? "man" : "woman";

      const promptText = `A stunning, professional studio headshot of a fictional, safe-for-work cinematic actor (${genderTerm}) named ${name || "Unknown"}.
Style: Realistic movie screenshot, gorgeous dramatic lighting, cinematic atmosphere, headshot profile picture, professional digital camera, 8k resolution.
Vibe and styling features: ${avatarSeed || "creative lead"}.
IMPORTANT: Make this a completely fictional, anonymous human face representation. Do NOT base this on or represent any real celebrity, public figure, or copyrighted person. Face clearly visible, centered, neutral-to-soft-styled expression.`;

      console.log(`Generating AI realistic portrait for character: ${name} (vibe: ${avatarSeed})`);

      const response = await getAIClient().models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [{ text: promptText }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      let base64Image: string | undefined;

      const parts = response.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            base64Image = part.inlineData.data;
            break;
          }
        }
      }

      if (!base64Image) {
        console.error("No base64 data generated by gemini-2.5-flash-image for portrait prompt.");
        throw new Error("No image data returned from Gemini API.");
      }

      res.json({ imageUrl: `data:image/png;base64,${base64Image}` });
    } catch (error: any) {
      console.error("AI portrait generation error:", error);
      res.status(500).json({ error: error.message || "Fictional portrait synthesis failed." });
    }
  });

  // API: AI Script Emotion Detector
  app.post("/api/detect-script-emotions", async (req, res) => {
    try {
      const { lines } = req.body;
      if (!lines || !Array.isArray(lines)) {
        return res.status(400).json({ error: "Lines array is required." });
      }

      console.log(`Detecting script emotions for ${lines.length} lines`);

      const prompt = `
Analyze the following dialogue lines from a script. For each line, classify the speaker's emotional state or tone as exactly one of the permitted emotional tags: "Neutral", "Happy", "Angry", "Sad", "Whispering", "Excited", "Scared".
Do not return any extra talking or wrapper other than the JSON object mapping key-value pairs matching lineId to the classified emotion.

Dialogue Lines:
${JSON.stringify(lines.map(l => ({ id: l.id, text: l.text })), null, 2)}

Return a structured JSON object where keys are the dialogue line ids and values are corresponding emotional tags.
`;

      const response = await getAIClient().models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an expert script director and vocal coach. Classify dialogue tones with extreme realism and precision. Always choose exactly one of 'Neutral', 'Happy', 'Angry', 'Sad', 'Whispering', 'Excited', 'Scared'.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {},
            additionalProperties: { type: Type.STRING }
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No response returned from the emotion detection model.");
      }

      res.json(JSON.parse(responseText.trim()));
    } catch (error: any) {
      console.error("AI script emotions detector error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze script emotions." });
    }
  });

  // API: Individual Character Text-To-Speech Synthesis
  app.post("/api/tts", async (req, res) => {
    try {
      const { text, voice, emotion, model } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Text is required to perform synthesis." });
      }

      const speakVoice = voice || "Zephyr";
      const speakEmotion = emotion || "Neutral";
      let modelName = model || "gemini-3.1-flash-tts-preview";
      if (modelName === "gemini-2.5-flash-preview-tts" || modelName.includes("gemini-2.5")) {
        modelName = "gemini-3.1-flash-tts-preview";
      }

      // Dynamically resolve custom voices mapping corresponding to data.ts
      const profiles = [
        { name: "Fenrir", baseVoice: "Fenrir", tonePrompt: "warm, natural, friendly conversational resonance" },
        { name: "Charon", baseVoice: "Charon", tonePrompt: "grave, serious, slow authoritative dramatic tone" },
        { name: "Zephyr", baseVoice: "Zephyr", tonePrompt: "natural, soft, clear conversational female voice" },
        { name: "Kore", baseVoice: "Kore", tonePrompt: "crisp, articulate, professional corporate executive female voice" },
        { name: "Puck", baseVoice: "Puck", tonePrompt: "high-spirited, energetic, dynamic animated female voice" },
        
        { name: "Oliver (Angry Warlord)", id: "v_ang_m1", baseVoice: "Charon", tonePrompt: "furious, talking in an angry gravelly tone, aggressive and screaming with rage" },
        { name: "Garrick (Hostile Grunt)", id: "v_ang_m2", baseVoice: "Fenrir", tonePrompt: "hostile, aggressive, shouting, loud and angry stern male expression" },
        { name: "Arthur (Jolly Grandpa)", id: "v_hap_m1", baseVoice: "Fenrir", tonePrompt: "jolly, chuckling, extremely happy and warm male voice, smiling dialogue" },
        { name: "Leo (Excited Agent)", id: "v_hap_m2", baseVoice: "Fenrir", tonePrompt: "highly energetic, happy, bright grinning male voice, animated speech" },
        { name: "Julian (Soft Whisperer)", id: "v_sof_m1", baseVoice: "Fenrir", tonePrompt: "very gentle, hushed whisper, quiet soft low-volume male voice" },
        { name: "Nico (Calm Narrator)", id: "v_sof_m2", baseVoice: "Charon", tonePrompt: "calm, relaxed, very soft slow-paced soothing speech, mindful narrative tone" },
        
        { name: "Sylvia (Scathing Queen)", id: "v_ang_w1", baseVoice: "Kore", tonePrompt: "scathing, sharp, cold aggressive angry female voice, snarky and stern tone" },
        { name: "Freya (Enraged Rebel)", id: "v_ang_w2", baseVoice: "Puck", tonePrompt: "screaming, furious, hot-tempered and highly enraged aggressive female voice" },
        { name: "Chloe (Cheerful Buddy)", id: "v_hap_w1", baseVoice: "Puck", tonePrompt: "giggling, bright, ecstatic happy female voice, bubbly and laughing dialogue" },
        { name: "Elena (Bright Guide)", id: "v_hap_w2", baseVoice: "Zephyr", tonePrompt: "optimistic, smiling, warm happy female voice, bright and encouraging" },
        { name: "Seraphina (Whispering Angel)", id: "v_sof_w1", baseVoice: "Zephyr", tonePrompt: "very soft, comforting whisper, quiet gentle delicate female voice" },
        { name: "Celeste (Gentle Healer)", id: "v_sof_w2", baseVoice: "Kore", tonePrompt: "soothing, soft, peaceful friendly slow female speech" },
        
        { name: "Toby (Playful Little Boy)", id: "v_kid_1", baseVoice: "Puck", tonePrompt: "cute playful young 7-year-old boy's voice, high-pitched, childish speech style" },
        { name: "Lily (Sweet Little Girl)", id: "v_kid_2", baseVoice: "Zephyr", tonePrompt: "cute sweet young 5-year-old little girl's voice, very high-pitched, cute innocent talk" },
        { name: "Leo (Anxious Toddler)", id: "v_kid_3", baseVoice: "Puck", tonePrompt: "anxious young child's voice, whiny and cute, high-pitched, worried little kid stuttering" },
        { name: "Mia (Quiet Gentle Child)", id: "v_kid_4", baseVoice: "Kore", tonePrompt: "shy quiet young child, very soft gentle slow talk, high-pitched innocent kid voice" },
        
        { name: "Chidi (Lagos Gentleman)", id: "v_ng_m1", baseVoice: "Fenrir", tonePrompt: "warm, clear, friendly adult male speaking with a rich, authentic Nigerian accent (Lagos style), precise West African cadence" },
        { name: "Yomi (Lively Lagos Guy)", id: "v_ng_m2", baseVoice: "Fenrir", tonePrompt: "lively, highly energetic, animated young adult male speaking with an energetic, authentic Nigerian accent, smiling friendly tone" },
        { name: "Amina (Abuja Professional)", id: "v_ng_w1", baseVoice: "Kore", tonePrompt: "clear, warm, articulate professional adult female speaking with a clear, elegant Nigerian accent, thoughtful and friendly delivery" },
        { name: "Zainab (Cheerful Lagos Sister)", id: "v_ng_w2", baseVoice: "Zephyr", tonePrompt: "bubbly, cheerful, highly expressive young adult female speaking with a sweet, lively Nigerian accent, smiling expression with expressive West African pacing" }
      ];

      const norm = speakVoice.toLowerCase().trim();
      const matched = profiles.find(p => 
        p.name.toLowerCase() === norm || 
        (p.id && p.id.toLowerCase() === norm) ||
        norm.includes(p.name.toLowerCase()) ||
        p.name.toLowerCase().includes(norm)
      ) || { baseVoice: "Zephyr" as const, tonePrompt: "natural, soft, clear conversational female voice" };

      const baseVoiceToApi = matched.baseVoice;
      // Combine the specialized profile prompt with current dialogue emotion delivery
      const decoratedText = `[Tone: ${matched.tonePrompt}, expressing ${speakEmotion.toLowerCase()} feeling] ${text}`;

      console.log(`Synthesizing text: "${decoratedText}" with Gemini Base Voice: ${baseVoiceToApi} (virtual voice requested: ${speakVoice})`);

      let response;
      let lastError: any = null;
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        try {
          response = await getAIClient().models.generateContent({
            model: modelName,
            contents: [{ parts: [{ text: decoratedText }] }],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: baseVoiceToApi },
                },
              },
            },
          });
          break; // successfully generated!
        } catch (err: any) {
          attempts++;
          lastError = err;
          const errMsg = err.message || "";
          
          const isRateLimit = errMsg.includes("429") || 
                              errMsg.includes("RESOURCE_EXHAUSTED") || 
                              errMsg.includes("quota") || 
                              errMsg.includes("limit") ||
                              err.status === 429 ||
                              err.code === 429;
                              
          if (isRateLimit && attempts < maxAttempts) {
            // Check if there is a suggested wait time in the error text (e.g., "Please retry in 4.739981332s.")
            let waitMs = Math.pow(2, attempts) * 1200 + Math.random() * 800; // default backoff
            const delayMatch = errMsg.match(/Please retry in ([0-9.]+)s/i);
            if (delayMatch && delayMatch[1]) {
              const seconds = parseFloat(delayMatch[1]);
              if (!isNaN(seconds)) {
                waitMs = (seconds * 1000) + 750; // Parse Gemini's precise delay recommendation & add buffer
              }
            }
            
            console.warn(`[TTS API QUOTA MATCH] Attempt ${attempts} of ${maxAttempts} hit 429 Resource Exhausted. Pausing for ${Math.round(waitMs)}ms before retry. Details: ${errMsg.substring(0, 140)}`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
          } else {
            throw err;
          }
        }
      }

      if (!response) {
        throw lastError || new Error("Failed to contact Gemini Text-To-Speech generator.");
      }

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        console.error("Gemini TTS response content: ", JSON.stringify(response));
        return res.status(500).json({ error: "Failed to generate audio from Gemini TTS service." });
      }

      // Encode raw 24kHz Mono 16-bit PCM bytes as WAV
      const pcmBuffer = Buffer.from(base64Audio, "base64");
      const wavBuffer = pcmToWav(pcmBuffer, 24000);

      const base64Wav = wavBuffer.toString("base64");
      res.json({
        audioContent: base64Wav,
        mimeType: "audio/wav",
      });
    } catch (error: any) {
      console.error("TTS generation error:", error);
      res.status(500).json({ error: error.message || "An error occurred during audio synthesis." });
    }
  });

  // Serve static assets if in production, else mount Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server running on http://localhost:${PORT}`);
  });
}

startServer();
