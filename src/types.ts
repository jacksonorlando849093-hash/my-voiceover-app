export interface Character {
  id: string;
  name: string;
  voice: string; // Dynamic physical/virtual voice selection
  avatarSeed: string;
  description?: string;
  avatarUrl?: string; // Cinematic actor portrait url or base64 generated AI image
}

export interface DialogueLine {
  id: string;
  characterId: string;
  text: string;
  emotion: string;
  audioUrl?: string; // Cacheable synthesized audio blob URL
  loading?: boolean;
  error?: string;
}

export interface DialogueScript {
  id?: string;
  title: string;
  characters: Character[];
  lines: DialogueLine[];
}

export interface PrebuiltVoice {
  id: string;
  name: string; // The specific vocal profile name
  gender: "Male" | "Female" | "Kids" | "Neutral"; // Simplified billing
  category: "Men" | "Women" | "Kids"; // Clear UI selection buckets
  subCategory: "Angry" | "Happy" | "Soft" | "Normal"; // emotional presets in one place
  description: string;
  tags: string[];
  baseVoice: "Puck" | "Charon" | "Kore" | "Fenrir" | "Zephyr"; // Maps to standard Gemini voices
  tonePrompt: string; // Extra style prompts passed to Gemini TTS
  playbackRate?: number; // client-side play rate for children or unique pitches
}
