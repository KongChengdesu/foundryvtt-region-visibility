/**
 * Region Visibility Range — Range Preset System
 *
 * Standalone menu for designing named grid-pattern presets, a preset list
 * manager, and macro generation. Each preset can be toggled on the selected
 * token to create/remove an attached polygon Region.
 *
 * Uses ApplicationV2 and DialogV2 APIs (Foundry V14).
 */

// ── V2 API references ────────────────────────────────────────────────────────
const ApplicationV2 = foundry.applications.api.ApplicationV2;
const DialogV2 = foundry.applications.api.DialogV2;

// ── Module references (set via initPresetSystem) ─────────────────────────────
let _MODULE_ID = null;
let _buildShapesForToken = null;

/**
 * Called by module.js during the `init` hook with the module ID and a
 * reference to buildShapesForToken. Avoids circular import issues.
 */
export function initPresetSystem(moduleId, buildShapesForTokenFn) {
  _MODULE_ID = moduleId;
  _buildShapesForToken = buildShapesForTokenFn;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function _generateId() {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function _getPresets() {
  return game.settings.get(_MODULE_ID, "rangePresets") ?? [];
}

async function _savePresets(presets) {
  await game.settings.set(_MODULE_ID, "rangePresets", presets);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared CSS injection
// ═══════════════════════════════════════════════════════════════════════════════

function _ensureStyles() {
  if (document.getElementById("vr-grid-styles")) return;
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
    .vr-legend .vr-legend-dir { border: none; color: #ff6400; font-weight: bold; font-size: 1.2em; text-align: center; line-height: 16px; }
    .vr-config-section .form-group { margin: 0.5em 0; }
    .vr-cell.center-arrow { display: flex !important; align-items: center; justify-content: center; color: #ff6400; font-size: 12px; }
    .vr-designer-name { margin-bottom: 0.5em; }
    .vr-designer-name label { display: block; margin-bottom: 0.2em; font-weight: bold; }
    .vr-designer-name input { width: 100% !important; }
    .vr-designer-color { margin-bottom: 0.5em; display: flex; align-items: center; gap: 0.5em; }
    .vr-designer-color label { font-weight: bold; white-space: nowrap; }
    .vr-designer-color input { width: 48px !important; height: 32px !important; padding: 2px; cursor: pointer; }
    .vr-designer-gridsize { font-size: 0.85em; color: #999; margin-bottom: 0.5em; }
    .vr-designer-buttons { display: flex; gap: 0.3em; margin-top: 0.5em; }
    .vr-designer-buttons button { flex: 1; }
    .vr-preset-list { list-style: none; padding: 0; margin: 0; }
    .vr-preset-item { display: flex; align-items: center; justify-content: space-between; padding: 0.5em; border-bottom: 1px solid #444; }
    .vr-preset-item:last-child { border-bottom: none; }
    .vr-preset-item-info { display: flex; flex-direction: column; gap: 0.2em; }
    .vr-preset-item-name { font-weight: bold; }
    .vr-preset-item-meta { font-size: 0.85em; color: #999; }
    .vr-preset-item-actions { display: flex; gap: 0.3em; }
    .vr-preset-item-actions button { font-size: 0.85em; padding: 2px 6px; }
    .vr-preset-empty { padding: 1em; text-align: center; color: #999; font-style: italic; }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared grid HTML builder
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the interactive grid HTML (no token footprint).
 * @param {number} gridSize
 * @param {boolean[][]} grid
 * @returns {string}
 */
function _buildGridHtml(gridSize, grid) {
  const cx = Math.floor(gridSize / 2);
  const cy = Math.floor(gridSize / 2);
  let html = `<div class="vr-grid" style="grid-template-columns: repeat(${gridSize}, 22px);">`;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const active = grid[y]?.[x] ? " active" : "";
      const isCenter = x === cx && y === cy;
      const center = isCenter ? " token-center" : "";
      const arrow = isCenter ? " center-arrow" : "";
      const content = isCenter ? '<i class="fas fa-arrow-right"></i>' : "";
      html += `<div class="vr-cell${active}${center}${arrow}" data-x="${x}" data-y="${y}">${content}</div>`;
    }
  }
  html += "</div>";
  return html;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Range Designer Dialog (DialogV2 API)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Open a Dialog for creating or editing a range preset.
 *
 * @param {object|null}  existingPreset - preset to edit, or null for new
 * @param {boolean[][]|null} initialGrid  - optional grid to pre-fill (from token config)
 * @returns {Promise<void>} Resolves when the dialog closes.
 */
export function openRangeDesigner(existingPreset = null, initialGrid = null) {
  _ensureStyles();

  const isEdit = existingPreset !== null;
  const gridSize = existingPreset?.gridSize
    ?? initialGrid?.length
    ?? game.settings.get(_MODULE_ID, "gridSize");

  const userColor = typeof game.user.color === "string"
    ? game.user.color
    : game.user.color?.css ?? "#ff6400";

  const preset = isEdit
    ? foundry.utils.deepClone(existingPreset)
    : {
        id: _generateId(),
        name: "",
        gridSize,
        grid: initialGrid
          ? initialGrid.map(row => [...row])
          : Array.from({ length: gridSize }, () => new Array(gridSize).fill(false)),
        color: userColor,
        createdAt: Date.now(),
      };

  // Working copy of the grid (mutated by cell clicks)
  let grid = preset.grid.map(row => [...row]);

  // Local colour state (mutated by color picker)
  let regionColor = preset.color ?? userColor;

  const title = isEdit
    ? game.i18n.format("REGIONVIS.EditPreset", { name: existingPreset.name })
    : game.i18n.localize("REGIONVIS.NewPreset");

  const content = `
    <div class="vr-designer">
      <div class="vr-designer-name">
        <label>${game.i18n.localize("REGIONVIS.PresetName")}</label>
        <input type="text" class="preset-name-input" value="${foundry.utils.escapeHTML(preset.name)}" placeholder="${game.i18n.localize("REGIONVIS.PresetNamePlaceholder")}" autofocus>
      </div>
      <div class="vr-designer-color">
        <label>${game.i18n.localize("REGIONVIS.RegionColor")}</label>
        <input type="color" class="preset-color-input" value="${regionColor}">
      </div>
      <div class="vr-designer-gridsize">${game.i18n.format("REGIONVIS.GridSizeLabel", { size: gridSize })}</div>
      <div class="vr-legend">
        <span class="vr-legend-active"></span> ${game.i18n.localize("REGIONVIS.VisibleCell")}
        <span class="vr-legend-dir"><i class="fas fa-arrow-right"></i></span> ${game.i18n.localize("REGIONVIS.TokenOrientation")}
      </div>
      ${_buildGridHtml(gridSize, grid)}
      <div class="vr-designer-buttons">
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
    </div>
  `;

  return new Promise((resolve) => {
    const dialog = new DialogV2({
      window: { title },
      content,
      form: { closeOnSubmit: false },
      buttons: [
        {
          action: "save",
          icon: "fa-solid fa-save",
          label: game.i18n.localize("REGIONVIS.SavePreset"),
          default: true,
          callback: async (_event, _button, dlg) => {
            const nameInput = dlg.element.querySelector(".preset-name-input");
            const name = nameInput?.value?.trim() ?? "";
            if (!name) {
              ui.notifications.warn(game.i18n.localize("REGIONVIS.PresetNameRequired"));
              return;
            }
            if (grid.flat().every(c => !c)) {
              ui.notifications.warn(game.i18n.localize("REGIONVIS.PresetNoCells"));
              return;
            }
            preset.name = name;
            preset.grid = grid.map(row => [...row]);
            preset.color = regionColor;

            const presets = _getPresets();
            const idx = presets.findIndex(p => p.id === preset.id);
            if (idx >= 0) presets[idx] = preset;
            else presets.push(preset);
            await _savePresets(presets);

            ui.notifications.info(
              game.i18n.format("REGIONVIS.PresetSaved", { name })
            );
            await dlg.close();
          },
        },
        {
          action: "close",
          icon: "fa-solid fa-times",
          label: game.i18n.localize("REGIONVIS.Cancel"),
        },
      ],
      position: { width: Math.max(420, gridSize * 22 + 100) },
    });

    dialog.addEventListener("render", (_event) => {
      const el = dialog.element;

      // ── cell clicks ──────────────────────────────────────────────────
      el.querySelectorAll(".vr-cell").forEach(cell => {
        cell.addEventListener("click", function () {
          this.classList.toggle("active");
          const x = parseInt(this.dataset.x);
          const y = parseInt(this.dataset.y);
          grid[y][x] = this.classList.contains("active");
        });
      });

      // ── action buttons ───────────────────────────────────────────────
      el.querySelector(".vr-clear-btn")?.addEventListener("click", () => {
        for (let y = 0; y < gridSize; y++)
          for (let x = 0; x < gridSize; x++)
            grid[y][x] = false;
        el.querySelectorAll(".vr-cell").forEach(c => c.classList.remove("active"));
      });

      el.querySelector(".vr-fill-btn")?.addEventListener("click", () => {
        for (let y = 0; y < gridSize; y++)
          for (let x = 0; x < gridSize; x++)
            grid[y][x] = true;
        el.querySelectorAll(".vr-cell").forEach(c => c.classList.add("active"));
      });

      el.querySelector(".vr-invert-btn")?.addEventListener("click", () => {
        for (let y = 0; y < gridSize; y++)
          for (let x = 0; x < gridSize; x++)
            grid[y][x] = !grid[y][x];
        el.querySelectorAll(".vr-cell").forEach(cell => {
          const cx = parseInt(cell.dataset.x);
          const cy = parseInt(cell.dataset.y);
          cell.classList.toggle("active", grid[cy]?.[cx] ?? false);
        });
      });

      // ── colour picker ─────────────────────────────────────────────
      el.querySelector(".preset-color-input")?.addEventListener("change", function () {
        regionColor = this.value;
      });
    }, { once: true });

    dialog.addEventListener("close", () => resolve(), { once: true });

    dialog.render({ force: true });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Range Preset List Application (ApplicationV2 API)
// ═══════════════════════════════════════════════════════════════════════════════

export class RangePresetList extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "range-preset-list",
    window: {
      resizable: true,
    },
    position: {
      width: 550,
      height: "auto",
    },
  };

  get title() {
    return game.i18n.localize("REGIONVIS.PresetListTitle") ?? "Range Presets";
  }

  async _renderHTML(_context, _options) {
    _ensureStyles();
    const presets = _getPresets();

    if (presets.length === 0) {
      return `<div class="vr-preset-empty">${game.i18n.localize("REGIONVIS.PresetListEmpty")}</div>`;
    }

    let rows = "";
    for (const preset of presets) {
      const dateStr = new Date(preset.createdAt).toLocaleDateString(
        game.i18n.lang ?? "en",
        { year: "numeric", month: "short", day: "numeric" }
      );
      rows += `
        <div class="vr-preset-item">
          <div class="vr-preset-item-info">
            <span class="vr-preset-item-name">${foundry.utils.escapeHTML(preset.name)}</span>
            <span class="vr-preset-item-meta">${game.i18n.format("REGIONVIS.GridSizeLabel", { size: preset.gridSize })} — ${dateStr}</span>
          </div>
          <div class="vr-preset-item-actions">
            <button type="button" class="edit-preset" data-id="${preset.id}">
              <i class="fas fa-edit"></i> ${game.i18n.localize("REGIONVIS.Edit")}
            </button>
            <button type="button" class="create-macro" data-id="${preset.id}" data-name="${foundry.utils.escapeHTML(preset.name)}">
              <i class="fas fa-scroll"></i> ${game.i18n.localize("REGIONVIS.CreateMacro")}
            </button>
            <button type="button" class="delete-preset" data-id="${preset.id}" data-name="${foundry.utils.escapeHTML(preset.name)}">
              <i class="fas fa-trash"></i> ${game.i18n.localize("REGIONVIS.Delete")}
            </button>
          </div>
        </div>`;
    }

    return `<div class="vr-preset-list">${rows}</div>`;
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = result;
    this._bindPresetListListeners(content);
  }

  _bindPresetListListeners(container) {
    const app = this;

    container.querySelectorAll(".edit-preset").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.dataset.id;
        const preset = _getPresets().find(p => p.id === id);
        if (preset) {
          await openRangeDesigner(preset);
          app.render(true);
        }
      });
    });

    container.querySelectorAll(".create-macro").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.dataset.id;
        const preset = _getPresets().find(p => p.id === id);
        if (preset) await _createPresetMacro(preset);
      });
    });

    container.querySelectorAll(".delete-preset").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.currentTarget.dataset.id;
        const name = e.currentTarget.dataset.name;
        const preset = _getPresets().find(p => p.id === id);
        if (!preset) return;

        const confirmed = await DialogV2.confirm({
          window: { title: game.i18n.localize("REGIONVIS.Delete") },
          content: game.i18n.format("REGIONVIS.PresetDeleteConfirm", { name }),
        });
        if (confirmed) {
          const presets = _getPresets().filter(p => p.id !== id);
          await _savePresets(presets);
          ui.notifications.info(
            game.i18n.format("REGIONVIS.PresetDeleted", { name })
          );
          app.render(true);
        }
      });
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Macro Generation
// ═══════════════════════════════════════════════════════════════════════════════

async function _createPresetMacro(preset) {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("REGIONVIS.GMOnly"));
    return;
  }

  const macroName = `Toggle Range: ${preset.name}`;
  const existing = game.macros.getName(macroName);
  if (existing) {
    ui.notifications.warn(
      game.i18n.format("REGIONVIS.MacroAlreadyExists", { name: macroName })
    );
    return;
  }

  const command = `game.modules.get("${_MODULE_ID}").api.togglePreset("${preset.id}");`;
  const macro = await Macro.create({
    name: macroName,
    type: "script",
    scope: "global",
    command,
    img: "icons/svg/eye.svg",
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
  });

  if (macro) {
    ui.notifications.info(
      game.i18n.format("REGIONVIS.PresetMacroCreated", { name: macroName })
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Toggle Preset Region
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Toggle a range preset on the primary controlled token.
 * Creates a polygon Region (attached, visibility ALWAYS) if none exists;
 * deletes the existing one if already present.
 *
 * Call from a macro: game.modules.get("region-visibility").api.togglePreset("preset_id")
 *
 * @param {string} presetId
 */
export async function togglePresetRegion(presetId) {
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
  const flagKey = `activePresetRegion_${presetId}`;
  const existingRegionId = tokenDoc.getFlag(_MODULE_ID, flagKey);

  // ── Delete existing region ───────────────────────────────────────────────
  if (existingRegionId) {
    const region = canvas.scene.regions.get(existingRegionId);
    if (region) {
      const name = region.name;
      await region.delete();
      await tokenDoc.unsetFlag(_MODULE_ID, flagKey);
      ui.notifications.info(
        game.i18n.format("REGIONVIS.PresetRemoved", { name })
      );
    } else {
      await tokenDoc.unsetFlag(_MODULE_ID, flagKey);
      ui.notifications.warn(game.i18n.localize("REGIONVIS.RegionNotFound"));
    }
    return;
  }

  // ── Build polygon from preset grid ────────────────────────────────────────
  const preset = _getPresets().find(p => p.id === presetId);
  if (!preset) {
    ui.notifications.error(game.i18n.localize("REGIONVIS.PresetNotFound"));
    return;
  }

  const { shapes } = _buildShapesForToken(tokenDoc, preset.grid);

  if (!shapes || shapes.length === 0) {
    ui.notifications.warn(game.i18n.localize("REGIONVIS.NoVertices"));
    return;
  }

  // ── Create region ────────────────────────────────────────────────────────
  const RegionDocument = CONFIG.Region.documentClass;
  const regionData = {
    name: `${token.name} — ${preset.name}`,
    shapes,
    visibility: CONST.REGION_VISIBILITY?.ALWAYS ?? 2,
    attachment: { token: tokenDoc.id },
    ownership: {
      [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
    },
    displayMeasurements: false,
    color: preset.color ?? game.user.color,
  };

  let regionDoc;
  try {
    regionDoc = await RegionDocument.create(regionData, { parent: canvas.scene });
  } catch (err) {
    ui.notifications.error(game.i18n.localize("REGIONVIS.RegionFailed"));
    console.error("Region Visibility | preset toggle failed:", err);
    return;
  }

  if (regionDoc) {
    await tokenDoc.setFlag(_MODULE_ID, flagKey, regionDoc.id);
    ui.notifications.info(
      game.i18n.format("REGIONVIS.PresetApplied", { name: preset.name, token: token.name })
    );
  } else {
    ui.notifications.error(game.i18n.localize("REGIONVIS.RegionFailed"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Lifecycle Hooks
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Clean up all active preset regions when a token is deleted.
 * Called from the preDeleteToken hook in module.js.
 */
export function onPreDeleteToken(tokenDoc) {
  if (!tokenDoc.parent?.regions) return;
  const flags = tokenDoc.flags?.[_MODULE_ID] ?? {};
  const deletions = [];
  for (const [key, regionId] of Object.entries(flags)) {
    if (key.startsWith("activePresetRegion_")) {
      const region = tokenDoc.parent.regions.get(regionId);
      if (region) deletions.push(region.delete());
    }
  }
  if (deletions.length) {
    Promise.allSettled(deletions).catch(() => {});
  }
}

/**
 * Clean up token flags when a tracked preset region is deleted externally.
 * Called from the deleteRegion hook in module.js.
 */
export function onDeleteRegion(region) {
  if (!canvas.scene) return;
  for (const token of canvas.scene.tokens) {
    const flags = token.flags?.[_MODULE_ID] ?? {};
    for (const [key, value] of Object.entries(flags)) {
      if (key.startsWith("activePresetRegion_") && value === region.id) {
        token.unsetFlag(_MODULE_ID, key);
        return;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// API Surface
// ═══════════════════════════════════════════════════════════════════════════════

export function getApi() {
  return {
    togglePreset: togglePresetRegion,
    openDesigner: openRangeDesigner,
    openPresetList: () => new RangePresetList().render(true),
    getPresets: _getPresets,
  };
}
