import { PrebuiltVoice, DialogueScript } from "./types";

export const PREBUILT_VOICES: PrebuiltVoice[] = [
  // --- BASE MEN ---
  {
    id: "v4",
    name: "Fenrir",
    gender: "Male",
    category: "Men",
    subCategory: "Normal",
    description: "Warm, deep, and deeply resonant. Great for friendly fathers or supportive roles.",
    tags: ["Deep", "Warm", "Resonant"],
    baseVoice: "Fenrir",
    tonePrompt: "warm, natural, friendly conversational resonance",
  },
  {
    id: "v5",
    name: "Charon",
    gender: "Male",
    category: "Men",
    subCategory: "Normal",
    description: "Grave, wise, and authoritative. Superb for narration and dramatic dialogue.",
    tags: ["Deep", "Grave", "Authoritative"],
    baseVoice: "Charon",
    tonePrompt: "grave, serious, slow authoritative dramatic tone",
  },
  
  // --- ANGRY MEN ---
  {
    id: "v_ang_m1",
    name: "Oliver (Angry Warlord)",
    gender: "Male",
    category: "Men",
    subCategory: "Angry",
    description: "Furious, harsh, and gravelly. Excellent for military leaders or high-octane confrontations.",
    tags: ["Angry", "Gravelly", "Furious"],
    baseVoice: "Charon",
    tonePrompt: "furious, talking in an angry gravelly tone, aggressive and screaming with rage",
  },
  {
    id: "v_ang_m2",
    name: "Garrick (Hostile Grunt)",
    gender: "Male",
    category: "Men",
    subCategory: "Angry",
    description: "Stern, rough, and shouty. Great for hostile characters or sharp military shouting.",
    tags: ["Angry", "Stern", "Rough"],
    baseVoice: "Fenrir",
    tonePrompt: "hostile, aggressive, shouting, loud and angry stern male expression",
  },

  // --- HAPPY MEN ---
  {
    id: "v_hap_m1",
    name: "Arthur (Jolly Grandpa)",
    gender: "Male",
    category: "Men",
    subCategory: "Happy",
    description: "Laughing, warm, and highly cheerful. Perfect for jolly elders, friendly merchants, or laughing peers.",
    tags: ["Happy", "Jolly", "Warm"],
    baseVoice: "Fenrir",
    tonePrompt: "jolly, chuckling, extremely happy and warm male voice, smiling dialogue",
  },
  {
    id: "v_hap_m2",
    name: "Leo (Excited Agent)",
    gender: "Male",
    category: "Men",
    subCategory: "Happy",
    description: "Highly energetic, bright, and enthusiastic. Excellent for energetic announcers or hyped-up characters.",
    tags: ["Happy", "Energetic", "Bright"],
    baseVoice: "Fenrir",
    tonePrompt: "highly energetic, happy, bright grinning male voice, animated speech",
  },

  // --- SOFT MEN ---
  {
    id: "v_sof_m1",
    name: "Julian (Soft Whisperer)",
    gender: "Male",
    category: "Men",
    subCategory: "Soft",
    description: "Gentle, soft, and extremely quiet. Perfect for emotional confessions or nocturnal secrets.",
    tags: ["Soft", "Gentle", "Whispering"],
    baseVoice: "Fenrir",
    tonePrompt: "very gentle, hushed whisper, quiet soft low-volume male voice",
  },
  {
    id: "v_sof_m2",
    name: "Nico (Calm Narrator)",
    gender: "Male",
    category: "Men",
    subCategory: "Soft",
    description: "Soothed, steady, and peaceful. Perfect for meditation, audiobooks, or soothing guides.",
    tags: ["Soft", "Narrative", "Calm"],
    baseVoice: "Charon",
    tonePrompt: "calm, relaxed, very soft slow-paced soothing speech, mindful narrative tone",
  },

  // --- BASE WOMEN ---
  {
    id: "v1",
    name: "Zephyr",
    gender: "Female",
    category: "Women",
    subCategory: "Normal",
    description: "Soft, clear, and perfectly balanced. Ideal for friendly conversations and smooth narration.",
    tags: ["Conversational", "Warm", "Gentle"],
    baseVoice: "Zephyr",
    tonePrompt: "natural, soft, clear conversational female voice",
  },
  {
    id: "v2",
    name: "Kore",
    gender: "Female",
    category: "Women",
    subCategory: "Normal",
    description: "Crisp, articulate, and highly professional. Excellent for corporate and explanatory dialogue.",
    tags: ["Professional", "Crisp", "Articulate"],
    baseVoice: "Kore",
    tonePrompt: "crisp, articulate, professional corporate executive female voice",
  },
  {
    id: "v3",
    name: "Puck",
    gender: "Female",
    category: "Women",
    subCategory: "Normal",
    description: "High-spirited, energetic, and dynamic. Perfect for cheerful characters or active dialogue.",
    tags: ["Energetic", "Dynamic", "High-pitch"],
    baseVoice: "Puck",
    tonePrompt: "high-spirited, energetic, dynamic animated female voice",
  },

  // --- ANGRY WOMEN ---
  {
    id: "v_ang_w1",
    name: "Sylvia (Scathing Queen)",
    gender: "Female",
    category: "Women",
    subCategory: "Angry",
    description: "Scathing, sharp, and icy cold. Ideal for condescending leaders or dramatic confrontation.",
    tags: ["Angry", "Sharp", "Icy-cold"],
    baseVoice: "Kore",
    tonePrompt: "scathing, sharp, cold aggressive angry female voice, snarky and stern tone",
  },
  {
    id: "v_ang_w2",
    name: "Freya (Enraged Rebel)",
    gender: "Female",
    category: "Women",
    subCategory: "Angry",
    description: "Screaming, hot-tempered, and highly intense. Ideal for highly active combat or extreme anger.",
    tags: ["Angry", "Intense", "Screaming"],
    baseVoice: "Puck",
    tonePrompt: "screaming, furious, hot-tempered and highly enraged aggressive female voice",
  },

  // --- HAPPY WOMEN ---
  {
    id: "v_hap_w1",
    name: "Chloe (Cheerful Buddy)",
    gender: "Female",
    category: "Women",
    subCategory: "Happy",
    description: "Giggling, bubbly, and ecstatic. Superb for best-friend characters, comedians, or bright guides.",
    tags: ["Happy", "Giggling", "Bubbly"],
    baseVoice: "Puck",
    tonePrompt: "giggling, bright, ecstatic happy female voice, bubbly and laughing dialogue",
  },
  {
    id: "v_hap_w2",
    name: "Elena (Bright Guide)",
    gender: "Female",
    category: "Women",
    subCategory: "Happy",
    description: "Optimistic, warm, and highly encouraging. Great for supportive assistants, sweet guides, or kind peers.",
    tags: ["Happy", "Optimistic", "Warm"],
    baseVoice: "Zephyr",
    tonePrompt: "optimistic, smiling, warm happy female voice, bright and encouraging",
  },

  // --- SOFT WOMEN ---
  {
    id: "v_sof_w1",
    name: "Seraphina (Whispering Angel)",
    gender: "Female",
    category: "Women",
    subCategory: "Soft",
    description: "Caring, gentle, and whispering. Ideal for intimate moments, close secrets, or soothing instructions.",
    tags: ["Soft", "Whisper", "Gentle"],
    baseVoice: "Zephyr",
    tonePrompt: "very soft, comforting whisper, quiet gentle delicate female voice",
  },
  {
    id: "v_sof_w2",
    name: "Celeste (Gentle Healer)",
    gender: "Female",
    category: "Women",
    subCategory: "Soft",
    description: "Soothing, smooth, and friendly. Great for calming or high-trust roles.",
    tags: ["Soft", "Soothing", "Peaceful"],
    baseVoice: "Kore",
    tonePrompt: "soothing, soft, peaceful friendly slow female speech",
  },

  // --- KIDS VOICEOVERS ---
  {
    id: "v_kid_1",
    name: "Toby (Playful Little Boy)",
    gender: "Kids",
    category: "Kids",
    subCategory: "Happy",
    description: "Cutesy, playful 7-year-old schoolboy. Perfect for kids, sidekicks, or innocent adventures.",
    tags: ["Kids", "Playful", "Boy"],
    baseVoice: "Puck",
    tonePrompt: "cute playful young 7-year-old boy's voice, high-pitched, childish speech style",
    playbackRate: 1.15,
  },
  {
    id: "v_kid_2",
    name: "Lily (Sweet Little Girl)",
    gender: "Kids",
    category: "Kids",
    subCategory: "Happy",
    description: "Very sweet, pure child's voice. Ideal for sweet daughters, magical fairy assistants, or little kids.",
    tags: ["Kids", "Sweet", "Girl"],
    baseVoice: "Zephyr",
    tonePrompt: "cute sweet young 5-year-old little girl's voice, very high-pitched, cute innocent talk",
    playbackRate: 1.18,
  },
  {
    id: "v_kid_3",
    name: "Leo (Anxious Toddler)",
    gender: "Kids",
    category: "Kids",
    subCategory: "Soft",
    description: "A little whimpering, anxious boy's voice. Ideal for scared children, worried kids, or sidekicks.",
    tags: ["Kids", "Anxious", "Boy"],
    baseVoice: "Puck",
    tonePrompt: "anxious young child's voice, whiny and cute, high-pitched, worried little kid stuttering",
    playbackRate: 1.14,
  },
  {
    id: "v_kid_4",
    name: "Mia (Quiet Gentle Child)",
    gender: "Kids",
    category: "Kids",
    subCategory: "Soft",
    description: "Shy, delicate little girl's voice. Great for quiet children, bedtime scenes, or emotional roles.",
    tags: ["Kids", "Quiet", "Shy"],
    baseVoice: "Kore",
    tonePrompt: "shy quiet young child, very soft gentle slow talk, high-pitched innocent kid voice",
    playbackRate: 1.13,
  },
  
  // --- NIGERIAN ACCENTED VOICES ---
  {
    id: "v_ng_m1",
    name: "Chidi (Lagos Gentleman)",
    gender: "Male",
    category: "Men",
    subCategory: "Normal",
    description: "Rich, deep, and confident English voice speaking with an authentic Nigerian (Lagos) accent.",
    tags: ["Nigerian", "Deep", "Confident"],
    baseVoice: "Fenrir",
    tonePrompt: "warm, clear, friendly adult male speaking with a rich, authentic Nigerian accent (Lagos style), precise West African cadence"
  },
  {
    id: "v_ng_m2",
    name: "Yomi (Lively Lagos Guy)",
    gender: "Male",
    category: "Men",
    subCategory: "Happy",
    description: "Highly energetic, welcoming English voice with a vibrant, cheerful Nigerian accent.",
    tags: ["Nigerian", "Happy", "Energetic"],
    baseVoice: "Fenrir",
    tonePrompt: "lively, highly energetic, animated young adult male speaking with an energetic, authentic Nigerian accent, smiling friendly tone"
  },
  {
    id: "v_ng_w1",
    name: "Amina (Abuja Professional)",
    gender: "Female",
    category: "Women",
    subCategory: "Normal",
    description: "Sophisticated, warm, and highly articulate English voice with a clear, professional Nigerian accent.",
    tags: ["Nigerian", "Professional", "Warm"],
    baseVoice: "Kore",
    tonePrompt: "clear, warm, articulate professional adult female speaking with a clear, elegant Nigerian accent, thoughtful and friendly delivery"
  },
  {
    id: "v_ng_w2",
    name: "Zainab (Cheerful Lagos Sister)",
    gender: "Female",
    category: "Women",
    subCategory: "Happy",
    description: "Sweet, bubbly, and expressive English voice speaking with a lively modern Nigerian accent.",
    tags: ["Nigerian", "Happy", "Bubbly"],
    baseVoice: "Zephyr",
    tonePrompt: "bubbly, cheerful, highly expressive young adult female speaking with a sweet, lively Nigerian accent, smiling expression with expressive West African pacing"
  }
];

