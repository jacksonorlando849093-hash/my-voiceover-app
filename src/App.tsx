import { useState, useEffect, useRef } from "react";
import { getCachedAudio, setCachedAudio } from "./utils/audioCache";
import { audioBufferToMp3 } from "./utils/mp3Exporter";
import GoogleDriveSync from "./components/GoogleDriveSync";
import { ScriptProjectPayload } from "./utils/googleDrive";
import { 
  Play, Pause, Save, Download, ChevronDown, ChevronUp, Loader2, Sparkles, FolderOpen, Volume2, Check, CheckCircle2, RefreshCw, AudioLines, FolderDown, FileAudio,
  Laptop, Smartphone, Gauge, Smile, BrainCircuit, Info, Clock, Undo, Redo
} from "lucide-react";

// Inline uncompressed PCM 16-bit WAV synthesis helper from AudioBuffer
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // 1 = raw PCM 16-bit
  const bitDepth = 16;
  
  let result;
  if (numOfChan === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    result = buffer.getChannelData(0);
  }
  
  const bufferLength = result.length * 2;
  const arrayBuffer = new ArrayBuffer(44 + bufferLength);
  const view = new DataView(arrayBuffer);
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + bufferLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numOfChan * 2, true);
  view.setUint16(32, numOfChan * 2, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, bufferLength, true);
  
  floatTo16BitPCM(view, 44, result);
  
  return new Blob([view], { type: 'audio/wav' });
}

function interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
  const length = inputL.length + inputR.length;
  const result = new Float32Array(length);
  let index = 0;
  let inputIndex = 0;
  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

// Royalty-Free, Non-Copyrighted high-fidelity voice profiles
const VOICE_CATEGORIES: Record<string, { id: string; name: string }[]> = {
  "Men": [
    { id: "Fenrir", name: "Fenrir (Warm Conversational Male)" },
    { id: "Charon", name: "Charon (Authoritative Grave Male)" },
    { id: "Leo (Excited Agent)", name: "Leo (Energetic Happy Male)" },
    { id: "Julian (Soft Whisperer)", name: "Julian (Hushed Whisperer Male)" },
    { id: "Nico (Calm Narrator)", name: "Nico (Calm Storyteller Male)" }
  ],
  "Women": [
    { id: "Zephyr", name: "Zephyr (Soft Friendly Narrator)" },
    { id: "Kore", name: "Kore (Articulate Sharp Executive)" },
    { id: "Puck", name: "Puck (Energetic Animated Buddy)" },
    { id: "Chloe (Cheerful Buddy)", name: "Chloe (Bubbly Giggling Buddy)" },
    { id: "Seraphina (Whispering Angel)", name: "Seraphina (Warm Delicate Whisperer)" }
  ],
  "Kids": [
    { id: "Toby (Playful Little Boy)", name: "Toby (Playful Schoolboy, age 7)" },
    { id: "Lily (Sweet Little Girl)", name: "Lily (Cutesy Little Girl, age 5)" }
  ],
  "Older Men": [
    { id: "Arthur (Jolly Grandpa)", name: "Arthur (Jolly Grandparent Male)" }
  ],
  "Older Women": [
    { id: "Eleanor", name: "Eleanor (Mellow Wisdom Grandmother)" }
  ],
  "Nigerian Accent": [
    { id: "Chidi (Lagos Gentleman)", name: "Chidi (Nigerian Accent Male)" },
    { id: "Amina (Abuja Professional)", name: "Amina (Nigerian Accent Executive Female)" }
  ]
};

// Flatten utility
const ALL_FLAT_VOICES = Object.values(VOICE_CATEGORIES).flat();

// Mapping for Quick Switch Button types to specific default config
const QUICK_SWITCH_PRESETS = [
  { label: "Men", actor: "John", voice: "Fenrir", category: "Men" },
  { label: "Women", actor: "Sarah", voice: "Zephyr", category: "Women" },
  { label: "Kids", actor: "Toby", voice: "Toby (Playful Little Boy)", category: "Kids" },
  { label: "Older Men", actor: "Arthur", voice: "Arthur (Jolly Grandpa)", category: "Older Men" },
  { label: "Older Women", actor: "Eleanor", voice: "Eleanor", category: "Older Women" },
  { label: "Nigerian Accent", actor: "Chidi", voice: "Chidi (Lagos Gentleman)", category: "Nigerian Accent" }
];

interface ActorConfig {
  voice: string;
  speed: number;
  pitch: number;
}

interface PlayableLine {
  id: string;
  actor: string;
  text: string;
  originalIndex: number;
  inlineEmotion?: string;
}

interface LineTiming {
  index: number;
  actor: string;
  text: string;
  start: number;
  end: number;
}

interface UndoRedoState {
  scriptText: string;
  voiceSettings: Record<string, ActorConfig>;
  lineEmotions: Record<string, string>;
  lineSpeeds: Record<string, number>;
  linePauses: Record<string, number>;
}

