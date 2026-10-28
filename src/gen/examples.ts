import type { AspectRatio } from "@/editor/types";

/**
 * Ready-made ideas for AI Studio: shown before the user writes anything. Each one fills the prompt,
 * style and format in one click, and its picture (public/gen-examples) can be animated right away
 * in the Video tab without generating anything.
 */
export interface GenExample {
  id: string;
  /** Short Uzbek title on the card. */
  title: string;
  category: ExampleCategory;
  /** English prompt (image models follow English best). */
  prompt: string;
  /** Style preset id of the image studio. */
  style: string;
  aspect: AspectRatio;
  /** What should move in the video (for the AI video models). */
  motion: string;
  /** Free camera move that suits the picture. */
  camera: string;
}

export type ExampleCategory = "nature" | "city" | "people" | "food" | "product" | "fantasy";

export const EXAMPLE_CATEGORIES: [ExampleCategory | "all", string][] = [
  ["all", "Hammasi"],
  ["nature", "Tabiat"],
  ["city", "Shahar"],
  ["people", "Odamlar"],
  ["food", "Taom"],
  ["product", "Mahsulot"],
  ["fantasy", "Fantaziya"],
];

export const GEN_EXAMPLES: GenExample[] = [
  {
    id: "registan",
    title: "Registon kechqurun",
    category: "city",
    prompt: "ancient Samarkand Registan madrasas glowing at blue hour, turquoise domes, warm lights",
    style: "cinema",
    aspect: "16:9",
    motion: "slow aerial flight towards the domes, lights flicker on",
    camera: "drone",
  },
  {
    id: "fox",
    title: "Qordagi tulki",
    category: "nature",
    prompt: "a red fox walking through a snowy forest at dawn",
    style: "photo",
    aspect: "9:16",
    motion: "the fox turns its head, snowflakes drift slowly",
    camera: "push-in",
  },
  {
    id: "plov",
    title: "Qozondagi palov",
    category: "food",
    prompt: "traditional Uzbek plov in a large kazan, steam rising, carrots and raisins, warm light, top view",
    style: "photo",
    aspect: "4:5",
    motion: "steam rises from the plov, a spoon lifts some rice",
    camera: "drift",
  },
  {
    id: "atlas",
    title: "Atlas ko'ylakdagi qiz",
    category: "people",
    prompt: "young woman in a traditional Uzbek atlas silk dress smiling in a sunlit courtyard",
    style: "portrait",
    aspect: "9:16",
    motion: "she smiles and turns towards the camera, the dress moves in the breeze",
    camera: "push-in",
  },
  {
    id: "tashkent",
    title: "Kelajak Toshkenti",
    category: "city",
    prompt: "futuristic Tashkent skyline at sunset with flying cars",
    style: "neon",
    aspect: "9:16",
    motion: "flying cars glide between the towers",
    camera: "pan-right",
  },
  {
    id: "coffee",
    title: "Ertalabki qahva",
    category: "food",
    prompt: "a cup of coffee on a wooden table, steam rising, morning light",
    style: "product",
    aspect: "1:1",
    motion: "steam swirls above the cup",
    camera: "push-in",
  },
  {
    id: "sneaker",
    title: "Krossovka reklamasi",
    category: "product",
    prompt: "white sneaker floating above a water splash, studio background",
    style: "product",
    aspect: "1:1",
    motion: "the sneaker spins slowly while water droplets fly",
    camera: "orbit-left",
  },
  {
    id: "perfume",
    title: "Atir flakoni",
    category: "product",
    prompt: "elegant perfume bottle on black marble with golden reflections and flower petals",
    style: "product",
    aspect: "4:5",
    motion: "petals fall slowly around the bottle",
    camera: "orbit-right",
  },
  {
    id: "cabin",
    title: "Tog'dagi kulba",
    category: "nature",
    prompt: "a cozy cabin in the mountains, northern lights above",
    style: "cinema",
    aspect: "9:16",
    motion: "the northern lights ripple across the sky",
    camera: "tilt-up",
  },
  {
    id: "astronaut",
    title: "Oydagi otliq",
    category: "fantasy",
    prompt: "an astronaut riding a horse on the moon, earth in the sky",
    style: "3d",
    aspect: "16:9",
    motion: "the horse gallops, moon dust rises",
    camera: "pan-left",
  },
  {
    id: "dragon",
    title: "Tog' ustida ajdar",
    category: "fantasy",
    prompt: "a giant dragon flying over snowy mountain peaks",
    style: "fantasy",
    aspect: "16:9",
    motion: "the dragon flaps its wings and soars past the peaks",
    camera: "drone",
  },
  {
    id: "rooftop",
    title: "Anime: tomda tun",
    category: "people",
    prompt: "anime girl on a rooftop at night with a city view, wind in her hair",
    style: "anime",
    aspect: "9:16",
    motion: "her hair and jacket move in the wind, city lights twinkle",
    camera: "drift",
  },
];

export const exampleImage = (e: GenExample) => `/gen-examples/${e.id}.webp`;

/** Words the user can tap to enrich a prompt (shown under the prompt box). */
export const PROMPT_BOOSTERS: { group: string; items: [string, string][] }[] = [
  {
    group: "Yorug'lik",
    items: [
      ["golden hour light", "Oltin soat"],
      ["blue hour", "Ko'k soat"],
      ["soft studio light", "Studiya"],
      ["neon glow", "Neon"],
      ["dramatic backlight", "Kontrovoy"],
    ],
  },
  {
    group: "Kamera",
    items: [
      ["close-up shot", "Yaqin plan"],
      ["wide angle shot", "Keng plan"],
      ["aerial drone view", "Dron"],
      ["low angle", "Pastdan"],
      ["shallow depth of field", "Bokeh"],
    ],
  },
  {
    group: "Kayfiyat",
    items: [
      ["cozy and warm", "Iliq"],
      ["epic and grand", "Epik"],
      ["mysterious, foggy", "Sirli"],
      ["joyful, vibrant colors", "Quvnoq"],
      ["minimalist", "Minimal"],
    ],
  },
];
