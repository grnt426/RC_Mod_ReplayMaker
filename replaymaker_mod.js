import HistoryManager from "./historymanager.js";
let fs = require("fs");
let clone = require("./clone");

class ReplayMaker {
    constructor() {
        this.historyManager = new HistoryManager();
        this.name = "Replay History";
    }

    gameLoaded() {

        window.granite.debug("Game load detected; checking for replay data.");

        // No point in creating a history if the game is already over.
        if(this.#gameEnded()) {
            window.granite.debug("Game ended, not bothering with history data.");
            return;
        }

        let instance = window.gamestate.game.auth.instance;
        let snapshot = this.#getGalaxy();
        if(!this.historyManager.hasHistory(instance)) {
            try {
                this.historyManager.processNewInstance(instance, snapshot);
            }
            catch(err) {
                window.granite.debug("Error in creating a new history instance: " + err, window.granite.levels.ERROR);
            }
        }

            // If the game was closed and then later re-opened to the same galaxy, we need to catch up to the current
        // state of the game
        else {
            window.granite.debug("Updating history to current state!", window.granite.levels.DEBUG);
            Object.values(snapshot.stellar_systems).forEach(s => {
                s.unknownTime = true;
                this.historyManager.applySystemUpdate(s, instance);
            });
            this.historyManager.applySectorsUpdate(snapshot.sectors, instance)
        }
    }

    update(data) {

        // No need to process incoming updates if game has ended.
        if(this.#gameEnded()) {
            window.granite.debug("Game ended, not bothering with history updates.");
            return;
        }

        if(data.global_galaxy_system || data.global_galaxy_sector) {
            window.granite.debug("Applying system/sector update.");
            let instance = window.gamestate.game.auth.instance;

            // it is safer to use deep-copies of the updates, as HistoryManager may make edits to the objects.
            if(data.global_galaxy_system) {
                this.historyManager.applySystemUpdate(clone(data.global_galaxy_system), instance);
            }
            else if(data.global_galaxy_sector) {
                this.historyManager.applySectorsUpdate(clone(data.global_galaxy_sector), instance);
            }
        }
    }

    #gameEnded() {
        return window.gamestate.game.victory.winner;
    }

    /**
     * Returns the current state of the galaxy as a COPY of the original. This allows for edits to be safely made.
     * @returns a large JSON object representing the galaxy.
     */
    #getGalaxy() {
        return clone(window.gamestate.game.galaxy);
    }
}

window.granite.addHookListener(new ReplayMaker());