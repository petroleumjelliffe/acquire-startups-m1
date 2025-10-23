# Acquire - Startups Edition

Based on the Avalon Hill game, [Acquire](https://eu.nobleknight.com/P/2147380348/Acquire-1976-Edition), this version pokes a little fun at the world of Startups.

# Objective
Form Startups, collect stock options, and earn money from acquiring smaller startups or being acquired.


# Features
* Online: play against against 1 to 5 others, all on their own devices
* Pass & Play: play on one device, and take turns
* Auto-save: each game has it's own unique link, and progress is saved automatically, in case someone loses their wifi or has to leave.
* Easy resume: simply visit the same link and pick up from where you were

# Rules
Largely the same as the board game
* Each player takes turns placing tiles on the board.
  * Place 2 tiles adacjent to each other to found a startup. 
  * Expand existing startups.
  * Trigger a merger by connecting 2 startups
  * Once a startup reaches 11 tiles, it's too big to fail, and can't me merged with another startup
* Buy up to 3 stock options after placing a tile
  * Stock prices go up as the Startup grows
* Mergers - the larger startup acquires the smaller one (Player chooses in case of a tie)
  * Cash bonuses are awarded to the majority and minority stock holders
  * Each player can choose to sell, keep or swap their defunct stock for the acruiring Startup.
* Game ends when no more tiles can be played, because there are no spaces left that won'tconnect 2 unmergable Startups

# Play Now
[Start New Game](https://petroleumjelliffe.github.io/acquire-startups-m1/)

# How it was built
* This was largely vibe coded with Claude.ai, in React Typescript
* Server is hosted on Render.com
* Play tested it locally on multiple browsers, and Online with family over Facetime.
* Took steps to make the Pass & Play version try to respect the "hidden hand tiles" but obviously that's where the Online mode is a better fit
