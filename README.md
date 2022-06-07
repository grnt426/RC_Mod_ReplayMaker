# Replay Maker
Make your own replays of the game and view them locally!

## Dependencies
For simplicity, these dependencies are downloaded and embedded as part of this project so NPM isn't needed
for all users.

* Clone - https://github.com/pvorb/clone
* Luxon - https://moment.github.io/luxon/#/

## Install
1) Copy and replace the `package.json` file into the `Rising Constellation` directory.
2) Dump `historymanager.js` and `clone.js` into `Rising Constellation/dist/main` directory.
3) Create a directory named `replays` inside the `Rising Constellation/dist/main` directory.
4) Copy the `viewer/` directory into the `Rising Constellation/dist/main/replays` directory created in the previous step

That's it!

## Usage
After creating a replay, open up the `index.html` file. It will automatically show you the latest replay!