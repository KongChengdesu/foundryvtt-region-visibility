/**
 * Region Visibility - Foundry VTT V14 Module
 *
 * Adds token-linked visibility to Regions. A Region with the
 * "Token Visibility" behavior only renders when a player selects
 * the token linked in the behavior config.
 */

// ─── Custom RegionBehaviorType ───────────────────────────────────────────────

class TokenVisibilityRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  /** @override */
  static defineSchema() {
    return {
      linkedTokenUuid: new foundry.data.fields.StringField({
        required: true,
        blank: false,
        label: "REGIONVIS.LinkedTokenUuid",
        hint: "REGIONVIS.LinkedTokenUuidHint"
      }),
      hideFromGM: new foundry.data.fields.BooleanField({
        initial: false,
        label: "REGIONVIS.HideFromGM",
        hint: "REGIONVIS.HideFromGMHint"
      })
    };
  }

  /** @override */
  static LOCALIZATION_PREFIXES = ["REGIONVIS"];
}

// ─── Registration ────────────────────────────────────────────────────────────

Hooks.once("init", () => {
  // Register custom behavior type with Foundry's RegionBehavior config
  CONFIG.RegionBehavior.dataModels.tokenVisibility = TokenVisibilityRegionBehaviorType;
  CONFIG.RegionBehavior.typeLabels.tokenVisibility = "REGIONVIS.BehaviorLabel";
  CONFIG.RegionBehavior.typeIcons.tokenVisibility = "fa-solid fa-eye";
});

// ─── Visibility Engine ───────────────────────────────────────────────────────

/**
 * Determine whether a region should be visible based on token selection.
 * @param {Region} region - The canvas Region placeable
 * @returns {boolean}
 */
function shouldRegionBeVisible(region) {
  const behavior = region.document.behaviors?.contents?.find(
    b => (b.type === "tokenVisibility") && !b.disabled
  );
  if (!behavior) return true; // Not our behavior — don't interfere

  const isGM = game.user.isGM;
  const hideFromGM = behavior.system.hideFromGM;

  // GM sees everything unless explicitly opted out
  if (isGM && !hideFromGM) return true;

  const controlled = canvas.tokens?.controlled ?? [];
  const linkedUuid = behavior.system.linkedTokenUuid;
  if (!linkedUuid) return true;

  return controlled.some(t => t.document.uuid === linkedUuid);
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

// ─── Hooks ───────────────────────────────────────────────────────────────────

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
