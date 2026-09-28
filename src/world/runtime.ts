import * as Phaser from "phaser";
import type { WorldScene, WorldState } from "@/lib/world/model";

export type Interaction = {
  id: string;
  name: string;
  x: number;
  y: number;
  scene: WorldScene;
};
export type WorldRuntime = {
  destroy: () => void;
  position: () => { scene: WorldScene; x: number; y: number };
  setState: (state: WorldState) => void;
  setPaused: (paused: boolean) => void;
  setTouch: (x: number, y: number, action: boolean) => void;
  travel: (scene: WorldScene) => void;
};
type Hooks = {
  progress: (value: number) => void;
  ready: () => void;
  interact: (point: Interaction) => void;
  nearby: (point: Interaction | null) => void;
  escape: () => void;
  scene: (scene: WorldScene) => void;
  error: (message: string) => void;
};
const npcNames = ["aruzhan", "timur", "dana", "amir", "saniya"] as const;
const props = [
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
] as const;
const buildings = ["hall", "media", "workshop"] as const;
const url = (name: string) => `/world/art/${name}`;

export function mountWorld(
  parent: HTMLElement,
  initial: WorldState,
  hooks: Hooks,
): WorldRuntime {
  let state = initial;
  let active: GameScene | null = null;
  let paused = false;
  let touch = { x: 0, y: 0, action: false };
  class LoadingScene extends Phaser.Scene {
    constructor() {
      super("loading");
    }
    preload() {
      this.load.on("progress", (progress: number) =>
        hooks.progress(25 + Math.round(progress * 75)),
      );
      this.load.on("loaderror", () => hooks.error("Не удалось загрузить мир"));
      this.load.image("terrain", url("terrain.png"));
      for (const actor of ["player", ...npcNames])
        this.load.spritesheet(actor, url(`${actor}-walk.png`), {
          frameWidth: 32,
          frameHeight: 32,
        });
      for (const actor of ["player", ...npcNames])
        this.load.image(`${actor}-portrait`, url(`${actor}-portrait.webp`));
      for (const prop of props) this.load.image(prop, url(`${prop}.webp`));
      for (const building of buildings)
        this.load.image(building, url(`${building}.webp`));
      this.load.json("square-map", "/world/maps/campus-square.json");
      this.load.json("cafe-map", "/world/maps/cafe.json");
    }
    create() {
      hooks.progress(100);
      this.scene.start(state.scene);
    }
  }
  class GameScene extends Phaser.Scene {
    zone!: WorldScene;
    player!: Phaser.Physics.Arcade.Sprite;
    cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    keys!: Record<string, Phaser.Input.Keyboard.Key>;
    objects: Interaction[] = [];
    current: Interaction | null = null;
    destination: { x: number; y: number; point: Interaction | null } | null =
      null;
    destinationAt = 0;
    lastAction = 0;
    constructor(zone: WorldScene) {
      super(zone);
      this.zone = zone;
    }
    create() {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      active = this;
      const data = this.cache.json.get(
        this.zone === "square" ? "square-map" : "cafe-map",
      ) as { tiles: number[][]; width: number; height: number };
      const map = this.make.tilemap({
        data: data.tiles,
        tileWidth: 32,
        tileHeight: 32,
      });
      const set = map.addTilesetImage("terrain", "terrain", 32, 32, 0, 0);
      if (set) map.createLayer(0, set, 0, 0);
      this.physics.world.setBounds(
        16,
        16,
        data.width * 32 - 32,
        data.height * 32 - 32,
      );
      const walls = this.physics.add.staticGroup();
      const wall = (x: number, y: number, w: number, h: number) => {
        const zone = this.add.zone(x, y, w, h);
        this.physics.add.existing(zone, true);
        walls.add(zone);
      };
      const art = (
        key: string,
        x: number,
        y: number,
        size: number,
        depth = 2,
      ) =>
        this.add
          .image(x, y, key)
          .setDisplaySize(size, size)
          .setDepth(depth)
          .setOrigin(0.5, 1);
      const point = (id: string, name: string, x: number, y: number) =>
        this.objects.push({ id, name, x, y, scene: this.zone });
      const npcBodies: Phaser.Physics.Arcade.Sprite[] = [];
      if (this.zone === "square") {
        // Shared 32 px coordinates keep visual props, collisions and server validation aligned.
        art("hall", 26 * 32, 8 * 32, 256);
        wall(26 * 32, 5 * 32, 8 * 32 - 28, 5 * 32);
        art("media", 40 * 32, 11 * 32, 256);
        wall(40 * 32, 8 * 32, 8 * 32 - 28, 6 * 32);
        art("workshop", 8 * 32, 12 * 32, 256);
        wall(8 * 32, 9 * 32, 8 * 32 - 28, 6 * 32);
        for (const [x, y] of [
          [2, 3],
          [5, 20],
          [8, 27],
          [15, 4],
          [16, 27],
          [35, 4],
          [35, 28],
          [47, 6],
          [45, 18],
          [5, 30],
        ]) {
          art("tree", x * 32, y * 32, 88);
          wall(x * 32, y * 32 - 18, 42, 42);
        }
        for (const [x, y] of [
          [15, 11],
          [37, 14],
          [16, 25],
          [36, 25],
        ])
          art("lamp", x * 32, y * 32, 74);
        for (const [x, y] of [
          [19, 22],
          [31, 10],
          [18, 27],
        ])
          art("bench", x * 32, y * 32, 74);
        art("fountain", 25 * 32, 18 * 32, 96);
        wall(25 * 32, 17 * 32, 50, 42);
        art("bike", 36 * 32, 21 * 32, 74);
        art("bunting", 25 * 32, 23 * 32, 104);
        art("labcart", 34 * 32, 26 * 32, 80);
        art("coffee", 10 * 32, 24 * 32, 114);
        point("cafe-door", "Зайти в кофейню", 10 * 32, 24 * 32);
        art("board", 18 * 32, 12 * 32, 80);
        point("board", "Прочитать стенд", 18 * 32, 12 * 32);
        if (!state.flags.crate) art("crate", 13 * 32, 18 * 32, 66);
        point(
          "crate",
          state.flags.crate ? "Материалы взяты" : "Забрать материалы",
          13 * 32,
          18 * 32,
        );
        art("display", 31 * 32, 16 * 32, 84);
        point("display", "Осмотреть экран", 31 * 32, 16 * 32);
        point("deliver", "Площадка события", 25 * 32, 23 * 32);
        for (const [id, name, x, y] of [
          ["aruzhan", "Аружан", 20, 19],
          ["timur", "Тимур", 32, 16],
          ["dana", "Дана", 29, 23],
          ["amir", "Амир", 34, 19],
          ["saniya", "Сания", 25, 13],
        ] as const) {
          const npc = this.physics.add
            .sprite(x * 32, y * 32, id, 0)
            .setDepth(4)
            .setScale(1.7)
            .setImmovable(true);
          npc.body?.setSize(18, 14).setOffset(7, 18);
          npc.setData("homeX", x * 32);
          npcBodies.push(npc);
          point(id, name, x * 32, y * 32);
        }
        for (let x = 38; x <= 46; x++)
          for (let y = 23; y <= 29; y++)
            if (data.tiles[y]?.[x] === 3)
              wall(x * 32 + 16, y * 32 + 16, 32, 32);
        for (const [id, name, x, y] of [
          ["maker", "Maker Yard", 2, 17],
          ["garage", "Product Garage", 47, 17],
          ["people", "People Lab", 24, 2],
          ["urban", "Urban Lab", 42, 31],
          ["house", "Media House", 5, 32],
        ] as const)
          point(id, name, x * 32, y * 32);
      } else {
        for (let x = 0; x < 18; x++) {
          wall(x * 32 + 16, 16, 32, 32);
          wall(x * 32 + 16, 11 * 32 + 16, 32, 32);
        }
        for (let y = 0; y < 12; y++) {
          wall(16, y * 32 + 16, 32, 32);
          wall(17 * 32 + 16, y * 32 + 16, 32, 32);
        }
        art("coffee", 9 * 32, 5 * 32, 126);
        art("bench", 5 * 32, 7 * 32, 76);
        art("shrub", 14 * 32, 6 * 32, 66);
        point("coffee-counter", "Осмотреть кофейню", 9 * 32, 5 * 32);
        point("square-door", "Выйти на площадь", 9 * 32, 10 * 32);
      }
      const position =
        state.scene === this.zone
          ? state
          : {
              x: this.zone === "square" ? 25 * 32 + 16 : 9 * 32,
              y: this.zone === "square" ? 27 * 32 + 16 : 9 * 32,
            };
      this.player = this.physics.add
        .sprite(position.x, position.y, "player", 0)
        .setDepth(5)
        .setScale(1.7)
        .setCollideWorldBounds(true);
      this.player.body?.setSize(15, 12).setOffset(9, 20);
      this.physics.add.collider(this.player, walls);
      for (const npc of npcBodies) this.physics.add.collider(this.player, npc);
      for (const dir of ["down", "left", "right", "up"] as const) {
        const row = { down: 0, left: 1, right: 2, up: 3 }[dir];
        if (!this.anims.exists(`walk-${dir}`))
          this.anims.create({
            key: `walk-${dir}`,
            frames: [0, 1, 2].map((i) => ({
              key: "player",
              frame: row * 3 + i,
            })),
            frameRate: 8,
            repeat: -1,
          });
      }
      this.cameras.main
        .setBounds(0, 0, data.width * 32, data.height * 32)
        .startFollow(this.player, true, 0.1, 0.1);
      this.cameras.main.setZoom(parent.clientWidth < 600 ? 1.35 : 1.75);
      this.cameras.main.roundPixels = true;
      this.cursors = this.input.keyboard!.createCursorKeys();
      this.keys = this.input.keyboard!.addKeys("W,A,S,D,E,ENTER,ESC") as Record<
        string,
        Phaser.Input.Keyboard.Key
      >;
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (paused) return;
        const where = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const point =
          this.objects.find(
            (p) =>
              Phaser.Math.Distance.Between(p.x, p.y, where.x, where.y) < 32,
          ) ?? null;
        this.destination = {
          x: point?.x ?? where.x,
          y: point?.y ?? where.y,
          point,
        };
        this.destinationAt = this.time.now;
      });
      hooks.ready();
      hooks.scene(this.zone);
      this.scale.on("resize", () =>
        this.cameras.main.setZoom(parent.clientWidth < 600 ? 1.35 : 1.75),
      );
    }
    update(time: number) {
      if (!this.player?.body) return;
      if (!paused && Phaser.Input.Keyboard.JustDown(this.keys.ESC))
        hooks.escape();
      if (paused) {
        this.player.setVelocity(0);
        this.player.anims.stop();
        return;
      }
      let dx =
        Number(this.cursors.right.isDown || this.keys.D.isDown) -
        Number(this.cursors.left.isDown || this.keys.A.isDown) +
        touch.x;
      let dy =
        Number(this.cursors.down.isDown || this.keys.S.isDown) -
        Number(this.cursors.up.isDown || this.keys.W.isDown) +
        touch.y;
      if (dx || dy) this.destination = null;
      else if (this.destination) {
        const distance = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          this.destination.x,
          this.destination.y,
        );
        if (distance < (this.destination.point ? 82 : 10)) {
          const point = this.destination.point;
          this.destination = null;
          if (point) hooks.interact(point);
        } else if (time - this.destinationAt > 7000) this.destination = null;
        else {
          dx = (this.destination.x - this.player.x) / distance;
          dy = (this.destination.y - this.player.y) / distance;
        }
      }
      dx = Math.max(-1, Math.min(1, dx));
      dy = Math.max(-1, Math.min(1, dy));
      const norm = Math.hypot(dx, dy) || 1;
      this.player.setVelocity((dx / norm) * 145, (dy / norm) * 145);
      if (dx || dy) {
        const dir =
          Math.abs(dx) > Math.abs(dy)
            ? dx > 0
              ? "right"
              : "left"
            : dy > 0
              ? "down"
              : "up";
        this.player.anims.play(`walk-${dir}`, true);
      } else this.player.anims.stop();
      const nearest = this.objects.reduce<Interaction | null>((best, p) => {
        const d = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          p.x,
          p.y,
        );
        return d < 95 &&
          (!best ||
            d <
              Phaser.Math.Distance.Between(
                this.player.x,
                this.player.y,
                best.x,
                best.y,
              ))
          ? p
          : best;
      }, null);
      if (nearest?.id !== this.current?.id) {
        this.current = nearest;
        hooks.nearby(nearest);
      }
      if (
        nearest &&
        (Phaser.Input.Keyboard.JustDown(this.keys.E) ||
          Phaser.Input.Keyboard.JustDown(this.keys.ENTER) ||
          touch.action) &&
        time - this.lastAction > 300
      ) {
        this.lastAction = time;
        touch.action = false;
        hooks.interact(nearest);
      }
    }
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth,
    height: parent.clientHeight,
    backgroundColor: "#b8d995",
    pixelArt: true,
    roundPixels: true,
    render: { antialias: false, roundPixels: true },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: "arcade", arcade: { debug: false } },
    scene: [LoadingScene, new GameScene("square"), new GameScene("cafe")],
  });
  const observer = new ResizeObserver(() =>
    game.scale.resize(parent.clientWidth, parent.clientHeight),
  );
  observer.observe(parent);
  return {
    destroy() {
      observer.disconnect();
      game.destroy(true);
      active = null;
    },
    position() {
      return {
        scene: active?.zone ?? state.scene,
        x: Math.round(active?.player?.x ?? state.x),
        y: Math.round(active?.player?.y ?? state.y),
      };
    },
    setState(next) {
      state = next;
      if (active?.zone === next.scene && active.player)
        active.player.setPosition(next.x, next.y);
    },
    setPaused(value) {
      paused = value;
    },
    setTouch(x, y, action) {
      touch = { x, y, action };
    },
    travel(scene) {
      state = { ...state, scene };
      active?.scene.start(scene);
    },
  };
}
