# Region Visibility

Foundry VTT V14 module — adds token-linked visibility to Regions.

## What it does

Regions normally display for all users who can see them. This module adds a **Token Visibility** behavior type to Regions. When applied, the Region only renders on the canvas when a player has the linked token selected.

- GM always sees all Regions (configurable)
- Players only see Regions linked to their currently selected token
- Works with any Region shape

## How to use

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
