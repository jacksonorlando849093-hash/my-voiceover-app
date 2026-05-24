import { useState, useRef } from "react";
import { PREBUILT_VOICES, EMOTIONS } from "../data";
import { PrebuiltVoice } from "../types";
import { getCachedAudio, setCachedAudio } from "../utils/audioCache";
import { Volume2, Play, Square, Loader2, Sparkles } from "lucide-react";

export default function VoiceLibrary() {
  const [activeCategory, setActiveCategory] = useState<"all" | "Men" | "Women" | "Kids">("all");
  const [activeSubcategory, setActiveSubcategory] = useState<"all" | "Angry" | "Happy" | "Soft" | "Normal">("all");
  const [selectedVoice, setSelectedVoice] = useState<PrebuiltVoice>(PREBUILT_VOICES[0]);
  const [previewText, setPreviewText] = useState("Hello! I am ready to bring your interactive video dialog scripts to life with realistic voice synthesis.");
  const [selectedEmotion, setSelectedEmotion] = useState("Warm");
  const [isLoading, setIsLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredVoices = PREBUILT_VOICES.filter((voice) => {
    const matchCat = activeCategory === "all" || voice.category === activeCategory;
    const matchSub = activeSubcategory === "all" || voice.subCategory === activeSubcategory;
    return matchCat && matchSub;
  });

  const handlePreview = async () => {
    if (playing) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlaying(false);
      return;
    }

    setIsLoading(true);
    try {
      // 1. Check local persistent cache
      const cachedUrl = await getCachedAudio(previewText, selectedVoice.name, selectedEmotion);
      if (cachedUrl) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        const audio = new Audio(cachedUrl);
        audioRef.current = audio;
        
        audio.onended = () => {
          setPlaying(false);
        };
        
        audio.onplay = () => {
          setPlaying(true);
        };

        setIsLoading(false);
        await audio.play();
        return;
      }

      // 2. Fall back to TTS API only on cache-miss
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: previewText,
          voice: selectedVoice.name,
          emotion: selectedEmotion,
        }),
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      if (data.audioContent) {
        const audioUrl = `data:audio/wav;base64,${data.audioContent}`;
        
        // 3. Save to local persistent cache
        await setCachedAudio(previewText, selectedVoice.name, selectedEmotion, audioUrl);

        if (audioRef.current) {
          audioRef.current.pause();
        }
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        
        audio.onended = () => {
          setPlaying(false);
        };
        
        audio.onplay = () => {
          setPlaying(true);
        };

        await audio.play();
      }
    } catch (err) {
      console.error("Preview error:", err);
      alert("Failed to synthesize voice preview properly. Please check your network or API keys.");
    } finally {
      setIsLoading(false);
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlaying(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl" id="voice-library">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-sans font-semibold text-white flex items-center gap-2">
            <Volume2 className="h-5 w-5 text-indigo-400" />
            Vocal Library
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Explore realistic voices powered by Gemini text-to-speech
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Left selector col */}
        <div className="md:col-span-2 space-y-3 max-h-[480px] overflow-y-auto pr-1">
          {PREBUILT_VOICES.map((voice) => {
            const isSelected = selectedVoice.name === voice.name;
            return (
              <button
                key={voice.id}
                onClick={() => {
                  stopAudio();
                  setSelectedVoice(voice);
                }}
                className={`w-full text-left p-4 rounded-lg border transition-all ${
                  isSelected
                    ? "bg-slate-800/80 border-indigo-500/50 shadow-md shadow-indigo-950/20"
                    : "bg-slate-950/40 border-slate-800 hover:bg-slate-800/20 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-sans font-medium text-white text-base">
                    {voice.name}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono">
                    {voice.gender}
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-2 line-clamp-2">
                  {voice.description}
                </p>
                <div className="flex flex-wrap gap-1 mt-3">
                  {voice.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800/80"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* Right preview workbench panel */}
        <div className="md:col-span-3 bg-slate-950/50 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <span className="text-slate-400 text-sm">Previewing Vocal Range:</span>
              <span className="text-white font-semibold flex items-center gap-1.5 text-sm">
                <Sparkles className="h-4 w-4 text-amber-400" />
                {selectedVoice.name}
              </span>
            </div>

            <div className="space-y-4">
              {/* Emotion Selector */}
              <div>
                <label className="block text-slate-400 text-xs font-medium mb-1.5">
                  Adaptive Emotional Delivery Tone
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {EMOTIONS.slice(0, 6).map((emo) => {
                    const isSelected = selectedEmotion === emo;
                    return (
                      <button
                        key={emo}
                        type="button"
                        onClick={() => setSelectedEmotion(emo)}
                        className={`text-slate-300 rounded text-xs py-1.5 transition-all ${
                          isSelected
                            ? "bg-indigo-600/30 text-indigo-200 border border-indigo-500/40 font-medium"
                            : "bg-slate-900 text-slate-400 hover:text-white border border-transparent"
                        }`}
                      >
                        {emo}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sample Input box */}
              <div>
                <label className="block text-slate-400 text-xs font-medium mb-1.5">
                  Try Custom Sample Dialogue Text
                </label>
                <textarea
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  placeholder="Enter a descriptive sentence to synthesize..."
                  rows={4}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-sans resize-none"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              onClick={handlePreview}
              disabled={isLoading || !previewText.trim()}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-sans font-medium rounded-lg py-2.5 px-4 flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Synthesizing Speech...
                </>
              ) : playing ? (
                <>
                  <Square className="h-4 w-4" />
                  Pause Audio
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" />
                  Hear Voice Demo
                </>
              )}
            </button>
            {playing && (
              <button
                onClick={stopAudio}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg px-3.5 flex items-center justify-center cursor-pointer transition-colors"
                title="Stop audio playback"
              >
                Stop
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Copyright-free reassurance guarantee banner */}
      <div className="mt-6 p-4 bg-emerald-950/20 border border-emerald-500/25 rounded-xl flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="px-2 py-0.5 bg-emerald-500/15 text-emerald-400 font-mono text-[10px] rounded border border-emerald-500/30 uppercase font-bold tracking-wider shrink-0">
            PROD SAFE
          </div>
          <div className="px-2 py-0.5 bg-indigo-500/15 text-indigo-400 font-mono text-[10px] rounded border border-indigo-500/30 uppercase font-bold tracking-wider shrink-0">
            ROYALTY FREE
          </div>
        </div>
        <div className="flex-1">
          <h4 className="text-white text-xs font-semibold font-sans">Public Domain Voiceover Synthesis</h4>
          <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
            All voices utilize prebuilt public-domain configurations safe from standard trademark infringements. Dialogue recordings and video export file assets are fully licensed for commercial monetization, public broadcasting, and online reels without royalties.
          </p>
        </div>
      </div>
    </div>
  );
}
