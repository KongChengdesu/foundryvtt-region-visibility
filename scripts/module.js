/**
 * Region Visibility Range - Foundry VTT V14 Module
 *
 * Adds a visibility range grid to token configuration. Players define a
 * 2D pattern on a configurable N×N grid. A keybind toggles a polygon
 * Region (attached to the token, visibility ALWAYS) shaped to the pattern.
 */

const MODULE_ID = "region-visibility";

// ═══════════════════════════════════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════════════════════════════════

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "gridSize", {
    name: "REGIONVIS.GridSize",
    hint: "REGIONVIS.GridSizeHint",
    scope: "world",
    config: true,
    type: Number,
    default: 10,
    range: { min: 3, max: 30, step: 1 },
    requiresReload: false,
  });

  game.keybindings.register(MODULE_ID, "toggleRange", {
    name: "REGIONVIS.KeybindName",
    hint: "REGIONVIS.KeybindHint",
    editable: [
      { key: "KeyV", modifiers: ["Control", "Shift"] },
    ],
    onDown: toggleRangeRegion,
    precedence: 1, // NORMAL (CONST.KEYBIND_PRECEDENCE removed in V14)
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// Grid → Polygon Conversion
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert a 2D boolean grid to a polygon outline (flat array of [x,y,…]).
 *
 * Selected cells merge into a single boundary. Only the outer perimeter
 * edges are kept — interior edges between adjacent selected cells are
 * discarded. Disconnected islands produce separate polygon point sets.
 *
 * @param {boolean[][]} grid       - grid[y][x] === true if cell selected
 * @param {number}      cellSize   - pixel size of one grid cell
 * @param {number}      offsetX    - canvas-pixel x of grid origin (top-left)
 * @param {number}      offsetY    - canvas-pixel y of grid origin (top-left)
 * @returns {{ points: number[], shapes: Array<{type:"polygon",points:number[]}> }}
 */
function gridToShapes(grid, cellSize, offsetX, offsetY) {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const selected = new Set();

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y]?.[x]) selected.add(`${x},${y}`);
    }
  }

  if (selected.size === 0) return { points: [], shapes: [] };

  // ── collect boundary edges ──────────────────────────────────────────────
  const edges = [];
  for (const key of selected) {
    const [x, y] = key.split(",").map(Number);
    if (!selected.has(`${x},${y - 1}`)) edges.push([x, y, x + 1, y]);       // top
    if (!selected.has(`${x + 1},${y}`)) edges.push([x + 1, y, x + 1, y + 1]); // right
    if (!selected.has(`${x},${y + 1}`)) edges.push([x + 1, y + 1, x, y + 1]); // bottom
    if (!selected.has(`${x - 1},${y}`)) edges.push([x, y + 1, x, y]);        // left
  }

  if (edges.length === 0) return { points: [], shapes: [] };

  // ── adjacency map ────────────────────────────────────────────────────────
  const adj = new Map();
  const keyPt = (ex, ey) => `${ex},${ey}`;
  for (const [x1, y1, x2, y2] of edges) {
    const k1 = keyPt(x1, y1);
    const k2 = keyPt(x2, y2);
    if (!adj.has(k1)) adj.set(k1, []);
    if (!adj.has(k2)) adj.set(k2, []);
    adj.get(k1).push(k2);
    adj.get(k2).push(k1);
  }

  // ── trace each connected component ───────────────────────────────────────
  const visited = new Set();
  const shapes = [];

  for (const startKey of adj.keys()) {
    if (visited.has(startKey)) continue;

    const compPoints = [];
    let current = startKey;

    while (current && !visited.has(current)) {
      const [cx, cy] = current.split(",").map(Number);
      compPoints.push(offsetX + cx * cellSize, offsetY + cy * cellSize);
      visited.add(current);
      const neighbors = adj.get(current) ?? [];
      current = neighbors.find(n => !visited.has(n));
    }

    // Valid polygon needs ≥ 3 vertices
    if (compPoints.length >= 6) {
      shapes.push({ type: "polygon", points: compPoints });
    }
  }

  const allPoints = shapes.flatMap(s => s.points);
  return { points: allPoints, shapes };
}

/**
 * Build polygon shapes for a token from its stored range grid.
 * Always includes the token's own footprint.
 * Points are in token-relative coordinates (token top-left = origin).
 * Rotation is NOT pre-applied — the attachment system handles it.
 * @param {TokenDocument} tokenDoc
 * @param {boolean[][]}   grid
 * @returns {{ shapes: Array<{type:"polygon",points:number[]}> }}
 */
