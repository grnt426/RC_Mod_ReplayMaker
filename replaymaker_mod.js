import HistoryManager from "./historymanager.js";
let fs = require("fs");

class ReplayMaker {
    constructor() {
        this.historyManager = new HistoryManager();
        this.name = "Replay History";
    }

    gameLoaded() {
        let instance = window.gamestate.game.auth.instance;
        if(!this.historyManager.hasHistory(instance)) {
            try {
                this.historyManager.processNewInstance(instance, window.gamestate.game.galaxy);
            }
            catch(err) {
                window.granite.debug("Error in creating a new history instance: " + err, window.granite.levels.ERROR);
            }
        }
    }

    update(data) {
        if(data.global_galaxy_system || data.global_galaxy_sector) {
            window.granite.debug("Found a system/sector update. Applying...");
            let instance = window.gamestate.game.auth.instance;
            if(data.global_galaxy_system) {
                this.historyManager.applySystemUpdate(data.global_galaxy_system, instance);
            }
            else if(data.global_galaxy_sector) {
                this.historyManager.applySectorsUpdate(data.global_galaxy_sector, instance);
            }
        }
    }
}

window.granite.addHookListener(new ReplayMaker());