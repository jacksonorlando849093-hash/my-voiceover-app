import React, { useState, useRef } from "react";
import { DialogueScript, DialogueLine, Character } from "../types";
import { EMOTIONS, STARTER_SCRIPTS, PREBUILT_VOICES } from "../data";
import { getAvatarColor } from "../utils";
import { getCachedAudio, setCachedAudio } from "../utils/audioCache";
import { 
  Users, Plus, Trash2, ArrowUp, ArrowDown, Play, Sparkles, 
  Loader2, ClipboardList, MessageSquarePlus, RefreshCw, CheckCircle, AlertTriangle,
  Scissors, FileText, Type, Download, Info, GripVertical
} from "lucide-react";
import { decodeAudioUrl, audioBufferToMp3, audioBufferToWav, mergeAudioBuffers, triggerFileDownload } from "../utils/mp3Exporter";

const PRESET_CINEMATIC_ACTORS = [
  { name: "Sunny Enthusiast (F)", url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=250&h=250&fit=crop" },
  { name: "Thoughtful Scholar (M)", url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=250&h=250&fit=crop" },
  { name: "Brilliant Researcher (F)", url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=250&h=250&fit=crop" },
  { name: "Expressive Producer (M)", url: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=250&h=250&fit=crop" },
  { name: "Confident Lead (F)", url: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=250&h=250&fit=crop" },
  { name: "Supportive Partner (F)", url: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=250&h=250&fit=crop" },
  { name: "Witty Companion (M)", url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=250&h=250&fit=crop" },
  { name: "Grave Executive (M)", url: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=250&h=250&fit=crop" }
];

interface ScriptWorkbenchProps {
  script: DialogueScript;
  onChange: (updated: DialogueScript) => void;
  onSynthesizeLine: (lineId: string, model?: string) => Promise<string | undefined>;
  globalCastingBook: Character[];
  savedEpisodes: DialogueScript[];
  activeEpisodeId: string;
  onSelectEpisode: (id: string) => void;
  onCreateEpisode: (title: string, copyCast: boolean) => void;
  onDuplicateEpisode: (id: string) => void;
  onDeleteEpisode: (id: string) => void;
  onRenameEpisode: (id: string, newTitle: string) => void;
  onSyncVoicesAcrossEpisodes: () => void;
  onSyncWithGlobalCast: () => void;
  onExportProjectDraft: () => void;
  onImportProjectDraft: (importedData: any) => void;
}

export default function ScriptWorkbench({ 
  script, 
  onChange, 
  onSynthesizeLine,
  globalCastingBook,
  savedEpisodes,
  activeEpisodeId,
  onSelectEpisode,
  onCreateEpisode,
  onDuplicateEpisode,
  onDeleteEpisode,
  onRenameEpisode,
  onSyncVoicesAcrossEpisodes,
  onSyncWithGlobalCast,
  onExportProjectDraft,
  onImportProjectDraft
}: ScriptWorkbenchProps) {
  const getVoicePlaybackRate = (voiceName: string): number => {
    const voice = PREBUILT_VOICES.find(v => v.name === voiceName || v.id === voiceName);
    return voice?.playbackRate || 1.0;
  };

  const [workbenchTab, setWorkbenchTab] = useState<"ai_presets" | "cast" | "paste_import" | "quick_cast">("ai_presets");
  const [aiPrompt, setAiPrompt] = useState("");
  const [speakerCount, setSpeakerCount] = useState(2);
  const [isGenerating, setIsGenerating] = useState(false);

  // --- Dynamic Episode Scripting Studio States & Hooks ---
  const [episodeScript, setEpisodeScriptInternal] = useState("");
  const [unassignedSpeakers, setUnassignedSpeakers] = useState<string[]>([]);
  const [unassignedVoices, setUnassignedVoices] = useState<Record<string, string>>({});
  const [isGeneratingScriptAudio, setIsGeneratingScriptAudio] = useState(false);
  const [stitchedAudioUrl, setStitchedAudioUrl] = useState<string | null>(null);
  const [stitchedAudioRawBlob, setStitchedAudioRawBlob] = useState<Blob | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileProgress, setCompileProgress] = useState(0);

  // States for drag-and-drop reordering of dialogue lines
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // States for AI Voice auto-assign prompt
  const [voiceAssignPrompt, setVoiceAssignPrompt] = useState("");
  const [isAssigningVoices, setIsAssigningVoices] = useState(false);

  // Sync episode script on dynamic activeEpisodeId switch
  React.useEffect(() => {
    setStitchedAudioUrl(null);
    setStitchedAudioRawBlob(null);
    const saved = localStorage.getItem(`episode-script-raw-${activeEpisodeId}`);
    if (saved) {
      setEpisodeScriptInternal(saved);
    } else {
      setEpisodeScriptInternal(
        "[Zephyr]: Hey Puck! Did you double-check the warp gate coordinates? [pause 0.5s]\n" +
        "[Puck]: (excited) Yes, Zephyr! Nav-deck is fully primed and locked for lightspeed. [excited]\n" +
        "[Zephyr]: [whisper] Softly, Puck! We don't want the quantum engine noise waking up the pilot."
      );
    }
  }, [activeEpisodeId]);

  const setEpisodeScript = (text: string) => {
    setEpisodeScriptInternal(text);
    localStorage.setItem(`episode-script-raw-${activeEpisodeId}`, text);
  };

  const startScriptAudioCompilation = async (
    parsedLines: { speakerName: string; dialogueText: string; emotion: string, rawLineText: string }[],
    chosenRecord: Record<string, string>
  ) => {
    setIsGeneratingScriptAudio(true);
    setGenerationProgress(1);
    setStitchedAudioUrl(null);
    setStitchedAudioRawBlob(null);

    // 1. Synchronize newly parsed actors casting continuity ledger
    const nextCharacters = [...script.characters];
    for (const name of Object.keys(chosenRecord)) {
      const matchLower = name.toLowerCase().trim();
      const existing = nextCharacters.find(c => c.name.toLowerCase().trim() === matchLower);
      if (!existing) {
        const freshId = `char_${Math.random().toString(36).substr(2, 9)}`;
        nextCharacters.push({
          id: freshId,
          name: name,
          voice: chosenRecord[name],
          avatarSeed: name.toLowerCase().trim()
        });
      } else {
        existing.voice = chosenRecord[name];
      }
    }

    // 1.1 group the lines into chunks of max 4000 characters per chunk. 
    // This strictly respects the 4000 character limit without splitting a single line.
    const chunks: typeof parsedLines[] = [];
    let currentChunk: typeof parsedLines = [];
    let currentChunkLen = 0;
    const maxChars = 4000;

    for (const pLine of parsedLines) {
      const lineLen = pLine.rawLineText.length + 1; // +1 for newline boundary
      if (currentChunkLen + lineLen > maxChars && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [pLine];
        currentChunkLen = lineLen;
      } else {
        currentChunk.push(pLine);
        currentChunkLen += lineLen;
      }
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    // 2. Build Dialogue sequential timeline track
    const nextLines: any[] = [];
    const chunkLineIds: string[][] = [];
    let lineIdxGlobal = 0;

    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      const chunkLines = chunks[cIdx];
      const lineIdsInChunk: string[] = [];

      for (const p of chunkLines) {
        const charObj = nextCharacters.find(c => c.name.toLowerCase().trim() === p.speakerName.toLowerCase().trim());
        const charId = charObj ? charObj.id : "char_unknown";
        const lineId = `line_${lineIdxGlobal}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        nextLines.push({
          id: lineId,
          characterId: charId,
          text: p.dialogueText,
          emotion: p.emotion,
        });

        lineIdsInChunk.push(lineId);
        lineIdxGlobal++;
      }
      chunkLineIds.push(lineIdsInChunk);
    }

    // 3. Commit state changes
    const updatedScript = {
      ...script,
      characters: nextCharacters,
      lines: nextLines
    };
    onChange(updatedScript);

    // Dynamic React batch state flush threshold
    await new Promise(r => setTimeout(r, 200));

    // 4. Parallelized Batch synthesis with controlled concurrency (3 workers) for extreme responsiveness
    const idToAudioUrlMap: Record<string, string> = {};
    const totalLinesCount = nextLines.length;
    let processedLinesCount = 0;

    const allLineIds = chunkLineIds.flat();
    const executeWorkers = async (ids: string[]) => {
      while (ids.length > 0) {
        const lineId = ids.shift();
        if (!lineId) break;
        try {
          const url = await onSynthesizeLine(lineId, "gemini-3.1-flash-tts-preview");
          if (url) {
            idToAudioUrlMap[lineId] = url;
          }
        } catch (err) {
          console.error("Single line synthesis error:", err);
        } finally {
          processedLinesCount++;
          setGenerationProgress(Math.round((processedLinesCount / totalLinesCount) * 100));
        }
      }
    };

    // Spawn 3 concurrent workers to process the queue in parallel
    const workerCount = Math.min(3, allLineIds.length);
    const workers = [];
    const queue = [...allLineIds];
    for (let i = 0; i < workerCount; i++) {
      workers.push(executeWorkers(queue));
    }
    await Promise.all(workers);

    // 5. Stitching all line outputs sequentially into one continuous audio track
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decodedBuffers: AudioBuffer[] = [];

      for (const line of nextLines) {
        const url = idToAudioUrlMap[line.id];
        if (url) {
          try {
            const buf = await decodeAudioUrl(audioCtx, url);
            decodedBuffers.push(buf);
          } catch (e) {
            console.warn("Failed to decode audio for stitching line ID:", line.id, e);
          }
        }
      }

      if (decodedBuffers.length > 0) {
        // Stitch with gapSeconds = 0.4s to maintain beautiful pacing, but zero extra gaps between chunks/boundaries
        const stitchedBuffer = mergeAudioBuffers(audioCtx, decodedBuffers, 0.4);
        const wavBlob = audioBufferToWav(stitchedBuffer);
        const wavUrl = URL.createObjectURL(wavBlob);
        setStitchedAudioUrl(wavUrl);
        setStitchedAudioRawBlob(wavBlob);
      }
    } catch (stitchErr) {
      console.error("Master Audio stitching failed:", stitchErr);
    }

    setIsGeneratingScriptAudio(false);
  };

  const compileEpisodeAudio = async (format: "mp3" | "wav" | "srt") => {
    setIsCompiling(true);
    setCompileProgress(10);
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decodedBuffers: AudioBuffer[] = [];
      const linesWithAudio = script.lines.filter(l => l.audioUrl);
      
      if (linesWithAudio.length === 0) {
        alert("Please generate audio for some script lines first.");
        setIsCompiling(false);
        return;
      }

      setCompileProgress(30);
      
      const linesMeta: { speaker: string, text: string, duration: number, start: number, end: number }[] = [];
      let currentOffset = 0;
      const gapSeconds = 0.4; // Updated default separator gap to match the 0.4s stitched gap

      // Sequential audio decoder
      for (let i = 0; i < script.lines.length; i++) {
        const line = script.lines[i];
        const speakerChar = script.characters.find(c => c.id === line.characterId);
        const speakerName = speakerChar ? speakerChar.name : "Unknown";
        
        let buf: AudioBuffer | null = null;
        if (line.audioUrl) {
          try {
            buf = await decodeAudioUrl(audioCtx, line.audioUrl);
          } catch (e) {
            console.warn("Failed to decode audio for line", line.id, e);
          }
        }
        
        // Estimate if audio wasn't loaded
        const duration = buf ? buf.duration : (line.text.length * 0.08 + 1.0);
        
        linesMeta.push({
          speaker: speakerName,
          text: line.text,
          duration,
          start: currentOffset,
          end: currentOffset + duration
        });

        if (buf) {
          decodedBuffers.push(buf);
          currentOffset += duration + gapSeconds;
        } else {
          currentOffset += duration + gapSeconds;
        }
        
        setCompileProgress(Math.min(90, 30 + Math.floor((i / script.lines.length) * 50)));
      }

      setCompileProgress(90);

      if (format === "srt") {
        // Build SRT subtitle text representation
        let srtText = "";
        linesMeta.forEach((meta, idx) => {
          const srtIdx = idx + 1;
          const formatTime = (seconds: number) => {
            const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
            const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
            const s = Math.floor(seconds % 60).toString().padStart(2, "0");
            const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, "0");
            return `${h}:${m}:${s},${ms}`;
          };
          srtText += `${srtIdx}\n${formatTime(meta.start)} --> ${formatTime(meta.end)}\n[${meta.speaker}]: ${meta.text}\n\n`;
        });
        
        const blob = new Blob([srtText], { type: "text/srt" });
        triggerFileDownload(blob, `${script.title || "episode"}_subtitles.srt`);
      } else {
        // Merge Audio Blocks
        const merged = mergeAudioBuffers(audioCtx, decodedBuffers, gapSeconds);
        let outputBlob: Blob;
        let filename = "";

        if (format === "mp3") {
          outputBlob = await audioBufferToMp3(merged);
          filename = `${script.title || "episode"}_audio.mp3`;
        } else {
          outputBlob = audioBufferToWav(merged);
          filename = `${script.title || "episode"}_audio.wav`;
        }
        triggerFileDownload(outputBlob, filename);
      }
      
      setCompileProgress(100);
      setTimeout(() => setIsCompiling(false), 800);
    } catch (err: any) {
      console.error("Failed compiling episode resources:", err);
      alert("Error compiling audio resources: " + err.message);
      setIsCompiling(false);
    }
  };
  // ------------------------------------------------------
  const [testLinePlaying, setTestLinePlaying] = useState<string | null>(null);
  const [activePortraitPickerCharId, setActivePortraitPickerCharId] = useState<string | null>(null);
  const [isGeneratingPortraitForCharId, setIsGeneratingPortraitForCharId] = useState<string | null>(null);
  
  const [expandedVoiceChooserCharId, setExpandedVoiceChooserCharId] = useState<string | null>(null);
  const [castingActiveCategory, setCastingActiveCategory] = useState<"Men" | "Women" | "Kids">("Kids");
  const [castingDemoPlayingVoiceId, setCastingDemoPlayingVoiceId] = useState<string | null>(null);
  const castingAudioRef = useRef<HTMLAudioElement | null>(null);

  // Series planning and editor states
  const [newEpTitle, setNewEpTitle] = useState("");
  const [isCreatingEp, setIsCreatingEp] = useState(false);
  const [copyCastOnCreate, setCopyCastOnCreate] = useState(true);
  const [isRenamingEp, setIsRenamingEp] = useState(false);
  const [renameText, setRenameText] = useState("");

  const playCastingVoiceDemo = async (voiceName: string, voiceId: string) => {
    if (castingAudioRef.current) {
      castingAudioRef.current.pause();
    }
    
    if (castingDemoPlayingVoiceId === voiceId) {
      setCastingDemoPlayingVoiceId(null);
      return;
    }

    setCastingDemoPlayingVoiceId(voiceId);
    try {
      const demoText = `Hi, this is a quick voice demo for ${voiceName}! Ready to bring your screenplay to life in the studio.`;
      
      // 1. Check local persistent cache
      const cachedUrl = await getCachedAudio(demoText, voiceName, "Warm");
      if (cachedUrl) {
        const audio = new Audio(cachedUrl);
        audio.playbackRate = getVoicePlaybackRate(voiceName);
        castingAudioRef.current = audio;
        
        audio.onended = () => {
          setCastingDemoPlayingVoiceId(null);
        };
        audio.onerror = () => {
          setCastingDemoPlayingVoiceId(null);
        };
        await audio.play();
        return;
      }

      // 2. Fall back to API only on cache-miss
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: demoText,
          voice: voiceName,
          emotion: "Warm",
        }),
      });

      const data = await response.json();
      if (data.audioContent) {
        const audioUrl = `data:audio/wav;base64,${data.audioContent}`;
        
        // 3. Save to local persistent cache
        await setCachedAudio(demoText, voiceName, "Warm", audioUrl);

        const audio = new Audio(audioUrl);
        audio.playbackRate = getVoicePlaybackRate(voiceName);
        castingAudioRef.current = audio;
        
        audio.onended = () => {
          setCastingDemoPlayingVoiceId(null);
        };
        audio.onerror = () => {
          setCastingDemoPlayingVoiceId(null);
        };
        await audio.play();
      } else {
        setCastingDemoPlayingVoiceId(null);
      }
    } catch (e) {
      console.error("Failed voice preview:", e);
      setCastingDemoPlayingVoiceId(null);
    }
  };

  // States for Smart Paste & Importer Workspace
  const [importFormat, setImportFormat] = useState<"line_by_line" | "screenplay" | "prose">("line_by_line");
  const [autoCreateSpeakers, setAutoCreateSpeakers] = useState(true);
  const [parseStageDirections, setParseStageDirections] = useState(true);
  const [skipHeaders, setSkipHeaders] = useState(true);
  const [pasteText, setPasteText] = useState("");

  // Text selection to Voiceover helper states
  const [sourceText, setSourceText] = useState(
    "Speaker 1: Welcome to the futuristic voiceover simulator laboratory.\n" +
    "Speaker 2: Select any sentence or word in this box, and click an actor below to synthesize."
  );
  const [selectedText, setSelectedText] = useState("");
  const selectionTextareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTextareaSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    if (start !== end) {
      const selected = target.value.substring(start, end);
      setSelectedText(selected.trim());
    } else {
      setSelectedText("");
    }
  };

  const handleAssignSelectionToCharacter = async (charId: string) => {
    if (!selectedText.trim()) return;
    
    const newLineId = `line_${Math.random().toString(36).substr(2, 9)}`;
    const newLine: DialogueLine = {
      id: newLineId,
      characterId: charId,
      text: selectedText.trim(),
      emotion: "Neutral",
    };
    
    // Append to script lines state array
    onChange({
      ...script,
      lines: [...script.lines, newLine],
    });
    
    // Reset selection ranges and clean active state
    setSelectedText("");
    if (selectionTextareaRef.current) {
      selectionTextareaRef.current.selectionStart = selectionTextareaRef.current.selectionEnd;
    }
    
    // Instantly trigger high quality speech synthesis for this line
    await onSynthesizeLine(newLineId);
  };

  // Parser mapping helper
  const mapKeywordToEmotion = (paramWord: string): string => {
    const word = paramWord.toLowerCase();
    if (word.includes("whisper") || word.includes("quiet") || word.includes("soft") || word.includes("hush")) return "Whispering";
    if (word.includes("scared") || word.includes("fear") || word.includes("fright") || word.includes("terrify") || word.includes("dread") || word.includes("nervous") || word.includes("anxious")) return "Fearful";
    if (word.includes("sad") || word.includes("cry") || word.includes("weep") || word.includes("sorrow") || word.includes("sigh") || word.includes("gloom") || word.includes("pity")) return "Sad";
    if (word.includes("angr") || word.includes("furi") || word.includes("mad") || word.includes("yell") || word.includes("shout") || word.includes("rage") || word.includes("hostile") || word.includes("stern")) return "Angry";
    if (word.includes("excit") || word.includes("laugh") || word.includes("gigg") || word.includes("happ") || word.includes("joy") || word.includes("cheer") || word.includes("glad") || word.includes("opti")) return "Excited";
    if (word.includes("warm") || word.includes("friend") || word.includes("gentle") || word.includes("kind") || word.includes("love") || word.includes("sweet")) return "Warm";
    if (word.includes("sarcas") || word.includes("mock") || word.includes("iron") || word.includes("cynic") || word.includes("smug") || word.includes("snark")) return "Sarcastic";
    if (word.includes("anxi") || word.includes("nerv") || word.includes("worr") || word.includes("tense") || word.includes("panick")) return "Anxious";
    if (word.includes("confid") || word.includes("proud") || word.includes("bold") || word.includes("strong") || word.includes("brave")) return "Confident";
    return "Neutral";
  };

  const parsedPreviewItems = React.useMemo(() => {
    if (!pasteText.trim()) return [];
    
    const lines = pasteText.split("\n");
    const parsedItems: Array<{
      speakerName: string;
      originalText: string;
      cleanedText: string;
      emotion: string;
      isNewSpeaker: boolean;
      isHeader: boolean;
      matchedCharacterId: string | null;
    }> = [];
    
    let currentSpeaker = "";
    
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      
      // Look for screenplay scene headers
      const isHeaderLine = skipHeaders && (
        trimmed.startsWith("INT.") ||
        trimmed.startsWith("EXT.") ||
        /^(scene|act|chapter|scene\s|act\s|chapter\s)\s*/i.test(trimmed) ||
        (trimmed.toUpperCase() === trimmed && (trimmed.startsWith("SCENE") || trimmed.startsWith("ACT") || trimmed.startsWith("SCREENPLAY")))
      );
      
      if (isHeaderLine) {
        parsedItems.push({
          speakerName: "SYSTEM_HEADER",
          originalText: trimmed,
          cleanedText: trimmed,
          emotion: "Neutral",
          isNewSpeaker: false,
          isHeader: true,
          matchedCharacterId: null,
        });
        continue;
      }
      
      // Screenplay format check: If line is completely UPPERCASE, short, has no basic punctuation, and we are in screenplay format, it is a speaker definition!
      const isScreenplayName = 
        importFormat === "screenplay" &&
        trimmed.length < 25 &&
        /^[A-Z0-9\s._-]+$/.test(trimmed) &&
        !trimmed.includes(".") && !trimmed.includes(",") && !trimmed.includes("?") && !trimmed.includes("!");
        
      if (isScreenplayName) {
        currentSpeaker = trimmed.trim();
        // Remove trailing descriptors like (O.S.) or (cont'd) or (V.O.)
        currentSpeaker = currentSpeaker.replace(/\(.*\)/g, "").trim();
        continue;
      }
      
      let parsedSpeaker = currentSpeaker;
      let dialogueText = trimmed;
      
      // Line-by-Line format: Look for Name: text or Name - text
      const separatorMatch = trimmed.match(/^([^:-]+)[:|-]\s*(.*)$/);
      if (importFormat === "line_by_line" && separatorMatch) {
         parsedSpeaker = separatorMatch[1].trim();
         dialogueText = separatorMatch[2].trim();
      } else if (importFormat === "prose") {
         // In prose, alternate between first 2 characters
         const pIdx = parsedItems.filter(item => !item.isHeader).length;
         const backupChar = script.characters[pIdx % script.characters.length];
         parsedSpeaker = backupChar ? backupChar.name : "Narrator";
      }
      
      if (!parsedSpeaker) {
        // Fallback to first existing character of the workspace
        parsedSpeaker = script.characters[0]?.name || "Speaker 1";
      }
      
      // Look for parenthetical or bracketed action modifiers (e.g., "(whispering) No problem")
      let finalEmotion = "Neutral";
      let cleanedText = dialogueText;
      
      if (parseStageDirections) {
        const stageMatch = dialogueText.match(/[([*]([^)\]*]+)[)\]*]/);
        if (stageMatch) {
          finalEmotion = mapKeywordToEmotion(stageMatch[1]);
          // Strip parenthetical/brackets
          cleanedText = dialogueText.replace(/[([*]([^)\]*]+)[)\]*]/g, "").replace(/\s+/g, " ").trim();
        }
      }
      
      if (!cleanedText) continue;
      
      // Match active casting deck name
      const matchingChar = script.characters.find(
        (c) => c.name.toLowerCase() === parsedSpeaker.toLowerCase() ||
               c.name.toLowerCase().includes(parsedSpeaker.toLowerCase()) ||
               parsedSpeaker.toLowerCase().includes(c.name.toLowerCase())
      );
      
      parsedItems.push({
        speakerName: parsedSpeaker,
        originalText: trimmed,
        cleanedText,
        emotion: finalEmotion,
        isNewSpeaker: !matchingChar,
        isHeader: false,
        matchedCharacterId: matchingChar ? matchingChar.id : null,
      });
    }
    
    return parsedItems;
  }, [pasteText, importFormat, autoCreateSpeakers, parseStageDirections, skipHeaders, script.characters]);

  // Execute actual paste script import
  const handleExecuteImport = (mode: "append" | "replace") => {
    if (parsedPreviewItems.length === 0) {
      alert("No valid speech lines parsed. Please check your formatted text or format selection.");
      return;
    }
    
    // Identify unique new characters
    const newlyCreatedCharacters: Character[] = [];
    
    if (autoCreateSpeakers) {
      const uniqueNewNames = Array.from(new Set<string>(
        parsedPreviewItems
          .filter((item) => item.isNewSpeaker && !item.isHeader && item.speakerName !== "SYSTEM_HEADER")
          .map((item) => item.speakerName)
      ));
      
      const voices: Array<"Puck" | "Charon" | "Kore" | "Fenrir" | "Zephyr"> = [
        "Zephyr", "Puck", "Kore", "Fenrir", "Charon"
      ];
      
      uniqueNewNames.forEach((name, i) => {
        const id = `char_${Math.random().toString(36).substr(2, 5)}_${Date.now()}_${i}`;
        
        // Search the Golden casting ledger across our episodes first!
        const globalMatch = globalCastingBook.find(
          (gc) => gc.name.toLowerCase().trim() === name.toLowerCase().trim()
        );

        if (globalMatch) {
          newlyCreatedCharacters.push({
            id,
            name,
            voice: globalMatch.voice,
            avatarSeed: globalMatch.avatarSeed,
            avatarUrl: globalMatch.avatarUrl,
            description: globalMatch.description || `Imported speaker profile for ${name}`,
          });
        } else {
          const voice = voices[Math.floor(Math.random() * voices.length)];
          const avatarSeed = `${name.toLowerCase()}-${Math.floor(Math.random() * 100)}`;
          newlyCreatedCharacters.push({
            id,
            name,
            voice,
            avatarSeed,
            description: `Imported speaker profile for ${name}`,
          });
        }
      });
    }
    
    const combinedCharacters = mode === "replace"
      ? (newlyCreatedCharacters.length > 0 ? newlyCreatedCharacters : [...script.characters])
      : [...script.characters, ...newlyCreatedCharacters];
      
    // Create dialogues
    const importedLines: DialogueLine[] = parsedPreviewItems
      .filter((item) => !item.isHeader && item.speakerName !== "SYSTEM_HEADER")
      .map((item, idx) => {
        let characterId = item.matchedCharacterId;
        
        // If it was newly created
        if (!characterId && autoCreateSpeakers) {
          const fresh = newlyCreatedCharacters.find(
            (c) => c.name.toLowerCase() === item.speakerName.toLowerCase()
          );
          if (fresh) {
            characterId = fresh.id;
          }
        }
        
        // Final fallback if character not assigned
        if (!characterId) {
          characterId = combinedCharacters[0]?.id || "char_default";
        }
        
        return {
          id: `line_imported_${Math.random().toString(36).substr(2, 5)}_${idx}`,
          characterId,
          text: item.cleanedText,
          emotion: item.emotion,
        };
      });
      
    onChange({
      title: mode === "replace" ? "Imported Script Draft" : script.title || "Dialogue Script",
      characters: combinedCharacters,
      lines: mode === "replace" ? importedLines : [...script.lines, ...importedLines],
    });
    
    alert(`Success! Successfully imported ${importedLines.length} lines. ${newlyCreatedCharacters.length > 0 ? `Created ${newlyCreatedCharacters.length} new actor profiles: ${newlyCreatedCharacters.map(c => c.name).join(", ")}.` : ""}`);
    setPasteText("");
    setWorkbenchTab("ai_presets"); // Switch back to see or work with synthesized lines
  };

  const handleBulkParseSourceText = () => {
    if (!sourceText.trim()) return;
    
    const lineStrings = sourceText.split("\n");
    const parsedLines: DialogueLine[] = [];
    
    lineStrings.forEach((l) => {
      const trimmed = l.trim();
      if (!trimmed) return;
      
      // Attempt separator-based parsing: matching "Actor Name: Voice dialogue text"
      const match = trimmed.match(/^([^:-]+)[:|-](.*)$/);
      let characterId = script.characters[0]?.id || "char_default";
      let text = trimmed;
      
      if (match) {
        const speakerPrefix = match[1].trim().toLowerCase();
        const speechStr = match[2].trim();
        
        const matchingChar = script.characters.find(
          (c) => c.name.toLowerCase() === speakerPrefix || 
                 c.name.toLowerCase().includes(speakerPrefix) || 
                 speakerPrefix.includes(c.name.toLowerCase())
        );
        
        if (matchingChar) {
          characterId = matchingChar.id;
          text = speechStr;
        }
      }
      
      parsedLines.push({
        id: `line_${Math.random().toString(36).substr(2, 9)}`,
        characterId,
        text,
        emotion: "Neutral",
      });
    });
    
    if (parsedLines.length > 0) {
      onChange({
        ...script,
        lines: [...script.lines, ...parsedLines],
      });
      alert(`Import complete: Appended ${parsedLines.length} individual voiceover lines based on active characters.`);
    }
  };

  // Load predefined preset template script
  const handleLoadTemplate = (template: DialogueScript) => {
    // Create deep copy to avoid reference sharing issues
    const copied: DialogueScript = {
      title: template.title,
      characters: template.characters.map((c) => ({ ...c })),
      lines: template.lines.map((l) => ({ ...l, id: `line_${Math.random().toString(36).substr(2, 9)}`, audioUrl: undefined })),
    };
    onChange(copied);
  };

  // Generate Dialogue Script from custom prompt using Gemini
  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: aiPrompt,
          speakerCount,
        }),
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      // Convert network lines into local state models
      const generatedCharacters: Character[] = data.characters.map((c: any) => ({
        id: c.id,
        name: c.name,
        voice: c.voice,
        avatarSeed: c.avatarSeed,
        description: c.description
      }));

      const generatedLines: DialogueLine[] = data.lines.map((l: any, idx: number) => ({
        id: `line_${idx}_${Math.random().toString(36).substr(2, 5)}`,
        characterId: l.characterId,
        text: l.text,
        emotion: l.emotion || "Neutral",
      }));

      onChange({
        title: data.title || "AI Script dialogue",
        characters: generatedCharacters,
        lines: generatedLines,
      });

      setAiPrompt("");
    } catch (err) {
      console.error("AI Script generation error:", err);
      alert("Failed to generate dialogue script automatically. Check parameters or API secrets configuration.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAutoAssignVoices = async () => {
    if (!voiceAssignPrompt.trim()) {
      alert("Please type some voice guidelines or casting instructions first.");
      return;
    }
    setIsAssigningVoices(true);

    try {
      const response = await fetch("/api/auto-assign-voices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          characters: script.characters,
          prompt: voiceAssignPrompt,
          availableVoices: PREBUILT_VOICES,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to auto-assign voices.");
      }

      const data = await response.json();
      if (data && Array.isArray(data.assignments)) {
        let changedCount = 0;
        let updatedLines = [...script.lines];

        const nextCharacters = script.characters.map((char) => {
          const matched = data.assignments.find(
            (a: any) => a.characterId === char.id
          );
          if (matched && matched.voice) {
            const voiceChanged = matched.voice !== char.voice;
            if (voiceChanged) {
              changedCount++;
              updatedLines = updatedLines.map((l) => {
                if (l.characterId === char.id) {
                  return { ...l, audioUrl: undefined };
                }
                return l;
              });
              return { ...char, voice: matched.voice };
            }
          }
          return char;
        });

        if (changedCount > 0) {
          onChange({
            ...script,
            characters: nextCharacters,
            lines: updatedLines,
          });
          alert(`Successfully auto-cast ${changedCount} character(s) using Gemini AI based on your directions!`);
          setVoiceAssignPrompt("");
        } else {
          alert("All characters' assigned voiceovers are already fully optimized to your casting guidelines.");
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "An error occurred during AI auto-casting.");
    } finally {
      setIsAssigningVoices(false);
    }
  };

  // Character modifications
  const handleUpdateCharacter = (charId: string, updates: Partial<Character>) => {
    const updatedChars = script.characters.map((c) => {
      if (c.id === charId) {
        // If voice changed, clear older audios generated by previous voices so we don't play stale audio!
        const voiceChanged = updates.voice && updates.voice !== c.voice;
        if (voiceChanged) {
          script.lines = script.lines.map((l) => {
            if (l.characterId === charId) {
              return { ...l, audioUrl: undefined };
            }
            return l;
          });
        }
        return { ...c, ...updates };
      }
      return c;
    });
    onChange({ ...script, characters: updatedChars });
  };

  const handleAddCharacter = () => {
    const id = `char_${Math.random().toString(36).substr(2, 5)}`;
    const voiceNames: Array<"Puck" | "Charon" | "Kore" | "Fenrir" | "Zephyr"> = [
      "Zephyr", "Puck", "Kore", "Fenrir", "Charon"
    ];
    const pickedVoice = voiceNames[script.characters.length % voiceNames.length];
    
    const newChar: Character = {
      id,
      name: `Speaker ${script.characters.length + 1}`,
      voice: pickedVoice,
      avatarSeed: `seed-${Math.floor(Math.random() * 1000)}`,
      description: "Dialogue speaker",
    };
    
    onChange({
      ...script,
      characters: [...script.characters, newChar],
    });
  };

  const handleDeleteCharacter = (charId: string) => {
    if (script.characters.length <= 1) {
      alert("The script must have at least one character.");
      return;
    }
    const filteredChars = script.characters.filter((c) => c.id !== charId);
    // Remove lines belonging to deleted character
    const remainingLines = script.lines.filter((l) => l.characterId !== charId);
    onChange({
      ...script,
      characters: filteredChars,
      lines: remainingLines,
    });
  };

  const handleApplyEmotionToAllLines = (charId: string, emotion: string) => {
    const updatedLines = script.lines.map((l) => {
      if (l.characterId === charId) {
        const isChanged = l.emotion !== emotion;
        return {
          ...l,
          emotion,
          ...(isChanged ? { audioUrl: undefined } : {}),
        };
      }
      return l;
    });
    onChange({ ...script, lines: updatedLines });
  };

  const handleGenerateAiPortrait = async (charId: string) => {
    const char = script.characters.find((c) => c.id === charId);
    if (!char) return;

    setIsGeneratingPortraitForCharId(charId);
    try {
      const response = await fetch("/api/generate-portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: char.name,
          avatarSeed: char.avatarSeed,
          voice: char.voice,
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      if (data.imageUrl) {
        handleUpdateCharacter(charId, { avatarUrl: data.imageUrl });
      }
    } catch (err: any) {
      console.error("AI portrait generation failure:", err);
      alert(`AI Portrait generation failed: ${err.message || "Please check connection or API configurations"}.\nFall back to our high fidelity cinematic human presets below!`);
    } finally {
      setIsGeneratingPortraitForCharId(null);
    }
  };

  // Dialogue Line modifications
  const handleAddLine = () => {
    const defaultChar = script.characters[0]?.id || "char_default";
    const newLine: DialogueLine = {
      id: `line_${Math.random().toString(36).substr(2, 9)}`,
      characterId: defaultChar,
      text: "",
      emotion: "Neutral",
    };
    onChange({
      ...script,
      lines: [...script.lines, newLine],
    });
  };

  const handleLineChange = (lineId: string, updates: Partial<DialogueLine>) => {
    const updatedLines = script.lines.map((l) => {
      if (l.id === lineId) {
        // If content text or character or emotion changes, clear cached audio
        const isChanged = (updates.text !== undefined && updates.text !== l.text) ||
                          (updates.characterId !== undefined && updates.characterId !== l.characterId) ||
                          (updates.emotion !== undefined && updates.emotion !== l.emotion);
        return {
          ...l,
          ...updates,
          ...(isChanged ? { audioUrl: undefined } : {})
        };
      }
      return l;
    });
    onChange({ ...script, lines: updatedLines });
  };

  const handleDeleteLine = (lineId: string) => {
    onChange({
      ...script,
      lines: script.lines.filter((l) => l.id !== lineId),
    });
  };

  const handleMoveLine = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= script.lines.length) return;

    const reordered = [...script.lines];
    const temp = reordered[index];
    reordered[index] = reordered[targetIdx];
    reordered[targetIdx] = temp;

    onChange({
      ...script,
      lines: reordered,
    });
  };

  const testPlayLineAudio = async (line: DialogueLine) => {
    if (testLinePlaying === line.id) return;
    
    let audioUrl = line.audioUrl;
    if (!audioUrl) {
      // Trigger dynamic generation first
      setTestLinePlaying(line.id);
      audioUrl = await onSynthesizeLine(line.id);
    }

    if (audioUrl) {
      setTestLinePlaying(line.id);
      const audio = new Audio(audioUrl);
      const character = script.characters.find(c => c.id === line.characterId);
      if (character) {
        audio.playbackRate = getVoicePlaybackRate(character.voice);
      }
      audio.onended = () => setTestLinePlaying(null);
      audio.onerror = () => setTestLinePlaying(null);
      await audio.play();
    } else {
      setTestLinePlaying(null);
    }
  };

  return (
    <div className="space-y-6" id="script-workbench">
      {/* 🚀 Episode Script & Multi-Speaker Studio Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 text-left" id="episode-script-studio">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-sans font-bold text-white flex items-center gap-2">
              <span className="p-1 px-2 rounded-md bg-indigo-505/20 border border-indigo-500/20 text-indigo-400 font-mono text-xs select-none">STUDIO</span>
              Episode Script Dashboard
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Paste your continuous script. Our engine maps voices, coordinates dramatic emotions, and builds full episodes in WAV, MP3, and SRT.
            </p>
          </div>
          <span className="text-[10px] uppercase bg-indigo-950/80 text-indigo-400 border border-indigo-900 px-2.5 py-1 rounded-full font-mono font-bold">
            Model: gemini-3.1-flash-tts-preview
          </span>
        </div>

        {/* Text Area Input */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block font-bold">
            Episode Script:
          </label>
          <textarea
            value={episodeScript}
            onChange={(e) => setEpisodeScript(e.target.value)}
            rows={8}
            className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 text-slate-200 placeholder-slate-600 text-xs leading-relaxed p-4 rounded-xl focus:outline-none font-mono resize-y min-h-[160px]"
            placeholder="[CHARACTER NAME]: Dialogue text [pause 0.8s] [angry] or [whisper]..."
          />
          <span className="text-[10px] text-slate-500 block leading-normal">
            Format: <code className="text-slate-400 font-mono bg-slate-950 px-1 py-0.5 rounded">[CHARACTER NAME]: dialogue line [pause 0.8s] or or.[angry][whisper]</code>. Inline bracket tags apply emotional parameters seamlessly.
          </span>
        </div>

        {/* Generate / Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <button
            onClick={async () => {
              // Parse Logic
              const linesStr = episodeScript.split("\n");
              const parsedLines: { speakerName: string; dialogueText: string; emotion: string; rawLineText: string }[] = [];
              
              for (const row of linesStr) {
                if (!row.trim()) continue;
                const match = row.match(/^\s*\[?([^\]\n:]+)\]?:\s*(.*)$/);
                if (match) {
                  const speaker = match[1].trim();
                  const text = match[2].trim();
                  
                  let emotion = "Neutral";
                  const lower = text.toLowerCase();
                  if (lower.includes("[angry]") || lower.includes("(angry)")) emotion = "Angry";
                  else if (lower.includes("[excited]") || lower.includes("(excited)")) emotion = "Excited";
                  else if (lower.includes("[whisper]") || lower.includes("(whisper)") || lower.includes("[soft]") || lower.includes("(soft)")) emotion = "Soft";
                  else if (lower.includes("[happy]") || lower.includes("(happy)")) emotion = "Happy";
                  else if (lower.includes("[warm]") || lower.includes("(warm)") || lower.includes("[calm]") || lower.includes("(calm)")) emotion = "Soft";
                  
                  // Clean emotional tags
                  const cleaned = text
                    .replace(/\[angry\]|\(angry\)/gi, "")
                    .replace(/\[excited\]|\(excited\)/gi, "")
                    .replace(/\[whisper\]|\(whisper\)|\[soft\]|\(soft\)/gi, "")
                    .replace(/\[happy\]|\(happy\)/gi, "")
                    .replace(/\[warm\]|\(warm\)|\[calm\]|\(calm\)/gi, "")
                    .replace(/\s+/g, " ")
                    .trim();
                    
                  parsedLines.push({ speakerName: speaker, dialogueText: cleaned, emotion, rawLineText: row });
                }
              }

              if (parsedLines.length === 0) {
                alert("Could not find any dialogue lines. Ensure you format lines as '[Name]: dialogue text'.");
                return;
              }

              // Evaluate Characters Casting Deck mapping
              const uniqueNames = Array.from(new Set(parsedLines.map(p => p.speakerName)));
              const missingList: string[] = [];
              const chosenRecord: Record<string, string> = {};

              for (const name of uniqueNames) {
                let currentVoice = "";
                // check active episode characters
                const activeC = script.characters.find(c => c.name.toLowerCase() === name.toLowerCase());
                if (activeC && activeC.voice) currentVoice = activeC.voice;
                
                // check global continuity board
                if (!currentVoice) {
                  const gc = globalCastingBook.find(c => c.name.toLowerCase() === name.toLowerCase());
                  if (gc && gc.voice) currentVoice = gc.voice;
                }

                // check other episodes
                if (!currentVoice) {
                  for (const ep of savedEpisodes) {
                    const oct = ep.characters.find(c => c.name.toLowerCase() === name.toLowerCase());
                    if (oct && oct.voice) {
                      currentVoice = oct.voice;
                      break;
                    }
                  }
                }

                if (currentVoice) {
                  chosenRecord[name] = currentVoice;
                } else {
                  missingList.push(name);
                }
              }

              if (missingList.length > 0) {
                setUnassignedSpeakers(missingList);
                const defaultMapped: Record<string, string> = {};
                missingList.forEach(m => {
                  defaultMapped[m] = PREBUILT_VOICES[0]?.name || "Zephyr";
                });
                setUnassignedVoices(defaultMapped);
              } else {
                // Execute straight to compilation loop
                await startScriptAudioCompilation(parsedLines, chosenRecord);
              }
            }}
            disabled={isGeneratingScriptAudio}
            className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-xs text-white font-sans font-bold rounded-lg cursor-pointer disabled:cursor-not-allowed shadow transition-all flex items-center justify-center gap-1.5"
          >
            {isGeneratingScriptAudio ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating Audio ({generationProgress}%)
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Generate Audio
              </>
            )}
          </button>
        </div>

        {/* Unassigned Speakers Panel */}
        {unassignedSpeakers.length > 0 && (
          <div className="bg-slate-950/60 p-4 border border-indigo-900/40 rounded-xl space-y-3 animate-fadeIn">
            <h4 className="text-xs font-sans font-bold text-amber-500 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Assign Voices for Characters Found in Script:
            </h4>
            <p className="text-[11px] text-slate-400">
              We found characters that have no voice profile assignment yet. Select a vocal casting for them below:
            </p>
            
            <div className="space-y-2 max-w-lg">
              {unassignedSpeakers.map((name) => (
                <div key={name} className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-xs font-mono font-bold text-slate-200">{name}</span>
                  <select
                    value={unassignedVoices[name]}
                    onChange={(e) => {
                      setUnassignedVoices({
                        ...unassignedVoices,
                        [name]: e.target.value
                      });
                    }}
                    className="bg-slate-950 text-indigo-305 text-xs border border-slate-800 rounded-lg px-2 py-1 outline-none cursor-pointer"
                  >
                    {PREBUILT_VOICES.map((v) => (
                      <option key={v.id} value={v.name}>
                        {v.name} ({v.category} - {v.subCategory})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setUnassignedSpeakers([])}
                className="px-3 py-1.5 bg-slate-805 hover:bg-slate-700 text-xs text-slate-300 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  // Compile lines and start synthesize with new mappings
                  const linesStr = episodeScript.split("\n");
                  const parsedLines: { speakerName: string; dialogueText: string; emotion: string; rawLineText: string }[] = [];
                  for (const row of linesStr) {
                    if (!row.trim()) continue;
                    const match = row.match(/^\s*\[?([^\]\n:]+)\]?:\s*(.*)$/);
                    if (match) {
                      const speaker = match[1].trim();
                      const text = match[2].trim();
                      let emotion = "Neutral";
                      const lower = text.toLowerCase();
                      if (lower.includes("[angry]") || lower.includes("(angry)")) emotion = "Angry";
                      else if (lower.includes("[excited]") || lower.includes("(excited)")) emotion = "Excited";
                      else if (lower.includes("[whisper]") || lower.includes("(whisper)") || lower.includes("[soft]") || lower.includes("(soft)")) emotion = "Soft";
                      else if (lower.includes("[happy]") || lower.includes("(happy)")) emotion = "Happy";
                      else if (lower.includes("[warm]") || lower.includes("(warm)") || lower.includes("[calm]") || lower.includes("(calm)")) emotion = "Soft";
                      
                      const cleaned = text
                        .replace(/\[angry\]|\(angry\)/gi, "")
                        .replace(/\[excited\]|\(excited\)/gi, "")
                        .replace(/\[whisper\]|\(whisper\)|\[soft\]|\(soft\)/gi, "")
                        .replace(/\[happy\]|\(happy\)/gi, "")
                        .replace(/\[warm\]|\(warm\)|\[calm\]|\(calm\)/gi, "")
                        .replace(/\s+/g, " ")
                        .trim();
                        
                      parsedLines.push({ speakerName: speaker, dialogueText: cleaned, emotion, rawLineText: row });
                    }
                  }
                  
                  const combinedDict: Record<string, string> = {};
                  // get all existing voices
                  for (const char of script.characters) {
                    combinedDict[char.name] = char.voice;
                  }
                  // add selected ones
                  for (const name of Object.keys(unassignedVoices)) {
                    combinedDict[name] = unassignedVoices[name];
                  }

                  setUnassignedSpeakers([]);
                  await startScriptAudioCompilation(parsedLines, combinedDict);
                }}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white rounded-lg cursor-pointer animate-pulse"
              >
                Confirm Cast & Generate Audio
              </button>
            </div>
          </div>
        )}

        {/* Generated Dialogue Blocks List */}
        {script.lines.length > 0 && (
          <div className="space-y-3.5 pt-3 border-t border-slate-800">
            <h3 className="text-xs font-sans font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-indigo-400" />
              Generated Audio Players ({script.lines.length} lines):
            </h3>

            {/* 🎧 Main Full Stitched Audio Player at the Top */}
            {stitchedAudioUrl && (
              <div className="bg-slate-950 border border-indigo-500/30 hover:border-indigo-500/50 p-4 rounded-xl space-y-3 animate-fadeIn transition-colors" id="main-stitched-player">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-sans font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      Full Episode Master Track
                    </h4>
                    <p className="text-[10px] text-slate-400">
                      This is the fully stitched, gap-free Master Audio compilation of all lines for {script.title || "the entire episode"}.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-900 px-2.5 py-0.5 rounded-full select-none">
                    Continuous Playback Enabled
                  </span>
                </div>
                <div className="flex items-center gap-3 bg-slate-900 border border-slate-850 p-2.5 rounded-lg">
                  <audio
                    src={stitchedAudioUrl}
                    controls
                    className="w-full h-8 rounded bg-slate-950"
                  />
                </div>
              </div>
            )}

             <div className="grid grid-cols-1 gap-3 max-h-[380px] overflow-y-auto pr-1.5 scrollbar-thin">
              {script.lines.map((line, index) => {
                const char = script.characters.find(c => c.id === line.characterId);
                const colors = char ? getAvatarColor(char.avatarSeed) : { bg: "#1e1e38", secondary: "#4f46e5" };
                const isLineGenerating = line.loading;
                const isItemDragged = draggedIndex === index;
                const isItemDragOver = dragOverIndex === index;

                return (
                  <div 
                    key={line.id} 
                    draggable
                    onDragStart={(e) => {
                      setDraggedIndex(index);
                      e.dataTransfer.effectAllowed = "move";
                      // Set data for backward-compatibility & Firefox support
                      e.dataTransfer.setData("text/plain", index.toString());
                    }}
                    onDragEnd={() => {
                      setDraggedIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedIndex === null || draggedIndex === index) return;
                      setDragOverIndex(index);
                    }}
                    onDragLeave={() => {
                      if (dragOverIndex === index) {
                        setDragOverIndex(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedIndex === null || draggedIndex === index) {
                        setDraggedIndex(null);
                        setDragOverIndex(null);
                        return;
                      }

                      const reordered = [...script.lines];
                      const [removed] = reordered.splice(draggedIndex, 1);
                      reordered.splice(index, 0, removed);

                      onChange({
                        ...script,
                        lines: reordered,
                      });

                      setDraggedIndex(null);
                      setDragOverIndex(null);
                    }}
                    className={`p-3 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all duration-200 ${
                      isItemDragged 
                        ? "opacity-30 bg-slate-900 border-2 border-dashed border-indigo-500/50 scale-[0.98] cursor-grabbing" 
                        : isItemDragOver
                        ? "bg-indigo-950/20 border-2 border-indigo-400 shadow-xl scale-[1.01] -translate-y-0.5 cursor-grab"
                        : "bg-slate-950/45 border border-slate-850 hover:bg-slate-900/65 border-slate-800/80 hover:border-slate-750 cursor-grab"
                    }`}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Vertical Grip Handle */}
                      <div className="shrink-0 pt-2 text-slate-500 hover:text-indigo-400 transition-colors pointer-events-none select-none">
                        <GripVertical className="h-4 w-4" />
                      </div>

                      {/* Avatar */}
                      <div className="shrink-0 select-none pointer-events-none">
                        {char?.avatarUrl ? (
                          <img
                            src={char.avatarUrl}
                            alt=""
                            className="h-9 w-9 rounded-full object-cover border border-slate-800"
                          />
                        ) : (
                          <div
                            className="h-9 w-9 rounded-full flex items-center justify-center text-[10px] font-bold text-white uppercase"
                            style={{ backgroundColor: colors.bg, border: `1px solid ${colors.secondary}` }}
                          >
                            {char ? char.name.substring(0, 1) : "?"}
                          </div>
                        )}
                      </div>
 
                      {/* Name & Subtitle Dialogue line */}
                      <div className="space-y-1 text-left min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-200">
                            {char ? char.name : "Speaker"}
                          </span>
                          {line.emotion !== "Neutral" && (
                            <span className="text-[9px] font-mono uppercase font-bold bg-indigo-950 text-indigo-300 border border-indigo-900 px-1.5 rounded">
                              🎭 {line.emotion}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 font-sans italic truncate max-w-xl" title={line.text}>
                          "{line.text}"
                        </p>
                      </div>
                    </div>
 
                    {/* Play track & Individual Line Regenerator button */}
                    <div className="flex items-center gap-2 w-full md:w-auto shrink-0 justify-end" onClick={(e) => e.stopPropagation()}>
                      {line.audioUrl ? (
                        <audio
                          src={line.audioUrl}
                          controls
                          className="h-7 w-48 sm:w-56 rounded bg-slate-950"
                        />
                      ) : (
                        <div className="h-7 w-48 sm:w-56 flex items-center justify-center border border-dashed border-slate-800 rounded bg-slate-900/30 text-[10px] text-slate-500 font-sans italic">
                          {isLineGenerating ? "Generating voice..." : "No audio compiled"}
                        </div>
                      )}
 
                      <button
                        onClick={async () => {
                          try {
                            await onSynthesizeLine(line.id, "gemini-3.1-flash-tts-preview");
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                        disabled={isLineGenerating}
                        className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition-colors cursor-pointer"
                        title="Regenerate this specific line"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${isLineGenerating ? "animate-spin text-indigo-400" : ""}`} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Export Section */}
            <div className="mt-4 p-4 bg-slate-950/70 border border-slate-825 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-sans font-bold text-white flex items-center gap-1.5">
                    <Download className="h-4 w-4 text-indigo-400" />
                    Export
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Download the compiled conversation track and precise timestamped subtitle documents directly.
                  </p>
                </div>

                {isCompiling && (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 text-indigo-400 animate-spin" />
                    <span className="text-[10px] text-indigo-300 font-mono font-bold animate-pulse">
                      Compiling ({compileProgress}%)
                    </span>
                  </div>
                )}
              </div>

              {isCompiling && (
                <div className="w-full bg-slate-900 rounded-full h-1 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-1 transition-all duration-300"
                    style={{ width: `${compileProgress}%` }}
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1 font-sans">
                <button
                  type="button"
                  onClick={() => compileEpisodeAudio("mp3")}
                  disabled={isCompiling}
                  className="px-3.5 py-2 bg-indigo-900/30 hover:bg-indigo-600/35 hover:text-indigo-200 border border-indigo-850 text-indigo-300 disabled:bg-slate-950 disabled:text-slate-600 text-[11px] font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Full Episode as MP3
                </button>
                <button
                  type="button"
                  onClick={() => compileEpisodeAudio("wav")}
                  disabled={isCompiling}
                  className="px-3.5 py-2 bg-indigo-900/30 hover:bg-indigo-600/35 hover:text-indigo-200 border border-indigo-850 text-indigo-300 disabled:bg-slate-950 disabled:text-slate-600 text-[11px] font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Full Episode as WAV
                </button>
                <button
                  type="button"
                  onClick={() => compileEpisodeAudio("srt")}
                  disabled={isCompiling}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 disabled:bg-slate-950 disabled:text-slate-600 text-[11px] font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5 text-indigo-400" />
                  Download SRT Subtitles with timestamps
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Series Episodes & Universal Casting Ledger Board */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/85">
          <div className="text-left">
            <h2 className="text-base font-sans font-bold text-white flex items-center gap-2">
              <span className="p-1 px-2 rounded-md bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 font-mono text-xs select-none">SERIES</span>
              Episodes & Casting Planner
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Manage your show's episode scripts while preserving synchronized voice castings universally.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isCreatingEp && !isRenamingEp && (
              <>
                <button
                  onClick={() => {
                    setNewEpTitle(`Episode ${savedEpisodes.length + 1}`);
                    setCopyCastOnCreate(true);
                    setIsCreatingEp(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-sans font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition-all hover:scale-[1.02]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Episode
                </button>
                <button
                  onClick={() => onDuplicateEpisode(activeEpisodeId)}
                  className="bg-slate-800 hover:bg-slate-750 border border-slate-700/60 text-slate-300 hover:text-white text-[11px] font-sans font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                  title="Make an identical carbon copy of this episode and cast"
                >
                  Duplicate
                </button>
              </>
            )}
          </div>
        </div>

        {/* Inline Create Episode Mode */}
        {isCreatingEp && (
          <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl space-y-4 animate-fadeIn">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Create New Episode</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-mono block mb-1">Episode Script Title:</label>
                <input
                  type="text"
                  value={newEpTitle}
                  onChange={(e) => setNewEpTitle(e.target.value)}
                  placeholder="e.g. Episode 3: Dawn of Space Hamsters"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-slate-200 outline-none"
                />
              </div>
              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={copyCastOnCreate}
                    onChange={(e) => setCopyCastOnCreate(e.target.checked)}
                    className="rounded border-slate-805 text-indigo-655 bg-slate-900 focus:ring-opacity-50 h-3.5 w-3.5 cursor-pointer"
                  />
                  <span className="text-xs text-slate-300 font-sans">
                    Clone current casting deck ({script.characters.length} actors) for continuity
                  </span>
                </label>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setIsCreatingEp(false)}
                className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded bg-slate-800/20"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onCreateEpisode(newEpTitle, copyCastOnCreate);
                  setIsCreatingEp(false);
                }}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-1.5 rounded-lg"
              >
                Prepare Episode
              </button>
            </div>
          </div>
        )}

        {/* Inline Rename Mode */}
        {isRenamingEp && (
          <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl space-y-4 animate-fadeIn">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Rename Episode</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-slate-200 outline-none"
              />
              <button
                type="button"
                onClick={() => setIsRenamingEp(false)}
                className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded bg-slate-800/20"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onRenameEpisode(activeEpisodeId, renameText);
                  setIsRenamingEp(false);
                }}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-1.5 rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Episode Selector Controller Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-5 flex items-center gap-2">
            <span className="text-[10px] whitespace-nowrap uppercase text-slate-500 font-mono">Working On:</span>
            <select
              value={activeEpisodeId}
              onChange={(e) => onSelectEpisode(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 font-sans outline-none cursor-pointer focus:border-indigo-500 transition-colors"
            >
              {savedEpisodes.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.title} ({ep.lines.length} lines)
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-7 flex flex-wrap gap-2 lg:justify-end">
            <button
              onClick={() => {
                setRenameText(script.title);
                setIsRenamingEp(true);
              }}
              className="text-xs text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700 bg-slate-900/40 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
            >
              Rename
            </button>
            <button
              onClick={() => {
                if (confirm(`Are you sure you want to delete "${script.title}"? Your screenplay dialogues and specific cache will be cleared.`)) {
                  onDeleteEpisode(activeEpisodeId);
                }
              }}
              disabled={savedEpisodes.length === 1}
              className="text-xs text-slate-500 hover:text-rose-400 border border-slate-800 hover:border-rose-900/25 bg-slate-900/20 disabled:opacity-50 px-3 py-1.5 rounded-lg cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Dynamic Universal Casting Synchronizer Section */}
        <div className="bg-slate-950/50 rounded-xl p-3.5 border border-slate-850/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="text-left space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
              <h4 className="text-[11px] font-sans font-bold text-slate-200 uppercase tracking-wider">
                Series Casting Continuity Board
              </h4>
            </div>
            <p className="text-[10px] text-slate-400 max-w-lg leading-normal font-sans">
              Maintain uniform voice acting throughout the series. Align current profiles across all episodes, or copy golden presets from the Series Casting Catalog.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onSyncVoicesAcrossEpisodes}
              className="text-[10px] bg-slate-905 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 font-semibold py-2 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
              title="Apply active episode's casting choices instantly to all matching character names in other episodes"
            >
              <RefreshCw className="h-3 w-3 text-indigo-400" />
              Universally Sync Voices
            </button>
            <button
              type="button"
              onClick={onSyncWithGlobalCast}
              className="text-[10px] bg-indigo-900/30 hover:bg-indigo-600/30 hover:text-indigo-200 border border-indigo-850/65 text-indigo-300 font-semibold py-2 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
              title="Compare all actors here to the global casting ledger and update to golden voices"
            >
              <CheckCircle className="h-3 w-3 text-emerald-400" />
              Apply Golden Presets
            </button>
          </div>
        </div>

        {/* Local Draft Backup & Continuous Work Section */}
        <div className="bg-slate-950/50 rounded-xl p-3.5 border border-slate-850/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mt-3">
          <div className="text-left space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <h4 className="text-[11px] font-sans font-bold text-slate-200 uppercase tracking-wider">
                Backup & Off-line Draft Continuation
              </h4>
            </div>
            <p className="text-[10px] text-slate-400 max-w-lg leading-normal font-sans">
              Save your complete working project (casting specs, screenplay text history, audio buffers) as a single JSON file. Drop or upload a draft backup below to resume from any machine.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onExportProjectDraft}
              className="text-[10px] bg-slate-905 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 font-semibold py-2 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all"
              title="Saves your exact script progress, audio definitions, and custom actor avatars to a portable JSON backup drafting file"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              Export Project Draft
            </button>
            <label 
              className="text-[10px] bg-indigo-900/30 hover:bg-indigo-600/30 hover:text-indigo-200 border border-indigo-850/65 text-indigo-300 font-semibold py-2 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all"
              title="Select an exported project backup JSON file to safely overwrite current workspace state and keep editing your screenplay"
            >
              <RefreshCw className="h-3 w-3 text-indigo-400" />
              <span>Import Project Draft</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    try {
                      const data = JSON.parse(event.target?.result as string);
                      onImportProjectDraft(data);
                    } catch (err: any) {
                      alert("Error parsing backup formatting structure: " + err.message);
                    }
                  };
                  reader.readAsText(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Dialogue Setup Desk (Sub-Tabbed Controller Workspace) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
          <div>
            <h2 className="text-base font-sans font-bold text-white flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-indigo-400" />
              Dialogue Setup Desk
            </h2>
            <p className="text-xs text-slate-400">
              Generate scripts with AI, configure voice actor specs, or segment pre-written drafts.
            </p>
          </div>
          <div className="flex bg-slate-950 border border-slate-850 p-1 rounded-lg shrink-0 w-fit self-start md:self-auto overflow-x-auto max-w-full">
            <button
              onClick={() => setWorkbenchTab("ai_presets")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-sans font-semibold transition-all cursor-pointer whitespace-nowrap ${
                workbenchTab === "ai_presets"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Draft & Presets
            </button>
            <button
              onClick={() => setWorkbenchTab("cast")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-sans font-semibold transition-all cursor-pointer whitespace-nowrap ${
                workbenchTab === "cast"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Character Cast
            </button>
            <button
              onClick={() => setWorkbenchTab("paste_import")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-sans font-semibold transition-all cursor-pointer whitespace-nowrap ${
                workbenchTab === "paste_import"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Paste & Import
            </button>
            <button
              onClick={() => setWorkbenchTab("quick_cast")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-sans font-semibold transition-all cursor-pointer whitespace-nowrap ${
                workbenchTab === "quick_cast"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Scissors className="h-3.5 w-3.5" />
              Quick Cast
            </button>
          </div>
        </div>

        {/* Tab Content Panels */}
        {workbenchTab === "ai_presets" && (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <MessageSquarePlus className="h-4 w-4 text-indigo-400 animate-pulse" />
                Write with Gemini AI Prompt
              </h3>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Describe a storyboard concept, theme, or narrative script. Our system will generate multi-speaker script tracks with speaker profiles automatically.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g., Two travelers debating what to do after discovering a mysterious glowing key in an antique shop..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-sans"
                />
                
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-sans shrink-0">Actors:</span>
                  <select
                    value={speakerCount}
                    onChange={(e) => setSpeakerCount(Number(e.target.value))}
                    className="bg-slate-950 text-slate-200 text-xs border border-slate-800 rounded-lg px-2.5 py-2.5 focus:outline-none cursor-pointer"
                  >
                    <option value={2}>2 Speakers</option>
                    <option value={3}>3 Speakers</option>
                    <option value={4}>4 Speakers</option>
                  </select>
                  
                  <button
                    onClick={handleAiGenerate}
                    disabled={isGenerating || !aiPrompt.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-xs font-sans font-bold rounded-lg py-2.5 px-4 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition-all"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Generating Draft...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Compose Dialogue
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-950/20 border border-slate-850 p-4 rounded-xl space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5 text-indigo-400" />
                Interactive Screenplay Templates
              </h3>
              <p className="text-slate-400 text-[11px]">
                Instantly load formatted multi-speaker sample drafts to practice or test voice layouts:
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleLoadTemplate(STARTER_SCRIPTS[0])}
                  className="text-xs font-sans font-medium px-4 py-2 bg-slate-955 hover:bg-slate-800 border border-slate-850 hover:border-indigo-500/30 rounded-lg text-slate-200 hover:text-white cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Pizza Debate (2 Speakers)
                </button>
                
                <button
                  onClick={() => handleLoadTemplate(STARTER_SCRIPTS[1])}
                  className="text-xs font-sans font-medium px-4 py-2 bg-slate-955 hover:bg-slate-800 border border-slate-850 hover:border-indigo-500/30 rounded-lg text-slate-200 hover:text-white cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  Quantum Coffee Conflict (2 Speakers)
                </button>
              </div>
            </div>
          </div>
        )}

        {workbenchTab === "cast" && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-indigo-400" />
                  Character Casting Deck
                </h3>
              </div>
              <button
                onClick={handleAddCharacter}
                className="text-xs font-sans font-semibold text-indigo-300 hover:text-white flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 border border-slate-800 hover:border-slate-705 rounded-lg cursor-pointer transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Actor Profile
              </button>
            </div>

            {/* AI Voice Auto-Assigner Prompt Section */}
            <div className="bg-slate-950/40 border border-slate-850/80 p-4 rounded-xl space-y-3 shadow-md">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-400 animate-pulse" />
                <h4 className="text-xs font-sans font-bold text-slate-200 uppercase tracking-wider">
                  AI Voice Auto-Casting Coordinator
                </h4>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Describe the vocal profile and direction you want for your actors. Gemini will inspect your screenplay's cast, search the entire Voiceover Library, and instantly match everyone to matching voiceovers (including Nigerian, British, professional, or happy styles).
              </p>
              <div className="space-y-2">
                <textarea
                  value={voiceAssignPrompt}
                  onChange={(e) => setVoiceAssignPrompt(e.target.value)}
                  placeholder="e.g. Make Amina sound like Abuja Professional and Chidi sound like Lagos Gentleman. For any other male actor, assign a deep friendly voice. For kids, make them sound playful."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-sans"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAutoAssignVoices}
                    disabled={isAssigningVoices || script.characters.length === 0}
                    className="text-xs bg-indigo-600 hover:bg-indigo-505 disabled:opacity-40 text-white font-semibold py-1.5 px-4 rounded-lg flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed transition-all"
                  >
                    {isAssigningVoices ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Casting Actors...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 text-yellow-300" />
                        Auto-Assign Voices with Gemini
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {script.characters.map((char) => {
                const colors = getAvatarColor(char.avatarSeed);
                const activeVoice = PREBUILT_VOICES.find(v => v.name === char.voice);
                const activeCategory = activeVoice?.category || "Men";
                
                // Fetch up to 4 other highly matching prebuilt voice presets in the category for single-click switching
                const alternateVoices = PREBUILT_VOICES
                  .filter(v => v.name !== char.voice)
                  .sort((a, b) => {
                    if (a.category === activeCategory && b.category !== activeCategory) return -1;
                    if (a.category !== activeCategory && b.category === activeCategory) return 1;
                    return 0;
                  })
                  .slice(0, 4);

                return (
                  <div 
                    key={char.id}
                    className="p-3.5 bg-slate-950/45 border border-slate-850/80 rounded-xl flex flex-col gap-3 relative group hover:bg-slate-950/85 hover:border-slate-800 transition-all shadow-md"
                  >
                    {/* Top Layer: Avatar + Primary fields */}
                    <div className="flex items-start gap-4">
                      {/* Interactive Avatar */}
                      <div className="relative group/avatar shrink-0 select-none">
                        {char.avatarUrl ? (
                          <img 
                            src={char.avatarUrl} 
                            alt={char.name}
                            referrerPolicy="no-referrer"
                            className="h-12 w-12 rounded-full object-cover border-2 border-indigo-500/85 hover:border-white shadow shadow-indigo-500/20 cursor-pointer transition-all hover:scale-105"
                            onClick={() => setActivePortraitPickerCharId(char.id)}
                            title="Set / Generate Cast Photo"
                          />
                        ) : (
                          <div 
                            className="h-12 w-12 rounded-full flex items-center justify-center font-bold text-sm text-white cursor-pointer hover:border-white transition-all hover:scale-105"
                            style={{ backgroundColor: colors.bg, border: `2px solid ${colors.secondary}` }}
                            onClick={() => setActivePortraitPickerCharId(char.id)}
                            title="Set / Generate Cast Photo"
                          >
                            {char.name ? char.name.substring(0, 1).toUpperCase() : "?"}
                          </div>
                        )}
                        <button 
                          onClick={() => setActivePortraitPickerCharId(char.id)}
                          className="absolute -bottom-1 -right-1 h-5 w-5 bg-slate-900 hover:bg-indigo-600 border border-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer shadow-md"
                          title="Change / AI generate face"
                        >
                          <RefreshCw className={`h-2.5 w-2.5 ${isGeneratingPortraitForCharId === char.id ? "animate-spin text-white" : ""}`} />
                        </button>
                      </div>

                      {/* Info & Core Voice Picker */}
                      <div className="flex-1 space-y-1.5 min-w-0">
                        <div className="flex gap-2 items-center justify-between flex-wrap">
                          <input
                            type="text"
                            value={char.name}
                            onChange={(e) => handleUpdateCharacter(char.id, { name: e.target.value })}
                            className="bg-transparent border-b border-transparent hover:border-slate-800 focus:border-indigo-500 focus:outline-none text-slate-100 text-sm font-sans font-bold py-0.5 w-24"
                            placeholder="Actor Name"
                          />
                          
                          <div className="flex gap-1 items-center">
                            <select
                              value={char.voice}
                              onChange={(e) => handleUpdateCharacter(char.id, { voice: e.target.value as any })}
                              className="bg-slate-950 text-indigo-300 text-[11px] font-mono border border-slate-800 rounded px-1.5 py-0.5 focus:outline-none cursor-pointer max-w-[120px] truncate"
                              title="Dropdown voice inventory picker"
                            >
                              <optgroup label="👧 Kids Voiceovers (Easy Pick)">
                                {PREBUILT_VOICES.filter(v => v.category === "Kids").map(v => (
                                  <option key={v.id} value={v.name}>{v.name}</option>
                                ))}
                              </optgroup>
                              <optgroup label="🧔 Men (Normal)">
                                {PREBUILT_VOICES.filter(v => v.category === "Men" && v.subCategory === "Normal").map(v => (
                                  <option key={v.id} value={v.name}>{v.name}</option>
                                ))}
                              </optgroup>
                              <optgroup label="🧔 Men (Angry)">
                                {PREBUILT_VOICES.filter(v => v.category === "Men" && v.subCategory === "Angry").map(v => (
                                  <option key={v.id} value={v.name}>{v.name}</option>
                                ))}
                              </optgroup>
                              <optgroup label="🧔 Men (Happy)">
                                {PREBUILT_VOICES.filter(v => v.category === "Men" && v.subCategory === "Happy").map(v => (
                                  <option key={v.id} value={v.name}>{v.name}</option>
                                ))}
                              </optgroup>
                              <optgroup label="🧔 Men (Soft)">
                                {PREBUILT_VOICES.filter(v => v.category === "Men" && v.subCategory === "Soft").map(v => (
                                  <option key={v.id} value={v.name}>{v.name}</option>
                                ))}
                              </optgroup>
                              <optgroup label="👩 Women (Normal)">
                                {PREBUILT_VOICES.filter(v => v.category === "Women" && v.subCategory === "Normal").map(v => (
                                  <option key={v.id} value={v.name}>{v.name}</option>
                                ))}
                              </optgroup>
                              <optgroup label="👩 Women (Angry)">
                                {PREBUILT_VOICES.filter(v => v.category === "Women" && v.subCategory === "Angry").map(v => (
                                  <option key={v.id} value={v.name}>{v.name}</option>
                                ))}
                              </optgroup>
                              <optgroup label="👩 Women (Happy)">
                                {PREBUILT_VOICES.filter(v => v.category === "Women" && v.subCategory === "Happy").map(v => (
                                  <option key={v.id} value={v.name}>{v.name}</option>
                                ))}
                              </optgroup>
                              <optgroup label="👩 Women (Soft)">
                                {PREBUILT_VOICES.filter(v => v.category === "Women" && v.subCategory === "Soft").map(v => (
                                  <option key={v.id} value={v.name}>{v.name}</option>
                                ))}
                              </optgroup>
                            </select>

                            <button
                              type="button"
                              onClick={() => {
                                setExpandedVoiceChooserCharId(expandedVoiceChooserCharId === char.id ? null : char.id);
                              }}
                              className={`p-1 rounded text-[10px] font-sans font-bold border flex items-center gap-1 cursor-pointer transition-all ${
                                expandedVoiceChooserCharId === char.id
                                  ? "bg-indigo-600 border-indigo-500 text-white"
                                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                              }`}
                              title="Open Advanced Studio Voice Picker"
                            >
                              <span>🎙️ Advanced</span>
                            </button>
                          </div>
                        </div>

                        {/* Seed Input */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-500 font-mono shrink-0">Face Seed:</span>
                          <input
                            type="text"
                            value={char.avatarSeed}
                            onChange={(e) => handleUpdateCharacter(char.id, { avatarSeed: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-300 w-full focus:outline-none focus:border-indigo-505 font-mono"
                            placeholder="Seed string"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Middle Layer: Apply Tone override line */}
                    <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-850/60">
                      <span className="text-[10px] text-indigo-400 font-sans shrink-0 font-bold">Override Emotion:</span>
                      <select
                        onChange={(e) => {
                          const emo = e.target.value;
                          if (!emo) return;
                          handleApplyEmotionToAllLines(char.id, emo);
                          e.target.value = "";
                        }}
                        defaultValue=""
                        className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-300 w-full focus:outline-none focus:border-indigo-505 cursor-pointer font-sans"
                      >
                        <option value="" disabled>Apply vocal tone to all draft dialogue lines...</option>
                        {EMOTIONS.map((emo) => (
                          <option key={emo} value={emo}>{emo}</option>
                        ))}
                      </select>
                    </div>

                    {/* Actionable Bottom Layer: Easy Quick-Swap Voice Card */}
                    <div className="bg-slate-950/50 border border-slate-900 rounded-lg p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-indigo-400 tracking-wider uppercase flex items-center gap-1">
                          ⚡ QUICK-SWAP ROLES
                        </span>
                        <span className="text-[8px] px-1 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-900/40 uppercase font-mono">
                          Current: {char.voice}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-1.5">
                        {alternateVoices.map((altV) => {
                          const isDemoPlaying = castingDemoPlayingVoiceId === altV.id;
                          return (
                            <div 
                              key={altV.id}
                              className="p-1 px-1.5 bg-slate-900/50 hover:bg-slate-900 border border-slate-850 hover:border-indigo-500/50 rounded-md flex items-center justify-between gap-1 transition-all"
                            >
                              <button
                                type="button"
                                onClick={() => handleUpdateCharacter(char.id, { voice: altV.name })}
                                className="flex-1 text-left min-w-0 cursor-pointer group select-none"
                                title={`Substitute ${char.name}'s voice to ${altV.name}`}
                              >
                                <div className="text-[10px] font-bold text-slate-200 truncate group-hover:text-indigo-400 transition-colors">
                                  {altV.name.replace(/\(.*?\)/g, "").trim()}
                                </div>
                                <div className="text-[8px] text-slate-500 truncate uppercase font-mono">
                                  {altV.category} • {altV.subCategory}
                                </div>
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => playCastingVoiceDemo(altV.name, altV.id)}
                                className={`h-4.5 w-4.5 rounded text-[9px] flex items-center justify-center cursor-pointer transition-all ${
                                  isDemoPlaying
                                    ? "bg-rose-600 text-white animate-pulse"
                                    : "bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800"
                                }`}
                                title={isDemoPlaying ? "Stop preview" : "Hear voice preview"}
                              >
                                {isDemoPlaying ? "⏹" : "▶"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {expandedVoiceChooserCharId === char.id && (
                      <div className="col-span-full mt-3 p-3 bg-slate-950 border border-slate-850 rounded-lg space-y-3 font-sans">
                        <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                          <span className="text-xs font-semibold text-slate-300">🎙️ Studio Casting Deck</span>
                          <div className="flex bg-slate-900 p-0.5 rounded border border-slate-800">
                            {(["Kids", "Men", "Women"] as const).map((cat) => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setCastingActiveCategory(cat)}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                                  castingActiveCategory === cat
                                    ? "bg-indigo-600 text-white"
                                    : "text-slate-400 hover:text-white"
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* List voices for active category */}
                        <div className="max-h-[180px] overflow-y-auto space-y-1.5 scrollbar-thin pr-1">
                          {PREBUILT_VOICES.filter(v => v.category === castingActiveCategory).map((voice) => {
                            const isSelected = char.voice === voice.name;
                            const isDemoPlaying = castingDemoPlayingVoiceId === voice.id;

                            let styleBadge = "bg-slate-900 text-slate-400";
                            if (voice.subCategory === "Angry") styleBadge = "bg-rose-950/40 text-rose-300 border border-rose-900/10";
                            if (voice.subCategory === "Happy") styleBadge = "bg-amber-950/40 text-amber-300 border border-amber-900/10";
                            if (voice.subCategory === "Soft") styleBadge = "bg-purple-950/40 text-purple-300 border border-purple-900/10";

                            return (
                              <div
                                key={voice.id}
                                className={`flex items-start justify-between p-2 rounded border text-left transition-all ${
                                  isSelected
                                    ? "bg-slate-900 border-indigo-500/35"
                                    : "bg-slate-900/40 border-slate-850 hover:bg-slate-900/80"
                                }`}
                              >
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-semibold text-white">{voice.name}</span>
                                    <span className={`text-[9px] px-1 py-0.2 rounded font-mono font-bold uppercase ${styleBadge}`}>
                                      {voice.subCategory}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-400 leading-normal line-clamp-2">
                                    {voice.description}
                                  </p>
                                </div>

                                <div className="flex gap-1.5 items-center shrink-0 ml-2">
                                  <button
                                    type="button"
                                    onClick={() => playCastingVoiceDemo(voice.name, voice.id)}
                                    className={`p-1 rounded border text-[10px] font-medium flex items-center justify-center cursor-pointer transition-all ${
                                      isDemoPlaying
                                        ? "bg-rose-600 border-rose-500 text-white animate-pulse"
                                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                                    }`}
                                  >
                                    {isDemoPlaying ? "⏹ Stop" : "▶ Preview"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleUpdateCharacter(char.id, { voice: voice.name });
                                    }}
                                    className={`px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                                      isSelected
                                        ? "bg-emerald-600 text-white"
                                        : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                                    }`}
                                  >
                                    {isSelected ? "Cast ✓" : "Cast"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <button
                        onClick={() => setActivePortraitPickerCharId(char.id)}
                        className="text-slate-500 hover:text-indigo-400 p-1.5 rounded transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                        title="Edit Portrait"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCharacter(char.id)}
                        className="text-slate-600 hover:text-rose-400 p-1.5 rounded transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                        title="Remove speaker profile"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {workbenchTab === "paste_import" && (
          <div className="space-y-5 animate-fadeIn" id="smart-paste-import-panel">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <ClipboardList className="h-4 w-4 text-indigo-400" />
                Smart Paste & Script Importer
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Paste screenplays or prompt dialogues directly from ChatGPT, Gemini, or industry drafts. Our smart parser splits rows, maps speakers, extracts performance emotions, and sets up your casting deck automatically.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Settings & Paste Column */}
              <div className="lg:col-span-7 space-y-4">
                <div className="bg-slate-950/45 border border-slate-850 p-4 rounded-xl space-y-4">
                  {/* Presets and Samples */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-850">
                    <span className="text-[11px] font-sans font-semibold text-slate-400">Load Paste Template Sample:</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setImportFormat("line_by_line");
                          setPasteText(
                            "Zephyr: (whispering) Did you hear that sound coming from the engine room?\n" +
                            "Puck: (excited) I'm sure it's just the space hamsters running on their hyperdrive wheels!\n" +
                            "Zephyr: (anxious) This is no time for jokes, Puck. The life support pressure is dropping.\n" +
                            "Puck: (confident) Relax! Space hamsters never let us down. I'll go check the main fuse."
                          );
                        }}
                        className="text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 px-2.5 py-1 rounded cursor-pointer transition-all"
                      >
                        Sample Line-by-Line
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setImportFormat("screenplay");
                          setPasteText(
                            "INT. SPACESHIP - NIGHT\n\n" +
                            "ZEPHYR\n" +
                            "(nervous)\n" +
                            "We are running out of power. The reserve batteries are at twelve percent.\n\n" +
                            "Puck\n" +
                            "(excited)\n" +
                            "I'm telling you, everything is completely stable!\n\n" +
                            "ZEPHYR\n" +
                            "(whispers)\n" +
                            "If we lose shields, the asteroid debris... it could tear the hull apart."
                          );
                        }}
                        className="text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 px-2.5 py-1 rounded cursor-pointer transition-all"
                      >
                        Sample Screenplay
                      </button>
                    </div>
                  </div>

                  {/* Options Settings */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-sans font-medium text-slate-400 block mb-1">Script Formatting Style:</label>
                      <select
                        value={importFormat}
                        onChange={(e) => setImportFormat(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 text-xs text-slate-200 p-2.5 rounded-lg focus:outline-none cursor-pointer"
                      >
                        <option value="line_by_line">Line-by-Line Format (Speaker: Dialogue)</option>
                        <option value="screenplay">Classic Screenplay (Speaker name on own line)</option>
                        <option value="prose">Paragraph / Prose Alternator</option>
                      </select>
                    </div>

                    <div className="space-y-2 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={autoCreateSpeakers}
                          onChange={(e) => setAutoCreateSpeakers(e.target.checked)}
                          className="rounded border-slate-805 text-indigo-650 bg-slate-900 focus:ring-opacity-50 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className="text-[11px] text-slate-300 font-sans">Auto-create newly discovered actors</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={parseStageDirections}
                          onChange={(e) => setParseStageDirections(e.target.checked)}
                          className="rounded border-slate-805 text-indigo-650 bg-slate-900 focus:ring-opacity-50 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className="text-[11px] text-slate-300 font-sans">{"Extract performance emotions (e.g. (excited) -> Excited)"}</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={skipHeaders}
                          onChange={(e) => setSkipHeaders(e.target.checked)}
                          className="rounded border-slate-805 text-indigo-650 bg-slate-900 focus:ring-opacity-50 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className="text-[11px] text-slate-300 font-sans">Ignore screenplay metadata (INT., EXT., Scene)</span>
                      </label>
                    </div>
                  </div>

                  {/* Input Canvas */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] uppercase font-mono tracking-wider text-slate-500">
                      <span>Paste Raw Dialogues or Prose Script Below:</span>
                      {pasteText.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setPasteText("")}
                          className="text-indigo-400 hover:text-white cursor-pointer"
                        >
                          Clear Text
                        </button>
                      )}
                    </div>
                    <textarea
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      rows={10}
                      className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 text-slate-100 placeholder-slate-600 text-[11px] leading-relaxed p-3.5 rounded-xl focus:outline-none font-mono resize-y"
                      style={{ minHeight: "220px" }}
                      placeholder={"e.g.\nZephyr: (excited) Stand back! The particle core is unstable!\nFenrir: (anxious) Wait, where is the emergency stop lever?!"}
                    />
                  </div>
                </div>

                {/* Import Execution Console */}
                <div className="bg-indigo-950/25 border border-indigo-900/40 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-0.5 max-w-sm text-left">
                    <h4 className="text-xs font-sans font-bold text-white flex items-center gap-1.5">
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      Ready to Synthesis-Script
                    </h4>
                    <p className="text-[11px] text-indigo-300 leading-normal">
                      Select how you want to compile and insert this script into your active timeline window.
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleExecuteImport("append")}
                      disabled={parsedPreviewItems.length === 0}
                      className="px-4 py-2 bg-slate-850 hover:bg-slate-800 disabled:bg-slate-950 disabled:text-slate-650 text-xs text-white font-sans font-semibold rounded-lg border border-slate-800 hover:border-slate-705 cursor-pointer disabled:cursor-not-allowed transition-all"
                    >
                      Append to Timeline
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Are you sure you want to replace all current dialogue lines and actors with the parsed content? This action cannot be undone.")) {
                          handleExecuteImport("replace");
                        }
                      }}
                      disabled={parsedPreviewItems.length === 0}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-550 disabled:bg-slate-950 disabled:text-slate-650 text-xs text-white font-sans font-bold rounded-lg cursor-pointer disabled:cursor-not-allowed shadow transition-all"
                    >
                      Overwrite Entire Script
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Live Preview Column */}
              <div className="lg:col-span-12 xl:col-span-5 flex flex-col">
                <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 flex-1 flex flex-col min-h-[300px] lg:max-h-[580px]">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-850 mb-3 shrink-0">
                    <div className="text-left">
                      <h4 className="text-xs font-sans font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-indigo-400" />
                        Live Parsing Preview
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-0.5 font-sans">
                        See how lines and actors map in real-time.
                      </p>
                    </div>
                    {parsedPreviewItems.length > 0 && (
                      <span className="text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-850/65 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {parsedPreviewItems.filter(p => !p.isHeader).length} lines /{" "}
                        {Array.from(new Set(parsedPreviewItems.filter(p => !p.isHeader && p.speakerName !== "SYSTEM_HEADER").map(p => p.speakerName))).length} actors
                      </span>
                    )}
                  </div>

                  {parsedPreviewItems.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500 font-sans">
                      <ClipboardList className="h-8 w-8 text-slate-700 mb-2.5 stroke-1" />
                      <p className="text-xs font-semibold text-slate-400">Pasting Arena is Empty</p>
                      <p className="text-[11px] text-slate-500 max-w-xs mt-1 leading-normal">
                        Try typing or clicking one of our preset samples to see the instant live parser mapping preview!
                      </p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[460px] scrollbar-thin">
                      {parsedPreviewItems.map((item, idx) => {
                        if (item.isHeader) {
                          return (
                            <div key={idx} className="bg-slate-900/80 border border-slate-800 rounded px-2.5 py-1.5 text-[10px] text-indigo-400 font-mono tracking-wide text-left">
                              🎬 Scene Metadata: {item.originalText}
                            </div>
                          );
                        }

                        return (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-lg border text-left transition-all text-[11.5px] leading-relaxed space-y-1.5 ${
                              item.isNewSpeaker
                                ? "bg-purple-950/15 border-purple-900/40"
                                : "bg-slate-900/45 border-slate-850/60"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 font-sans">
                                <span className="font-bold text-slate-200">
                                  {item.speakerName}
                                </span>
                                {item.isNewSpeaker ? (
                                  <span className="text-[8px] font-bold tracking-wider uppercase font-mono bg-purple-900/40 text-purple-300 border border-purple-750/50 px-1.5 py-0.2 rounded">
                                    Create New Actor
                                  </span>
                                ) : (
                                  <span className="text-[8px] font-medium tracking-wider uppercase font-mono bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded">
                                    Matches Active Cast
                                  </span>
                                )}
                              </div>
                              {item.emotion !== "Neutral" && (
                                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 ${
                                  item.emotion === "Whispering" ? "bg-slate-800 text-indigo-300 border border-indigo-900/40" :
                                  item.emotion === "Angry" ? "bg-rose-950/40 text-rose-300 border border-rose-900/40" :
                                  item.emotion === "Excited" ? "bg-amber-955/40 text-amber-300 border border-amber-900/40" :
                                  item.emotion === "Warm" ? "bg-emerald-950/40 text-emerald-300 border border-emerald-900/40" :
                                  "bg-indigo-950/40 text-indigo-300 border border-indigo-900/40"
                                }`}>
                                  🎭 {item.emotion}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-300 font-sans italic text-[11px]">
                              "{item.cleanedText}"
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {workbenchTab === "quick_cast" && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Scissors className="h-4 w-4 text-indigo-400" />
                  Segment-to-Speech Selector
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Type or paste raw screenplays below. Highlight any sentence, then tap on any character badge in the deck to cast!
                </p>
              </div>
              <button
                onClick={handleBulkParseSourceText}
                className="text-[11px] font-sans font-semibold text-indigo-300 hover:text-white flex items-center gap-1 bg-slate-950 px-3 py-1.5 border border-slate-800 hover:border-slate-700 rounded-lg cursor-pointer transition-colors animate-pulse"
                title="Splits the entire text line-by-line and maps it to actors based on prefixes (e.g., 'Zephyr: Hello')"
              >
                <FileText className="h-3.5 w-3.5 text-indigo-400" />
                Cast & Parse All
              </button>
            </div>

            <div className="relative">
              <textarea
                ref={selectionTextareaRef}
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                onSelect={handleTextareaSelect}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 text-slate-100 text-xs p-3 rounded-lg focus:outline-none font-sans resize-none"
                rows={4}
                placeholder="Type or paste script or screenplays..."
              />
              {selectedText && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-indigo-950/90 text-indigo-200 border border-indigo-500/30 text-[10px] uppercase font-mono px-2 py-0.5 rounded shadow">
                  <Type className="h-3 w-3 text-indigo-400 animate-pulse" />
                  {selectedText.length} characters selected
                </div>
              )}
            </div>

            <div className="bg-slate-950/40 border border-slate-850 p-3.5 rounded-xl">
              {selectedText ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                    <span className="text-[10px] font-mono text-amber-500 font-bold uppercase flex items-center gap-1.5">
                      <Play className="h-3 w-3 fill-amber-500 text-amber-505" />
                      ACTIVE CAST TARGET:
                    </span>
                    <button
                      onClick={() => setSelectedText("")}
                      className="text-slate-500 hover:text-slate-300 text-[11px] font-sans cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  </div>
                  <div className="p-2 bg-slate-950 border border-slate-850 rounded-lg max-h-20 overflow-y-auto">
                    <p className="text-xs text-slate-200 font-sans italic leading-relaxed">
                      "{selectedText}"
                    </p>
                  </div>

                  <div>
                    <span className="text-[11px] font-sans font-medium text-slate-400 block mb-2">
                      Tap an actor to assign selection and auto-generate voiceover:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {script.characters.map((char) => {
                        const colors = getAvatarColor(char.avatarSeed);
                        return (
                          <button
                            key={char.id}
                            onClick={() => handleAssignSelectionToCharacter(char.id)}
                            className="p-2 bg-slate-900/60 hover:bg-slate-900 border border-slate-850 hover:border-indigo-500/50 text-left rounded-lg group/btn cursor-pointer transition-all flex items-center gap-2 select-none"
                          >
                            {char.avatarUrl ? (
                              <img
                                src={char.avatarUrl}
                                alt=""
                                className="h-6 w-6 rounded-full object-cover border border-slate-800 shrink-0"
                              />
                            ) : (
                              <div
                                className="h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                                style={{ backgroundColor: colors.bg, border: `1px solid ${colors.secondary}` }}
                              >
                                {char.name.substring(0, 1).toUpperCase()}
                              </div>
                            )}
                            <div className="truncate flex-1">
                              <p className="text-xs text-slate-200 font-medium group-hover/btn:text-white truncate">
                                {char.name}
                              </p>
                              <p className="text-[9px] text-slate-500 font-mono truncate">
                                Voice: {char.voice}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 flex flex-col items-center justify-center gap-1.5 grayscale opacity-60">
                  <Scissors className="h-5 w-5 text-indigo-450 animate-pulse" />
                  <p className="text-xs text-slate-400 font-sans">
                    No active selection. Highlight text in the text box to assign to speakers.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {activePortraitPickerCharId && (() => {
        const char = script.characters.find((c) => c.id === activePortraitPickerCharId);
        if (!char) return null;
        const colors = getAvatarColor(char.avatarSeed);
        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Sparkles className="h-4.5 w-4.5 text-indigo-400" />
                    Cast Photo Room: {char.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Select a cinematic actor preset or generate a copyright-free human portrait with AI
                  </p>
                </div>
                <button 
                  onClick={() => setActivePortraitPickerCharId(null)}
                  className="text-slate-400 hover:text-white text-sm font-sans p-1.5 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Live Preview Container */}
              <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-slate-950/50 rounded-xl mb-6 border border-slate-850">
                <div className="relative shrink-0">
                  {char.avatarUrl ? (
                    <img 
                      src={char.avatarUrl} 
                      alt={char.name} 
                      referrerPolicy="no-referrer"
                      className="h-20 w-20 rounded-xl object-cover border-2 border-indigo-500 shadow-lg shadow-indigo-500/10"
                    />
                  ) : (
                    <div 
                      className="h-20 w-20 rounded-xl flex items-center justify-center font-bold text-2xl text-white"
                      style={{ backgroundColor: colors.bg, border: `2px solid ${colors.secondary}` }}
                    >
                      {char.name ? char.name.substring(0, 1).toUpperCase() : "?"}
                    </div>
                  )}
                  {isGeneratingPortraitForCharId === char.id && (
                    <div className="absolute inset-0 bg-slate-950/70 rounded-xl flex items-center justify-center">
                      <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 space-y-1 text-center sm:text-left">
                  <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-mono font-bold">ACTIVE ACTOR CAST MODEL</span>
                  <h4 className="text-sm font-semibold text-white">{char.name}</h4>
                  <p className="text-xs text-slate-400 font-sans italic">"{char.description || 'Dialogue Speaker'}"</p>
                  <p className="text-[10px] text-slate-500 font-mono">Style Keyword: {char.avatarSeed || 'None'}</p>
                </div>
              </div>

              {/* Presets List */}
              <div className="space-y-3 mb-6">
                <span className="text-xs font-semibold text-slate-300 block">Cinematic Human Presets (Copyright-Free):</span>
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_CINEMATIC_ACTORS.map((preset, pIdx) => (
                    <button
                      key={pIdx}
                      onClick={() => handleUpdateCharacter(char.id, { avatarUrl: preset.url })}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                        char.avatarUrl === preset.url ? 'border-indigo-500 scale-102 ring-2 ring-indigo-500/30' : 'border-slate-800 hover:border-slate-600'
                      }`}
                      title={preset.name}
                    >
                      <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-slate-950/80 py-0.5 px-1 truncate text-[8px] text-slate-300 text-center font-sans">
                        {preset.name.split(" ")[0]}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Generative Options */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-300 block">Synthesize Unique Human Actor with AI:</span>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1">
                    <input 
                      type="text"
                      value={char.avatarSeed}
                      onChange={(e) => handleUpdateCharacter(char.id, { avatarSeed: e.target.value })}
                      placeholder="seed prompt / actor descriptions (e.g. vintage astronaut, confident leader)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button
                    onClick={() => handleGenerateAiPortrait(char.id)}
                    disabled={isGeneratingPortraitForCharId === char.id}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-xs font-semibold text-white rounded-lg py-2 px-4 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    {isGeneratingPortraitForCharId === char.id ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Generate Face
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setActivePortraitPickerCharId(null)}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