function buildShapesForToken(tokenDoc, grid) {
  const gridSize = grid.length;
  const cellSize = canvas.grid.size;
  const tokenW = tokenDoc.width ?? 1;
  const tokenH = tokenDoc.height ?? 1;

  // Absolute canvas coordinates centred on token centre.
  // Attachment handles position delta tracking, but initial placement
  // must be at the token's actual canvas location.
  const halfGridCells = gridSize / 2;
  const tokenCenterX = tokenDoc.x + (tokenW * cellSize) / 2;
  const tokenCenterY = tokenDoc.y + (tokenH * cellSize) / 2;
  const offsetX = tokenCenterX - halfGridCells * cellSize;
  const offsetY = tokenCenterY - halfGridCells * cellSize;

  const { shapes } = gridToShapes(grid, cellSize, offsetX, offsetY);

  // Pre-rotate points to match token's current orientation.
  // Attachment handles animation deltas but initial rotation must be baked in.
  const rotation = ((tokenDoc.rotation ?? 0) + 90) % 360;
  if (rotation) {
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    for (const sh of shapes) {
      const pts = sh.points;
      for (let i = 0; i < pts.length; i += 2) {
        const dx = pts[i] - tokenCenterX;
        const dy = pts[i + 1] - tokenCenterY;
        pts[i] = tokenCenterX + dx * cos - dy * sin;
        pts[i + 1] = tokenCenterY + dx * sin + dy * cos;
      }
    }
  }

  return { shapes };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Token Config — Grid Injection
// ═══════════════════════════════════════════════════════════════════════════════

Hooks.on("renderTokenConfig", (app, html, _data) => {
  html = $(html); // V14 may pass raw element
  const token = app.document;
  if (!token) return;

  const gridSize = game.settings.get(MODULE_ID, "gridSize");
  let rangeGrid = token.getFlag(MODULE_ID, "rangeGrid");

  // Normalise stored grid to current gridSize
  if (!Array.isArray(rangeGrid) || rangeGrid.length !== gridSize) {
    rangeGrid = Array.from({ length: gridSize }, () =>
      new Array(gridSize).fill(false)
    );
  }

  // ── inject CSS once ──────────────────────────────────────────────────────
  if (!document.getElementById("vr-grid-styles")) {
    const style = document.createElement("style");
    style.id = "vr-grid-styles";
    style.textContent = `
      .vr-grid { display: grid; gap: 0; margin: 0.5em 0; width: fit-content; }
      .vr-cell {
        width: 22px !important; height: 22px !important;
        min-width: 22px !important; min-height: 22px !important;
        max-width: 22px !important; max-height: 22px !important;
        padding: 0 !important; margin: 0 !important;
        border: 1px solid #666; background: #222;
        cursor: pointer; box-sizing: border-box;
        display: block !important;
      }
      .vr-cell:hover { border-color: #ff6400; }
      .vr-cell.active { background: #ff6400; border-color: #ff8533; }
      .vr-cell.token-center { background: #444; border-color: #888; }
      .vr-legend { display: flex; gap: 1em; align-items: center; margin: 0.5em 0; font-size: 0.9em; }
      .vr-legend span { display: inline-block; width: 16px; height: 16px; border: 1px solid #666; }
      .vr-legend .vr-legend-center { background: #444; }
      .vr-legend .vr-legend-active { background: #ff6400; }
      .vr-config-section .form-group { margin: 0.5em 0; }
    `;
    document.head.appendChild(style);
  }

  // ── compute token footprint in grid ──────────────────────────────────────
  const tokenW = token.width ?? 1;
  const tokenH = token.height ?? 1;
  const halfGrid = Math.floor(gridSize / 2);
  const footStartX = halfGrid - Math.floor(tokenW / 2);
  const footStartY = halfGrid - Math.floor(tokenH / 2);

  // ── build grid (CSS grid, avoids Foundry table style conflicts) ──────────
  let gridHtml = `<div class="vr-grid" style="grid-template-columns: repeat(${gridSize}, 22px);">`;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const onFootprint = x >= footStartX && x < footStartX + tokenW &&
                          y >= footStartY && y < footStartY + tokenH;
      const active = rangeGrid[y]?.[x] ? " active" : "";
      const center = onFootprint ? " token-center" : "";
      gridHtml += `<div class="vr-cell${active}${center}" data-x="${x}" data-y="${y}"></div>`;
    }
  }
  gridHtml += "</div>";

  // ── assemble section HTML ────────────────────────────────────────────────
  const sectionHtml = `
    <fieldset class="vr-config-section">
      <legend>${game.i18n.localize("REGIONVIS.RangeSectionLabel")}</legend>
      <div class="form-group">
        <p class="notes">${game.i18n.localize("REGIONVIS.RangeHint")}</p>
      </div>
      <div class="vr-legend">
        <span class="vr-legend-center"></span> ${game.i18n.localize("REGIONVIS.TokenCenter")}
        <span class="vr-legend-active"></span> ${game.i18n.localize("REGIONVIS.VisibleCell")}
      </div>
      ${gridHtml}
      <div class="form-group" style="margin-top:0.5em;">
        <button type="button" class="vr-clear-btn">
          <i class="fas fa-eraser"></i> ${game.i18n.localize("REGIONVIS.ClearAll")}
        </button>
        <button type="button" class="vr-fill-btn">
          <i class="fas fa-fill-drip"></i> ${game.i18n.localize("REGIONVIS.FillAll")}
        </button>
        <button type="button" class="vr-invert-btn">
          <i class="fas fa-exchange-alt"></i> ${game.i18n.localize("REGIONVIS.Invert")}
        </button>
      </div>
    </fieldset>
  `;

  // ── inject into the Appearance tab, fall back to bottom of form ──────────
  const appearanceTab = html.find('.tab[data-tab="appearance"]');
  const target = appearanceTab.length ? appearanceTab : html.find("form");
  target.append(sectionHtml);

  // ── cell click handler ───────────────────────────────────────────────────
  html.find(".vr-cell").on("click", function () {
    const cell = $(this);
    const x = parseInt(cell.data("x"));
    const y = parseInt(cell.data("y"));

    cell.toggleClass("active");
    const isActive = cell.hasClass("active");

    let grid = token.getFlag(MODULE_ID, "rangeGrid");
    if (!Array.isArray(grid) || grid.length !== gridSize) {
      grid = Array.from({ length: gridSize }, () =>
        new Array(gridSize).fill(false)
      );
    } else {
      // Deep-clone to avoid mutating the cached flag object
      grid = grid.map(row => [...row]);
    }
    grid[y][x] = isActive;
    token.setFlag(MODULE_ID, "rangeGrid", grid);
  });

  // ── button handlers ──────────────────────────────────────────────────────
  html.find(".vr-clear-btn").on("click", () => {
    const grid = Array.from({ length: gridSize }, () =>
      new Array(gridSize).fill(false)
    );
    token.setFlag(MODULE_ID, "rangeGrid", grid);
    html.find(".vr-cell").removeClass("active");
  });

  html.find(".vr-fill-btn").on("click", () => {
    const grid = Array.from({ length: gridSize }, () =>
      new Array(gridSize).fill(true)
    );
    token.setFlag(MODULE_ID, "rangeGrid", grid);
    html.find(".vr-cell").addClass("active");
  });

  html.find(".vr-invert-btn").on("click", () => {
    let grid = token.getFlag(MODULE_ID, "rangeGrid");
    if (!Array.isArray(grid) || grid.length !== gridSize) {
      grid = Array.from({ length: gridSize }, () =>
        new Array(gridSize).fill(false)
      );
    }
    const inverted = grid.map(row => row.map(c => !c));
    token.setFlag(MODULE_ID, "rangeGrid", inverted);
    html.find(".vr-cell").each(function () {
      const cell = $(this);
      const cx2 = parseInt(cell.data("x"));
      const cy2 = parseInt(cell.data("y"));
      cell.toggleClass("active", inverted[cy2]?.[cx2] ?? false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Region Create / Delete
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Toggle the visibility-range region for the primary controlled token.
 *
 * If a region already exists (tracked by flag), it deletes it.
 * Otherwise it builds a polygon from the stored range grid and creates a
 * new region attached to the token with visibility ALWAYS (value 2).
 */
async function toggleRangeRegion() {
  if (!canvas.ready || !canvas.scene) {
    ui.notifications.warn(game.i18n.localize("REGIONVIS.NoCanvas"));
    return;
  }

  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("REGIONVIS.GMOnly"));
    return;
  }

  const controlled = canvas.tokens?.controlled ?? [];
  if (controlled.length === 0) {
    ui.notifications.warn(game.i18n.localize("REGIONVIS.SelectToken"));
    return;
  }

  const token = controlled[0];
  const tokenDoc = token.document;
  const existingRegionId = tokenDoc.getFlag(MODULE_ID, "activeRegionId");

  // ── Delete existing region ───────────────────────────────────────────────
  if (existingRegionId) {
    const region = canvas.scene.regions.get(existingRegionId);
    if (region) {
      const name = region.name;
      await region.delete();
      await tokenDoc.unsetFlag(MODULE_ID, "activeRegionId");
      ui.notifications.info(
        game.i18n.format("REGIONVIS.RegionRemoved", { name })
      );
    } else {
      // Region was deleted externally — just clean up the flags
      await tokenDoc.unsetFlag(MODULE_ID, "activeRegionId");
      ui.notifications.warn(game.i18n.localize("REGIONVIS.RegionNotFound"));
    }
    return;
  }

  // ── Build polygon from stored grid ───────────────────────────────────────
  const rangeGrid = tokenDoc.getFlag(MODULE_ID, "rangeGrid");
  const gridSize = tokenDoc.getFlag(MODULE_ID, "rangeGrid")?.length
    ?? game.settings.get(MODULE_ID, "gridSize");

  // Normalise and inject token footprint
  let grid = Array.isArray(rangeGrid) && rangeGrid.length === gridSize
    ? rangeGrid.map(row => [...row])
    : Array.from({ length: gridSize }, () => Array(gridSize).fill(false));

  if (grid.length === 0) {
    ui.notifications.warn(game.i18n.localize("REGIONVIS.NoPattern"));
    return;
  }

  const tokenW = tokenDoc.width ?? 1;
  const tokenH = tokenDoc.height ?? 1;
  const halfGridCells = gridSize / 2;
  const footStartX = Math.floor(halfGridCells) - Math.floor(tokenW / 2);
  const footStartY = Math.floor(halfGridCells) - Math.floor(tokenH / 2);
  for (let ty = 0; ty < tokenH; ty++) {
    for (let tx = 0; tx < tokenW; tx++) {
      const gx = footStartX + tx;
      const gy = footStartY + ty;
      if (gy >= 0 && gy < gridSize && gx >= 0 && gx < gridSize) {
        grid[gy][gx] = true;
      }
    }
  }

  const { shapes } = buildShapesForToken(tokenDoc, grid);

  if (shapes.length === 0) {
    ui.notifications.warn(game.i18n.localize("REGIONVIS.NoVertices"));
    return;
  }

  // ── Create region directly (non-interactive) ──────────────────────────────
  const RegionDocument = CONFIG.Region.documentClass;
  const regionData = {
    name: `${token.name} — ${game.i18n.localize("REGIONVIS.RangeRegionSuffix")}`,
    shapes,
    visibility: CONST.REGION_VISIBILITY?.ALWAYS ?? 2,
    attachment: { token: tokenDoc.id },
    ownership: {
      [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
    },
    displayMeasurements: false,
    color: game.user.color,
  };

  let regionDoc;
  try {
    regionDoc = await RegionDocument.create(regionData, { parent: canvas.scene });
  } catch (err) {
    ui.notifications.error(game.i18n.localize("REGIONVIS.RegionFailed"));
    console.error("Region Visibility | create failed:", err);
    return;
  }

  if (regionDoc) {
    await tokenDoc.setFlag(MODULE_ID, "activeRegionId", regionDoc.id);
    ui.notifications.info(
      game.i18n.format("REGIONVIS.RegionCreated", { name: token.name })
    );
  } else {
    ui.notifications.error(game.i18n.localize("REGIONVIS.RegionFailed"));
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// Region Lifecycle — clean up token flags when a tracked region is deleted
// ═══════════════════════════════════════════════════════════════════════════════

Hooks.on("deleteRegion", (region, _options, _userId) => {
  if (!canvas.scene) return;
  for (const token of canvas.scene.tokens) {
    const trackedId = token.getFlag(MODULE_ID, "activeRegionId");
    if (trackedId === region.id) {
      token.unsetFlag(MODULE_ID, "activeRegionId");
      break;
    }
  }
});

// When a token with an active range region is deleted, remove the region too
Hooks.on("preDeleteToken", (tokenDoc, _options, _userId) => {
  const regionId = tokenDoc.getFlag(MODULE_ID, "activeRegionId");
  if (!regionId) return;
  const region = tokenDoc.parent?.regions?.get(regionId);
  if (region) {
    region.delete().catch(() => {});
  }
});
