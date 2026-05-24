export function getAvatarColor(seed: string): { bg: string; text: string; primary: string; secondary: string } {
  let hash = 0;
  const normalizedSeed = seed || "default";
  for (let i = 0; i < normalizedSeed.length; i++) {
    hash = normalizedSeed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [340, 210, 280, 25, 145, 45, 185, 95];
  const hue = hues[Math.abs(hash) % hues.length];
  return {
    bg: `hsl(${hue}, 70%, 15%)`,
    primary: `hsl(${hue}, 85%, 60%)`,
    secondary: `hsl(${hue}, 75%, 45%)`,
    text: `hsl(${hue}, 90%, 95%)`,
  };
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  if (words.length === 0) return [];
  
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}
