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

async function cropGeneratedGrid(file, names, columns, rows, size) {
  const image = sharp(join(source, file));
  const meta = await image.metadata();
  for (const [index, name] of names.entries()) {
    const col = index % columns, row = Math.floor(index / columns);
    const left = Math.floor(col * meta.width / columns);
    const top = Math.floor(row * meta.height / rows);
    const right = Math.floor((col + 1) * meta.width / columns);
    const bottom = Math.floor((row + 1) * meta.height / rows);
    await sharp(join(source, file))
      .extract({left, top, width:right-left, height:bottom-top})
      .resize(size, size, {kernel:"nearest"})
      .webp({lossless:true, effort:6})
      .toFile(join(output, `${name}.webp`));
  }
}
await cropGeneratedGrid("district-atlas.png", [
  "maker-facade", "product-facade", "people-facade", "urban-facade",
  "media-facade", "maker-bench", "journey-board", "research-board",
  "city-model", "podcast-desk", "kinetic", "map-kiosk",
], 4, 3, 256);
await cropGeneratedGrid("interior-atlas.png", [
  "desk", "green-wall", "bike-rack", "event-stage",
  "maker-station", "test-screen", "interview-table", "planning-board",
  "editing-desk", "camera", "notebooks", "origami",
], 4, 3, 128);
await cropGeneratedGrid("cast-atlas.png", Array.from({length:16}, (_,i)=>`cast-${i}-portrait`), 4, 4, 128);
await cropGeneratedGrid("role-props.png", [
  "mission-engineer", "mission-product", "mission-research",
  "mission-policy", "mission-media", "mission-festival",
], 3, 2, 192);

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
  ["aida", "#6c9d6b", "#322628", "#c98e66"],
  ["nursultan", "#34363c", "#27282b", "#bb8057"],
  ["ayan", "#e4e3db", "#282b30", "#c89168"],
  ["malika", "#eee7cf", "#332a2b", "#bd7e5c"],
  ["leila", "#438e95", "#322728", "#bf825c"],
  ["oliver", "#76acbc", "#b99a6d", "#d8a077"],
  ["zhanerke", "#64857a", "#513626", "#c88d63"],
  ["daniyar", "#6c4d42", "#302622", "#b98259"],
  ["inaya", "#293238", "#24252b", "#d1916d"],
  ["mark", "#425f59", "#2d2827", "#b9855c"],
  ["azamat", "#5b8a8b", "#27282a", "#bb805c"],
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
for (const id of ["maker", "garage", "people", "urban", "house"]) {
  const width = 30, height = 22;
  const district = Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>{
    if ((x >= 1 && x <= 16 && y >= 10 && y <= 12) || (x >= 14 && x <= 16 && y >= 8 && y <= 20)) return 1;
    if (id === "maker" && x >= 19 && x <= 24 && y >= 11 && y <= 16) return 5;
    if (id === "garage" && x >= 17 && x <= 26 && y >= 10 && y <= 17) return 4;
    if (id === "people" && x >= 5 && x <= 12 && y >= 13 && y <= 18) return 5;
    if (id === "urban" && x >= 5 && x <= 25 && y >= 7 && y <= 19) return 2;
    if (id === "house" && x >= 19 && x <= 26 && y >= 12 && y <= 18) return 4;
    if (id === "house" && x >= 5 && x <= 10 && y >= 7 && y <= 10) return 5;
    if (x >= 6 && x <= 24 && y >= 8 && y <= 18) return id === "people" ? 5 : 2;
    return 0;
  }));
  await writeFile(`public/world/maps/${id}.json`,JSON.stringify({version:2,tileSize:32,width,height,tiles:district}));
  const interior = Array.from({length:12},(_,y)=>Array.from({length:18},(_,x)=> {
    if(y===0 || x===0 || x===17) return 5;
    if(id==="people" || id==="urban") return 5;
    if(id==="garage" && x>=4 && x<=14 && y>=3 && y<=8) return 2;
    if(id==="house" && x>=3 && x<=14 && y>=3 && y<=8) return 2;
    return 4;
  }));
  await writeFile(`public/world/maps/${id}-room.json`,JSON.stringify({version:2,tileSize:32,width:18,height:12,tiles:interior}));
}
console.log(
  "Built 12 original scenes with 5 generated facades, 24 new props, 16 portraits and 16 actor sheets.",
);