export const EMOTIONS = [
  "Neutral",
  "Excited",
  "Sad",
  "Angry",
  "Fearful",
  "Whispering",
  "Warm",
  "Sarcastic",
  "Anxious",
  "Confident"
];

export const STARTER_SCRIPTS: DialogueScript[] = [
  {
    title: "The Ultimate Pizza Debate",
    characters: [
      {
        id: "char_a",
        name: "Clara",
        voice: "Puck",
        avatarSeed: "culinary energy",
        description: "An energetic culinary enthusiast.",
        avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=250&h=250&fit=crop"
      },
      {
        id: "char_b",
        name: "Marcus",
        voice: "Charon",
        avatarSeed: "bearded pizza scholar",
        description: "A very serious pizza purist.",
        avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=250&h=250&fit=crop"
      }
    ],
    lines: [
      {
        id: "line_1",
        characterId: "char_a",
        text: "I am telling you, sweet pineapple with salty ham is an objective masterpiece of flavor profiles!",
        emotion: "Excited"
      },
      {
        id: "line_2",
        characterId: "char_b",
        text: "Pineapple? On a sacred Neapolitan canvas? Clara, that is not food, that is a culinary catastrophe.",
        emotion: "Angry"
      },
      {
        id: "line_3",
        characterId: "char_a",
        text: "You are just living in the past, Marcus. Open your mind! Taste the sweet and savory harmony!",
        emotion: "Warm"
      },
      {
        id: "line_4",
        characterId: "char_b",
        text: "Some things are sacred. I will whisper a prayer for your poor tastebuds.",
        emotion: "Whispering"
      }
    ]
  },
  {
    title: "Quantum Coffee Crisis",
    characters: [
      {
        id: "char_1",
        name: "Dr. Alicia",
        voice: "Kore",
        avatarSeed: "brilliant physicist",
        description: "A highly intelligent, no-nonsense physicist.",
        avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=250&h=250&fit=crop"
      },
      {
        id: "char_2",
        name: "Bob",
        voice: "Fenrir",
        avatarSeed: "clumsy young lab technician",
        description: "A loyal assistant prone to silly errors.",
        avatarUrl: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=250&h=250&fit=crop"
      }
    ],
    lines: [
      {
        id: "line_1",
        characterId: "char_1",
        text: "Bob, please check the particle analyzer immediately. Why is the readings oscillating at exactly 60 Hertz?",
        emotion: "Confident"
      },
      {
        id: "line_2",
        characterId: "char_2",
        text: "Ummm, Dr. Alicia... I think I plugged the espresso machine into the main superconducting core socket.",
        emotion: "Anxious"
      },
      {
        id: "line_3",
        characterId: "char_1",
        text: "You did WHAT?! Bob! That reactor has enough electricity to roast a city, let alone your breakfast beans!",
        emotion: "Angry"
      },
      {
        id: "line_4",
        characterId: "char_2",
        text: "But on the bright side, the coffee brewed in exactly general relativity time. Plus, it glows a beautiful neon blue!",
        emotion: "Excited"
      }
    ]
  },
  {
    title: "The Great Jollof Showdown",
    characters: [
      {
        id: "char_ng_1",
        name: "Chidi",
        voice: "Chidi (Lagos Gentleman)",
        avatarSeed: "stylish nigerian man in agbada",
        description: "An absolute champion of Nigerian food culture and pride.",
        avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=250&h=250&fit=crop"
      },
      {
        id: "char_ng_2",
        name: "Amina",
        voice: "Amina (Abuja Professional)",
        avatarSeed: "elegant nigerian woman speaking confidently",
        description: "A professional food designer who insists on gourmet perfection.",
        avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=250&h=250&fit=crop"
      }
    ],
    lines: [
      {
        id: "line_ng_1",
        characterId: "char_ng_1",
        text: "Amina, I have told you times without number! Authentic Jollof rice must have that smokey party flavor, otherwise it is just cooked rice and stew!",
        emotion: "Confident"
      },
      {
        id: "line_ng_2",
        characterId: "char_ng_2",
        text: "Chidi, your party recipe has too much maggi and heat. Our modern Abuja style prioritizes rich basmati grains and organic spices. It is far more sophisticated!",
        emotion: "Sarcastic"
      },
      {
        id: "line_ng_3",
        characterId: "char_ng_1",
        text: "Abuja style? Basmati? No, that is a culinary error! Jollof is supposed to be premium long-grain parboiled rice. The bottom burnt part of the pot is where the real gold is!",
        emotion: "Excited"
      },
      {
        id: "line_ng_4",
        characterId: "char_ng_2",
        text: "Anyway, let us cook. I will make my basmati version, and we will let the neighborhood elders judge who has the ultimate crown.",
        emotion: "Warm"
      }
    ]
  }
];
