import React, { useRef, useState, useEffect } from 'react';
import { Download, Trash2, Eraser, PenTool, Grid3X3, Gamepad2, Move, Box, Mountain, Cloud, Plus, Copy, Settings2, Globe, Component, Hand, User, Sparkles, Loader2, X, Code2 } from 'lucide-react';

const WORLD_SIZE = 100;
const CELL_SIZE = 6;
const SPRITE_SIZE = 40;
const WORLD_CANVAS_SIZE = WORLD_SIZE * CELL_SIZE;
const TRANSPARENT = '';
const DEFAULT_BG = '#ffffff';
const DEFAULT_COLOR = '#000000';

type Point = { x: number; y: number };
type LayerKey = 'background' | 'ground' | 'foreground';
type Tool = 'pen' | 'eraser' | 'move';
type AppMode = 'world' | 'entities' | 'logic' | 'play';
type SpritePart = 'head' | 'body' | 'arm' | 'leg';
type AiActionType = 'scratch' | 'edit';

interface Entity {
  id: string;
  name: string;
  width: number;
  height: number;
  parts: Record<SpritePart, string[]>;
  worldX: number;
  worldY: number;
  layer: LayerKey;
  behavior: string;
  state: Record<string, any>; 
}

const DEFAULT_LOGIC = `// PixelEngine.js Global Game Script
// Runs 60 times per second. 
// Variables available: entities, input, state, world

// 1. Initialize global state variables
if (state.score === undefined) state.score = 0;
if (state.money === undefined) state.money = 0;

// 2. Handle Player Movement
const player = entities.find(e => e.behavior === 'player');
if (player) {
  const speed = 0.7;
  let nextX = player.worldX + input.x * speed;
  let nextY = player.worldY + input.y * speed;

  // Simple boundary bounds
  nextX = Math.max(0, Math.min(100 - player.width, nextX));
  nextY = Math.max(0, Math.min(100 - player.height, nextY));

  player.worldX = nextX;
  player.worldY = nextY;
  
  // Tell engine renderer how to animate the player
  player.state.isMoving = input.x !== 0 || input.y !== 0;
  if (input.x < 0) player.state.facingLeft = true;
  if (input.x > 0) player.state.facingLeft = false;
}

// 3. Handle Action Button
if (input.action && player) {
  entities.forEach(ent => {
    if (ent.id === player.id) return;
    const dx = player.worldX - ent.worldX;
    const dy = player.worldY - ent.worldY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    // Interaction Radius
    if (dist < 15) {
      if (ent.behavior === 'collectible' && !ent.state.harvestedAt) {
        ent.state.harvestedAt = Date.now();
        state.score++;
      }
      if (ent.behavior === 'vendor') {
        state.money += state.score * 15;
        state.score = 0;
      }
    }
  });
}

// 4. Handle Crop Regrowth Animation
entities.forEach(ent => {
  if (ent.behavior === 'collectible' && ent.state.harvestedAt) {
    const elapsed = Date.now() - ent.state.harvestedAt;
    if (elapsed > 5000) {
      ent.state.harvestedAt = null;
      ent.state.scale = 1;
    } else {
      // Step growth scale 0 -> 0.25 -> 0.5 -> 0.75
      ent.state.scale = Math.max(0, Math.floor((elapsed / 5000) * 4) / 4);
    }
  }
});
`;

// --- UTILS ---
const resizePart = (pixels: string[], oldW: number, oldH: number, newW: number, newH: number) => {
    const newPix = new Array(newW * newH).fill(TRANSPARENT);
    for (let y = 0; y < Math.min(oldH, newH); y++) {
        for (let x = 0; x < Math.min(oldW, newW); x++) {
            newPix[y * newW + x] = pixels[y * oldW + x];
        }
    }
    return newPix;
};

const fillPartRect = (grid: string[], gridW: number, x: number, y: number, w: number, h: number, color: string) => {
  for (let r = y; r < y + h; r++) {
    for (let c = x; c < x + w; c++) {
      if (c >= 0 && c < gridW && r >= 0) grid[r * gridW + c] = color;
    }
  }
};

const createEmptyPart = (w: number, h: number) => new Array(w * h).fill(TRANSPARENT);

const applyRectsToGrid = (rects: any[], gridW: number, gridH: number, existingGrid?: string[]) => {
    const grid = existingGrid ? [...existingGrid] : new Array(gridW * gridH).fill(TRANSPARENT);
    if (!rects || !Array.isArray(rects)) return grid;
    for (const r of rects) {
        if (r.x === undefined || r.y === undefined || r.w === undefined || r.h === undefined || !r.color) continue;
        for (let y = r.y; y < r.y + r.h; y++) {
            for (let x = r.x; x < r.x + r.w; x++) {
                if (x >= 0 && x < gridW && y >= 0 && y < gridH) grid[y * gridW + x] = r.color;
            }
        }
    }
    return grid;
};

const generateDefaultWorld = () => {
  const bg = new Array(WORLD_SIZE * WORLD_SIZE).fill(TRANSPARENT);
  const gr = new Array(WORLD_SIZE * WORLD_SIZE).fill(TRANSPARENT);
  const fg = new Array(WORLD_SIZE * WORLD_SIZE).fill(TRANSPARENT);
  const fillW = (grid: string[], x: number, y: number, w: number, h: number, color: string) => fillPartRect(grid, WORLD_SIZE, x, y, w, h, color);
  fillW(bg, 0, 0, 100, 35, '#87CEEB'); fillW(bg, 10, 8, 12, 12, '#FFD700');
  fillW(gr, 0, 35, 100, 65, '#556B2F'); fillW(gr, 42, 40, 40, 60, '#D2B48C');
  return { background: bg, ground: gr, foreground: fg };
};

