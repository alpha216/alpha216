# Classroom corner

A Three.js classroom with two perpendicular walls: a green chalkboard on the front wall and recessed windows on the right wall. The camera looks diagonally toward their junction. Outside are a procedural cherry blossom tree and a clouded sky.

```sh
npm install
npm run dev
npm run build
```

- `src/main.js`: scene initialization, rendering and reduced-motion behavior.
- `src/tree.js`: `createCherryBlossomTree()` builds the branches and instanced flowers.
- `src/classroom.js`: separate functions for materials, walls, chalkboard, window frame, glass, ceiling fixtures, floor, desk, tree placement, sky and sunlight; `buildClassroom()` assembles them and returns the camera resize callback.
- `src/style.css`: full-screen canvas layout.

Blossoms use instanced geometry and branches are merged. Shadows are cached after the first frame; the subtle tree sway does not update the cached shadow map. All visual materials are generated locally, with no external image or font requests.