export default function App() {
  // Studio visual version layout mode (Window or Phone view option)
  const [layoutMode, setLayoutMode] = useState<"responsive" | "window" | "phone">("responsive");

  // Line-by-line explicit emotions tracker dictionary
  const [lineEmotions, setLineEmotions] = useState<Record<string, string>>({});

  // Line-by-line manual custom fine-tuned speech speeds overrides dictionary
  const [lineSpeeds, setLineSpeeds] = useState<Record<string, number>>({});

  // Line-by-line manual custom pause durations (after this line, in seconds) dictionary
  const [linePauses, setLinePauses] = useState<Record<string, number>>({});

  // Emotion analyzer state
  const [isDetectingEmotions, setIsDetectingEmotions] = useState(false);

  // Script Input Text Area
  const [scriptText, setScriptText] = useState<string>(() => {
    return (
      "[Sarah]: Hello! Welcome to the new multi-actor Voiceover Studio.\n" +
      "[John]: This is incredible! It automatically detects us and adds controls below.\n" +
      "[Sarah]: Exactly. You can customize each actor's speed and pitch seamlessly!"
    );
  });

  // Key-value Map of Actor Names to individual configurations
  const [voiceSettings, setVoiceSettings] = useState<Record<string, ActorConfig>>({
    _single_: { voice: "Zephyr", speed: 1.0, pitch: 1.0 },
    Sarah: { voice: "Zephyr", speed: 1.0, pitch: 1.0 },
    John: { voice: "Fenrir", speed: 1.0, pitch: 1.0 },
  });

  // Undo/Redo tracking state stacks
  const [past, setPast] = useState<UndoRedoState[]>([]);
  const [future, setFuture] = useState<UndoRedoState[]>([]);

  const currentStateRef = useRef<UndoRedoState>({
    scriptText: "",
    voiceSettings: {},
    lineEmotions: {},
    lineSpeeds: {},
    linePauses: {},
  });

  const isInteractionActiveRef = useRef(false);
  const interactionTimeoutRef = useRef<any>(null);

  // Track the most updated real-time state for history snapshotting
  useEffect(() => {
    currentStateRef.current = {
      scriptText,
      voiceSettings,
      lineEmotions,
      lineSpeeds,
      linePauses,
    };
  }, [scriptText, voiceSettings, lineEmotions, lineSpeeds, linePauses]);

  // Push the current state to the past history stack
  const recordAction = () => {
    const current = currentStateRef.current;
    
    setPast((prev) => {
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        if (
          last.scriptText === current.scriptText &&
          JSON.stringify(last.voiceSettings) === JSON.stringify(current.voiceSettings) &&
          JSON.stringify(last.lineEmotions) === JSON.stringify(current.lineEmotions) &&
          JSON.stringify(last.lineSpeeds) === JSON.stringify(current.lineSpeeds) &&
          JSON.stringify(last.linePauses) === JSON.stringify(current.linePauses)
        ) {
          return prev;
        }
      }
      const newPast = [...prev, JSON.parse(JSON.stringify(current))];
      if (newPast.length > 80) {
        newPast.shift();
      }
      return newPast;
    });
    setFuture([]);
  };

  const recordInteractionStart = () => {
    if (!isInteractionActiveRef.current) {
      recordAction();
      isInteractionActiveRef.current = true;
    }
    
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }
    
    interactionTimeoutRef.current = setTimeout(() => {
      isInteractionActiveRef.current = false;
    }, 1000);
  };

  const recordDiscreteAction = () => {
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }
    isInteractionActiveRef.current = false;
    recordAction();
  };

  const handleUndo = () => {
    if (past.length === 0) return;
    
    const previous = past[past.length - 1];
    const current = currentStateRef.current;
    
    setFuture((prev) => [JSON.parse(JSON.stringify(current)), ...prev]);
    setPast((prev) => prev.slice(0, -1));
    
    setScriptText(previous.scriptText);
    setVoiceSettings(previous.voiceSettings);
    setLineEmotions(previous.lineEmotions);
    setLineSpeeds(previous.lineSpeeds);
    setLinePauses(previous.linePauses);
    
    showToast("Undo applied successfully");
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    
    const nextState = future[0];
    const current = currentStateRef.current;
    
    setPast((prev) => [...prev, JSON.parse(JSON.stringify(current))]);
    setFuture((prev) => prev.slice(1));
    
    setScriptText(nextState.scriptText);
    setVoiceSettings(nextState.voiceSettings);
    setLineEmotions(nextState.lineEmotions);
    setLineSpeeds(nextState.lineSpeeds);
    setLinePauses(nextState.linePauses);
    
    showToast("Redo applied successfully");
  };

  // Keyboard shortcut listener for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is focused on inputs but prioritize undo if they want it
      // Let's allow standard Ctrl/Cmd+Z and Ctrl/Cmd+Y
      const isZ = e.key.toLowerCase() === 'z';
      const isY = e.key.toLowerCase() === 'y';
      
      if ((e.ctrlKey || e.metaKey) && isZ) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && isY) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [past, future]);

  // UI State toggles
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAutosaving, setIsAutosaving] = useState(false);

  // Individual line preview and playback audio state
  const [previewingLineId, setPreviewingLineId] = useState<string | null>(null);
  const [previewingActorName, setPreviewingActorName] = useState<string | null>(null);

  // Master Audio Playback State
  const [masterAudioUrl, setMasterAudioUrl] = useState<string | null>(null);
  const [masterMp3Url, setMasterMp3Url] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [lineTimings, setLineTimings] = useState<LineTiming[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  // 1. Silent recovery of work on mount and manual checking
  useEffect(() => {
    const manualExists = localStorage.getItem("voiceover-generator-v2-manual") !== null;
    setHasSavedDraft(manualExists);

    const autosaveRaw = localStorage.getItem("voiceover-generator-v2-autosave");
    if (autosaveRaw) {
      try {
        const parsed = JSON.parse(autosaveRaw);
        if (parsed.scriptText !== undefined) {
          setScriptText(parsed.scriptText);
        }
        if (parsed.voiceSettings) {
          setVoiceSettings(parsed.voiceSettings);
        }
        if (parsed.lineEmotions) {
          setLineEmotions(parsed.lineEmotions);
        }
        if (parsed.lineSpeeds) {
          setLineSpeeds(parsed.lineSpeeds);
        }
        if (parsed.linePauses) {
          setLinePauses(parsed.linePauses);
        }
      } catch (e) {
        console.error("Failed to restore silent autosave payload", e);
      }
    }
  }, []);

  // Parse Actor names dynamically out of [Actor Name]: script format (Unlimited!)
  const extractActorsFromScript = (text: string): string[] => {
    const regex = /\[([^\]\n:]+)\]\s*:/g;
    const matches = Array.from(text.matchAll(regex));
    const actorsSet = new Set<string>();
    matches.forEach((m) => {
      const name = m[1].trim();
      if (name && name.toLowerCase() !== "pause") {
        actorsSet.add(name);
      }
    });
    return Array.from(actorsSet);
  };

  const activeActors = extractActorsFromScript(scriptText);
  const isMultiActorMode = activeActors.length > 0;

  // Auto-fill and assign default voices intelligently based on name analysis
  useEffect(() => {
    if (activeActors.length > 0) {
      setVoiceSettings((prev) => {
        const next = { ...prev };
        let hasChanges = false;
        activeActors.forEach((actor) => {
          if (!next[actor]) {
            // Find default voice matching the category name or fallback wisely
            let matchedVoice = "Zephyr";
            const lowerActor = actor.toLowerCase();
            
            if (lowerActor.includes("john") || lowerActor.includes("leo") || lowerActor.includes("nico") || lowerActor.includes("boy") || lowerActor.includes("man")) {
              matchedVoice = "Fenrir";
            } else if (lowerActor.includes("sarah") || lowerActor.includes("chloe") || lowerActor.includes("woman") || lowerActor.includes("girl")) {
              matchedVoice = "Zephyr";
            } else if (lowerActor.includes("child") || lowerActor.includes("kid") || lowerActor.includes("toby") || lowerActor.includes("lily")) {
              matchedVoice = "Toby (Playful Little Boy)";
            } else if (lowerActor.includes("nigerian") || lowerActor.includes("chidi") || lowerActor.includes("amina")) {
              matchedVoice = "Chidi (Lagos Gentleman)";
            } else if (lowerActor.includes("grandfather") || lowerActor.includes("grandpa") || lowerActor.includes("arthur")) {
              matchedVoice = "Arthur (Jolly Grandpa)";
            } else if (lowerActor.includes("grandmother") || lowerActor.includes("grandma") || lowerActor.includes("eleanor")) {
              matchedVoice = "Eleanor";
            } else {
              // Rotate fallback voice allocation gracefully
              const hash = actor.charCodeAt(0) + (actor.charCodeAt(actor.length - 1) || 0);
              const index = Math.abs(hash) % ALL_FLAT_VOICES.length;
              matchedVoice = ALL_FLAT_VOICES[index].id;
            }

            next[actor] = {
              voice: matchedVoice,
              speed: 1.0,
              pitch: 1.0,
            };
            hasChanges = true;
          }
        });
        return hasChanges ? next : prev;
      });
    }
  }, [scriptText]);

  // 2. Automate Silent Autosave every 10 seconds securely
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const autoSavePayload = {
          scriptText,
          voiceSettings,
          lineEmotions,
          lineSpeeds,
          linePauses,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem("voiceover-generator-v2-autosave", JSON.stringify(autoSavePayload));
        setIsAutosaving(true);
        setTimeout(() => setIsAutosaving(false), 1200);
      } catch (err) {
        console.error("Autosave state failure", err);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [scriptText, voiceSettings, lineEmotions, lineSpeeds, linePauses]);

  const showToast = (message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  // Feature 4: Save manual snaps
  const handleSaveDraft = () => {
    try {
      const draftPayload = {
        scriptText,
        voiceSettings,
        lineEmotions,
        lineSpeeds,
        linePauses,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem("voiceover-generator-v2-manual", JSON.stringify(draftPayload));
      setHasSavedDraft(true);
      showToast("Manual Draft Saved Locally!");
    } catch (err) {
      console.error(err);
      alert("Failed to save draft.");
    }
  };

  // Feature 4: Load manual snapshot
  const handleLoadDraft = () => {
    try {
      recordDiscreteAction();
      const raw = localStorage.getItem("voiceover-generator-v2-manual");
      if (!raw) return;
      
      const parsed = JSON.parse(raw);
      if (parsed.scriptText !== undefined) {
        setScriptText(parsed.scriptText);
      }
      if (parsed.voiceSettings) {
        setVoiceSettings(parsed.voiceSettings);
      }
      if (parsed.lineEmotions) {
        setLineEmotions(parsed.lineEmotions);
      }
      if (parsed.lineSpeeds) {
        setLineSpeeds(parsed.lineSpeeds);
      }
      if (parsed.linePauses) {
        setLinePauses(parsed.linePauses);
      }
      
      setIsSettingsExpanded(true);
      showToast("Manual Draft Loaded Perfectly!");
    } catch (err) {
      console.error(err);
      alert("Failed to parse loaded draft settings.");
    }
  };

  // Google Drive Loader Service
  const handleGoogleDriveLoad = (payload: ScriptProjectPayload, fileId: string, fileName: string) => {
    if (payload.scriptText !== undefined) {
      setScriptText(payload.scriptText);
    }
    if (payload.voiceSettings) {
      setVoiceSettings(payload.voiceSettings);
    }
    if (payload.lineEmotions) {
      setLineEmotions(payload.lineEmotions);
    }
    if (payload.lineSpeeds) {
      setLineSpeeds(payload.lineSpeeds);
    }
    if (payload.linePauses) {
      setLinePauses(payload.linePauses);
    }
    setIsSettingsExpanded(true);
    showToast(`Loaded "${fileName}" from Google Drive!`);
  };

  // Resolve active emotion for a specific playable line
  const getLineActiveEmotion = (line: PlayableLine): string => {
    // 1. Manually overridden state
    if (lineEmotions[line.id]) {
      return lineEmotions[line.id];
    }
    // 2. Extracted parenthetical tone (e.g. from screenplay parentheticals like "(Angry)" in "[Hero] (Angry): Get out!")
    if (line.inlineEmotion) {
      const formatted = line.inlineEmotion.charAt(0).toUpperCase() + line.inlineEmotion.slice(1).toLowerCase();
      const supported = ["Neutral", "Happy", "Angry", "Sad", "Whispering", "Excited", "Scared"];
      if (supported.includes(formatted)) {
        return formatted;
      }
    }
    // 3. Fallback: Instant smart local keyword-heuristics
    const textLower = line.text.toLowerCase();
    if (textLower.includes("happy") || textLower.includes("yay") || textLower.includes("great") || textLower.includes("awesome") || textLower.includes("wonderful") || textLower.includes("haha") || textLower.includes("cheerful") || textLower.includes("smile")) {
      return "Happy";
    }
    if (textLower.includes("excited") || textLower.includes("wow") || textLower.includes("amazing") || textLower.includes("incredible") || textLower.includes("hurray") || textLower.includes("boom")) {
      return "Excited";
    }
    if (textLower.includes("angry") || textLower.includes("furious") || textLower.includes("hate") || textLower.includes("get out") || textLower.includes("unbelievable") || textLower.includes("shout") || textLower.includes("frustrated")) {
      return "Angry";
    }
    if (textLower.includes("sorry") || textLower.includes("sad") || textLower.includes("melancholy") || textLower.includes("tears") || textLower.includes("unfortunate") || textLower.includes("grief") || textLower.includes("crying")) {
      return "Sad";
    }
    if (textLower.includes("shh") || textLower.includes("whisper") || textLower.includes("secret") || textLower.includes("quiet") || textLower.includes("hush") || textLower.includes("gentle")) {
      return "Whispering";
    }
    if (textLower.includes("scared") || textLower.includes("afraid") || textLower.includes("fear") || textLower.includes("careful") || textLower.includes("worried") || textLower.includes("terrified") || textLower.includes("anxious")) {
      return "Scared";
    }

    return "Neutral";
  };

  // Resolve speed multiplier for a specific line based on overrides and calibrated emotional settings
  const getLineSpeed = (lineId: string, actorName: string, emotion: string): number => {
    // 1. Manual User-specific line slider override takes highest priority
    if (lineSpeeds[lineId] !== undefined) {
      return lineSpeeds[lineId];
    }
    // 2. Actor Global slider override takes second preference if not equal to 1x default
    const actorConfig = voiceSettings[actorName] || voiceSettings._single_;
    if (actorConfig && actorConfig.speed !== 1.0) {
      return actorConfig.speed;
    }
    // 3. Dynamic Emotion-based speech tempo calibrations
    switch (emotion) {
      case "Excited":
      case "Happy":
        return 1.15; // Joyful quick pacing
      case "Angry":
        return 1.12; // Snap/intense pace
      case "Sad":
      case "Whispering":
        return 0.86; // Low-intensity reflective slow pacing
      case "Scared":
        return 1.10; // Panicked hasty talk
      default:
        return 1.0;  // Balanced tempo
    }
  };

  // AI Script Emotion Detector scanning loop using process payload API
  const handleAutoDetectEmotions = async () => {
    recordDiscreteAction();
    const lines = getPlayableLines();
    const validLines = lines.filter(l => l.text.trim().length > 0);
    if (validLines.length === 0) {
      alert("Please write or paste several screenplay dialogue script lines in the editor.");
      return;
    }

    setIsDetectingEmotions(true);
    showToast("Scanned lines. Processing deep AI tone analysis...");

    try {
      const res = await fetch("/api/detect-script-emotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: validLines }),
      });

      if (!res.ok) {
        throw new Error("Gemini analysis completed with server failure response.");
      }

      const detectionMap = await res.json();
      setLineEmotions((prev) => ({
        ...prev,
        ...detectionMap
      }));

      // Adjust timings update after emotions scanning finishes
      showToast(`Successfully evaluated emotions for ${Object.keys(detectionMap).length} segment(s)!`);
    } catch (err: any) {
      console.error(err);
      // Fallback notification
      showToast("Model server busy. Utilising high-accuracy local keywords maps...");
      
      // Compute and apply keyword fallback immediately
      const defaultScans: Record<string, string> = {};
      validLines.forEach(l => {
        defaultScans[l.id] = getLineActiveEmotion(l);
      });
      setLineEmotions(prev => ({ ...prev, ...defaultScans }));
    } finally {
      setIsDetectingEmotions(false);
    }
  };

  // Parse lines from raw script input supporting screenplay parentheticals: [Name] (Emotion): Text
  const getPlayableLines = (): PlayableLine[] => {
    const rows = scriptText.split("\n");
    const parsed: PlayableLine[] = [];
    let currentActor = "_single_";

    rows.forEach((row, idx) => {
      const trimmed = row.trim();
      if (!trimmed) return;

      // Extract bracketed speaker, potential parenthesis emotional qualifier, and dialogue text
      const actorMatch = trimmed.match(/^\[([^\]\n:]+)\](?:\s*\(([^)]+)\))?\s*:\s*(.*)$/);
      if (actorMatch) {
        const actorName = actorMatch[1].trim();
        const inlineEmotion = actorMatch[2] ? actorMatch[2].trim() : undefined;
        const textValue = actorMatch[3].trim();
        currentActor = actorName;
        parsed.push({
          id: `line_${idx}`,
          actor: actorName,
          text: textValue,
          originalIndex: idx,
          inlineEmotion: inlineEmotion
        });
      } else {
        parsed.push({
          id: `line_${idx}`,
          actor: isMultiActorMode ? currentActor : "_single_",
          text: trimmed,
          originalIndex: idx
        });
      }
    });

    return parsed;
  };

  // Sync edits done line-by-line dynamically back into the script editor
  const handleLineTextChange = (lineIndex: number, newText: string) => {
    recordInteractionStart();
    const rows = scriptText.split("\n");
    const targetRow = rows[lineIndex];
    if (targetRow === undefined) return;

    const actorMatch = targetRow.match(/^\[([^\]\n:]+)\](?:\s*\(([^)]+)\))?\s*:\s*(.*)$/);
    if (actorMatch) {
      const actorName = actorMatch[1].trim();
      const parenText = actorMatch[2] ? ` (${actorMatch[2].trim()})` : "";
      rows[lineIndex] = `[${actorName}]${parenText}: ${newText}`;
    } else {
      rows[lineIndex] = newText;
    }
    setScriptText(rows.join("\n"));
  };

  // Dynamic quick-switch action instantly updating the line voice type structure (Feature 2)
  const handleQuickSwitchActor = (lineIndex: number, preset: typeof QUICK_SWITCH_PRESETS[0]) => {
    recordDiscreteAction();
    const rows = scriptText.split("\n");
    const targetRow = rows[lineIndex] || "";
    // Clean old actor name tag AND old parenthetical emotions if switching speaker profiles
    const cleanText = targetRow.replace(/^\[([^\]\n:]+)\](?:\s*\(([^)]+)\))?\s*:\s*/, "");

    // Modify prefix bracket tag to trigger dynamic actor state hook
    rows[lineIndex] = `[${preset.actor}]: ${cleanText}`;
    
    // Set default target voice details under actor settings automatically
    setVoiceSettings(prev => ({
      ...prev,
      [preset.actor]: prev[preset.actor] || {
        voice: preset.voice,
        speed: 1.0,
        pitch: 1.0
      }
    }));
    
    setScriptText(rows.join("\n"));
    showToast(`Switched line to ${preset.actor} (${preset.label})`);
  };

  // Manual Select Specific Voice directly for the exact actor assigned to a line
  const handleSetLineActorVoice = (actorName: string, selectedVoice: string) => {
    recordDiscreteAction();
    setVoiceSettings(prev => ({
      ...prev,
      [actorName]: {
        ...(prev[actorName] || { voice: "Zephyr", speed: 1.0, pitch: 1.0 }),
        voice: selectedVoice
      }
    }));
    showToast(`Assigned ${selectedVoice} to ${actorName}`);
  };

  // Feature 3: Play only a specific line preview natively
  const handlePlaySingleLine = async (line: PlayableLine) => {
    if (previewingLineId) return; // Prevent spam play requests
    
    const config = voiceSettings[line.actor] || voiceSettings._single_;
    const voiceSelected = config.voice;
    const textTarget = line.text.trim();
    if (!textTarget) {
      alert("Line is empty, please write some text to preview.");
      return;
    }

    setPreviewingLineId(line.id);
    const emotionAssigned = getLineActiveEmotion(line);
    const playbackSpeed = getLineSpeed(line.id, line.actor, emotionAssigned);

    try {
      // IndexedDB query first
      let cachedUrl = await getCachedAudio(textTarget, voiceSelected, emotionAssigned);
      
      if (!cachedUrl) {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: textTarget,
            voice: voiceSelected,
            emotion: emotionAssigned,
          })
        });

        if (!res.ok) {
          throw new Error("TTS generation failed.");
        }

        const data = await res.json();
        if (!data.audioContent) {
          throw new Error("Malformed speech audio content.");
        }

        cachedUrl = `data:audio/wav;base64,${data.audioContent}`;
        await setCachedAudio(textTarget, voiceSelected, emotionAssigned, cachedUrl);
      }

      // Initialize audio object
      const previewAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBufferRes = await fetch(cachedUrl);
      const rawBytes = await arrayBufferRes.arrayBuffer();
      const originalBuffer = await previewAudioCtx.decodeAudioData(rawBytes);

      // Perform pitch/speed processing for rendering
      const offlineCtx = new OfflineAudioContext(1, Math.floor(originalBuffer.duration / playbackSpeed * previewAudioCtx.sampleRate), previewAudioCtx.sampleRate);
      const source = offlineCtx.createBufferSource();
      source.buffer = originalBuffer;
      source.playbackRate.setValueAtTime(playbackSpeed, 0);

      if (source.detune) {
        source.detune.setValueAtTime((config.pitch - 1.0) * 1200, 0);
      }

      source.connect(offlineCtx.destination);
      source.start(0);

      const computedBuffer = await offlineCtx.startRendering();
      const pcmBlob = audioBufferToWav(computedBuffer);
      const pcmUrl = URL.createObjectURL(pcmBlob);

      const audioObj = new Audio(pcmUrl);
      audioObj.onended = () => setPreviewingLineId(null);
      audioObj.onerror = () => setPreviewingLineId(null);
      
      await audioObj.play();
    } catch (err) {
      console.error(err);
      alert("Failed to preview line. Verify connection.");
      setPreviewingLineId(null);
    }
  };

  // Previewing exact test voice line from Voice settings list items (Feature 1)
  const handlePreviewActorVoiceTest = async (actorName: string) => {
    if (previewingActorName) return;

    setPreviewingActorName(actorName);
    const config = voiceSettings[actorName] || voiceSettings._single_;
    const testText = `Hi, I am ${actorName}. Ready to record.`;

    try {
      let cachedUrl = await getCachedAudio(testText, config.voice, "Neutral");
      if (!cachedUrl) {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: testText,
            voice: config.voice,
            emotion: "Neutral"
          })
        });
        const data = await res.json();
        cachedUrl = `data:audio/wav;base64,${data.audioContent}`;
        await setCachedAudio(testText, config.voice, "Neutral", cachedUrl);
      }

      const audioObj = new Audio(cachedUrl);
      audioObj.onended = () => setPreviewingActorName(null);
      audioObj.onerror = () => setPreviewingActorName(null);
      await audioObj.play();
    } catch (err) {
      console.error(err);
      setPreviewingActorName(null);
    }
  };

  // Feature 5: Entire voiceover compiler master generation pipeline
  const handleGenerateVoiceover = async () => {
    if (!scriptText.trim()) {
      alert("Please enter a script text first.");
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    setMasterAudioUrl(null);
    setMasterMp3Url(null);
    setActiveLineIndex(null);
    setPlaybackProgress(0);

    setIsGenerating(true);

    try {
      const lines = getPlayableLines();
      const validLines = lines.filter(l => l.text.trim().length > 0);
      if (validLines.length === 0) {
        throw new Error("No readable script layout detected.");
      }

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const decodedLineBuffers = await Promise.all(
        validLines.map(async (line) => {
          const config = voiceSettings[line.actor] || voiceSettings._single_;
          const voiceSelected = config.voice;
          const emotionAssigned = getLineActiveEmotion(line);
          const calculatedSpeed = getLineSpeed(line.id, line.actor, emotionAssigned);

          let cachedDataUrl = await getCachedAudio(line.text, voiceSelected, emotionAssigned);
          
          if (!cachedDataUrl) {
            const res = await fetch("/api/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: line.text,
                voice: voiceSelected,
                emotion: emotionAssigned,
              }),
            });

            if (!res.ok) {
              const errorData = await res.json();
              throw new Error(errorData.error || `Voice synthesis failed for "${line.text.substring(0, 15)}..."`);
            }

            const data = await res.json();
            if (!data.audioContent) {
              throw new Error("Missing audio payload from TTS generator.");
            }

            cachedDataUrl = `data:audio/wav;base64,${data.audioContent}`;
            await setCachedAudio(line.text, voiceSelected, emotionAssigned, cachedDataUrl);
          }

          const arrayBufferRes = await fetch(cachedDataUrl);
          const rawBytes = await arrayBufferRes.arrayBuffer();
          const pcmBuffer = await audioCtx.decodeAudioData(rawBytes);

          return {
            id: line.id,
            actor: line.actor,
            text: line.text,
            buffer: pcmBuffer,
            speed: calculatedSpeed,
            pitch: config.pitch,
          };
        })
      );

      // Chronological timelines arrangement
      let currentOffset = 0;
      const spacingGap = 0.5; // High polished natural acting breath gap
      const computedTimings: LineTiming[] = [];

      decodedLineBuffers.forEach((lb, idx) => {
        const lineDuration = lb.buffer.duration / lb.speed;
        computedTimings.push({
          index: idx,
          actor: lb.actor,
          text: lb.text,
          start: currentOffset,
          end: currentOffset + lineDuration,
        });
        const customPause = linePauses[lb.id] !== undefined ? linePauses[lb.id] : spacingGap;
        currentOffset += lineDuration + customPause;
      });

      setLineTimings(computedTimings);

      // Buffer audio context compiler
      const totalHardwareSamples = Math.floor(currentOffset * audioCtx.sampleRate);
      const offlineCtx = new OfflineAudioContext(1, totalHardwareSamples, audioCtx.sampleRate);

      decodedLineBuffers.forEach((lb, idx) => {
        const sourceNode = offlineCtx.createBufferSource();
        sourceNode.buffer = lb.buffer;
        sourceNode.playbackRate.setValueAtTime(lb.speed, 0);

        if (sourceNode.detune) {
          sourceNode.detune.setValueAtTime((lb.pitch - 1.0) * 1200, 0);
        }

        sourceNode.connect(offlineCtx.destination);
        const timingInfo = computedTimings[idx];
        sourceNode.start(timingInfo.start);
      });

      const renderedMasterBuffer = await offlineCtx.startRendering();
      
      // WAV Build
      const finalWavBlob = audioBufferToWav(renderedMasterBuffer);
      const masterUrl = URL.createObjectURL(finalWavBlob);
      setMasterAudioUrl(masterUrl);
      
      const audioObj = new Audio(masterUrl);
      audioRef.current = audioObj;

      audioObj.onplay = () => setIsPlaying(true);
      audioObj.onpause = () => setIsPlaying(false);
      audioObj.onended = () => {
        setIsPlaying(false);
        setActiveLineIndex(null);
        setPlaybackProgress(100);
      };

      showToast("Master script synthesized perfectly!");

      // Seamless MP3 render
      try {
        const finalMp3Blob = await audioBufferToMp3(renderedMasterBuffer);
        const mp3Url = URL.createObjectURL(finalMp3Blob);
        setMasterMp3Url(mp3Url);
      } catch (mp3Err) {
        console.error("Failed compiling MP3 track", mp3Err);
      }

    } catch (err: any) {
      console.error(err);
      alert(err.message || "Synthesis failed. Ensure Server config is active.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Playback timer ticker
  useEffect(() => {
    if (!masterAudioUrl) return;

    const interval = setInterval(() => {
      if (audioRef.current && isPlaying) {
        const currentTime = audioRef.current.currentTime;
        const duration = audioRef.current.duration || 1;
        setPlaybackProgress((currentTime / duration) * 100);

        const match = lineTimings.find(
          (t) => currentTime >= t.start && currentTime < t.end
        );
        if (match) {
          setActiveLineIndex(match.index);
        } else {
          setActiveLineIndex(null);
        }
      }
    }, 50);

    return () => clearInterval(interval);
  }, [masterAudioUrl, isPlaying, lineTimings]);

  const handlePlayToggle = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  };

  // Modern File System Access API Export to specific custom local folder selected by the user
  const handleExportToFolder = async (format: "mp3" | "wav") => {
    const fileUrl = format === "wav" ? masterAudioUrl : masterMp3Url;
    if (!fileUrl) {
      alert(`The ${format.toUpperCase()} track is currently compiling. Please wait.`);
      return;
    }

    try {
      const response = await fetch(fileUrl);
      const audioBlob = await response.blob();

      // Check if showSaveFilePicker is supported (modern secure browsers)
      if ("showSaveFilePicker" in window) {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: `synthesized_voiceover.${format}`,
          types: [
            {
              description: `${format.toUpperCase()} Audio File`,
              accept: {
                [format === "wav" ? "audio/wav" : "audio/mpeg"]: [`.${format}`],
              },
            },
          ],
        });

        // Write the blob straight to the user's selected file path!
        const writable = await fileHandle.createWritable();
        await writable.write(audioBlob);
        await writable.close();

        showToast(`Successfully exported ${format.toUpperCase()} to custom folder!`);
      } else {
        // Fallback for sandboxed frames or older browsers: Use standard programmatic trigger
        const anchor = document.createElement("a");
        anchor.href = fileUrl;
        anchor.download = `synthesized_voiceover.${format}`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        showToast(`Folder picker nested access blocked. Downloaded ${format.toUpperCase()} directly instead.`);
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        showToast("Export process cancelled by user.");
        return;
      }
      
      // Safe fallback download
      console.warn("Save Picker failed, using fallback:", err);
      const anchor = document.createElement("a");
      anchor.href = fileUrl;
      anchor.download = `synthesized_voiceover.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      showToast(`Exported ${format.toUpperCase()} to downloads folder.`);
    }
  };

  const activeLines = getPlayableLines();

  const dialogueWordCount = activeLines.reduce((acc, line) => {
    const text = line.text.trim();
    if (!text) return acc;
    const words = text.split(/\s+/).filter(Boolean);
    return acc + words.length;
  }, 0);

  const totalWordCount = scriptText.trim() ? scriptText.trim().split(/\s+/).filter(Boolean).length : 0;
  
  // Average reading rate for spoken voiceover is ~140 WPM (2.33 words/sec)
  const totalPausesSec = activeLines.reduce((acc, line, idx) => {
    if (idx === activeLines.length - 1) return acc;
    const customPauseVal = linePauses[line.id] !== undefined ? linePauses[line.id] : 0.5;
    return acc + customPauseVal;
  }, 0);

  const estimatedDurationSec = Math.round((dialogueWordCount / 2.33) + totalPausesSec);

  return (
    <div className="min-h-screen bg-[#121212] text-white flex flex-col font-sans relative antialiased" id="studio-core">
      {/* Fonts implementation */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          background-color: #121212 !important;
          color: #FFFFFF !important;
          font-family: 'Inter', sans-serif !important;
        }
        input[type="range"] {
          accent-color: #00D9FF;
        }
      `}</style>

      {/* Dynamic Main Workspace Container based on layoutMode */}
      <main className={`w-full mx-auto px-4 py-6 md:py-10 flex flex-col gap-6 transition-all duration-300 ${
        layoutMode === "window" 
          ? "max-w-[1400px]" 
          : layoutMode === "phone"
            ? "max-w-[700px]"
            : "max-w-[700px] lg:max-w-[1400px]"
      }`}>
        
        {/* Sleek Minimalist Header & Version bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#181818] p-5 rounded-[12px] border border-zinc-900 shadow-xl">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#00D9FF] rounded-full animate-pulse"></div>
              <span className="text-[10px] font-mono tracking-[0.2em] text-[#00D9FF] uppercase font-bold">CROSS-PLATFORM STUDIO v3.0</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white font-sans flex items-center gap-2">
              Voiceover Generator
            </h1>
            <p className="text-zinc-400 text-xs leading-relaxed max-w-[550px]">
              Write screenplay dialogue lines. Extract speakers, auto-detect emotional expression with AI, and fine-tune speech rates.
            </p>
          </div>

          {/* Interactive Layout Switcher */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-start sm:items-center self-start md:self-center">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">Workspace View:</span>
            <div className="flex bg-zinc-950 border border-zinc-850 p-1 rounded-lg">
              <button
                onClick={() => {
                  setLayoutMode("responsive");
                  showToast("Adaptive Grid Active");
                }}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer select-none ${
                  layoutMode === "responsive"
                    ? "bg-[#00D9FF] text-black shadow-lg font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <span>Adaptive</span>
              </button>
              <button
                onClick={() => {
                  setLayoutMode("window");
                  showToast("PC Windows Desktop Interface Active");
                }}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer select-none ${
                  layoutMode === "window"
                    ? "bg-[#00D9FF] text-black shadow-lg font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Laptop className="h-3 w-3" />
                <span>💻 PC Window</span>
              </button>
              <button
                onClick={() => {
                  setLayoutMode("phone");
                  showToast("Mobile Phone Studio Active");
                }}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer select-none ${
                  layoutMode === "phone"
                    ? "bg-[#00D9FF] text-black shadow-lg font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Smartphone className="h-3 w-3" />
                <span>📱 Phone view</span>
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Dual columns grid wrapping depending on active view mode */}
        <div className={`grid gap-6 transition-all duration-300 ${
          layoutMode === "window"
            ? "grid-cols-1 lg:grid-cols-12"
            : layoutMode === "phone"
              ? "grid-cols-1"
              : "grid-cols-1 lg:grid-cols-12"
        }`}>

          {/* LEFT PANE: SCRIPT EDITOR & VOICE CONFIGURATION */}
          <div className={`${
            layoutMode === "window"
              ? "lg:col-span-5"
              : layoutMode === "phone"
                ? "col-span-1"
                : "lg:col-span-5"
          } flex flex-col gap-6`}>
            
            {/* Master Script Text Area */}
            <div className="flex flex-col gap-2.5 bg-[#171717] p-5 rounded-[10px] border border-zinc-850 shadow-md">
              <div className="flex justify-between items-center text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-semibold border-b border-zinc-800/40 pb-2.5 mb-1 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span>FULL SCREENPLAY EDITOR</span>
                  
                  {/* Real-time elegant Undo/Redo Controls Panel */}
                  <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800/80 px-1 py-0.5 rounded-md ml-1.5 shadow-inner">
                    <button
                      onClick={handleUndo}
                      disabled={past.length === 0}
                      title="Undo Action (Ctrl+Z)"
                      className={`p-1 rounded transition-all flex items-center justify-center gap-1 cursor-pointer select-none ${
                        past.length === 0
                          ? "text-zinc-600 cursor-not-allowed opacity-40"
                          : "text-zinc-300 hover:bg-zinc-800 hover:text-[#00D9FF] active:scale-95"
                      }`}
                    >
                      <Undo className="h-3 w-3" />
                      <span className="text-[9px] font-semibold font-sans">Undo</span>
                      {past.length > 0 && (
                        <span className="text-[8px] px-1 bg-zinc-800 text-zinc-400 rounded-full font-mono">{past.length}</span>
                      )}
                    </button>
                    <div className="w-[1px] h-3 bg-zinc-800 self-center" />
                    <button
                      onClick={handleRedo}
                      disabled={future.length === 0}
                      title="Redo Action (Ctrl+Y / Ctrl+Shift+Z)"
                      className={`p-1 rounded transition-all flex items-center justify-center gap-1 cursor-pointer select-none ${
                        future.length === 0
                          ? "text-zinc-650 cursor-not-allowed opacity-40"
                          : "text-zinc-300 hover:bg-zinc-800 hover:text-[#00D9FF] active:scale-95"
                      }`}
                    >
                      <Redo className="h-3 w-3" />
                      <span className="text-[9px] font-semibold font-sans">Redo</span>
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-medium font-mono">
                  {isAutosaving ? (
                    <span className="text-[#00D9FF] flex items-center gap-1 animate-pulse">
                      <span className="w-1 h-1 rounded-full bg-[#00D9FF]" />
                      <span>saving draft...</span>
                    </span>
                  ) : (
                    <span className="text-zinc-600">autosave enabled</span>
                  )}
                </div>
              </div>
              <div className="relative">
                <textarea
                  value={scriptText}
                  onChange={(e) => {
                    recordInteractionStart();
                    setScriptText(e.target.value);
                  }}
                  rows={10}
                  className="w-full bg-[#111111] border border-zinc-850 focus:border-[#00D9FF] text-white placeholder-zinc-550 text-xs sm:text-sm leading-relaxed p-4.5 rounded-[8px] focus:outline-none font-mono resize-y min-h-[180px] transition-colors duration-200"
                  placeholder="[Sarah]: Hello.&#10;[John]: Hi there."
                />
              </div>

              {/* Word Count & Approximate Duration Tracker */}
              <div className="flex flex-col sm:flex-row shadow-inner sm:items-center justify-between gap-4 bg-[#121212] border border-zinc-850 p-3.5 rounded-lg animate-fadeIn text-xs" id="word-tracker-metrics">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">Speakable Words</span>
                    <span className="text-sm font-bold text-white font-mono tracking-tight" id="speakable-word-count">
                      {dialogueWordCount} <span className="text-[10px] text-zinc-550 font-normal">words</span>
                    </span>
                  </div>
                  <div className="h-8 w-[1.5px] bg-zinc-800" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">Total Document Words</span>
                    <span className="text-sm font-bold text-zinc-400 font-mono tracking-tight" id="total-word-count">
                      {totalWordCount}
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-col sm:items-end gap-1 bg-zinc-900/40 p-2 rounded border border-zinc-850/50 sm:border-0 sm:p-0 sm:bg-transparent">
                  <span className="text-[10px] font-mono text-[#00D9FF] uppercase tracking-wider font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00D9FF] animate-pulse"></span>
                    Estimated VA Voice Duration
                  </span>
                  <span className="text-xs font-semibold text-zinc-300 font-mono" id="estimated-duration-feedback">
                    ~{estimatedDurationSec < 1 ? "< 1 sec" : `${Math.floor(estimatedDurationSec / 60)}m ${Math.floor(estimatedDurationSec % 60)}s`}
                    <span className="text-[10px] text-zinc-500 font-normal font-sans ml-1">(avg 140 WPM pacing)</span>
                  </span>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1.5">
                <div className="text-[10px] text-zinc-500 max-w-[240px]">
                  Tip: Use <code className="text-[#00D9FF] font-mono bg-zinc-900 px-1 py-0.5 rounded">[Mary]:</code> to assign Mary, or add emotional screenplay tags like <code className="text-[#00D9FF] font-mono bg-zinc-900 px-1 py-0.5 rounded">[Mary] (Sad):</code>!
                </div>
                
                {/* AI Tones detection button */}
                <button
                  onClick={handleAutoDetectEmotions}
                  disabled={isDetectingEmotions}
                  className="px-3 py-2 bg-[#00D9FF]/10 border border-[#00D9FF]/25 text-[#00D9FF] hover:bg-[#00D9FF]/20 text-[10px] font-bold rounded-[6px] flex items-center gap-1.5 transition-all cursor-pointer shadow-sm select-none"
                >
                  {isDetectingEmotions ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Analyzing script...</span>
                    </>
                  ) : (
                    <>
                      <BrainCircuit className="h-3.5 w-3.5" />
                      <span>AI Scan Emotions</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Folder Voice settings manager panel */}
            <div className="border border-zinc-850 bg-[#171717] rounded-[10px] overflow-hidden shadow-md animate-fadeIn">
              <button
                onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
                className="w-full flex items-center justify-between p-5 text-left text-sm font-semibold select-none cursor-pointer hover:bg-zinc-850/50 max-md:min-h-[48px] transition-colors"
                id="drawer-toggle"
              >
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-[#00D9FF]" />
                  <span className="text-white text-xs font-bold uppercase tracking-wider font-mono">
                    GLOBAL VOICE PARAMETERS 
                    {isMultiActorMode ? ` (${activeActors.length} Cast Detect)` : " (Single Mode)"}
                  </span>
                </div>
                {isSettingsExpanded ? (
                  <ChevronUp className="h-4 w-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-zinc-400" />
                )}
              </button>

              {isSettingsExpanded && (
                <div className="p-5 border-t border-zinc-850 flex flex-col gap-6 bg-[#131313]">
                  {!isMultiActorMode ? (
                    /* --- Single Voice Config --- */
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-mono text-zinc-400 uppercase">Voice Profile</span>
                          <select
                            value={voiceSettings._single_?.voice || "Zephyr"}
                            onChange={(e) => {
                              recordDiscreteAction();
                              const val = e.target.value;
                              setVoiceSettings(prev => ({
                                ...prev,
                                _single_: { ...(prev._single_ || { voice: "Zephyr", speed: 1.0, pitch: 1.0 }), voice: val }
                              }));
                            }}
                            className="bg-[#1a1a1a] border border-zinc-850 rounded-[8px] text-white p-2.5 text-xs focus:outline-none focus:border-[#00D9FF] cursor-pointer"
                          >
                            {Object.entries(VOICE_CATEGORIES).map(([catName, list]) => (
                              <optgroup key={catName} label={catName} className="font-semibold text-[#00D9FF]">
                                {list.map(v => (
                                  <option key={v.id} value={v.id} className="text-white bg-[#1a1a1a]">
                                    {v.name}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-zinc-400 uppercase">Speed</span>
                            <span className="text-[10px] font-mono text-[#00D9FF]">{voiceSettings._single_?.speed || 1.0}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="2.0"
                            step="0.1"
                            value={voiceSettings._single_?.speed || 1.0}
                            onChange={(e) => {
                              recordInteractionStart();
                              const val = parseFloat(e.target.value);
                              setVoiceSettings(prev => ({
                                ...prev,
                                _single_: { ...(prev._single_ || { voice: "Zephyr", speed: 1.0, pitch: 1.0 }), speed: val }
                              }));
                            }}
                            className="w-full h-1 rounded"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-zinc-400 uppercase">Pitch</span>
                            <span className="text-[10px] font-mono text-[#00D9FF]">{voiceSettings._single_?.pitch || 1.0}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="2.0"
                            step="0.1"
                            value={voiceSettings._single_?.pitch || 1.0}
                            onChange={(e) => {
                              recordInteractionStart();
                              const val = parseFloat(e.target.value);
                              setVoiceSettings(prev => ({
                                ...prev,
                                _single_: { ...(prev._single_ || { voice: "Zephyr", speed: 1.0, pitch: 1.0 }), pitch: val }
                              }));
                            }}
                            className="w-full h-1 rounded text-[#00D9FF]"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* --- Multi Speaker Config (Unlimited dynamic list) --- */
                    <div className="flex flex-col gap-6 divide-y divide-zinc-850">
                      {activeActors.map((actor, idx) => {
                        const config = voiceSettings[actor] || { voice: "Zephyr", speed: 1.0, pitch: 1.0 };
                        const isVoiceDemoing = previewingActorName === actor;
                        return (
                          <div key={actor} className={`flex flex-col gap-3.5 ${idx > 0 ? "pt-5" : ""}`}>
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-semibold text-[#00D9FF] flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#00D9FF]" />
                                {actor} Global Voice
                              </span>

                              <button
                                onClick={() => handlePreviewActorVoiceTest(actor)}
                                disabled={isVoiceDemoing}
                                className="bg-zinc-800 hover:bg-[#00D9FF]/10 text-zinc-300 hover:text-[#00D9FF] px-2.5 py-1 text-[10px] font-medium rounded-[4px] transition-all flex items-center gap-1 cursor-pointer"
                              >
                                {isVoiceDemoing ? (
                                  <>
                                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                    <span>Playing Demo...</span>
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-2.5 w-2.5" />
                                    <span>Test Voice</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-mono text-zinc-400 uppercase">Voice Profile</span>
                                <select
                                  value={config.voice}
                                  onChange={(e) => {
                                    recordDiscreteAction();
                                    const val = e.target.value;
                                    setVoiceSettings(prev => ({
                                      ...prev,
                                      [actor]: { ...config, voice: val }
                                    }));
                                  }}
                                  className="bg-[#1a1a1a] border border-zinc-850 rounded-[8px] text-white p-2 text-xs focus:outline-none focus:border-[#00D9FF] cursor-pointer"
                                >
                                  {Object.entries(VOICE_CATEGORIES).map(([catName, list]) => (
                                    <optgroup key={catName} label={catName} className="font-semibold text-[#00D9FF]">
                                      {list.map(v => (
                                        <option key={v.id} value={v.id} className="text-white bg-[#1a1a1a]">
                                          {v.name}
                                        </option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                              </div>

                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-mono text-zinc-400 uppercase">Speed</span>
                                  <span className="text-[10px] font-mono text-[#00D9FF]">{config.speed}x</span>
                                </div>
                                <input
                                  type="range"
                                  min="0.5"
                                  max="2.0"
                                  step="0.1"
                                  value={config.speed}
                                  onChange={(e) => {
                                    recordInteractionStart();
                                    const val = parseFloat(e.target.value);
                                    setVoiceSettings(prev => ({
                                      ...prev,
                                      [actor]: { ...config, speed: val }
                                    }));
                                  }}
                                  className="w-full h-1 rounded"
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-mono text-zinc-400 uppercase">Pitch</span>
                                  <span className="text-[10px] font-mono text-[#00D9FF]">{config.pitch}x</span>
                                </div>
                                <input
                                  type="range"
                                  min="0.5"
                                  max="2.0"
                                  step="0.1"
                                  value={config.pitch}
                                  onChange={(e) => {
                                    recordInteractionStart();
                                    const val = parseFloat(e.target.value);
                                    setVoiceSettings(prev => ({
                                      ...prev,
                                      [actor]: { ...config, pitch: val }
                                    }));
                                  }}
                                  className="w-full h-1 rounded"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>


          </div>

          {/* RIGHT PANE: ACTIVE TIMELINE STREAM AND DIALOGUE MIXER */}
          <div className={`${
            layoutMode === "window"
              ? "lg:col-span-7"
              : layoutMode === "phone"
                ? "col-span-1"
                : "lg:col-span-7"
          } flex flex-col gap-6`}>
            
            {/* Playable dialogue line-by-line mixer */}
            <div className="flex flex-col gap-4 bg-[#171717] p-4 sm:p-5 rounded-[10px] border border-zinc-850 shadow-md">
              <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-bold block flex items-center gap-1.5">
                  <AudioLines className="h-4 w-4 text-[#00D9FF]" />
                  Interactive Script Timeline Mixer
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {activeLines.length} Dynamic line{activeLines.length !== 1 ? "s" : ""}
                </span>
              </div>

              {activeLines.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-zinc-500 text-xs text-center border-2 border-dashed border-zinc-850 rounded-[8px] px-4 gap-2">
                  <Info className="h-5 w-5 text-zinc-500" />
                  <span>No dialogue segments parsed. Type a line to begin!</span>
                </div>
              ) : (
                <div className="flex flex-col gap-4.5 max-h-[580px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800">
                  {activeLines.map((line) => {
                    const currentActor = line.actor;
                    const config = voiceSettings[currentActor] || { voice: "Zephyr", speed: 1.0, pitch: 1.0 };
                    const isLinePreviewing = previewingLineId === line.id;
                    
                    // Emotion configuration mapping
                    const activeEmotion = getLineActiveEmotion(line);
                    const lineSpeed = getLineSpeed(line.id, line.actor, activeEmotion);
                    const hasManualSpeed = lineSpeeds[line.id] !== undefined;

                    const emotionDetails = (emo: string) => {
                      switch (emo) {
                        case "Happy": return { emoji: "😊", text: "Happy", color: "text-emerald-400 bg-emerald-900/15 border-emerald-900/40" };
                        case "Angry": return { emoji: "😠", text: "Angry", color: "text-red-400 bg-red-900/15 border-red-900/40" };
                        case "Sad": return { emoji: "😢", text: "Sad", color: "text-blue-400 bg-blue-900/15 border-blue-900/40" };
                        case "Whispering": return { emoji: "💭", text: "Whispering", color: "text-violet-400 bg-violet-900/15 border-violet-900/40" };
                        case "Excited": return { emoji: "⚡", text: "Excited", color: "text-amber-400 bg-amber-900/15 border-amber-900/40" };
                        case "Scared": return { emoji: "😨", text: "Scared", color: "text-orange-400 bg-orange-950/15 border-orange-900/40" };
                        default: return { emoji: "😐", text: "Neutral", color: "text-zinc-400 bg-zinc-900/50 border-zinc-800" };
                      }
                    };

                    const activeDetails = emotionDetails(activeEmotion);

                    return (
                      <div key={line.id} className="bg-[#1c1c1c] p-4 rounded-[10px] border border-zinc-850/70 flex flex-col gap-4.5 transition-all duration-200 hover:border-zinc-700">
                        
                        {/* Line Header settings */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-850/40 pb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono bg-[#00D9FF]/10 text-[#00D9FF] px-2 py-0.5 rounded-full font-bold">
                              {currentActor}
                            </span>
                            
                            {/* In-line Specific Voice Dropdown Selector */}
                            <select
                              value={config.voice}
                              onChange={(e) => handleSetLineActorVoice(currentActor, e.target.value)}
                              className="bg-[#242424] border border-zinc-800 rounded-[5px] text-zinc-300 px-2 py-1 text-[11px] focus:outline-none focus:border-[#00D9FF] cursor-pointer"
                            >
                              {Object.entries(VOICE_CATEGORIES).map(([catName, list]) => (
                                <optgroup key={catName} label={catName} className="font-semibold text-[#00D9FF] bg-[#1a1a1a]">
                                  {list.map(v => (
                                    <option key={v.id} value={v.id} className="text-white bg-[#1a1a1a]">
                                      {v.name}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                            {/* Emotion Indicator / Manual Selector dropdown */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-zinc-500 uppercase">Tone:</span>
                              <select
                                value={activeEmotion}
                                onChange={(e) => {
                                  recordDiscreteAction();
                                  const sel = e.target.value;
                                  setLineEmotions(prev => ({ ...prev, [line.id]: sel }));
                                  showToast(`Tone updated to "${sel}"`);
                                }}
                                className={`px-2.5 py-0.5 text-[11px] rounded-[5px] border font-semibold bg-[#222222] cursor-pointer focus:outline-none focus:border-[#00D9FF] ${activeDetails.color}`}
                              >
                                <option value="Neutral">😐 Neutral</option>
                                <option value="Happy">😊 Happy</option>
                                <option value="Angry">😠 Angry</option>
                                <option value="Sad">😢 Sad</option>
                                <option value="Whispering">💭 Whispering</option>
                                <option value="Excited">⚡ Excited</option>
                                <option value="Scared">😨 Scared</option>
                              </select>
                            </div>

                            {/* Listen Line Trigger */}
                            <button
                              onClick={() => handlePlaySingleLine(line)}
                              disabled={isLinePreviewing}
                              className="h-7 px-2.5 bg-[#00D9FF]/10 hover:bg-[#00D9FF]/20 text-[#00D9FF] text-[10px] font-bold rounded-[5px] flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              {isLinePreviewing ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  <span>Playing...</span>
                                </>
                              ) : (
                                <>
                                  <Play className="h-2.5 w-2.5 fill-[#00D9FF]" />
                                  <span>Listen</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Inline dialogue text */}
                        <textarea
                          value={line.text}
                          onChange={(e) => handleLineTextChange(line.originalIndex, e.target.value)}
                          rows={1}
                          className="w-full bg-[#131111] border border-zinc-850 focus:border-[#00D9FF] text-xs sm:text-sm text-zinc-100 px-3 py-2 rounded-[6px] focus:outline-none focus:ring-0 transition-all font-sans resize-y"
                          placeholder="Dialogue text..."
                        />

                        {/* Speech Rate manually adjusted control box */}
                        <div className="bg-[#141414] px-3 py-2 rounded-[8px] border border-zinc-850/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1">
                              <Gauge className="h-3 w-3 text-[#00D9FF]" />
                              <span className="text-[9px] font-mono text-zinc-400 uppercase font-bold">Speaking Speed</span>
                            </div>
                            <span className="text-[11px] text-zinc-300 font-mono">
                              {lineSpeed.toFixed(2)}x {hasManualSpeed ? (
                                <span className="text-amber-400 text-[10px] font-semibold bg-amber-950/20 px-1 rounded">(adjusted)</span>
                              ) : (
                                <span className="text-zinc-500 text-[9px] font-medium bg-zinc-900 px-1 rounded">(auto emotion tempo)</span>
                              )}
                            </span>
                          </div>

                          <div className="flex-1 flex items-center gap-3">
                            <input
                              type="range"
                              min="0.5"
                              max="2.0"
                              step="0.05"
                              value={lineSpeed}
                              onChange={(e) => {
                                recordInteractionStart();
                                const val = parseFloat(e.target.value);
                                setLineSpeeds(prev => ({ ...prev, [line.id]: val }));
                              }}
                              className="flex-1 h-1 rounded cursor-pointer"
                            />

                            {/* Reset custom speed button to default calibration */}
                            {hasManualSpeed && (
                              <button
                                onClick={() => {
                                  recordDiscreteAction();
                                  setLineSpeeds(prev => {
                                    const next = { ...prev };
                                    delete next[line.id];
                                    return next;
                                  });
                                  showToast("Restored local emotional tempo.");
                                }}
                                className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-400 hover:text-white rounded text-[10px] font-mono transition-colors cursor-pointer"
                              >
                                Auto-Reset
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Pause Duration manually adjusted control box */}
                        <div className="bg-[#141414] px-3 py-2 rounded-[8px] border border-zinc-850/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-[#00D9FF]" />
                              <span className="text-[9px] font-mono text-zinc-400 uppercase font-bold">Dramatic Pause After Line</span>
                            </div>
                            <span className="text-[11px] text-zinc-300 font-mono">
                              {linePauses[line.id] !== undefined ? `${linePauses[line.id]}s` : "0.5s (standard)"}
                            </span>
                          </div>

                          <div className="flex-1 flex items-center gap-3 justify-end">
                            <select
                              value={linePauses[line.id] !== undefined ? linePauses[line.id] : 0.5}
                              onChange={(e) => {
                                recordDiscreteAction();
                                const val = parseFloat(e.target.value);
                                setLinePauses(prev => ({ ...prev, [line.id]: val }));
                                showToast(`Pause set to ${val}s`);
                              }}
                              className="bg-[#1e1e1e] border border-zinc-800 rounded-[5px] text-zinc-300 px-2.5 py-1 text-[11px] focus:outline-none focus:border-[#00D9FF] cursor-pointer"
                            >
                              <option value="0">0s (continuous)</option>
                              <option value="0.2">0.2s (short breath)</option>
                              <option value="0.5">0.5s (standard pacing)</option>
                              <option value="1.0">1.0s (dramatic pause)</option>
                              <option value="1.5">1.5s (prolonged gap)</option>
                              <option value="2.0">2.0s (long beat)</option>
                              <option value="3.0">3.0s (scene transition)</option>
                              <option value="4.0">4.0s (scene break)</option>
                              <option value="5.0">5.0s (extra long hold)</option>
                            </select>

                            {linePauses[line.id] !== undefined && linePauses[line.id] !== 0.5 && (
                              <button
                                onClick={() => {
                                  recordDiscreteAction();
                                  setLinePauses(prev => {
                                    const next = { ...prev };
                                    delete next[line.id];
                                    return next;
                                  });
                                  showToast("Restored standard 0.5s pacing gap.");
                                }}
                                className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-400 hover:text-white rounded text-[10px] font-mono transition-colors cursor-pointer"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Quick Recasting badging matrix */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-mono uppercase text-zinc-500">Recast Voice profile</span>
                          <div className="flex flex-wrap gap-1">
                            {QUICK_SWITCH_PRESETS.map((preset) => (
                              <button
                                key={preset.label}
                                onClick={() => handleQuickSwitchActor(line.originalIndex, preset)}
                                className="px-1.5 py-0.5 bg-[#252525] hover:bg-zinc-800 text-zinc-400 hover:text-white text-[9px] rounded transition-all cursor-pointer"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Master Render Output: Double HD Format (MP3 + WAV) Playback bar */}
            {masterAudioUrl && (
              <div className="bg-[#171717] border border-zinc-850 p-6 rounded-[10px] flex flex-col gap-5 animate-scaleUp text-left shadow-lg">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-white tracking-widest font-mono uppercase text-[10px]">MASTER TRACK MIXER BOARD</span>
                  <span className="text-[#00D9FF] text-[9px] px-2 py-0.5 rounded bg-[#00D9FF]/10 font-mono tracking-wider font-bold">WAV SYNTHESIZED</span>
                </div>

                {/* Progress Bar Timeline */}
                <div className="relative w-full h-2 bg-[#101010] rounded-[4px] overflow-hidden">
                  <div 
                    className="absolute left-0 top-0 bottom-0 bg-[#00D9FF] transition-all duration-75"
                    style={{ width: `${playbackProgress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {/* Play/Pause Button */}
                    <button
                      onClick={handlePlayToggle}
                      className="w-12 h-12 rounded-[8px] bg-[#00D9FF] hover:bg-[#00c2e6] text-black font-bold flex items-center justify-center transition-all duration-200 cursor-pointer active:scale-95 shadow-lg shadow-[#00D9FF]/20"
                    >
                      {isPlaying ? (
                        <Pause className="h-5 w-5 fill-black text-black" />
                      ) : (
                        <Play className="h-5 w-5 fill-black text-black ml-0.5" />
                      )}
                    </button>

                    {/* Progress readable timer */}
                    <div className="text-xs text-zinc-400 font-mono">
                      {audioRef.current ? `${Math.floor(audioRef.current.currentTime)}s / ${Math.floor(audioRef.current.duration || 0)}s` : "0:00"}
                    </div>
                  </div>
                </div>

                {/* Direct Export & Folder Selection Options */}
                <div className="border-t border-zinc-850 pt-4 flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono text-[#00D9FF] uppercase tracking-wider font-bold">EXPORT PROJECT FILE DIRECTORY</span>
                    <span className="text-[10px] text-zinc-450">
                      Pick a specific folder within your local system memory to save the generated audio files on your device.
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Choose Folder & Export WAV */}
                    <button
                      onClick={() => handleExportToFolder("wav")}
                      className="min-h-[46px] px-4 rounded-[8px] border border-zinc-800 text-white bg-[#1a1a1a]/80 hover:bg-zinc-800 active:scale-95 font-medium text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <FolderDown className="h-4 w-4 text-[#00D9FF]" />
                      <span>Choose Folder & Export WAV</span>
                    </button>

                    {/* Choose Folder & Export MP3 */}
                    {masterMp3Url ? (
                      <button
                        onClick={() => handleExportToFolder("mp3")}
                        className="min-h-[46px] px-4 rounded-[8px] border border-[#00D9FF]/30 text-[#00D9FF] bg-[#00D9FF]/5 hover:bg-[#00D9FF]/15 active:scale-95 font-medium text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <FolderDown className="h-4 w-4" />
                        <span>Choose Folder & Export MP3</span>
                      </button>
                    ) : (
                      <div className="min-h-[46px] px-4 rounded-[8px] border border-zinc-800 text-zinc-500 bg-[#1a1a1a]/40 font-medium text-xs flex items-center justify-center gap-2 select-none">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-600 animate-infinite" />
                        <span>Compiling MP3 export...</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Traditional Direct Downloads */}
                <div className="border-t border-zinc-850 pt-3 flex flex-col gap-2">
                  <span className="text-[9px] font-mono text-zinc-500 uppercase">Direct Library Stream (Fallback)</span>
                  <div className="flex flex-wrap gap-2.5">
                    <a
                      href={masterAudioUrl}
                      download="synthesized_voiceover.wav"
                      className="px-3 py-2 rounded-[6px] border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 text-[11px] transition-all duration-150 flex items-center gap-1.5 cursor-pointer font-medium"
                    >
                      <Download className="h-3.5 w-3.5 text-zinc-400" />
                      <span>Download WAV Directly</span>
                    </a>

                    {masterMp3Url ? (
                      <a
                        href={masterMp3Url}
                        download="synthesized_voiceover.mp3"
                        className="px-3 py-2 rounded-[6px] border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 text-[11px] transition-all duration-150 flex items-center gap-1.5 cursor-pointer font-medium"
                      >
                        <Download className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Download MP3 Directly</span>
                      </a>
                    ) : (
                      <span className="text-zinc-600 text-[11px] flex items-center gap-1 font-mono">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Compiling standard MP3 fallback...</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Google Drive Integration Panel */}
        <div className="mt-4 mb-2">
          <GoogleDriveSync
            scriptText={scriptText}
            voiceSettings={voiceSettings}
            lineEmotions={lineEmotions}
            lineSpeeds={lineSpeeds}
            linePauses={linePauses}
            onLoadScript={handleGoogleDriveLoad}
            showToast={showToast}
            recordDiscreteAction={recordDiscreteAction}
          />
        </div>

        {/* Unified Project Controls Bar at the bottom of the workspace */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#181818] p-5 rounded-[12px] border border-zinc-900 shadow-xl animate-fadeIn text-left mt-2" id="bottom-action-controls">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono tracking-[0.2em] text-[#00D9FF] uppercase font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00D9FF] animate-pulse" />
              Project Control Deck
            </span>
            <span className="text-xs text-zinc-400">Ready to synthesize your screenplay? Compile all tracks using the generator.</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {hasSavedDraft && (
              <button
                onClick={handleLoadDraft}
                className="px-5 min-h-[46px] rounded-[8px] border border-[#00D9FF]/20 text-[#00D9FF] bg-[#00D9FF]/5 hover:bg-[#00D9FF]/10 active:scale-[0.98] font-semibold text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer animate-fadeIn select-none"
              >
                <FolderOpen className="h-4 w-4" />
                <span>Load Draft</span>
              </button>
            )}

            <button
              onClick={handleSaveDraft}
              className="px-5 min-h-[46px] rounded-[8px] border border-zinc-850 text-white bg-[#1a1a1a] hover:bg-zinc-800 active:scale-[0.98] font-semibold text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer select-none"
            >
              <Save className="h-4 w-4 text-zinc-400" />
              <span>Save Draft</span>
            </button>

            <button
              onClick={handleGenerateVoiceover}
              disabled={isGenerating}
              className={`min-h-[46px] px-8 rounded-[8px] flex items-center justify-center gap-2 text-black font-bold text-xs sm:text-sm transition-all duration-200 cursor-pointer w-full sm:w-auto shadow-md shadow-[#00D9FF]/10 select-none ${
                isGenerating 
                  ? "bg-zinc-800 text-zinc-400 pointer-events-none" 
                  : "bg-[#00D9FF] hover:bg-[#00c2e6] active:scale-[0.98]"
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                  <span>Synthesizing Dialouge...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 fill-black text-black" />
                  <span>Generate Voiceover</span>
                </>
              )}
            </button>
          </div>
        </div>

      </main>

      {/* Solid Checkmark alert Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-[#1a1a1a] border border-[#00D9FF]/20 px-4 py-3 rounded-[8px] flex items-center gap-2.5 text-[#00D9FF] text-xs font-medium shadow-2xl animate-slideIn z-50">
          <CheckCircle2 className="h-4 w-4 text-[#00D9FF]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
