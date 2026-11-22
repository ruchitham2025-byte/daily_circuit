# Daily Circuit Rules

## Voltage and routing

- The source starts at 5V.
- A signal can move between orthogonally adjacent cells only when both tiles have matching arms facing each other.
- Entering an ordinary tile or receiver reduces voltage by 1V. A signal at 1V can therefore enter the next cell at 0V, but a 0V cell does not propagate further.
- When multiple routes reach a cell, the game keeps the highest voltage received there.
- A receiver is met when its received voltage is greater than or equal to its displayed required voltage. A circuit is complete only when every receiver is met and no hazard is powered.

## Tile arms

Rotations advance clockwise in 90-degree steps. Directions are numbered north (0), east (1), south (2), and west (3).

- **Conduit (type 1):** straight, arms north and south at rotation 0. Each rotation turns both arms clockwise.
- **Vector (type 2):** elbow, arms north and east at rotation 0. Each rotation turns both arms clockwise.
- **Splitter (type 3):** tee, arms north, east, and south at rotation 0. Each rotation turns all three arms clockwise.
- **Cross (type 4):** arms in all four directions; rotation does not change its connections. It is used by fixed circuit nodes.
- **Empty tile (type 0):** no arms.
- The source, receivers, boosters, and hazards connect on all four sides. Walls have no connections.

## Receivers, boosters, and hazards

- A receiver displays its minimum voltage requirement. It counts as met when the voltage reaching it is at least that value.
- A signal entering a booster resets to 5V, regardless of its incoming voltage. The booster then propagates that refreshed voltage through its connected arms.
- A hazard is powered if a live signal reaches it through matching arms from a cell whose voltage is above 0V. Powering any hazard shorts the circuit, so the puzzle cannot be completed.

## Cost

- Empty user-placed cells cost nothing.
- A placed conduit costs $10, a vector costs $15, and a splitter costs $25.
- An unrecognized non-empty user component type uses the current $10 fallback cost.
- The total cost is the sum of placed component costs plus any explicit additional cost supplied to the evaluator (for example, hint fees).
