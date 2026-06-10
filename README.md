# Region Visibility

Foundry VTT V14 module — token-linked visibility for Regions, plus a visibility-range polygon generator.

## Features

### Token-Linked Visibility

Regions only render on the canvas when a player has the linked token selected.

- GM always sees all Regions (configurable)
- Players only see Regions linked to their currently selected token
- Works with any Region shape

### Visibility Range (New)

Define a 2D pattern on a configurable grid per token. Press a keybind to create a polygon Region shaped to that pattern, attached to the token.

1. Open a token's configuration
2. Find the **Visibility Range** grid in the Appearance tab
3. Click cells to define the range shape
4. Close config, select the token on the canvas
5. Press **Ctrl+Shift+V** — a polygon region is created
6. Press again to remove it

The region uses visibility **ALWAYS** — all users see it while it exists.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Grid Size | 10 | Cells per side of the range grid (10 = 10×10) |
| Keybind Modifiers | Ctrl+Shift | Modifier keys used with V |

## Keybind

Default: **Ctrl+Shift+V**. Rebind in Foundry's Configure Controls menu (category: Region Visibility).

## How Token-Linked Visibility Works

1. Enable the module in your world
2. Create or edit a Region
3. Add the **"Token Visibility"** behavior to the Region
4. Paste the UUID of the token you want to link
5. Save — the Region now only shows when that token is selected

### Getting a token UUID

Run this macro with a token selected:
```js
console.log(canvas.tokens.controlled[0]?.document.uuid);
```
Or drag the token from the sidebar into a macro/chat to see its UUID.

## Compatibility

- Foundry VTT V14+
- No dependencies on other modules

## License

See LICENSE file.
