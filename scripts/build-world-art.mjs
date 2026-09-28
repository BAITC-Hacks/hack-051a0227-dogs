// Build reproducible, grid-aligned game assets from original generated art.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const source = "assets/world/source";
const output = "public/world/art";
await mkdir(output, { recursive: true });
await mkdir("public/world/maps", { recursive: true });

async function cropSheet(file, names, columns, cell, size) {
  for (const [index, name] of names.entries()) {
    await sharp(join(source, file))
      .extract({
        left: (index % columns) * cell,
        top: Math.floor(index / columns) * cell,
        width: cell,
        height: cell,
      })
      .resize(size, size, { kernel: "nearest" })
      .webp({ lossless: true, effort: 6 })
      .toFile(join(output, `${name}.webp`));
  }
}
await sharp(join(source, "planet.png"))
  .resize(256, 256, { kernel: "nearest" })
  .webp({ lossless: true, effort: 6 })
  .toFile(join(output, "planet.webp"));
await cropSheet(
  "portraits.png",
  [
    "aruzhan-portrait",
    "timur-portrait",
    "dana-portrait",
    "amir-portrait",
    "saniya-portrait",
    "player-portrait",
  ],
  3,
  512,
  128,
);
await cropSheet(
  "props.png",
  [
    "tree",
    "lamp",
    "bench",
    "bike",
    "board",
    "crate",
    "display",
    "shrub",
    "coffee",
    "fountain",
    "bunting",
    "labcart",
  ],
  4,
  362,
  96,
);
await cropSheet("buildings.png", ["hall", "media", "workshop"], 3, 724, 256);

const rgba = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
  255,
];
function canvas(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  function rect(x, y, w, h, color) {
    const c = rgba(color);
    for (let py = Math.max(0, y); py < Math.min(height, y + h); py++)
      for (let px = Math.max(0, x); px < Math.min(width, x + w); px++)
        pixels.set(c, (py * width + px) * 4);
  }
  return { pixels, rect };
}

// One 32x32 pixel grid underlies terrain, actors, props and collision coordinates.
const tiles = canvas(32 * 6, 32);
const tileColors = [
  "#b8d995",
  "#e7dcbd",
  "#d5d0bb",
  "#75bed0",
  "#bb906b",
  "#d6c5a0",
];
for (let t = 0; t < 6; t++) {
  tiles.rect(t * 32, 0, 32, 32, tileColors[t]);
  for (let y = 0; y < 32; y += 8)
    for (let x = 0; x < 32; x += 8) {
      if ((x * 13 + y * 7 + t * 11) % 5 === 0)
        tiles.rect(
          t * 32 + x + 2,
          y + 3,
          4,
          2,
          ["#a5c983", "#d5c6a2", "#c3bda8", "#67aebd", "#a78360", "#c6b28d"][t],
        );
    }
  if (t === 0) {
    tiles.rect(t * 32 + 8, 9, 2, 4, "#81bb63");
    tiles.rect(t * 32 + 21, 23, 3, 2, "#93c66d");
  }
  if (t === 2) {
    tiles.rect(t * 32 + 0, 15, 32, 1, "#c4bea9");
    tiles.rect(t * 32 + 15, 0, 1, 32, "#c4bea9");
  }
  if (t === 3) {
    tiles.rect(t * 32 + 3, 12, 9, 2, "#9bd6df");
    tiles.rect(t * 32 + 18, 26, 8, 2, "#9bd6df");
  }
  if (t === 4) {
    for (let yy = 7; yy < 32; yy += 8) tiles.rect(t * 32, yy, 32, 1, "#9f7654");
  }
}
await sharp(tiles.pixels, { raw: { width: 192, height: 32, channels: 4 } })
  .png()
  .toFile(join(output, "terrain.png"));

const actors = [
  ["player", "#d5fc48", "#2f3132", "#c88355"],
  ["aruzhan", "#48b7ba", "#292629", "#bb7952"],
  ["timur", "#eee0c2", "#4a3228", "#b9794e"],
  ["dana", "#87ae4f", "#2d2524", "#ab6a45"],
  ["amir", "#416f95", "#282526", "#bc855b"],
  ["saniya", "#96765f", "#43332b", "#c38b63"],
];
for (const [name, jacket, hair, skin] of actors) {
  const image = canvas(96, 128);
  for (let direction = 0; direction < 4; direction++)
    for (let frame = 0; frame < 3; frame++) {
      const ox = frame * 32,
        oy = direction * 32,
        stride = frame === 1 ? 1 : frame === 2 ? -1 : 0;
      image.rect(ox + 9, oy + 6, 15, 13, "#28302a");
      image.rect(ox + 10, oy + 8, 13, 11, skin);
      image.rect(ox + 9, oy + 5, 15, direction === 3 ? 12 : 6, hair);
      if (direction !== 3) {
        if (direction === 0) {
          image.rect(ox + 13, oy + 13, 2, 2, "#292626");
          image.rect(ox + 19, oy + 13, 2, 2, "#292626");
        } else
          image.rect(
            ox + (direction === 1 ? 11 : 21),
            oy + 13,
            2,
            2,
            "#292626",
          );
      }
      image.rect(ox + 9, oy + 18, 15, 10, "#293238");
      image.rect(ox + 10, oy + 19, 13, 8, jacket);
      image.rect(ox + 7, oy + 20 + stride, 3, 6, skin);
      image.rect(ox + 23, oy + 20 - stride, 3, 6, skin);
      image.rect(ox + 11, oy + 28 + Math.max(0, stride), 5, 3, "#303037");
      image.rect(ox + 18, oy + 28 + Math.max(0, -stride), 5, 3, "#303037");
      if (name === "amir") {
        image.rect(ox + 11, oy + 13, 11, 2, "#202b34");
      }
      if (name === "dana") image.rect(ox + 23, oy + 8, 3, 14, hair);
      if (name === "aruzhan") image.rect(ox + 14, oy + 21, 5, 2, "#ddf1ed");
    }
  await sharp(image.pixels, { raw: { width: 96, height: 128, channels: 4 } })
    .png()
    .toFile(join(output, `${name}-walk.png`));
}

const width = 50,
  height = 34;
const map = Array.from({ length: height }, (_, y) =>
  Array.from({ length: width }, (_, x) => {
    if ((x >= 23 && x <= 27) || (y >= 16 && y <= 18)) return 1;
    if (x >= 17 && x <= 33 && y >= 9 && y <= 25) return 2;
    if (
      x >= 38 &&
      x <= 46 &&
      y >= 23 &&
      y <= 29 &&
      (x - 42) ** 2 / 20 + (y - 26) ** 2 / 10 < 1
    )
      return 3;
    return 0;
  }),
);
await writeFile(
  "public/world/maps/campus-square.json",
  JSON.stringify({ version: 1, tileSize: 32, width, height, tiles: map }),
);
const cafe = Array.from({ length: 12 }, (_, y) =>
  Array.from({ length: 18 }, (_, x) =>
    y === 0 || x === 0 || x === 17 ? 5 : 4,
  ),
);
await writeFile(
  "public/world/maps/cafe.json",
  JSON.stringify({
    version: 1,
    tileSize: 32,
    width: 18,
    height: 12,
    tiles: cafe,
  }),
);
console.log(
  "Built planet, 6 portraits, 12 props, 3 facades, 6 actor sheets, terrain and two maps.",
);
