import { useState, useEffect, useRef } from "react";
import { DialogueScript, DialogueLine, Character } from "../types";
import { PREBUILT_VOICES } from "../data";
import { getAvatarColor, wrapText } from "../utils";
import { getCachedAudio, setCachedAudio } from "../utils/audioCache";
import { Play, Pause, Square, Download, Film, Eye, Sparkles, Loader2, RefreshCw, Music, Trash2, ArrowLeft, ArrowRight, Plus, Sliders, PlusCircle, Check, Copy, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { decodeAudioUrl, mergeAudioBuffers, audioBufferToMp3, triggerFileDownload } from "../utils/mp3Exporter";

interface VideoPlayerProps {
  script: DialogueScript;
  onSynthesizeLine: (lineId: string) => Promise<string | undefined>;
  onChange?: (updatedScript: DialogueScript) => void;
}

export default function VideoPlayer({ script, onSynthesizeLine, onChange }: VideoPlayerProps) {
  const getVoicePlaybackRate = (voiceName: string): number => {
    const voice = PREBUILT_VOICES.find(v => v.name === voiceName || v.id === voiceName);
    return voice?.playbackRate || 1.0;
  };

  const renderStylizedWave = (text: string, isActive: boolean, isReady: boolean, forceStyle?: string) => {
    const activeStyle = forceStyle || waveformStyle || "bars";
    const cleanText = text || "";
    const hash = cleanText.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) || 42;
    
    if (activeStyle === "spectrum") {
      const barsCount = 18;
      const bars = Array.from({ length: barsCount }, (_, i) => {
        const h = 4 + ((hash * (i + 4) * 3) % 18);
        return (
          <span
            key={i}
            className={`w-[2px] rounded-t transition-all duration-300 ${
              isActive ? "bg-gradient-to-t from-indigo-400 to-cyan-300 animate-pulse" : isReady ? "bg-indigo-500/55" : "bg-slate-700/60"
            }`}
            style={{
              height: `${h}px`,
            }}
          />
        );
      });
      return (
        <div className="flex items-end gap-[2px] h-7 justify-center bg-slate-950/70 px-2 py-1 rounded border border-slate-900/60 w-full overflow-hidden select-none">
          {bars}
        </div>
      );
    }

    if (activeStyle === "mirror") {
      const barsCount = 12;
      const bars = Array.from({ length: barsCount }, (_, i) => {
        const size = 3 + ((hash * (i + 1) * 2) % 10);
        return (
          <div key={i} className="flex flex-col gap-[1px] items-center">
            <span
              className={`w-[3px] rounded-t transition-all duration-300 ${
                isActive ? "bg-indigo-400 animate-pulse" : isReady ? "bg-indigo-500/50" : "bg-slate-700/60"
              }`}
              style={{ height: `${size}px` }}
            />
            <span
              className={`w-[3px] rounded-b opacity-50 transition-all duration-300 ${
                isActive ? "bg-indigo-400 animate-pulse" : isReady ? "bg-indigo-505/50" : "bg-slate-750/50"
              }`}
              style={{ height: `${size}px` }}
            />
          </div>
        );
      });
      return (
        <div className="flex items-center gap-[3px] h-9 justify-center bg-slate-950/70 px-2 py-1 rounded border border-slate-900/60 w-full select-none">
          {bars}
        </div>
      );
    }

    if (activeStyle === "frequency") {
      const cols = 8;
      const bars = Array.from({ length: cols }, (_, i) => {
        const litDots = 1 + ((hash * (i + 2)) % 3);
        return (
          <div key={i} className="flex flex-col-reverse gap-[1.5px] items-center">
            {Array.from({ length: 3 }, (_, dotIdx) => {
              const isLit = dotIdx < litDots;
              return (
                <span
                  key={dotIdx}
                  className={`w-[4.5px] h-[4.5px] rounded-full transition-all duration-200 ${
                    isLit ? (isActive ? "bg-cyan-400 font-bold" : isReady ? "bg-indigo-400 scale-105" : "bg-slate-650") : "bg-slate-900/90"
                  }`}
                />
              );
            })}
          </div>
        );
      });
      return (
        <div className="flex items-center justify-around h-7 bg-slate-950/75 px-1.5 py-1 rounded border border-slate-900/80 w-full select-none">
          {bars}
        </div>
      );
    }

    // Classic standard bars fallback
    const barsCount = 12;
    const bars = Array.from({ length: barsCount }, (_, i) => {
      const height = 4 + ((hash * (i + 1)) % 14);
      return (
        <span
          key={i}
          className={`w-[3px] rounded-full transition-all duration-300 ${
            isActive ? "bg-indigo-400 animate-pulse" : isReady ? "bg-indigo-500/50" : "bg-slate-700/60"
          }`}
          style={{
            height: `${height}px`,
          }}
        />
      );
    });
    return (
      <div className="flex items-center gap-0.5 h-6 justify-center bg-slate-950/50 px-2 py-1 rounded border border-slate-900/60 w-full select-none">
        {bars}
      </div>
    );
  };

  const [isPlaying, setIsPlaying] = useState(false);
  const [isSilentPreview, setIsSilentPreviewState] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState<number>(-1);
  const [isSynthesizingAll, setIsSynthesizingAll] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingAudio, setIsExportingAudio] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportAudioProgress, setExportAudioProgress] = useState(0);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportExtension, setExportExtension] = useState("mp4");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const renderIntervalRef = useRef<any>(null);
  const previewTimeoutRef = useRef<any>(null);
  const imageCacheRef = useRef<Record<string, HTMLImageElement>>({});
  const lastRenderTimeRef = useRef<number>(Date.now());
  const attentionRef = useRef<Record<string, number>>({});
  const subtitleFadeRef = useRef({
    currentLineText: "",
    currentEmotion: "",
    currentSpeakerName: "",
    prevLineText: "",
    prevEmotion: "",
    prevSpeakerName: "",
    fadeProgress: 1.0,
  });

  // Synchronous play reference to ensure proper chaining
  const stateRef = useRef({
    isPlaying: false,
    lineIndex: -1,
    script: script,
    isExporting: false,
    isSilentPreview: false,
  });

  useEffect(() => {
    stateRef.current.script = script;
  }, [script]);

  // Timeline Active Selection State
  const [selectedTimelineIndex, setSelectedTimelineIndex] = useState<number>(0);
  const [timelineView, setTimelineView] = useState<"linear" | "multitrack">("multitrack");
  const [timelineZoom, setTimelineZoom] = useState<number>(1.0); // Zoom scale factor from 0.6 to 2.0
  const [waveformStyle, setWaveformStyle] = useState<"bars" | "mirror" | "spectrum" | "frequency">("bars");
  const [playingVoiceDemoId, setPlayingVoiceDemoId] = useState<string | null>(null);
  const voiceDemoAudioRef = useRef<HTMLAudioElement | null>(null);

  const updateCharacterVoice = (charId: string, voiceName: string) => {
    if (!onChange) return;
    const updatedChars = script.characters.map((c) => {
      if (c.id === charId) {
        return { ...c, voice: voiceName };
      }
      return c;
    });

    const updatedLines = script.lines.map((l) => {
      if (l.characterId === charId) {
        return { ...l, audioUrl: undefined };
      }
      return l;
    });

    onChange({
      ...script,
      characters: updatedChars,
      lines: updatedLines,
    });
  };

  const previewVoiceDemo = async (charId: string, charName: string, voiceName: string) => {
    if (voiceDemoAudioRef.current) {
      voiceDemoAudioRef.current.pause();
    }
    
    setPlayingVoiceDemoId(charId);

    try {
      const textToSynthesize = `Hi, I am ${charName}. I speak using the ${voiceName} voice profile, ready to record!`;
      
      // 1. Check local persistent cache
      const cachedUrl = await getCachedAudio(textToSynthesize, voiceName, "Casual");
      if (cachedUrl) {
        const audio = new Audio(cachedUrl);
        audio.playbackRate = getVoicePlaybackRate(voiceName);
        voiceDemoAudioRef.current = audio;
        
        audio.onended = () => setPlayingVoiceDemoId(null);
        await audio.play();
        return;
      }

      // 2. Fall back to API only on cache-miss
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textToSynthesize,
          voice: voiceName,
          emotion: "Casual"
        }),
      });

      const data = await response.json();
      if (data.audioContent) {
        const audioUrl = `data:audio/wav;base64,${data.audioContent}`;
        
        // 3. Save to local persistent cache
        await setCachedAudio(textToSynthesize, voiceName, "Casual", audioUrl);

        const audio = new Audio(audioUrl);
        audio.playbackRate = getVoicePlaybackRate(voiceName);
        voiceDemoAudioRef.current = audio;
        
        audio.onended = () => setPlayingVoiceDemoId(null);
        await audio.play();
      } else {
        setPlayingVoiceDemoId(null);
      }
    } catch (err) {
      console.error("Voice demo preview failed:", err);
      setPlayingVoiceDemoId(null);
    }
  };

  // Sync timeline selection overlay with what is playing
  useEffect(() => {
    if (isPlaying && currentLineIndex >= 0 && currentLineIndex < script.lines.length) {
      setSelectedTimelineIndex(currentLineIndex);
    }
  }, [currentLineIndex, isPlaying, script.lines.length]);

  // Adjust selected index automatically if out of bounds
  useEffect(() => {
    if (selectedTimelineIndex >= script.lines.length) {
      setSelectedTimelineIndex(Math.max(0, script.lines.length - 1));
    }
  }, [script.lines.length]);

  // Play a single line on demand
  const playLineSolo = async (index: number) => {
    // Stop sequence playback if any
    if (isPlaying) {
      pausePlayback();
    }
    
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
    }
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
    }

    setCurrentLineIndex(index);
    stateRef.current.lineIndex = index;

    const line = script.lines[index];
    if (!line) return;

    let audioUrl = line.audioUrl;
    if (!audioUrl) {
      try {
        audioUrl = await onSynthesizeLine(line.id);
      } catch (err) {
        console.error("Solo synthesis failed:", err);
      }
    }

    if (!audioUrl) {
      renderCanvasFrame(index);
      return;
    }

    const audio = new Audio(audioUrl);
    const character = script.characters.find(c => c.id === line.characterId);
    if (character) {
      audio.playbackRate = getVoicePlaybackRate(character.voice);
    }
    
    activeAudioRef.current = audio;
    
    try {
      await audio.play();
    } catch (e) {
      console.warn("Audio play blocked, rendering canvas directly as preview fallback", e);
      renderCanvasFrame(index);
    }
  };

  const updateTimelineLine = (lineId: string, updates: Partial<DialogueLine>) => {
    if (!onChange) return;
    const nextLines = script.lines.map((l) => {
      if (l.id === lineId) {
        // If text or emotion changes, flush synthesized audio cache to trigger fresh TTS synthesis
        const shouldClearAudio = 
          (updates.text !== undefined && updates.text.trim() !== l.text.trim()) || 
          (updates.emotion !== undefined && updates.emotion !== l.emotion) ||
          (updates.characterId !== undefined && updates.characterId !== l.characterId);
          
        return {
          ...l,
          ...updates,
          audioUrl: shouldClearAudio ? undefined : l.audioUrl
        };
      }
      return l;
    });

    onChange({
      ...script,
      lines: nextLines
    });
  };

  const moveTimelineLine = (index: number, direction: "left" | "right") => {
    if (!onChange) return;
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= script.lines.length) return;

    const nextLines = [...script.lines];
    const temp = nextLines[index];
    nextLines[index] = nextLines[targetIndex];
    nextLines[targetIndex] = temp;

    onChange({
      ...script,
      lines: nextLines
    });

    setSelectedTimelineIndex(targetIndex);
  };

  const deleteTimelineLine = (lineId: string) => {
    if (!onChange) return;
    const nextLines = script.lines.filter((l) => l.id !== lineId);
    
    onChange({
      ...script,
      lines: nextLines
    });

    // Reset cursor safely
    if (selectedTimelineIndex >= nextLines.length) {
      setSelectedTimelineIndex(Math.max(0, nextLines.length - 1));
    }
  };

  const insertTimelineLine = (afterIndex: number) => {
    if (!onChange) return;
    const defaultCharId = script.characters[0]?.id || "char_default";
    const newLine: DialogueLine = {
      id: `line_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      characterId: defaultCharId,
      text: "New script segment beat...",
      emotion: "Casual"
    };

    const nextLines = [...script.lines];
    nextLines.splice(afterIndex + 1, 0, newLine);

    onChange({
      ...script,
      lines: nextLines
    });

    setSelectedTimelineIndex(afterIndex + 1);
  };

  // Clean elements on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  // Global Keyboard Shortcuts for desktop/Windows efficiency
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Bypass if the user is actively typing in a text field
      const active = document.activeElement;
      if (active) {
        const tag = active.tagName.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          active.getAttribute("contenteditable") === "true"
        ) {
          return;
        }
      }

      if (e.code === "Space") {
        e.preventDefault();
        startPlayback();
      } else if (e.code === "Escape") {
        e.preventDefault();
        stopPlayback();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [script, isPlaying, currentLineIndex]);

  // Continuous canvas simulation playback loop
  useEffect(() => {
    if (canvasRef.current && !isExporting) {
      renderCanvasFrame();
    }
  }, [currentLineIndex, script, isExporting]);

  // Render a frame on the canvas reflecting current speaker, visual status & subtitles
  const renderCanvasFrame = (customIndex?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Calculate sub-second timing delta for smooth transitions
    const now = Date.now();
    const dT = Math.min(0.05, (now - lastRenderTimeRef.current) / 1000); // capped delta to prevent jumps
    lastRenderTimeRef.current = now;

    // 1. Draw Background (Cinematic Space Dark Slate Gradient)
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#0b0f19");
    bgGrad.addColorStop(1, "#1e1b4b");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle background grid aesthetic
    ctx.strokeStyle = "rgba(99, 102, 241, 0.05)";
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 2. Draw watermark and title
    ctx.fillStyle = stateRef.current.isSilentPreview ? "#f59e0b" : "rgba(99, 102, 241, 0.45)";
    ctx.font = "italic bold 12px monospace";
    const statusText = stateRef.current.isSilentPreview 
      ? "MUTED PREVIEW RENDER • TIMING ACTIVE" 
      : "DIRECTOR TTS ENGINE • 1080P";
    ctx.fillText(statusText, 40, 45);

    ctx.fillStyle = "#ffffff";
    ctx.font = "600 18px ui-sans-serif, system-ui, sans-serif";
    const displayTitle = script.title || "Untitled Sequence Dialog";
    ctx.fillText(displayTitle, 40, 80);

    const activeIndex = customIndex !== undefined ? customIndex : currentLineIndex;
    const currentLine = script.lines[activeIndex];
    const activeCharacter = currentLine
      ? script.characters.find((c) => c.id === currentLine.characterId)
      : null;

    // Transition State computations for Subtitle Cross-fades
    const expectedText = currentLine ? currentLine.text : "";
    const expectedEmotion = currentLine ? currentLine.emotion : "";
    const expectedSpeakerName = activeCharacter ? activeCharacter.name : "";

    if (expectedText !== subtitleFadeRef.current.currentLineText) {
      subtitleFadeRef.current = {
        prevLineText: subtitleFadeRef.current.currentLineText,
        prevEmotion: subtitleFadeRef.current.currentEmotion,
        prevSpeakerName: subtitleFadeRef.current.currentSpeakerName,
        currentLineText: expectedText,
        currentEmotion: expectedEmotion,
        currentSpeakerName: expectedSpeakerName,
        fadeProgress: expectedText ? 0.0 : 1.0, 
      };
    }

    // Advance subtitle cross-fade state (snappy cinematic transitions)
    if (subtitleFadeRef.current.fadeProgress < 1.0) {
      subtitleFadeRef.current.fadeProgress = Math.min(1.0, subtitleFadeRef.current.fadeProgress + dT * 6.0);
    }

    // 3. Draw Speaker Panels with visual attention-based transition states
    const characters = script.characters;
    let needsAnotherAnimFrame = false;

    if (characters.length > 0) {
      const panelSpacing = width / (characters.length + 1);
      
      characters.forEach((char, index) => {
        const isSpeaker = activeCharacter?.id === char.id;
        const x = panelSpacing * (index + 1);
        const y = height * 0.42;

        const colors = getAvatarColor(char.avatarSeed);

        // Compute smooth attention level targets
        const targetAttention = activeIndex === -1 ? 1.0 : (isSpeaker ? 1.0 : 0.0);
        if (attentionRef.current[char.id] === undefined) {
          attentionRef.current[char.id] = targetAttention;
        }

        const currAttention = attentionRef.current[char.id];
        let smoothedAttention = currAttention;

        if (Math.abs(currAttention - targetAttention) > 0.005) {
          const attentionSpeed = 6.0; // Blend transition factor
          smoothedAttention = currAttention + (targetAttention - currAttention) * Math.min(1, dT * attentionSpeed);
          attentionRef.current[char.id] = smoothedAttention;
          needsAnotherAnimFrame = true;
        } else {
          attentionRef.current[char.id] = targetAttention;
          smoothedAttention = targetAttention;
        }

        ctx.save();
        
        // Fluid desaturation matching the interpolated attention level
        ctx.globalAlpha = 0.35 + 0.65 * smoothedAttention;
        const grayAmount = Math.max(0, Math.min(60, Math.floor(60 * (1 - smoothedAttention))));
        if (grayAmount > 0) {
          ctx.filter = `grayscale(${grayAmount}%)`;
        } else {
          ctx.filter = "none";
        }

        // Draw character concentric neon soundwave rings if speaking (fading with attention)
        if (smoothedAttention > 0.01 && isPlaying && activeCharacter?.id === char.id) {
          const time = Date.now() * 0.005;
          const pulseCount = 3;
          for (let p = 0; p < pulseCount; p++) {
            const ratio = ((time + p / pulseCount) % 1);
            const r = 65 + ratio * 35;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.strokeStyle = colors.primary;
            ctx.lineWidth = (1 - ratio) * 3.5 * smoothedAttention;
            ctx.stroke();
          }
        }

        // Draw circular Avatar container with transition shadows and border thickness
        ctx.beginPath();
        ctx.arc(x, y, 60, 0, Math.PI * 2);
        ctx.fillStyle = colors.bg;
        ctx.shadowColor = colors.primary;
        ctx.shadowBlur = 5 + 15 * smoothedAttention;
        ctx.fill();
        ctx.strokeStyle = smoothedAttention > 0.5 ? "#ffffff" : colors.secondary;
        ctx.lineWidth = 2 + 2 * smoothedAttention;
        ctx.stroke();
        ctx.shadowBlur = 0; // reset shadow

        // Render portrait image or fall back to initials text
        if (char.avatarUrl) {
          let cachedImg = imageCacheRef.current[char.avatarUrl];
          if (!cachedImg) {
            cachedImg = new Image();
            cachedImg.crossOrigin = "anonymous"; // Avoid tainted canvas
            cachedImg.src = char.avatarUrl;
            cachedImg.onload = () => {
              renderCanvasFrame();
            };
            imageCacheRef.current[char.avatarUrl] = cachedImg;
          }

          if (cachedImg.complete && cachedImg.naturalWidth !== 0) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, 58, 0, Math.PI * 2);
            ctx.clip();
            // Draw image cropped cleanly in the circle
            ctx.drawImage(cachedImg, x - 58, y - 58, 116, 116);
            ctx.restore();
          } else {
            // Draw styled avatar initials in absolute typography standard pairings during load
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 28px monospace";
            ctx.textAlign = "center";
            ctx.fillText(char.name.substring(0, 2).toUpperCase(), x, y + 10);
          }
        } else {
          // Draw styled avatar initials in absolute typography standard pairings
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 28px monospace";
          ctx.textAlign = "center";
          ctx.fillText(char.name.substring(0, 2).toUpperCase(), x, y + 10);
        }

        // Draw character label tags (font transforms to bold/colored seamlessly)
        ctx.fillStyle = smoothedAttention > 0.5 ? colors.primary : "#94a3b8";
        ctx.font = smoothedAttention > 0.5 ? "bold 15px ui-sans-serif, sans-serif" : "500 13px ui-sans-serif, sans-serif";
        ctx.fillText(char.name, x, y + 90);

        // Subtitled Voice mode description
        ctx.fillStyle = "rgba(148, 163, 184, 0.75)";
        ctx.font = "10px monospace";
        ctx.fillText(`Voice: ${char.voice}`, x, y + 106);

        // 4. Draw energetic bouncing real-time soundwaves scaling with attention
        if (isPlaying && activeCharacter?.id === char.id && smoothedAttention > 0.1) {
          ctx.fillStyle = colors.primary;
          const barWidth = 4;
          const barGap = 3;
          const barCount = 10;
          const waveHeight = 25;
          const startX = x - ((barWidth + barGap) * barCount) / 2;

          for (let b = 0; b < barCount; b++) {
            const heightFactor = Math.abs(Math.sin((b + Date.now() * 0.015))) * 0.7 + Math.random() * 0.3;
            const size = Math.max(4, heightFactor * waveHeight * smoothedAttention);
            ctx.fillRect(
              startX + b * (barWidth + barGap),
              y - 120 - size / 2,
              barWidth,
              size
            );
          }
        }

        ctx.restore();
      });
    }

    // 5. Render Cinematic Subtitle/Caption Overlay Drawer with cross-fading texts
    const fadeState = subtitleFadeRef.current;
    const hasAnySubtitleToRender = !!fadeState.currentLineText || (fadeState.fadeProgress < 0.99 && !!fadeState.prevLineText);

    if (hasAnySubtitleToRender) {
      const bannerHeight = 150;
      const bannerY = height - bannerHeight - 40;

      ctx.save();
      // Draw semi-transparent subtitle backing plate
      ctx.fillStyle = "rgba(4, 6, 15, 0.85)";
      ctx.strokeStyle = "rgba(99, 102, 241, 0.15)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(40, bannerY, width - 80, bannerHeight, 8);
      ctx.fill();
      ctx.stroke();

      // Render Previous Line (Blending Out)
      if (fadeState.prevLineText && fadeState.fadeProgress < 0.99) {
        ctx.save();
        ctx.globalAlpha = 1.0 - fadeState.fadeProgress;

        const prevChar = script.characters.find((c) => c.name === fadeState.prevSpeakerName);
        const prevColors = getAvatarColor(prevChar?.avatarSeed || "default");

        // Speaker Name Tag Box
        ctx.fillStyle = prevColors.primary;
        ctx.font = "bold 15px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`[${fadeState.prevSpeakerName.toUpperCase()} • ${fadeState.prevEmotion.toUpperCase()}]`, 70, bannerY + 35);

        // Dialog Lines text wrapped inside standard bounds
        ctx.fillStyle = "#ffffff";
        ctx.font = "500 18px ui-sans-serif, system-ui, sans-serif";
        ctx.textBaseline = "top";
        
        const wrappedLines = wrapText(ctx, fadeState.prevLineText, width - 150);
        wrappedLines.forEach((textLine, textIdx) => {
          ctx.fillText(textLine, 70, bannerY + 55 + textIdx * 25);
        });

        ctx.restore();
      }

      // Render Current Line (Blending In)
      if (fadeState.currentLineText && fadeState.fadeProgress > 0.01) {
        ctx.save();
        ctx.globalAlpha = fadeState.fadeProgress;

        const currChar = script.characters.find((c) => c.name === fadeState.currentSpeakerName);
        const currColors = getAvatarColor(currChar?.avatarSeed || "default");

        // Speaker Name Tag Box
        ctx.fillStyle = currColors.primary;
        ctx.font = "bold 15px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`[${fadeState.currentSpeakerName.toUpperCase()} • ${fadeState.currentEmotion.toUpperCase()}]`, 70, bannerY + 35);

        // Dialog Lines text wrapped inside standard bounds
        ctx.fillStyle = "#ffffff";
        ctx.font = "500 18px ui-sans-serif, system-ui, sans-serif";
        ctx.textBaseline = "top";
        
        const wrappedLines = wrapText(ctx, fadeState.currentLineText, width - 150);
        wrappedLines.forEach((textLine, textIdx) => {
          ctx.fillText(textLine, 70, bannerY + 55 + textIdx * 25);
        });

        ctx.restore();
      }

      ctx.restore();
    } else {
      // Idle helper text overlay
      ctx.save();
      ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
      ctx.font = "14px ui-sans-serif, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Ready. Press Play to review dialogue flow sequentially.", width / 2, height - 100);
      ctx.restore();
    }

    if (fadeState.fadeProgress < 1.0) {
      needsAnotherAnimFrame = true;
    }

    // Schedule next frame in case transitions have not fully converged (only when not playing and not exporting)
    if (needsAnotherAnimFrame && !isPlaying && !isExporting) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = requestAnimationFrame(() => renderCanvasFrame());
    }
  };

  // Pre-generate / cache all dialogue lines audio in parallel with controlled concurrency
  const handleSynthesizeAll = async () => {
    if (isSynthesizingAll) return;
    setIsSynthesizingAll(true);
    try {
      const allLines = script.lines.filter((l) => !l.audioUrl);
      const totalCount = allLines.length;
      let processedCount = 0;

      const executeWorkers = async (queue: any[]) => {
        while (queue.length > 0) {
          const line = queue.shift();
          if (!line) break;
          try {
            await onSynthesizeLine(line.id);
          } catch (err) {
            console.error("Batch synthesis failed for line id:", line.id, err);
          }
        }
      };

      const workerCount = Math.min(3, allLines.length);
      const workers = [];
      const queue = [...allLines];
      for (let i = 0; i < workerCount; i++) {
        workers.push(executeWorkers(queue));
      }
      await Promise.all(workers);
    } catch (err) {
      console.error("Batch synthesis failed:", err);
    } finally {
      setIsSynthesizingAll(false);
    }
  };

  // Play dialogue sequentially
  const startPlayback = async (silentMode = false) => {
    if (isPlaying) {
      pausePlayback();
      return;
    }

    if (!silentMode) {
      // Ensure audio context is safe
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }
    }

    setIsPlaying(true);
    setIsSilentPreviewState(silentMode);
    stateRef.current.isPlaying = true;
    stateRef.current.isSilentPreview = silentMode;

    // Start rendering animation ticks (soundwaves & visual timers)
    if (renderIntervalRef.current) clearInterval(renderIntervalRef.current);
    renderIntervalRef.current = setInterval(() => {
      if (stateRef.current.isPlaying) {
        renderCanvasFrame();
      }
    }, 45);

    // If starting from clean state, set line to 0
    let startIdx = currentLineIndex;
    if (startIdx === -1 || startIdx >= script.lines.length - 1) {
      startIdx = 0;
      setCurrentLineIndex(0);
      stateRef.current.lineIndex = 0;
    }

    playSequenceStep(startIdx);
  };

  const playSequenceStep = async (index: number) => {
    if (!stateRef.current.isPlaying || index >= script.lines.length) {
      stopPlayback();
      return;
    }

    setCurrentLineIndex(index);
    stateRef.current.lineIndex = index;
    const line = script.lines[index];

    if (stateRef.current.isSilentPreview) {
      // Calculate visual timing standard based on average reading speed
      // E.g. ~250ms per word + 1000ms base, bounds 1.8s to 5.5s
      const wordCount = line.text.split(/\s+/).filter(Boolean).length;
      const readingDuration = Math.max(1800, Math.min(5500, wordCount * 250 + 1000));
      
      if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = setTimeout(() => {
        if (stateRef.current.isPlaying && stateRef.current.isSilentPreview) {
          playSequenceStep(index + 1);
        }
      }, readingDuration);
      return;
    }

    let audioUrl = line.audioUrl;
    if (!audioUrl) {
      // Auto synthesize dynamically on the fly! Very high end feature.
      try {
        console.log(`Auto synthesizing line index ${index} on the fly...`);
        audioUrl = await onSynthesizeLine(line.id);
      } catch (err) {
        console.error("Inline dynamic synthesis failed:", err);
      }
    }

    if (!audioUrl) {
      // Skip gracefully if it failed
      setTimeout(() => playSequenceStep(index + 1), 2200);
      return;
    }

    // Load and play the synthesized audio element natively
    const audio = new Audio(audioUrl);
    const character = script.characters.find(c => c.id === line.characterId);
    if (character) {
      audio.playbackRate = getVoicePlaybackRate(character.voice);
    }
    activeAudioRef.current = audio;

    audio.onended = () => {
      // Safe dynamic recursion for next dialogue part
      if (stateRef.current.isPlaying) {
        playSequenceStep(index + 1);
      }
    };

    audio.onerror = (e) => {
      console.error("Audio playback error:", e);
      if (stateRef.current.isPlaying) {
        setTimeout(() => playSequenceStep(index + 1), 1500);
      }
    };

    try {
      await audio.play();
    } catch (error) {
      console.warn("Audio play blocked, playing silently fallback timer", error);
      // Fallback timer based on typical reading speed if blocked
      if (stateRef.current.isPlaying) {
        setTimeout(() => playSequenceStep(index + 1), 4000);
      }
    }
  };

  const pausePlayback = () => {
    setIsPlaying(false);
    setIsSilentPreviewState(false);
    stateRef.current.isPlaying = false;
    stateRef.current.isSilentPreview = false;
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
    }
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
    if (renderIntervalRef.current) {
      clearInterval(renderIntervalRef.current);
      renderIntervalRef.current = null;
    }
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    setIsSilentPreviewState(false);
    stateRef.current.isPlaying = false;
    stateRef.current.isSilentPreview = false;
    setCurrentLineIndex(-1);
    stateRef.current.lineIndex = -1;
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
    if (renderIntervalRef.current) {
      clearInterval(renderIntervalRef.current);
      renderIntervalRef.current = null;
    }
    // Final tick to clear overlays
    setTimeout(() => renderCanvasFrame(-1), 100);
  };

  // MP4 browser recording and assembly pipeline
  const exportAsVideoFile = async () => {
    if (isExporting) return;
    
    // Stop any active play first
    stopPlayback();

    // Ensure all lines have synthesized audio before starting (parallelized with controlled concurrency)
    const missingAudio = script.lines.some((l) => !l.audioUrl);
    if (missingAudio) {
      setIsSynthesizingAll(true);
      try {
        const allLines = script.lines.filter((l) => !l.audioUrl);
        const totalLinesCount = script.lines.length;
        let processedCount = 0;

        const executeWorkers = async (queue: any[]) => {
          while (queue.length > 0) {
            const line = queue.shift();
            if (!line) break;
            try {
              await onSynthesizeLine(line.id);
            } catch (err) {
              console.error("Single line synthesis error:", err);
            } finally {
              processedCount++;
              setExportProgress(Math.floor((processedCount / totalLinesCount) * 30));
            }
          }
        };

        const workerCount = Math.min(3, allLines.length);
        const workers = [];
        const queue = [...allLines];
        for (let i = 0; i < workerCount; i++) {
          workers.push(executeWorkers(queue));
        }
        await Promise.all(workers);
      } catch (err) {
        alert("Could not generate audio tracks necessary for synthesis.");
        setIsSynthesizingAll(false);
        return;
      }
      setIsSynthesizingAll(false);
    }

    setExportProgress(30);
    setIsExporting(true);
    stateRef.current.isExporting = true;

    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("No canvas resource detected");

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();
      const canvasStream = canvas.captureStream(30); // 30 FPS

      // Mix Video & Audio streams
      const mixedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      // Detect browser mime type support (WebM which wraps MP4 streams natively)
      let recordType = "video/webm";
      let ext = "webm";
      if (MediaRecorder.isTypeSupported("video/mp4")) {
        recordType = "video/mp4";
        ext = "mp4";
      } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
        recordType = "video/webm;codecs=vp9,opus";
        ext = "webm";
      } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
        recordType = "video/webm;codecs=vp8";
        ext = "webm";
      }
      setExportExtension(ext);

      const recorder = new MediaRecorder(mixedStream, {
        mimeType: recordType,
        videoBitsPerSecond: 2500000, // sharp crisp quality
      });

      const chunkBuffer: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunkBuffer.push(event.data);
        }
      };

      // Set up recording loop callback
      let linesRecorded = 0;
      const totalScriptLines = script.lines.length;

      const recordStep = async (stepIdx: number) => {
        if (stepIdx >= totalScriptLines) {
          // Finished recording!
          recorder.stop();
          return;
        }

        const percentage = 30 + Math.floor((stepIdx / totalScriptLines) * 60);
        setExportProgress(percentage);

        // Update visual model state
        setCurrentLineIndex(stepIdx);
        renderCanvasFrame(stepIdx);

        const currentLine = script.lines[stepIdx];
        if (!currentLine.audioUrl) {
          setTimeout(() => recordStep(stepIdx + 1), 1000);
          return;
        }

        // Create standard HTMLAudioElement on custom stream context to record properly
        const audio = new Audio(currentLine.audioUrl);
        const character = script.characters.find(c => c.id === currentLine.characterId);
        if (character) {
          audio.playbackRate = getVoicePlaybackRate(character.voice);
        }
        audiosInFlight.push(audio);

        // Pipe audio element directly into destination stream recorder node
        const source = audioCtx.createMediaElementSource(audio);
        source.connect(dest);
        source.connect(audioCtx.destination); // Let user hear what is being parsed

        audio.onended = () => {
          source.disconnect();
          recordStep(stepIdx + 1);
        };

        audio.onerror = () => {
          source.disconnect();
          recordStep(stepIdx + 1);
        };

        await audio.play();
      };

      const audiosInFlight: HTMLAudioElement[] = [];

      // Canvas dynamic visualization loop specifically for video capture stream
      const drawVisualLoop = () => {
        if (stateRef.current.isExporting) {
          renderCanvasFrame();
          requestAnimationFrame(drawVisualLoop);
        }
      };

      recorder.onstop = () => {
        stateRef.current.isExporting = false;
        
        // compile chunks into download blob
        const videoBlob = new Blob(chunkBuffer, { type: "video/mp4" });
        const videoUrl = URL.createObjectURL(videoBlob);
        setExportUrl(videoUrl);
        setExportProgress(100);
        setIsExporting(false);
        setCurrentLineIndex(-1);
        renderCanvasFrame(-1);
      };

      // Start recording triggers
      recorder.start();
      requestAnimationFrame(drawVisualLoop);
      await recordStep(0);

    } catch (err: any) {
      console.error("Export error: ", err);
      alert(`Synthesis Failed during export pipeline: ${err.message || "Unknown context error"}`);
      setIsExporting(false);
      stateRef.current.isExporting = false;
    }
  };

  const exportAsMp3AudioFile = async () => {
    if (isExporting || isExportingAudio) return;
    
    // Stop active playback
    stopPlayback();

    const missingAudio = script.lines.some((l) => !l.audioUrl);
    if (missingAudio) {
      setIsSynthesizingAll(true);
      try {
        const allLines = script.lines.filter((l) => !l.audioUrl);
        const totalLinesCount = script.lines.length;
        let processedCount = 0;

        const executeWorkers = async (queue: any[]) => {
          while (queue.length > 0) {
            const line = queue.shift();
            if (!line) break;
            try {
              await onSynthesizeLine(line.id);
            } catch (err) {
              console.error("Single line synthesis error:", err);
            } finally {
              processedCount++;
              setExportAudioProgress(Math.floor((processedCount / totalLinesCount) * 30));
            }
          }
        };

        const workerCount = Math.min(3, allLines.length);
        const workers = [];
        const queue = [...allLines];
        for (let i = 0; i < workerCount; i++) {
          workers.push(executeWorkers(queue));
        }
        await Promise.all(workers);
      } catch (err) {
        alert("Could not generate audio tracks necessary for synthesis.");
        setIsSynthesizingAll(false);
        return;
      }
      setIsSynthesizingAll(false);
    }

    setIsExportingAudio(true);
    setExportAudioProgress(35);

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      setExportAudioProgress(50);
      
      const buffers = [];
      for (let i = 0; i < script.lines.length; i++) {
        const line = script.lines[i];
        if (line.audioUrl) {
          const buffer = await decodeAudioUrl(audioCtx, line.audioUrl);
          buffers.push(buffer);
        }
        setExportAudioProgress(50 + Math.floor((i / script.lines.length) * 25));
      }
      
      if (buffers.length === 0) {
        throw new Error("No synthesized dialogue lines available to export.");
      }
      
      setExportAudioProgress(80);
      const mergedBuffer = mergeAudioBuffers(audioCtx, buffers, 0.8);
      
      setExportAudioProgress(90);
      const mp3Blob = await audioBufferToMp3(mergedBuffer);
      
      setExportAudioProgress(100);
      const filename = `${script.title ? script.title.toLowerCase().replace(/\s+/g, "_") : "soundtrack"}_audio.mp3`;
      triggerFileDownload(mp3Blob, filename);
      
      setTimeout(() => {
        setIsExportingAudio(false);
        setExportAudioProgress(0);
      }, 1000);
      
    } catch (err: any) {
      console.error("Audio export error:", err);
      alert(`Synthesis Failed during audio export pipeline: ${err.message || "Unknown context error"}`);
      setIsExportingAudio(false);
      setExportAudioProgress(0);
    }
  };

  const totalLines = script.lines.length;
  const linesSynthesized = script.lines.filter((l) => l.audioUrl).length;
  const allSynthesized = linesSynthesized === totalLines;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between h-full" id="video-workspace">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-sans font-semibold text-white flex items-center gap-2">
            <Film className="h-4.5 w-4.5 text-indigo-400" />
            Dialogue Workspace
          </h2>
          <div className="text-[11px] px-2 py-0.5 rounded bg-slate-950 text-indigo-300 font-mono border border-slate-800">
            {linesSynthesized}/{totalLines} Channels Armed
          </div>
        </div>

        {/* 16:9 Cinematic Video Output Screen */}
        <div className="relative aspect-video w-full bg-slate-950 rounded-lg overflow-hidden border border-slate-800 shadow-inner group">
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="w-full h-full object-contain"
          />

          {/* Sync / Export loading overlay */}
          {isExporting && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
              <Loader2 className="h-10 w-10 text-indigo-400 animate-spin mb-3" />
              <h3 className="text-white text-base font-semibold">Generating HD MP4 Video</h3>
              <p className="text-slate-400 text-xs mt-1 max-w-[280px]">
                Encoding audio streams & rendering subtitle cards. Keep window active while generating.
              </p>
              <div className="w-full max-w-[200px] bg-slate-800 h-1.5 rounded-full mt-4 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              <span className="text-slate-400 text-xs mt-2 font-mono">
                {exportProgress}% Encoded
              </span>
            </div>
          )}

          {isExportingAudio && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
              <Loader2 className="h-10 w-10 text-indigo-400 animate-spin mb-3" />
              <h3 className="text-white text-base font-semibold">Compiling MP3 Audio Master</h3>
              <p className="text-slate-400 text-xs mt-1 max-w-[280px]">
                Encoding multiple dialogue WAV streams dynamically into a single clean MP3 output track.
              </p>
              <div className="w-full max-w-[200px] bg-slate-800 h-1.5 rounded-full mt-4 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${exportAudioProgress}%` }}
                />
              </div>
              <span className="text-slate-400 text-xs mt-2 font-mono">
                {exportAudioProgress}% Encoded
              </span>
            </div>
          )}
        </div>

        {/* Timeline info and caching arming widget */}
        <div className="mt-4 flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-950/50 p-3 border border-slate-800/60 rounded-lg">
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${allSynthesized ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
            <span className="text-xs text-slate-300">
              {allSynthesized
                ? "All dialog lines compiled!"
                : `${totalLines - linesSynthesized} lines require speech synthesis`}
            </span>
          </div>

          {!allSynthesized && (
            <button
              onClick={handleSynthesizeAll}
              disabled={isSynthesizingAll || totalLines === 0}
              className="w-full sm:w-auto text-xs font-sans font-medium px-3.5 py-1.5 rounded bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white disabled:bg-slate-850 disabled:text-slate-600 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isSynthesizingAll ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Compiling...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3" />
                  Synthesize Remainder
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* --- Chronological Visual Timeline Editor --- */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-3 animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-indigo-400 animate-pulse" />
            <h3 className="text-xs font-sans font-bold text-slate-200 uppercase tracking-wider">
              Audio Timeline Studio
            </h3>
          </div>
          
          <div className="flex bg-slate-900 border border-slate-800/80 p-0.5 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setTimelineView("multitrack")}
              className={`px-3 py-1 rounded text-[10px] font-sans font-semibold transition-all cursor-pointer ${
                timelineView === "multitrack"
                  ? "bg-indigo-600 text-white shadow-md font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Multi-Track DAW
            </button>
            <button
              type="button"
              onClick={() => setTimelineView("linear")}
              className={`px-3 py-1 rounded text-[10px] font-sans font-semibold transition-all cursor-pointer ${
                timelineView === "linear"
                  ? "bg-indigo-600 text-white shadow-md font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Linear Clips
            </button>
          </div>
          
          <span className="text-[10px] font-mono text-slate-450 shrink-0">
            {script.lines.length} {script.lines.length === 1 ? "track beat" : "track beats"} • Alignment: Sequential Sync
          </span>
        </div>

        {/* Workspace Toolbar: Zoom Options + Waveform Views */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900/30 p-3 rounded-lg border border-slate-900/60 z-10 transition-all select-none">
          {/* Waveform View Selector options */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full md:w-auto">
            <span className="text-[10px] font-sans font-extrabold text-slate-400 uppercase tracking-widest shrink-0">
              Waveform Visualizer:
            </span>
            <div className="flex bg-slate-950/80 p-0.5 rounded border border-slate-850 w-full sm:w-auto justify-between overflow-x-auto gap-0.5">
              {(["bars", "mirror", "spectrum", "frequency"] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setWaveformStyle(style)}
                  className={`px-3 py-1 rounded text-[9px] font-mono font-bold uppercase tracking-wide transition-all cursor-pointer grow text-center select-none ${
                    waveformStyle === style
                      ? "bg-indigo-600/90 text-white shadow-md font-bold"
                      : "text-slate-400 hover:text-white hover:bg-slate-900/40"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline Zoom controls: slider + ZoomIn/ZoomOut icons */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full md:w-auto justify-end">
            <span className="text-[10px] font-sans font-extrabold text-slate-400 uppercase tracking-widest shrink-0">
              Zoom Track:
            </span>
            <div className="flex items-center gap-2 bg-slate-950/80 p-1 px-3 rounded border border-slate-850 w-full sm:w-auto justify-between">
              <button
                type="button"
                onClick={() => setTimelineZoom(Math.max(0.6, timelineZoom - 0.15))}
                disabled={timelineZoom <= 0.6}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-25 hover:text-white transition-colors cursor-pointer"
                title="Decrease Timeline Width (Zoom Out)"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              
              <input
                type="range"
                min="0.6"
                max="2.0"
                step="0.1"
                value={timelineZoom}
                onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
                className="grow sm:w-24 accent-indigo-550 bg-slate-850 h-1.5 rounded-lg cursor-pointer hover:accent-indigo-400 transition-all opacity-85 hover:opacity-100"
                title="Timeline zoom track factor"
              />

              <button
                type="button"
                onClick={() => setTimelineZoom(Math.min(2.0, timelineZoom + 0.15))}
                disabled={timelineZoom >= 2.0}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-25 hover:text-white transition-colors cursor-pointer"
                title="Increase Timeline Width (Zoom In)"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              
              <span className="text-[9px] font-mono text-indigo-400 w-8 text-right font-bold ml-1">
                {Math.round(timelineZoom * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Multi-Track DAW Mode representation */}
        {timelineView === "multitrack" && (
          <div className="space-y-3 animate-fadeIn">
            {script.lines.length === 0 ? (
              <div className="w-full py-8 flex flex-col items-center justify-center text-center bg-slate-950/40 border border-dashed border-slate-850 rounded-lg">
                <PlusCircle className="h-8 w-8 text-slate-500 mb-2 animate-pulse" />
                <p className="text-xs text-slate-400 mb-2">No dialogue segments on the DAW track timeline yet.</p>
                <button
                  type="button"
                  onClick={() => insertTimelineLine(-1)}
                  className="text-xs bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white px-3 py-1.5 rounded-md font-sans transition-colors cursor-pointer"
                >
                  Insert First Line
                </button>
              </div>
            ) : (
              <div className="flex overflow-x-auto scrollbar-thin rounded-lg border border-slate-800/80 bg-slate-950/45">
                {/* Fixed Track Headers Left Desk Side */}
                <div className="w-52 bg-slate-900 flex-shrink-0 flex flex-col divide-y divide-slate-800/70 border-r border-slate-800 sticky left-0 z-20">
                  <div className="h-9 bg-slate-950 text-slate-400 text-[10px] font-mono font-bold flex items-center px-3 border-b border-slate-800 uppercase tracking-wider bg-slate-900/90 select-none">
                    Tracks & Cast
                  </div>
                  {script.characters.map((char) => {
                    const colorTuple = getAvatarColor(char.avatarSeed || "unknown");
                    const isAnyTrackDemoActive = playingVoiceDemoId === char.id;
                    return (
                      <div key={char.id} className="h-[125px] p-2.5 flex flex-col justify-between bg-slate-900/95">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm"
                            style={{ backgroundColor: colorTuple.bg }}
                          >
                            {char.name.substring(0, 1).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-sans font-bold text-slate-200 truncate">{char.name}</div>
                            <div className="text-[9px] text-indigo-400 font-semibold font-mono">Actor Voice</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5 justify-between">
                          <select
                            value={char.voice}
                            onChange={(e) => updateCharacterVoice(char.id, e.target.value)}
                            className="text-[9px] font-sans bg-slate-950 border border-slate-800/85 rounded px-1.5 py-1 text-slate-300 outline-none max-w-[125px] truncate cursor-pointer hover:border-indigo-500 transition-colors"
                          >
                            {PREBUILT_VOICES.map((v) => (
                              <option key={v.id} value={v.name}>{v.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => previewVoiceDemo(char.id, char.name, char.voice)}
                            className="p-1 px-1.5 rounded bg-slate-950 hover:bg-slate-850 border border-slate-850 text-indigo-450 transition-colors cursor-pointer shrink-0"
                            title="Test voice timbre"
                          >
                            {isAnyTrackDemoActive ? (
                              <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                            ) : (
                              <Music className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Horizontally scrolling sequential lanes grid */}
                <div className="flex flex-1">
                  {script.lines.map((line, colIndex) => {
                    const isCurrentPlayhead = colIndex === currentLineIndex;
                    const isSelected = colIndex === selectedTimelineIndex;
                    return (
                      <div key={line.id} className="flex-shrink-0 flex flex-col border-r border-slate-850/60 divide-y divide-slate-850/60" style={{ width: `${Math.round(224 * timelineZoom)}px` }}>
                        {/* Beat Header Step Box */}
                        <div className={`h-9 bg-slate-950 border-b border-slate-805 px-3 flex items-center justify-between text-[10px] font-mono leading-none ${isCurrentPlayhead ? "text-indigo-450 font-bold bg-indigo-950/20" : "text-slate-500"}`}>
                          <span>BEAT #{colIndex + 1}</span>
                          {isCurrentPlayhead && (
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                          )}
                        </div>
                        
                        {/* Render actor tracks segments */}
                        {script.characters.map((char) => {
                          const isOwner = line.characterId === char.id;
                          return (
                            <div key={char.id} className={`h-[125px] p-2 flex flex-col justify-between transition-colors relative ${isOwner ? (isSelected ? "bg-indigo-950/20" : "bg-slate-900/10") : "bg-transparent hover:bg-slate-900/10"}`}>
                              {isOwner ? (
                                <div
                                  onClick={() => setSelectedTimelineIndex(colIndex)}
                                  className={`flex-1 flex flex-col justify-between rounded-lg p-2 text-left border cursor-pointer select-none transition-all duration-200 relative group/node ${
                                    isCurrentPlayhead
                                      ? "border-indigo-500 bg-indigo-950/40 ring-1 ring-indigo-500"
                                      : isSelected
                                      ? "border-indigo-500/50 bg-slate-900/90 shadow-md"
                                      : "border-slate-800/80 bg-slate-950 hover:bg-slate-900"
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold tracking-wide">
                                        {line.emotion}
                                      </span>
                                      {line.audioUrl ? (
                                        <Check className="h-2.5 w-2.5 text-emerald-400 shrink-0 border border-slate-800 rounded bg-slate-950/60" />
                                      ) : line.loading ? (
                                        <Loader2 className="h-2.5 w-2.5 animate-spin text-amber-500 shrink-0" />
                                      ) : null}
                                    </div>
                                    <p className="text-[10px] text-slate-300 leading-tight line-clamp-2 italic font-sans">
                                      "{line.text || "(empty dialogue)"}"
                                    </p>
                                  </div>

                                  {/* Multi-track dynamic waveform generator */}
                                  {renderStylizedWave(line.text, isCurrentPlayhead, !!line.audioUrl)}

                                  {/* Action popup on hover */}
                                  <div className="absolute inset-0 bg-slate-905/98 rounded-lg opacity-0 group-hover/node:opacity-100 transition-opacity flex flex-col justify-between p-1.5 select-none z-10 transition-all duration-150">
                                    <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                                      <span className="text-[8px] text-indigo-400 font-bold uppercase">Beat #{colIndex + 1}</span>
                                      <div className="flex gap-0.5">
                                        <button
                                          type="button"
                                          disabled={colIndex === 0}
                                          onClick={(e) => { e.stopPropagation(); moveTimelineLine(colIndex, "left"); }}
                                          className="p-0.5 rounded bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                                          title="Move Beat Earlier"
                                        >
                                          <ArrowLeft className="h-2.5 w-2.5" />
                                        </button>
                                        <button
                                          type="button"
                                          disabled={colIndex === script.lines.length - 1}
                                          onClick={(e) => { e.stopPropagation(); moveTimelineLine(colIndex, "right"); }}
                                          className="p-0.5 rounded bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                                          title="Move Beat Later"
                                        >
                                          <ArrowRight className="h-2.5 w-2.5" />
                                        </button>
                                      </div>
                                    </div>

                                    <div className="flex justify-around items-center gap-0.5">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); playLineSolo(colIndex); }}
                                        className="bg-indigo-600 p-1 px-1.5 rounded text-white flex items-center gap-0.5 text-[8px] font-bold cursor-pointer hover:bg-indigo-500 transition-colors"
                                      >
                                        <Play className="h-2 w-2 fill-white" />
                                        SOLO
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); insertTimelineLine(colIndex); }}
                                        className="bg-slate-800 p-1 px-1.5 rounded text-indigo-300 flex items-center gap-0.5 text-[8px] font-bold cursor-pointer hover:bg-slate-700 hover:text-white transition-colors"
                                      >
                                        <Plus className="h-2 w-2" />
                                        INS
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (confirm(`Remove track segment beat #${colIndex + 1}?`)) {
                                            deleteTimelineLine(line.id);
                                          }
                                        }}
                                        className="bg-slate-900 border border-slate-800 p-1 rounded text-rose-500 hover:bg-rose-950/40 hover:text-rose-400 cursor-pointer"
                                      >
                                        <Trash2 className="h-2.5 w-2.5" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  onClick={() => {
                                    updateTimelineLine(line.id, { characterId: char.id });
                                  }}
                                  className="flex-1 rounded-lg border border-dashed border-slate-800/40 hover:border-indigo-500/50 hover:bg-indigo-500/5 flex flex-col justify-center items-center cursor-pointer transition-all duration-200 group/empty select-none"
                                  title={`Switch Beat #${colIndex + 1} speaker to ${char.name}`}
                                >
                                  <span className="text-[9px] text-slate-500 group-hover/empty:text-indigo-400 font-semibold font-sans transition-colors flex items-center gap-1">
                                    <Plus className="h-2 w-2 opacity-40 group-hover/empty:opacity-100" />
                                    Reassign
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  
                  {/* Append New Beat Column Block */}
                  <div className="flex-shrink-0 flex flex-col transition-all" style={{ width: `${Math.round(144 * timelineZoom)}px` }}>
                    <div className="h-9 bg-slate-950/20 border-b border-slate-805 flex items-center px-3 text-[10px] font-mono text-slate-505 uppercase">
                      Append
                    </div>
                    <div
                      onClick={() => insertTimelineLine(script.lines.length - 1)}
                      className="flex-1 flex flex-col justify-center items-center py-6 border-dashed border border-slate-800/50 hover:border-indigo-500/50 bg-slate-950/10 hover:bg-indigo-600/5 cursor-pointer group/addcol"
                    >
                      <PlusCircle className="h-6 w-6 text-slate-500 group-hover/addcol:text-indigo-400 mb-1 scale-100 group-hover/addcol:scale-110 transition-transform" />
                      <span className="text-[9px] text-slate-500 group-hover/addcol:text-indigo-300 font-bold uppercase tracking-wider font-sans select-none">
                        Add Beat
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Linear Classic Timeline Clips Mode representation */}
        {timelineView === "linear" && (
          <div className="space-y-3 animate-fadeIn">
            <div className="flex flex-row overflow-x-auto gap-3 py-2 px-1 scrollbar-thin scrollbar-thumb-indigo-900/60 scrollbar-track-slate-950/45 scrollbar-corner-transparent" style={{ contentVisibility: "auto" }}>
              {script.lines.length === 0 ? (
                <div className="w-full py-6 flex flex-col items-center justify-center text-center bg-slate-905-30 border border-dashed border-slate-850 rounded-lg">
                  <PlusCircle className="h-8 w-8 text-slate-500 mb-2 animate-pulse" />
                  <p className="text-xs text-slate-400 mb-2">No dialogue segments on the timeline track yet.</p>
                  <button
                    type="button"
                    onClick={() => insertTimelineLine(-1)}
                    className="text-xs bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white px-3 py-1.5 rounded-md font-sans transition-colors cursor-pointer"
                  >
                    Insert First Line
                  </button>
                </div>
              ) : (
                script.lines.map((line, index) => {
                  const char = script.characters.find((c) => c.id === line.characterId);
                  const isCurrentPlayhead = index === currentLineIndex;
                  const isSelected = index === selectedTimelineIndex;
                  const colorTuple = getAvatarColor(char?.avatarSeed || "unknown");

                  return (
                    <div
                      key={line.id}
                      onClick={() => setSelectedTimelineIndex(index)}
                      className={`shrink-0 p-3 rounded-lg border text-left cursor-pointer transition-all duration-250 relative group/node select-none flex flex-col justify-between min-h-[135px] ${
                        isCurrentPlayhead
                          ? "border-indigo-500 bg-slate-900 ring-2 ring-indigo-500 shadow-xl"
                          : isSelected
                          ? "border-indigo-500/50 bg-slate-850/90 shadow-md"
                          : "border-slate-800/80 bg-slate-950/50 hover:bg-slate-900/40"
                      }`}
                      style={{
                        width: `${Math.round(180 * timelineZoom)}px`,
                        boxShadow: isCurrentPlayhead ? "0 0 15px rgba(99, 102, 241, 0.3)" : undefined
                      }}
                    >
                      {/* Top Bar Speaker badge */}
                      <div>
                        <div className="flex items-center gap-1.5 justify-between">
                          <div className="flex items-center gap-1 min-w-0">
                            <span
                              className="h-3.5 w-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                              style={{ backgroundColor: colorTuple.bg }}
                            >
                              {char?.name.substring(0, 1).toUpperCase() || "?"}
                            </span>
                            <span className="text-[10px] font-sans font-semibold text-slate-200 truncate">
                              {char?.name || "Unassigned"}
                            </span>
                          </div>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/85 text-slate-400 text-mono truncate shrink-0">
                            {line.emotion}
                          </span>
                        </div>

                        {/* Speech Trimmed body */}
                        <p className="text-[10px] text-slate-350 font-sans line-clamp-2 mt-2 mb-2 leading-relaxed italic">
                          "{line.text || "(empty dialogue text)"}"
                        </p>

                        {/* Dynamic Waveform Style layout selection inside linear card */}
                        {renderStylizedWave(line.text, isCurrentPlayhead, !!line.audioUrl)}
                      </div>

                      {/* Status Wave tracker / Indicators */}
                      <div className="flex items-center justify-between border-t border-slate-800/40 pt-1.5 mt-1.5">
                        {isCurrentPlayhead ? (
                          <span className="flex items-center gap-1">
                            <span className="flex items-center gap-0.5 h-3">
                              <span className="w-0.5 bg-indigo-400 h-2 animate-bounce" style={{ animationDelay: "0.1s" }} />
                              <span className="w-0.5 bg-indigo-400 h-3 animate-bounce" style={{ animationDelay: "0.4s" }} />
                              <span className="w-0.5 bg-indigo-400 h-1." style={{ animationDelay: "0.2s" }} />
                              <span className="w-0.5 bg-indigo-400 h-2.5 animate-bounce" style={{ animationDelay: "0s" }} />
                            </span>
                            <span className="text-[9px] text-indigo-400 font-mono animate-pulse">PLAYING</span>
                          </span>
                        ) : line.loading ? (
                          <span className="text-[9px] text-amber-405 font-mono flex items-center gap-1">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            SYNTH...
                          </span>
                        ) : line.audioUrl ? (
                          <span className="text-[9px] text-emerald-400 font-mono flex items-center gap-1">
                            <Check className="h-2.5 w-2.5 text-emerald-500" />
                            READY
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-500 font-mono">NO AUDIO</span>
                        )}

                        <span className="text-[9px] text-slate-500 font-mono">
                          #{index + 1}
                        </span>
                      </div>

                      {/* Action overlay menu on timeline hover */}
                      <div className="absolute inset-0 bg-slate-905/95 rounded-lg opacity-0 group-hover/node:opacity-100 transition-opacity flex flex-col justify-between p-2 select-none z-10 font-sans">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                          <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">
                            Segment #{index + 1}
                          </span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveTimelineLine(index, "left");
                              }}
                              disabled={index === 0}
                              className="p-1 rounded bg-slate-800 text-slate-300 disabled:opacity-40 hover:text-white cursor-pointer"
                              title="Move Left (Reorder earlier)"
                            >
                              <ArrowLeft className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveTimelineLine(index, "right");
                              }}
                              disabled={index === script.lines.length - 1}
                              className="p-1 rounded bg-slate-800 text-slate-300 disabled:opacity-40 hover:text-white cursor-pointer"
                              title="Move Right (Reorder later)"
                            >
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        <div className="flex justify-around items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              playLineSolo(index);
                            }}
                            className="bg-indigo-600 p-1.5 rounded text-white flex items-center gap-0.5 text-[9px] font-bold cursor-pointer hover:bg-indigo-500 transition-colors"
                            title="Listen to this segment solo"
                          >
                            <Play className="h-2.5 w-2.5 fill-white shrink-0" />
                            SOLO
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              insertTimelineLine(index);
                            }}
                            className="bg-slate-850 p-1.5 rounded text-indigo-300 flex items-center gap-0.5 text-[9px] font-bold cursor-pointer hover:bg-slate-700 hover:text-white transition-colors"
                            title="Insert new segment after this"
                          >
                            <Plus className="h-2.5 w-2.5" />
                            INSERT
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Remove track segment #${index + 1}?`)) {
                                deleteTimelineLine(line.id);
                              }
                            }}
                            className="bg-slate-900 border border-slate-800 p-1.5 rounded text-rose-500 hover:bg-rose-950/40 hover:text-rose-400 cursor-pointer"
                            title="Delete this segment"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Timeline Dynamic segment inspector dashboard */}
        {script.lines.length > 0 && selectedTimelineIndex >= 0 && selectedTimelineIndex < script.lines.length && (
          <div className="bg-slate-900/50 rounded-lg p-3.5 border border-slate-800/80 space-y-3 mt-1.5 animate-fadeIn">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                <h4 className="text-[10px] font-sans font-bold text-slate-300 uppercase tracking-wider">
                  Timeline Inspector (Clip #{selectedTimelineIndex + 1})
                </h4>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => playLineSolo(selectedTimelineIndex)}
                  className="text-[10px] bg-indigo-600 hover:bg-indigo-505 text-white font-semibold py-1 px-2.5 rounded flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                >
                  <Play className="h-3 w-3 fill-white" />
                  Preview Clip Dialogue
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const original = script.lines[selectedTimelineIndex];
                    if (!onChange) return;
                    const duplicated: DialogueLine = {
                      ...original,
                      id: `line_${Date.now()}_duplicate`,
                      audioUrl: undefined, // Fresh copy needs fresh synthesis
                    };
                    const nextLines = [...script.lines];
                    nextLines.splice(selectedTimelineIndex + 1, 0, duplicated);
                    onChange({ ...script, lines: nextLines });
                    setSelectedTimelineIndex(selectedTimelineIndex + 1);
                  }}
                  className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-350 font-semibold py-1 px-2.5 rounded flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Copy className="h-3 w-3" />
                  Clone Clip
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Left Column: Actor & Emotion settings */}
              <div className="space-y-3">
                {/* Speaker Dropdown Selection */}
                <div>
                  <label className="text-[9px] font-mono uppercase text-slate-500 block mb-1">Speaker Actor:</label>
                  <select
                    value={script.lines[selectedTimelineIndex]?.characterId}
                    onChange={(e) => updateTimelineLine(script.lines[selectedTimelineIndex].id, { characterId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 outline-none cursor-pointer focus:border-indigo-500 transition-colors bg-slate-905"
                  >
                    {script.characters.map((char) => (
                      <option key={char.id} value={char.id}>
                        {char.name} ({char.voice})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Speech Emotion Badge selection row */}
                <div>
                  <label className="text-[9px] font-mono uppercase text-slate-500 block mb-1">Speaker Voice Emotion:</label>
                  <div className="flex flex-wrap gap-1">
                    {["Casual", "Happy", "Exciting", "Sad", "Angry", "Dramatic", "Sincere", "Whispering"].map((emo) => {
                      const isActive = script.lines[selectedTimelineIndex]?.emotion === emo;
                      return (
                        <button
                          key={emo}
                          type="button"
                          onClick={() => updateTimelineLine(script.lines[selectedTimelineIndex].id, { emotion: emo })}
                          className={`text-[9px] px-2 py-1 rounded transition-all cursor-pointer ${
                            isActive
                              ? "bg-indigo-600/35 text-indigo-300 border border-indigo-500 font-bold"
                              : "bg-slate-955 text-slate-400 hover:text-white border border-slate-850 hover:border-slate-850"
                          }`}
                        >
                          {emo}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Dialogue Text Script editor */}
              <div className="flex flex-col">
                <label className="text-[9px] font-mono uppercase text-slate-500 block mb-1">Dialogue Speech Script Text:</label>
                <textarea
                  value={script.lines[selectedTimelineIndex]?.text || ""}
                  onChange={(e) => updateTimelineLine(script.lines[selectedTimelineIndex].id, { text: e.target.value })}
                  rows={3}
                  placeholder="Type dialogue transcript..."
                  className="w-full flex-1 bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded p-2.5 text-xs text-slate-100 outline-none resize-none font-sans"
                />
                {!script.lines[selectedTimelineIndex]?.audioUrl && (
                  <p className="text-[8px] text-amber-500 font-mono mt-1 tracking-wider animate-pulse">
                    ⚠️ Text or cast modification triggers background Dynamic Synthesis upon play.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 mt-6 border-t border-slate-800/80 pt-4">
        {/* Playback Controls bar */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={startPlayback}
            disabled={totalLines === 0 || isExporting}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 px-4 rounded-lg cursor-pointer transition-all ${
              isPlaying
                ? "bg-amber-600 hover:bg-amber-500 text-white"
                : "bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-slate-800 disabled:text-slate-500"
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5" />
                Pause Video
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-white" />
                Play Dialogue
              </>
            )}
          </button>

          <button
            onClick={stopPlayback}
            disabled={(!isPlaying && currentLineIndex === -1) || isExporting}
            className="flex-1 bg-slate-800 hover:bg-slate-705 text-slate-300 text-xs font-medium py-2 px-4 rounded-lg cursor-pointer transition-colors flex items-center justify-center gap-1.5"
          >
            <Square className="h-3.5 w-3.5" />
            Stop Preview
          </button>
        </div>

        {/* Video compilation generation button */}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => startPlayback(true)}
              disabled={isPlaying || isExporting || isExportingAudio || totalLines === 0}
              className="text-xs font-sans font-semibold py-2.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-indigo-300 border border-indigo-500/35 hover:border-indigo-400 disabled:bg-slate-900 disabled:text-slate-600 disabled:border-slate-850 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              title="Plays the subtitle sequence with precise mock timed transitions but completely muted for fast visual formatting inspection"
            >
              <Eye className="h-4 w-4 text-indigo-400" />
              Preview Render (Muted)
            </button>

            <button
              onClick={exportAsVideoFile}
              disabled={isExporting || isExportingAudio || totalLines === 0}
              className="text-xs font-sans font-semibold py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-slate-800 disabled:text-slate-500 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-950/20"
            >
              <Film className="h-4 w-4" />
              Assemble & Export MP4 Video
            </button>
          </div>

          <button
            onClick={exportAsMp3AudioFile}
            disabled={isExporting || isExportingAudio || totalLines === 0}
            className="w-full text-xs font-sans font-semibold py-2.5 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/35 hover:bg-indigo-950/40 hover:text-white disabled:bg-slate-800 disabled:text-slate-500 disabled:border-slate-850 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            title="Saves a high-quality consolidated dialog master track directly in standard MP3 format"
          >
            <Music className="h-4 w-4 text-indigo-400 animate-pulse" />
            Export Combined Dialogue Audio Track (MP3)
          </button>

          {exportUrl && (
            <a
              href={exportUrl}
              download={`${script.title ? script.title.toLowerCase().replace(/\s+/g, "_") : "dialogue"}_render.${exportExtension}`}
              className="w-full text-xs text-center font-sans font-medium py-2 rounded-lg bg-slate-950 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-950/80 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              Download Generated {exportExtension.toUpperCase()} Video File
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
