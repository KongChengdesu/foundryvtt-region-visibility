/**
 * Region Visibility - Foundry VTT V14 Module
 *
 * Adds token-linked visibility to Regions. Visibility settings are
 * injected directly into the Region configuration form and stored
 * in document flags (bypassing the behavior system entirely).
 */

// ─── Visibility Engine ───────────────────────────────────────────────────────

/**
 * Determine whether a region should be visible based on token selection.
 * Reads visibility configuration from region document flags.
 * @param {Region} region - The canvas Region placeable
 * @returns {boolean}
 */
function shouldRegionBeVisible(region) {
  const flags = region.document.flags?.["region-visibility"];
  if (!flags?.linkedTokenUuid) return true; // Not configured — default visible

  const isGM = game.user.isGM;
  const hideFromGM = flags.hideFromGM;

  // GM sees everything unless explicitly opted out
  if (isGM && !hideFromGM) return true;

  const controlled = canvas.tokens?.controlled ?? [];
  return controlled.some(t => t.document.uuid === flags.linkedTokenUuid);
}

/**
 * Apply token-based visibility to a single region placeable.
 * @param {Region} region
 */
function applyVisibility(region) {
  region.visible = shouldRegionBeVisible(region);
}

/**
 * Refresh visibility for all regions on the canvas.
 */
function refreshAllRegions() {
  if (!canvas.ready) return;
  for (const region of canvas.regions?.placeables ?? []) {
    applyVisibility(region);
  }
}

// ─── Region Config Form Injection ────────────────────────────────────────────

/**
 * Inject the Token Visibility section into the Region configuration form.
 * Attached via the renderRegionConfig hook.
 */
function injectVisibilitySection(app, html, _data) {
  const root = html[0] ?? html;
  const form = root.querySelector?.("form") ?? root;
  if (!form || form.querySelector(".region-visibility-config")) return;

  const doc = app.document;
  const flags = doc.flags?.["region-visibility"] ?? {};

  const section = document.createElement("fieldset");
  section.classList.add("region-visibility-config");
  section.innerHTML = `
    <legend>${game.i18n.localize("REGIONVIS.SectionLabel")}</legend>
    <div class="form-group">
      <label for="rv-linked-token">${game.i18n.localize("REGIONVIS.LinkedTokenUuid")}</label>
      <div class="form-fields">
        <input type="text" id="rv-linked-token"
               value="${foundry.utils.escapeHTML(flags.linkedTokenUuid || "")}"
               placeholder="Scene.Token.uuid">
      </div>
      <p class="hint">${game.i18n.localize("REGIONVIS.LinkedTokenUuidHint")}</p>
    </div>
    <div class="form-group">
      <label for="rv-hide-from-gm">${game.i18n.localize("REGIONVIS.HideFromGM")}</label>
      <div class="form-fields">
        <input type="checkbox" id="rv-hide-from-gm"
               ${flags.hideFromGM ? "checked" : ""}>
      </div>
      <p class="hint">${game.i18n.localize("REGIONVIS.HideFromGMHint")}</p>
    </div>
  `;

  // Insert before the form footer; fallback to appending at the end
  const footer = form.querySelector("footer");
  if (footer) {
    form.insertBefore(section, footer);
  } else {
    form.appendChild(section);
  }

  // Auto-save visibility settings to document flags on field change
  section.querySelector("#rv-linked-token").addEventListener("change", (e) => {
    doc.setFlag("region-visibility", "linkedTokenUuid", e.target.value);
  });
  section.querySelector("#rv-hide-from-gm").addEventListener("change", (e) => {
    doc.setFlag("region-visibility", "hideFromGM", e.target.checked);
  });
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

Hooks.on("renderRegionConfig", injectVisibilitySection);

Hooks.once("ready", () => {
  // Patch Region._refreshVisibility so our visibility survives Foundry refreshes
  const Region = foundry.canvas.placeables.Region;
  const _origRefreshVisibility = Region.prototype._refreshVisibility;
  Region.prototype._refreshVisibility = function () {
    _origRefreshVisibility.call(this);
    applyVisibility(this);
  };

  // Token selection changes
  Hooks.on("controlToken", refreshAllRegions);

  // Region lifecycle — re-evaluate visibility
  Hooks.on("createRegion", refreshAllRegions);
  Hooks.on("updateRegion", refreshAllRegions);

  // Initial pass for already-loaded canvas
  if (canvas.ready) refreshAllRegions();
});
