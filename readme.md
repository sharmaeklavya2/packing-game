# Packing Game

This is a 2D geometric bin-packing game that can be played in the browser.
This game is currently a minimal prototype.

## How to play

Drag-and-drop rectangles from the left side (arena)
to the minimum number of bins on the right side.

## How to contribute

* Help with design decisions. See the issues labeled 'design'.
We want you to come up with precise descriptions of what the UI should look like
and how would the user interact with it.

* Try out the game and suggest improvements.
Open an issue for your suggestion after ensuring that
there isn't already an issue for it.

* Help in implementing stuff. See the issues for what needs to be done.
Before making a major change, preferably talk about the change to ensure
that you're implementing the right thing.

## Guidelines for adding a new feature

The game is written in a layered manner (see `script.js`),
and additions to code must adhere to this structure.

Consider the example of picking an item and placing it into a bin (already implemented).
First I wrote code to do this via the developer console:
```js
i = globalGame.items[0];
b = globalGame.bins[0];
i.attach(b, 0, 0);
```
This places item `i` at the top left corner of the first bin.
This allowed me to only focus on the packing logic and not worry about mouse events.
I could even test/debug my code before implementing event handlers.
Later when implementing the event handlers, I just call `attach` at the appropriate place.
