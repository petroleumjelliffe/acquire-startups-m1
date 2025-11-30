# Merger Mechanics: Multiple Critical Bugs

## Summary
The merger logic has several critical bugs related to timing of state mutations and price calculations. The absorbed startup is being modified BEFORE bonuses and liquidations are calculated, leading to incorrect prices and lost shares.

## Bug 1: Majority/Minority Bonuses Calculated with Wrong Share Price

### Current Behavior
When a merger occurs, `mergeStartups()` is called BEFORE `prepareMergerPayout()`. The sequence is:

```typescript
// gameLogic.ts:247
mergeStartups(state, survivorId, absorbedIds);
// ...
prepareMergerPayout(state, survivorId, absorbedIds);
```

Inside `mergeStartups()`, the absorbed startup's tiles are immediately reassigned to the survivor:

```typescript
// gameLogic.ts:538-542
for (const [coord, cell] of Object.entries(state.board)) {
  if (absorbedIds.includes(cell.startupId || "")) {
    cell.startupId = survivorId;  // ❌ Tiles moved to survivor
  }
}
```

Then in `prepareMergerPayout()`, it calculates bonuses using:

```typescript
// gameLogic.ts:665
const price = getSharePrice(state, absorbedId);  // ❌ Price is now 0!
```

But `getSharePrice()` calculates based on startup SIZE (number of tiles), which is now **0** because all tiles were already moved to the survivor.

### Expected Behavior
- Share price for bonuses should be calculated based on the absorbed startup's size **at the time of merger**
- The absorbed startup size should be captured BEFORE any tiles are reassigned
- Bonuses should use the pre-merger share price

### Impact
- Majority and minority bonuses are calculated incorrectly (likely $0 or minimum tier pricing)
- Players are not receiving the correct bonus payouts for their holdings

---

## Bug 2: Liquidation Sale Price is Wrong

### Current Behavior
In `handleLiquidationChoice()`, when a player chooses to "sell" their shares:

```typescript
// gameLogic.ts:984-985
const sellPrice = getSharePrice(state, absorbedId);  // ❌ Wrong price!
player.cash += shares * sellPrice;
```

This uses `getSharePrice()` which calculates based on the current startup size. But the absorbed startup's tiles have already been moved to the survivor (Bug #1), so the price is wrong.

### Expected Behavior
- Sale price should be based on the absorbed startup's size **at the time of merger**
- Should use the same pre-merger price that was used for bonus calculations

### Impact
- Players selling shares receive incorrect cash amounts
- Liquidation values don't match the actual pre-merger share prices

---

## Bug 3: Held Shares Are Lost After Merger

### Current Behavior
In `completeLiquidation()`, after all shareholders have made their choices:

```typescript
// gameLogic.ts:1038-1048
function completeLiquidation(state: GameState, absorbedId: string) {
  const absorbed = state.startups[absorbedId];
  absorbed.isFounded = false;
  absorbed.foundingTile = null;
  absorbed.availableShares = absorbed.totalShares;  // ❌ Resets all shares

  // Remove all tiles from board
  for (const cell of Object.values(state.board)) {
    if (cell.startupId === absorbedId) cell.startupId = undefined;
  }

  // ❌ Does not preserve player portfolio holdings
}
```

If a player chose to "hold" their shares (e.g., 6 shares), those shares disappear from their portfolio because:
1. The startup is marked as not founded
2. Available shares are reset to total
3. Player portfolios are not preserved

### Expected Behavior
- If a player chooses to "hold" shares during liquidation, those shares should **remain in their portfolio**
- The shares should persist even though the startup is no longer on the board
- If the startup is later re-founded, the player should still own those shares
- This is how the official Acquire game works - held shares can appreciate if the brand is re-founded

### Impact
- Players lose shares they explicitly chose to hold
- Strategic holding decisions are meaningless
- Game rules are violated

---

## Root Cause Analysis

The fundamental issue is **premature state mutation**:

1. `mergeStartups()` immediately modifies the board state (reassigns tiles)
2. This happens BEFORE bonuses and liquidations are calculated
3. All subsequent calculations use the modified state, not the pre-merger state

## Proposed Fix

### 1. Capture Pre-Merger Data
Before calling `mergeStartups()`, capture the absorbed startup sizes and prices:

```typescript
// Calculate prices BEFORE merger
const absorbedSizes: Record<string, number> = {};
const absorbedPrices: Record<string, number> = {};

for (const absorbedId of absorbedIds) {
  absorbedSizes[absorbedId] = getStartupSize(state, absorbedId);
  absorbedPrices[absorbedId] = getSharePrice(state, absorbedId);
}

// Store in merger context
state.mergerContext = {
  survivorId,
  absorbedIds,
  absorbedPrices,  // ✅ Use these for bonuses and sales
  // ... other context
};

// NOW it's safe to merge
mergeStartups(state, survivorId, absorbedIds);
```

### 2. Use Stored Prices in Calculations

```typescript
// In prepareMergerPayout
const price = state.mergerContext.absorbedPrices[absorbedId];  // ✅ Pre-merger price

// In handleLiquidationChoice
const sellPrice = state.mergerContext.absorbedPrices[absorbedId];  // ✅ Pre-merger price
```

### 3. Preserve Held Shares

```typescript
// In completeLiquidation
function completeLiquidation(state: GameState, absorbedId: string) {
  const absorbed = state.startups[absorbedId];

  // Mark as not founded, but don't reset available shares yet
  absorbed.isFounded = false;
  absorbed.foundingTile = null;

  // Count how many shares are held by players
  const heldShares = state.players.reduce(
    (sum, p) => sum + (p.portfolio[absorbedId] || 0),
    0
  );

  // Only reset available shares accounting for held shares
  absorbed.availableShares = absorbed.totalShares - heldShares;  // ✅ Preserve held shares

  // Remove tiles from board (this is correct)
  for (const cell of Object.values(state.board)) {
    if (cell.startupId === absorbedId) cell.startupId = undefined;
  }

  // ✅ Do NOT clear player portfolios - they keep their held shares
}
```

## Testing Checklist

After fixing:
- [ ] Merger bonuses use correct pre-merger share prices
- [ ] Sale prices during liquidation use correct pre-merger prices
- [ ] Held shares remain in player portfolios after merger completes
- [ ] Re-founding a previously merged startup accounts for held shares
- [ ] Available shares calculation is correct after liquidation
- [ ] Multi-startup mergers handle prices correctly for each absorbed startup

## Related Files

- `src/state/gameLogic.ts` - `mergeStartups()`, `prepareMergerPayout()`, `handleLiquidationChoice()`, `completeLiquidation()`
- `src/state/gameTypes.ts` - `MergerContext` interface may need to be extended

## Priority

**Critical** - These bugs affect core game mechanics and violate official Acquire rules.