const generateDefaultEntities = (): Entity[] => {
  const pHead = createEmptyPart(40, 40); fillPartRect(pHead, 40, 17, 10, 6, 6, '#FFDAB9'); fillPartRect(pHead, 40, 17, 9, 6, 2, '#8B4513');
  const pBody = createEmptyPart(40, 40); fillPartRect(pBody, 40, 16, 16, 8, 9, '#8A2BE2'); fillPartRect(pBody, 40, 16, 19, 8, 1, '#ADFF2F');
  const pArm = createEmptyPart(40, 40); fillPartRect(pArm, 40, 18, 0, 3, 8, '#FFDAB9');
  const pLeg = createEmptyPart(40, 40); fillPartRect(pLeg, 40, 18, 0, 4, 9, '#1E90FF'); fillPartRect(pLeg, 40, 17, 8, 5, 2, '#5C4033');

  const entities: Entity[] = [
    {
      id: 'player', name: 'Farmer', width: 40, height: 40, worldX: 45, worldY: 50, layer: 'ground', behavior: 'player', state: {},
      parts: { head: pHead, body: pBody, arm: pArm, leg: pLeg }
    }
  ];

  const bBody = createEmptyPart(40, 40); fillPartRect(bBody, 40, 5, 10, 30, 25, '#B22222');
  entities.push({
    id: 'barn', name: 'Barn', width: 40, height: 40, worldX: 60, worldY: 10, layer: 'foreground', behavior: 'vendor', state: {},
    parts: { body: bBody, head: createEmptyPart(40, 40), arm: createEmptyPart(40, 40), leg: createEmptyPart(40, 40) }
  });

  const tBody = createEmptyPart(40, 40); fillPartRect(tBody, 40, 10, 25, 20, 10, '#228B22'); fillPartRect(tBody, 40, 15, 22, 4, 4, '#FF4500');
  entities.push({
    id: 'tomato1', name: 'Tomato', width: 40, height: 40, worldX: 10, worldY: 50, layer: 'ground', behavior: 'collectible', state: {},
    parts: { body: tBody, head: createEmptyPart(40, 40), arm: createEmptyPart(40, 40), leg: createEmptyPart(40, 40) }
  });

  return entities;
};

// --- AI INTEGRATION CONFIG (same storage key as classic.html) ---
const GEMINI_STORAGE_KEY = 'pixelengine_gemini_api_key';
const DEFAULT_AI_MODEL = 'gemini-2.5-flash';
const AI_SCHEMA = {
  type: "OBJECT",
  properties: {
    gameLogic: { type: "STRING", description: "JavaScript code block for game loop. Variables: entities, input, state, world." },
    world: {
      type: "OBJECT",
      properties: {
        background: { type: "ARRAY", items: { type: "OBJECT", properties: { x: { type: "INTEGER" }, y: { type: "INTEGER" }, w: { type: "INTEGER" }, h: { type: "INTEGER" }, color: { type: "STRING" } } } },
        ground: { type: "ARRAY", items: { type: "OBJECT", properties: { x: { type: "INTEGER" }, y: { type: "INTEGER" }, w: { type: "INTEGER" }, h: { type: "INTEGER" }, color: { type: "STRING" } } } },
        foreground: { type: "ARRAY", items: { type: "OBJECT", properties: { x: { type: "INTEGER" }, y: { type: "INTEGER" }, w: { type: "INTEGER" }, h: { type: "INTEGER" }, color: { type: "STRING" } } } }
      }
    },
    entities: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" }, width: { type: "INTEGER" }, height: { type: "INTEGER" }, worldX: { type: "INTEGER" }, worldY: { type: "INTEGER" }, layer: { type: "STRING" }, behavior: { type: "STRING" },
          parts: {
            type: "OBJECT",
            properties: {
              head: { type: "ARRAY", items: { type: "OBJECT", properties: { x: { type: "INTEGER" }, y: { type: "INTEGER" }, w: { type: "INTEGER" }, h: { type: "INTEGER" }, color: { type: "STRING" } } } },
              body: { type: "ARRAY", items: { type: "OBJECT", properties: { x: { type: "INTEGER" }, y: { type: "INTEGER" }, w: { type: "INTEGER" }, h: { type: "INTEGER" }, color: { type: "STRING" } } } },
              arm: { type: "ARRAY", items: { type: "OBJECT", properties: { x: { type: "INTEGER" }, y: { type: "INTEGER" }, w: { type: "INTEGER" }, h: { type: "INTEGER" }, color: { type: "STRING" } } } },
              leg: { type: "ARRAY", items: { type: "OBJECT", properties: { x: { type: "INTEGER" }, y: { type: "INTEGER" }, w: { type: "INTEGER" }, h: { type: "INTEGER" }, color: { type: "STRING" } } } }
            }
          }
        }
      }
    }
  }
};

