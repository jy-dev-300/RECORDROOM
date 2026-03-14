import type { StackProject } from "../components/ProjectCardStack";

export type AlbumStack = {
  id: string;
  projects: StackProject[];
};

function hslToHex(h: number, s: number, l: number) {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = h / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = x;
  } else if (huePrime < 2) {
    red = x;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = x;
  } else if (huePrime < 4) {
    green = x;
    blue = chroma;
  } else if (huePrime < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const match = lightness - chroma / 2;
  const toHex = (channel: number) =>
    Math.round((channel + match) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function getCardColor(stackIndex: number, cardIndex: number) {
  const topHue = (stackIndex * 137) % 360;
  const hue = (topHue + 72 + cardIndex * 83) % 360;
  const saturation = [88, 82, 90, 78, 86][cardIndex] ?? 84;
  const lightness = [52, 64, 42, 70, 34][cardIndex] ?? 56;
  return hslToHex(hue, saturation, lightness);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export const albumStacks: AlbumStack[] = Array.from({ length: 128 }, (_, stackIndex) => ({
  id: `stack-${stackIndex + 1}`,
  projects: Array.from({ length: 5 }, (_, cardIndex) => {
    const topHue = (stackIndex * 137) % 360;
    return {
      id: `stack-${stackIndex + 1}-card-${cardIndex + 1}`,
      title: `Stack ${stackIndex + 1} Card ${cardIndex + 1}`,
      media: "",
      type: "image" as const,
      color:
        cardIndex === 0
          ? hslToHex(topHue, 92, 52)
          : getCardColor(stackIndex, cardIndex),
    };
  }),
}));