export default function App() {
  const worldCanvasRef = useRef<HTMLCanvasElement>(null);
  const spriteCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [mode, setMode] = useState<AppMode>('world');
  const [activePart, setActivePart] = useState<SpritePart>('body');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [brushSize, setBrushSize] = useState<number>(1);
  const [activeTool, setActiveTool] = useState<Tool>('pen');
  
  const worldData = useRef(generateDefaultWorld());
  const [activeWorldLayer, setActiveWorldLayer] = useState<LayerKey>('ground');
  
  const [entities, setEntities] = useState<Entity[]>(generateDefaultEntities());
  const entitiesRef = useRef<Entity[]>(entities); 
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(entities[0].id);
  const [entityUpdateTick, setEntityUpdateTick] = useState(0); 

  const [gameLogic, setGameLogic] = useState(DEFAULT_LOGIC);

  const isDrawing = useRef<boolean>(false);
  const lastPoint = useRef<Point | null>(null);
  const draggingEntity = useRef<Entity | null>(null);
  const dragOffset = useRef<Point>({ x: 0, y: 0 });

  const gameEntities = useRef<Entity[]>([]); 
  const gameState = useRef<Record<string, any>>({});
  const bgCacheCanvas = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number>();
  const joyVec = useRef<Point>({ x: 0, y: 0 });
  const actionTriggered = useRef<boolean>(false);
  const [thumbPos, setThumbPos] = useState({ x: 0, y: 0 });
  const [hudTick, setHudTick] = useState(0);

  // AI State
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiActionType, setAiActionType] = useState<AiActionType>('scratch');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [aiModelId, setAiModelId] = useState(DEFAULT_AI_MODEL);

  useEffect(() => {
    try {
      const k = localStorage.getItem(GEMINI_STORAGE_KEY);
      if (k) setApiKey(k);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => { entitiesRef.current = entities; }, [entities]);

  const generateGameWithAI = async () => {
    if (!aiPrompt.trim()) return;
    if (!apiKey.trim()) {
      setAiError('Add your Gemini API key (stored in this browser only).');
      return;
    }
    setIsGenerating(true);
    setAiError("");

    let sysPrompt = "";
    let userPayload = "";

    if (aiActionType === 'scratch') {
      sysPrompt = `You are an expert 2D pixel art game generator. Create a NEW GAME FROM SCRATCH.
      1. WORLD: Provide large colored rectangles for 'background', 'ground', and 'foreground' (100x100 grid). Background MUST have at least one giant base rectangle (e.g. w:100, h:100).
      2. ENTITIES: Create dynamic entities. MUST include a 'player' entity.
      3. GAMELOGIC: Write 60fps JavaScript game loop.
      DO NOT return empty arrays!`;
      userPayload = aiPrompt;
    } else {
      sysPrompt = `You are an expert 2D game assistant. MODIFY the user's EXISTING game based on their request.
      - To update rules, return the completely rewritten 'gameLogic'.
      - To ADD new characters/items, return them in the 'entities' array.
      - To ADD details to the world, return new 'world' rectangles (they will be painted over existing layers).
      Omit arrays if they shouldn't change. Keep designs simple using CSS hex colors.`;
      
      const context = `Current Entities:\n${entities.map(e => `- ${e.name} (${e.behavior})`).join('\n')}\n\nCurrent Logic:\n${gameLogic}`;
      userPayload = `User Request: ${aiPrompt}\n\n--- EXISTING CONTEXT ---\n${context}`;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(aiModelId.trim())}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    const payload = {
      systemInstruction: { parts: [{ text: sysPrompt }] },
      contents: [{ parts: [{ text: userPayload }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: AI_SCHEMA }
    };

    let delay = 1000;
    let success = false;
    let data = null;

    for (let i = 0; i < 5; i++) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        data = JSON.parse(result.candidates[0].content.parts[0].text);
        success = true; break;
      } catch (err) {
        if (i === 4) { setAiError("Failed to connect to AI after multiple attempts."); setIsGenerating(false); return; }
        await new Promise(r => setTimeout(r, delay)); delay *= 2;
      }
    }

    if (success && data) {
      const safeArray = (arr: any) => Array.isArray(arr) ? arr : [];

      if (aiActionType === 'scratch') {
          // Verify critical data exists before wiping canvas
          if (!data.world?.background?.length && !data.entities?.length) {
              setAiError("AI failed to generate a complete game. Please try a different prompt.");
              setIsGenerating(false);
              return;
          }

          worldData.current = {
              background: applyRectsToGrid(data.world?.background, WORLD_SIZE, WORLD_SIZE),
              ground: applyRectsToGrid(data.world?.ground, WORLD_SIZE, WORLD_SIZE),
              foreground: applyRectsToGrid(data.world?.foreground, WORLD_SIZE, WORLD_SIZE)
          };

          const newEntities: Entity[] = safeArray(data.entities).map((ent: any, idx: number) => {
              const w = ent.width || 40; const h = ent.height || 40;
              return {
                  id: `ai_ent_${Date.now()}_${idx}`, name: ent.name || `Entity ${idx}`, width: w, height: h,
                  worldX: ent.worldX || 50, worldY: ent.worldY || 50, layer: (ent.layer as LayerKey) || 'ground', behavior: ent.behavior || 'none', state: {},
                  parts: {
                      head: applyRectsToGrid(ent.parts?.head, w, h), body: applyRectsToGrid(ent.parts?.body, w, h),
                      arm: applyRectsToGrid(ent.parts?.arm, w, h), leg: applyRectsToGrid(ent.parts?.leg, w, h)
                  }
              };
          });

          if (newEntities.length > 0 && !newEntities.find(e => e.behavior === 'player')) newEntities[0].behavior = 'player';
          
          setEntities(newEntities.length > 0 ? newEntities : generateDefaultEntities());
          setSelectedEntityId(newEntities.length > 0 ? newEntities[0].id : null);
          if (data.gameLogic) setGameLogic(data.gameLogic);

      } else {
          // Edit Mode: Merge safely!
          if (data.world) {
              worldData.current = {
                  background: applyRectsToGrid(data.world.background, WORLD_SIZE, WORLD_SIZE, worldData.current.background),
                  ground: applyRectsToGrid(data.world.ground, WORLD_SIZE, WORLD_SIZE, worldData.current.ground),
                  foreground: applyRectsToGrid(data.world.foreground, WORLD_SIZE, WORLD_SIZE, worldData.current.foreground)
              };
          }
          
          const newEntities: Entity[] = safeArray(data.entities).map((ent: any, idx: number) => {
              const w = ent.width || 40; const h = ent.height || 40;
              return {
                  id: `ai_edit_${Date.now()}_${idx}`, name: ent.name || `New Entity ${idx}`, width: w, height: h,
                  worldX: ent.worldX || 50, worldY: ent.worldY || 50, layer: (ent.layer as LayerKey) || 'ground', behavior: ent.behavior || 'none', state: {},
                  parts: {
                      head: applyRectsToGrid(ent.parts?.head, w, h), body: applyRectsToGrid(ent.parts?.body, w, h),
                      arm: applyRectsToGrid(ent.parts?.arm, w, h), leg: applyRectsToGrid(ent.parts?.leg, w, h)
                  }
              };
          });

          if (newEntities.length > 0) {
              setEntities(prev => {
                  const combined = [...prev, ...newEntities];
                  setSelectedEntityId(newEntities[0].id);
                  return combined;
              });
          }

          if (data.gameLogic && data.gameLogic.trim().length > 10) {
              setGameLogic(data.gameLogic);
          }
      }

      setEntityUpdateTick(t => t + 1); 
      setShowAiModal(false); 
      setMode('world');
    }
    setIsGenerating(false);
  };

  const drawGridLines = (ctx: CanvasRenderingContext2D, width: number, height: number, cellSize: number) => {
    if (!showGrid) return;
    ctx.strokeStyle = 'rgba(229, 231, 235, 0.5)'; ctx.lineWidth = 1;
    for (let i = 0; i <= width; i++) { ctx.beginPath(); ctx.moveTo(i * cellSize, 0); ctx.lineTo(i * cellSize, height * cellSize); ctx.stroke(); }
    for (let i = 0; i <= height; i++) { ctx.beginPath(); ctx.moveTo(0, i * cellSize); ctx.lineTo(width * cellSize, i * cellSize); ctx.stroke(); }
  };

  const renderPartPixels = (ctx: CanvasRenderingContext2D, pixels: string[], entW: number, ox: number = 0, oy: number = 0) => {
    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i] !== TRANSPARENT) {
        ctx.fillStyle = pixels[i];
        ctx.fillRect((ox + (i % entW)) * CELL_SIZE, (oy + Math.floor(i / entW)) * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
  };

  const renderWorld = () => {
    if (mode !== 'world') return;
    const ctx = worldCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, WORLD_CANVAS_SIZE, WORLD_CANVAS_SIZE);
    ctx.fillStyle = DEFAULT_BG; ctx.fillRect(0, 0, WORLD_CANVAS_SIZE, WORLD_CANVAS_SIZE);

    const drawWorldLayer = (layer: LayerKey) => {
      const grid = worldData.current[layer];
      ctx.globalAlpha = activeWorldLayer === layer || activeTool === 'move' ? 1.0 : 0.3;
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] !== TRANSPARENT) {
          ctx.fillStyle = grid[i];
          ctx.fillRect((i % WORLD_SIZE) * CELL_SIZE, Math.floor(i / WORLD_SIZE) * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
      }
      entitiesRef.current.filter(e => e.layer === layer).forEach(ent => {
        ctx.save();
        ctx.translate(ent.worldX * CELL_SIZE, ent.worldY * CELL_SIZE);
        Object.values(ent.parts).forEach(p => renderPartPixels(ctx, p, ent.width));
        ctx.restore();
        if (ent.id === selectedEntityId) {
          ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2;
          ctx.strokeRect(ent.worldX * CELL_SIZE, ent.worldY * CELL_SIZE, ent.width * CELL_SIZE, ent.height * CELL_SIZE);
        }
      });
    };

    drawWorldLayer('background'); drawWorldLayer('ground'); drawWorldLayer('foreground');
    ctx.globalAlpha = 1.0; drawGridLines(ctx, WORLD_SIZE, WORLD_SIZE, CELL_SIZE);
  };

  const renderEntityStudio = () => {
    if (mode !== 'entities') return;
    const ctx = spriteCanvasRef.current?.getContext('2d');
    const ent = entitiesRef.current.find(e => e.id === selectedEntityId);
    if (!ctx || !ent) return;
    
    ctx.canvas.width = ent.width * CELL_SIZE;
    ctx.canvas.height = ent.height * CELL_SIZE;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    for(let y=0; y<ent.height; y++) {
      for(let x=0; x<ent.width; x++) {
        ctx.fillStyle = (x+y)%2 === 0 ? '#f9fafb' : '#f3f4f6';
        ctx.fillRect(x*CELL_SIZE, y*CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }

    (Object.keys(ent.parts) as SpritePart[]).forEach(pk => {
      ctx.globalAlpha = pk === activePart ? 1.0 : 0.2;
      renderPartPixels(ctx, ent.parts[pk], ent.width);
    });
    ctx.globalAlpha = 1.0; drawGridLines(ctx, ent.width, ent.height, CELL_SIZE);
  };

  useEffect(() => {
    if (mode === 'world') renderWorld();
    if (mode === 'entities') renderEntityStudio();
  }, [mode, activeWorldLayer, activeTool, showGrid, selectedEntityId, entityUpdateTick, activePart]);

  // --- GAME ENGINE ---
  const gameLoop = () => {
    if (mode !== 'play') return;
    const ctx = worldCanvasRef.current?.getContext('2d');
    if (!ctx || !bgCacheCanvas.current) return;

    gameState.current._frame = (gameState.current._frame || 0) + 1;

    // 1. RUN CUSTOM LOGIC SCRIPT
    try {
        const inputState = { x: joyVec.current.x, y: joyVec.current.y, action: actionTriggered.current };
        const scriptBody = new Function('entities', 'input', 'state', 'world', gameLogic);
        scriptBody(gameEntities.current, inputState, gameState.current, worldData.current);
    } catch (err) {
        console.error("Game Logic Error:", err);
    }
    actionTriggered.current = false; 
    
    if (gameState.current._frame % 10 === 0) setHudTick(t => t + 1);

    // 2. RENDER THE WORLD
    ctx.clearRect(0, 0, WORLD_CANVAS_SIZE, WORLD_CANVAS_SIZE);
    ctx.drawImage(bgCacheCanvas.current, 0, 0);

    // 3. RENDER DYNAMIC ENTITIES (Sorted by Y depth)
    const sorted = [...gameEntities.current].sort((a,b) => (a.worldY + a.height) - (b.worldY + b.height));
    sorted.forEach(ent => {
      ctx.save();
      
      const scaleAmount = ent.state.scale !== undefined ? ent.state.scale : 1;
      if (scaleAmount === 0) { ctx.restore(); return; }

      if (scaleAmount !== 1) {
          ctx.translate(0, (ent.worldY + ent.height) * CELL_SIZE);
          ctx.scale(1, scaleAmount);
          ctx.translate(0, -((ent.worldY + ent.height) * CELL_SIZE));
      }

      ctx.translate(ent.worldX * CELL_SIZE, ent.worldY * CELL_SIZE);

      if (ent.state.facingLeft) {
        ctx.translate(ent.width * CELL_SIZE, 0); ctx.scale(-1, 1);
      }

      const isMoving = ent.state.isMoving;
      const f = gameState.current._frame * 0.1;
      const swing = isMoving ? Math.sin(f) * 8 : 0;
      const bob = isMoving ? Math.abs(Math.sin(f)) * 2 : 0;

      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath(); ctx.ellipse((ent.width/2)*CELL_SIZE, ent.height*CELL_SIZE, (ent.width/3)*CELL_SIZE, 3*CELL_SIZE, 0, 0, Math.PI*2); ctx.fill();

      ctx.save(); ctx.translate((ent.width/2)*CELL_SIZE, (ent.height/2)*CELL_SIZE); ctx.rotate(-swing * Math.PI/180); ctx.translate(-(ent.width/2)*CELL_SIZE, -(ent.height/2)*CELL_SIZE);
      renderPartPixels(ctx, ent.parts.leg, ent.width); ctx.restore();
      ctx.save(); ctx.translate((ent.width/2)*CELL_SIZE, (ent.height/3)*CELL_SIZE); ctx.rotate(swing * Math.PI/180); ctx.translate(-(ent.width/2)*CELL_SIZE, -(ent.height/3)*CELL_SIZE);
      renderPartPixels(ctx, ent.parts.arm, ent.width); ctx.restore();

      ctx.save(); ctx.translate(0, -bob);
      renderPartPixels(ctx, ent.parts.body, ent.width);
      renderPartPixels(ctx, ent.parts.head, ent.width);
      ctx.restore();

      ctx.save(); ctx.translate((ent.width/2)*CELL_SIZE, (ent.height/2)*CELL_SIZE); ctx.rotate(swing * Math.PI/180); ctx.translate(-(ent.width/2)*CELL_SIZE, -(ent.height/2)*CELL_SIZE);
      renderPartPixels(ctx, ent.parts.leg, ent.width); ctx.restore();
      ctx.save(); ctx.translate((ent.width/2)*CELL_SIZE, (ent.height/3)*CELL_SIZE); ctx.rotate(-swing * Math.PI/180); ctx.translate(-(ent.width/2)*CELL_SIZE, -(ent.height/3)*CELL_SIZE);
      renderPartPixels(ctx, ent.parts.arm, ent.width); ctx.restore();

      ctx.restore();
    });

    requestRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => {
    if (mode === 'play') {
      gameEntities.current = JSON.parse(JSON.stringify(entitiesRef.current));
      gameState.current = {}; 
      const canvas = document.createElement('canvas');
      canvas.width = WORLD_CANVAS_SIZE; canvas.height = WORLD_CANVAS_SIZE;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const bg = worldData.current.background;
        const gr = worldData.current.ground;
        for(let i=0; i<bg.length; i++) {
          if(bg[i] !== TRANSPARENT) { ctx.fillStyle=bg[i]; ctx.fillRect((i%WORLD_SIZE)*CELL_SIZE, Math.floor(i/WORLD_SIZE)*CELL_SIZE, CELL_SIZE, CELL_SIZE); }
          if(gr[i] !== TRANSPARENT) { ctx.fillStyle=gr[i]; ctx.fillRect((i%WORLD_SIZE)*CELL_SIZE, Math.floor(i/WORLD_SIZE)*CELL_SIZE, CELL_SIZE, CELL_SIZE); }
        }
      }
      bgCacheCanvas.current = canvas;
      requestRef.current = requestAnimationFrame(gameLoop);
    }
    return () => cancelAnimationFrame(requestRef.current!);
  }, [mode, gameLogic]);

  // --- DRAWING LOGIC ---
  const applyBrush = (cx: number, cy: number, isWorld: boolean) => {
    const ent = entitiesRef.current.find(e => e.id === selectedEntityId);
    const sizeW = isWorld ? WORLD_SIZE : (ent ? ent.width : SPRITE_SIZE);
    const sizeH = isWorld ? WORLD_SIZE : (ent ? ent.height : SPRITE_SIZE);
    const grid = isWorld ? worldData.current[activeWorldLayer] : ent?.parts[activePart];
    
    if (!grid) return;
    const offset = Math.floor(brushSize / 2);
    for (let dy = 0; dy < brushSize; dy++) {
      for (let dx = 0; dx < brushSize; dx++) {
        const x = cx - offset + dx, y = cy - offset + dy;
        if (x >= 0 && x < sizeW && y >= 0 && y < sizeH) {
          grid[y * sizeW + x] = activeTool === 'pen' ? color : TRANSPARENT;
        }
      }
    }
    if (isWorld) renderWorld(); else renderEntityStudio();
  };

  const getCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - rect.left) * (e.currentTarget.width / rect.width)) / CELL_SIZE),
      y: Math.floor(((e.clientY - rect.top) * (e.currentTarget.height / rect.height)) / CELL_SIZE)
    };
  };

  const updateSelectedEntity = (updates: Partial<Entity>) => {
      setEntities(entities.map(e => {
          if (e.id === selectedEntityId) {
              const updated = { ...e, ...updates };
              if (updates.width !== undefined || updates.height !== undefined) {
                  const nW = updates.width || e.width;
                  const nH = updates.height || e.height;
                  updated.parts = {
                      head: resizePart(e.parts.head, e.width, e.height, nW, nH),
                      body: resizePart(e.parts.body, e.width, e.height, nW, nH),
                      arm: resizePart(e.parts.arm, e.width, e.height, nW, nH),
                      leg: resizePart(e.parts.leg, e.width, e.height, nW, nH)
                  };
              }
              return updated;
          }
          return e;
      }));
      setEntityUpdateTick(t => t + 1);
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 font-sans select-none overflow-hidden relative">
      <header className="h-14 bg-white border-b px-6 flex items-center justify-between shrink-0 shadow-sm">
        <h1 className="font-bold text-lg text-slate-800 tracking-tight">PixelEngine<span className="text-indigo-500">.v3</span></h1>
        <div className="flex items-center gap-3">
          <a
            href={`${import.meta.env.BASE_URL}classic.html`}
            className="text-xs font-medium text-slate-500 hover:text-indigo-600 underline-offset-2 hover:underline"
          >
            Classic 100×100 grid
          </a>
          <div className="w-px h-6 bg-slate-200" />
          <button onClick={() => setShowAiModal(true)} className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow-md transition transform active:scale-95">
            <Sparkles size={16} /> AI Builder
          </button>
          <div className="w-px h-6 bg-slate-200"></div>
          <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
            <button onClick={() => setMode('world')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1 ${mode === 'world' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}><Globe size={16}/> World</button>
            <button onClick={() => setMode('entities')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1 ${mode === 'entities' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}><Component size={16}/> Entities</button>
            <button onClick={() => setMode('logic')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1 ${mode === 'logic' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}><Code2 size={16}/> Logic</button>
            <button onClick={() => setMode('play')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1 ${mode === 'play' ? 'bg-indigo-500 text-white shadow' : 'text-slate-500 hover:text-slate-800'}`}><Gamepad2 size={16}/> Play</button>
          </div>
        </div>
      </header>

      {/* AI MODAL */}
      {showAiModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Sparkles className="text-purple-500" size={20} /> AI Game Architect
              </h2>
              <button onClick={() => !isGenerating && setShowAiModal(false)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            
            <div className="p-6 space-y-5">
              
              <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button onClick={() => setAiActionType('scratch')} disabled={isGenerating} className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${aiActionType === 'scratch' ? 'bg-white text-purple-600 shadow' : 'text-slate-500'}`}>Create from Scratch</button>
                  <button onClick={() => setAiActionType('edit')} disabled={isGenerating} className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${aiActionType === 'edit' ? 'bg-white text-purple-600 shadow' : 'text-slate-500'}`}>Modify Current Game</button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Gemini API key (stored in this browser)</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onBlur={() => {
                    try {
                      if (apiKey.trim()) localStorage.setItem(GEMINI_STORAGE_KEY, apiKey.trim());
                      else localStorage.removeItem(GEMINI_STORAGE_KEY);
                    } catch {
                      /* ignore */
                    }
                  }}
                  disabled={isGenerating}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-400 outline-none"
                  placeholder="Paste key from Google AI Studio"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Model id</label>
                <input
                  type="text"
                  value={aiModelId}
                  onChange={(e) => setAiModelId(e.target.value)}
                  disabled={isGenerating}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-purple-400 outline-none"
                  placeholder={DEFAULT_AI_MODEL}
                />
              </div>

              <div className="space-y-2">
                  <p className="text-sm text-slate-600 font-medium">
                      {aiActionType === 'scratch' ? "Describe your new world:" : "What should the AI add or change?"}
                  </p>
                  <textarea 
                    value={aiPrompt} 
                    onChange={(e) => setAiPrompt(e.target.value)} 
                    placeholder={aiActionType === 'scratch' ? "e.g., A spooky graveyard with a skeleton player, ghost enemies, and tombstones." : "e.g., Add a friendly dog that follows the player, and make the player move twice as fast."} 
                    className="w-full h-32 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none resize-none disabled:opacity-50"
                    disabled={isGenerating}
                  />
              </div>
              
              {aiError && <div className="text-red-500 text-xs font-semibold bg-red-50 p-3 rounded-lg border border-red-100">{aiError}</div>}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowAiModal(false)} disabled={isGenerating} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50 transition">Cancel</button>
              <button onClick={generateGameWithAI} disabled={isGenerating || !aiPrompt.trim()} className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 transition shadow-md">
                {isGenerating ? <><Loader2 size={16} className="animate-spin" /> {aiActionType === 'scratch' ? 'Generating New Game...' : 'Modifying Game...'}</> : (aiActionType === 'scratch' ? 'Generate Game' : 'Apply Modifications')}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex overflow-hidden">
        {mode === 'entities' && (
          <aside className="w-64 bg-white border-r flex flex-col shrink-0">
            <div className="p-4 border-b flex justify-between items-center">
              <span className="font-bold text-xs text-slate-400 uppercase tracking-widest">Library</span>
              <button onClick={() => { const newEnt: Entity = { id: `ent_${Date.now()}`, name: 'New Entity', width: 40, height: 40, parts: { head: createEmptyPart(40,40), body: createEmptyPart(40,40), arm: createEmptyPart(40,40), leg: createEmptyPart(40,40) }, worldX: 50, worldY: 50, layer: 'ground', behavior: 'none', state: {} }; setEntities([...entities, newEnt]); setSelectedEntityId(newEnt.id); }} className="text-indigo-500 hover:bg-indigo-50 p-1 rounded transition"><Plus size={16}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {entities.map(ent => (
                <div key={ent.id} onClick={() => setSelectedEntityId(ent.id)} className={`p-3 rounded-lg cursor-pointer transition flex items-center gap-3 ${selectedEntityId === ent.id ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'hover:bg-slate-50 text-slate-600 border border-transparent'}`}>
                  <User size={16} /> <span className="text-sm font-medium truncate">{ent.name}</span>
                </div>
              ))}
            </div>
          </aside>
        )}

        <div className="flex-1 flex flex-col relative bg-slate-100 items-center justify-start overflow-auto">
          
          {/* LOGIC MODE */}
          {mode === 'logic' && (
              <div className="w-full h-full p-6 flex flex-col max-w-6xl mx-auto">
                  <div className="mb-2 flex justify-between items-end">
                      <div>
                          <h2 className="font-bold text-slate-700 text-lg">Game Script</h2>
                          <p className="text-sm text-slate-500">Write custom JavaScript to control behaviors, state, and rules. Runs 60 times/sec.</p>
                      </div>
                  </div>
                  <textarea 
                    value={gameLogic}
                    onChange={(e) => setGameLogic(e.target.value)}
                    className="flex-1 w-full bg-slate-900 text-green-400 font-mono p-6 rounded-xl shadow-inner focus:outline-none resize-none text-sm"
                    spellCheck={false}
                  />
              </div>
          )}

          {/* CONTEXT TOOLBAR */}
          {(mode === 'world' || mode === 'entities') && (
            <div className="my-4 bg-white p-2 rounded-xl shadow-sm border flex items-center gap-4 shrink-0 mx-6">
              {mode === 'world' && (
                <div className="flex border-r pr-4 gap-1">
                  <button onClick={() => setActiveWorldLayer('background')} className={`p-2 rounded-md ${activeWorldLayer === 'background' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-100'}`}><Cloud size={18}/></button>
                  <button onClick={() => setActiveWorldLayer('ground')} className={`p-2 rounded-md ${activeWorldLayer === 'ground' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-100'}`}><Mountain size={18}/></button>
                  <button onClick={() => setActiveWorldLayer('foreground')} className={`p-2 rounded-md ${activeWorldLayer === 'foreground' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-100'}`}><Box size={18}/></button>
                </div>
              )}
              <div className="flex items-center gap-3 pr-4 border-r">
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-8 h-8 rounded-lg cursor-pointer border-none" />
                <input type="range" min="1" max="9" step="2" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="w-20 accent-indigo-500" />
              </div>
              <div className="flex gap-1">
                <button onClick={() => setActiveTool('pen')} className={`p-1.5 rounded-md ${activeTool === 'pen' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:bg-slate-100'}`}><PenTool size={18}/></button>
                <button onClick={() => setActiveTool('eraser')} className={`p-1.5 rounded-md ${activeTool === 'eraser' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:bg-slate-100'}`}><Eraser size={18}/></button>
                {mode === 'world' && <button onClick={() => setActiveTool('move')} className={`p-1.5 rounded-md ${activeTool === 'move' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:bg-slate-100'}`}><Move size={18}/></button>}
              </div>
              <button onClick={() => setShowGrid(!showGrid)} className={`p-1.5 rounded-md ml-auto ${showGrid ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-200'}`} title="Toggle Grid"><Grid3X3 size={18} /></button>
            </div>
          )}

          <div className={`${mode === 'logic' ? 'hidden' : 'flex'} relative shadow-2xl border-4 border-white bg-white rounded-lg overflow-hidden shrink-0 mt-2`}>
            
            {/* WORLD CANVAS */}
            {mode === 'world' && <canvas ref={worldCanvasRef} width={WORLD_CANVAS_SIZE} height={WORLD_CANVAS_SIZE} onPointerDown={e => { draggingEntity.current = null; if (activeTool === 'move') { const p = getCoords(e); entitiesRef.current.forEach(ent => { if (p.x >= ent.worldX && p.x < ent.worldX + ent.width && p.y >= ent.worldY && p.y < ent.worldY + ent.height) { draggingEntity.current = ent; dragOffset.current = { x: p.x - ent.worldX, y: p.y - ent.worldY }; setSelectedEntityId(ent.id); } }); } else { isDrawing.current = true; applyBrush(getCoords(e).x, getCoords(e).y, true); } }} onPointerMove={e => { const p = getCoords(e); if (draggingEntity.current) { draggingEntity.current.worldX = p.x - dragOffset.current.x; draggingEntity.current.worldY = p.y - dragOffset.current.y; renderWorld(); } else if (isDrawing.current) applyBrush(p.x, p.y, true); }} onPointerUp={() => { isDrawing.current = false; draggingEntity.current = null; }} className="cursor-crosshair block" style={{width: WORLD_CANVAS_SIZE, height: WORLD_CANVAS_SIZE}} />}
            
            {/* ENTITY STUDIO CANVAS */}
            {mode === 'entities' && (
              <div className="flex items-start gap-6 p-4">
                <div className="bg-slate-100 p-2 rounded-lg border border-slate-200">
                    <canvas ref={spriteCanvasRef} onPointerDown={e => { isDrawing.current = true; applyBrush(getCoords(e).x, getCoords(e).y, false); }} onPointerMove={e => { if (isDrawing.current) applyBrush(getCoords(e).x, getCoords(e).y, false); }} onPointerUp={() => isDrawing.current = false} className="cursor-crosshair block bg-white" />
                </div>
                <div className="w-64 space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Part</label>
                    <div className="grid grid-cols-2 gap-1">
                      {(['head', 'body', 'arm', 'leg'] as SpritePart[]).map(p => (
                        <button key={p} onClick={() => setActivePart(p)} className={`px-3 py-2 rounded text-xs font-bold capitalize transition ${activePart === p ? 'bg-indigo-500 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{p}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Entity Info</label>
                    <input type="text" value={entities.find(e => e.id === selectedEntityId)?.name || ''} onChange={e => updateSelectedEntity({ name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border rounded text-sm focus:ring-2 focus:ring-indigo-200 outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Width</label>
                        <input type="number" min="1" max="100" value={entities.find(e => e.id === selectedEntityId)?.width || 40} onChange={e => updateSelectedEntity({ width: parseInt(e.target.value) || 10 })} className="w-full px-3 py-2 bg-slate-50 border rounded text-sm outline-none" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Height</label>
                        <input type="number" min="1" max="100" value={entities.find(e => e.id === selectedEntityId)?.height || 40} onChange={e => updateSelectedEntity({ height: parseInt(e.target.value) || 10 })} className="w-full px-3 py-2 bg-slate-50 border rounded text-sm outline-none" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Logic Behavior</label>
                    <input type="text" value={entities.find(e => e.id === selectedEntityId)?.behavior || ''} onChange={e => updateSelectedEntity({ behavior: e.target.value })} placeholder="e.g. player, solid..." className="w-full px-3 py-2 bg-slate-50 border rounded text-sm focus:ring-2 focus:ring-indigo-200 outline-none" />
                  </div>
                </div>
              </div>
            )}

            {/* PLAY CANVAS */}
            {mode === 'play' && (
              <div className="relative flex-shrink-0">
                <canvas ref={worldCanvasRef} width={WORLD_CANVAS_SIZE} height={WORLD_CANVAS_SIZE} className="block" style={{width: WORLD_CANVAS_SIZE, height: WORLD_CANVAS_SIZE}} />
                
                {/* Dynamic HUD reading from Game Script State */}
                <div className="absolute top-4 left-4 flex gap-4 pointer-events-none">
                  {Object.entries(gameState.current)
                    .filter(([k, v]) => !k.startsWith('_') && typeof v === 'number')
                    .map(([k, v]) => (
                      <div key={k} className="bg-white/80 backdrop-blur px-4 py-2 rounded-xl shadow-lg font-bold text-indigo-600 flex items-center gap-2 border uppercase text-sm tracking-wide">
                        {k}: {v as number}
                      </div>
                  ))}
                </div>

                {/* Joystick */}
                <div className="absolute bottom-6 left-6 w-32 h-32 rounded-full bg-slate-900/10 border-2 border-white/20 backdrop-blur-sm flex items-center justify-center touch-none"
                  onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); const dx = e.clientX - (r.left + 64), dy = e.clientY - (r.top + 64); setThumbPos({x:dx, y:dy}); joyVec.current = {x:dx/40, y:dy/40}; }}
                  onPointerMove={e => { if (e.buttons > 0) { const r = e.currentTarget.getBoundingClientRect(); let dx = e.clientX - (r.left + 64), dy = e.clientY - (r.top + 64); const d = Math.sqrt(dx*dx+dy*dy); if (d > 40) { dx=(dx/d)*40; dy=(dy/d)*40; } setThumbPos({x:dx, y:dy}); joyVec.current = {x:dx/40, y:dy/40}; } }}
                  onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); setThumbPos({x:0, y:0}); joyVec.current = {x:0, y:0}; }}
                >
                  <div className="w-12 h-12 rounded-full bg-white shadow-xl transition-transform" style={{transform: `translate(${thumbPos.x}px, ${thumbPos.y}px)`}} />
                </div>
                
                {/* Action Button */}
                <button onPointerDown={() => { actionTriggered.current = true; }} className="absolute bottom-8 right-8 w-20 h-20 rounded-full bg-indigo-500 text-white font-black shadow-2xl active:scale-90 transition border-4 border-white/30 flex items-center justify-center"><Hand size={32}/></button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}