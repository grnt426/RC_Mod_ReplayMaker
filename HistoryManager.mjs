import fs from "fs";
import {DateTime} from "luxon";
import clone from "./clone.js";

export default class HistoryManager {

    #loadedGalaxies = {};
    #rootDir = "./";
    #fatal = false;

    constructor(rootDir = "./dist/main/replays/") {
        this.#rootDir = rootDir;

        if(!fs.existsSync(this.#rootDir)) {
            fs.mkdir(this.#rootDir, err => {
                if(err) {
                    this.#fatal = true;
                    window.granite.debug("Failed to create replay dir: " + err);
                }
            });
        }
    }

    hasHistory(instance) {
        try {
            let history = this.#loadedGalaxies[instance];
            if(history)
                return true;

            const file = this.#getFilePathForHistory(instance);
            return fs.existsSync(file);
        }
        catch (err) {
            throw "Failed to check if history exists for " + instance + ". Cause: " + err;
        }
    }

    getHistory(instance) {
        try {
            let history = this.#loadedGalaxies[instance];
            if(!history) {
                const file = this.#getFilePathForHistory(instance);

                if(!fs.existsSync(file)) {
                    throw "Could not find '" + file + "'";
                }

                history = JSON.parse(fs.readFileSync(file, 'utf8'));
                this.#loadedGalaxies[instance] = history;
            }

            return history;
        }
        catch (err) {
            throw "Failed to load history for " + instance + ". Cause: " + err;
        }
    }

    /**
     * Given a galaxy data dump from the game, will create a new history file with no snapshot/undo entries.
     *
     * @param payload   Full galactic data dump from the game.
     */
    processNewInstance(instance, galaxy) {
        window.granite.debug("Processing new instance: " + instance);

        if(this.#fatal) {
            window.granite.debug("FATAL'd, doing nothing...");
            return;
        }

        if(this.hasHistory(instance)) {
            window.granite.debug("History file already exists for instance " + instance);
        }

        const file = this.#getFilePathForHistory(instance);
        const historyData = {
            start:DateTime.now().toISO(), base:galaxy,
            current:clone(galaxy), snapshots: [], undo: [], instance:instance,
            currentTime:DateTime.now().toISO()
        }
        this.#loadedGalaxies[instance] = historyData;

        fs.mkdir(this.#rootDir + instance, err => {
            if(err) {
                this.#fatal = true;
                window.granite.debug("Failed to create replay dir for " + isntance + ": " + err, window.granite.levels.ERROR);
            }
            else {
                fs.writeFile(file, JSON.stringify(historyData), err => {
                    if (err) {
                        window.granite.debug("Error in saving initial galaxy: " + err, window.granite.levels.ERROR);
                    }
                    else {
                        window.granite.debug("Saved initial galaxy state successfully.", window.granite.levels.DEBUG);
                    }
                });
            }
        });
    }

    /**
     * Given a system, will check for differences and apply as needed.
     *
     * @param sys   The System to check against.
     * @param instance  The galaxy to check against.
     */
    applySystemUpdate(sys, instance) {

        if(this.#fatal) {
            return;
        }

        const history = this.getHistory(instance);
        sys.type = "system";
        const curState = history.current;
        const storedSys = this.#getById(curState.stellar_systems, sys.id);
        const storedSec = this.#getById(curState.sectors, sys.sector_id);

        if(storedSys == null) {
            throw "Null system ID: " + sys.id + " from instance " + instance;
        }
        else if(storedSec == null) {
            throw "Null sector ID: " + sys.sector_id + " from instance " + instance;
        }

        if(storedSys.owner !== sys.owner || storedSys.status !== sys.status) {

            // Create a snapshot that allows us to undo this step
            const u = clone(storedSys);
            delete u.position;
            delete u.score;
            delete u.receivedAt;
            u.time = history.currentTime;
            u.type = "system";

            // Clean up the current snapshot
            sys.time = DateTime.now().toISO();
            delete sys.position;
            delete sys.score;
            delete sys.receivedAt;

            // Update the stored current state of the galaxy
            storedSys.owner = sys.owner;
            storedSys.faction = sys.faction;
            storedSys.status = sys.status;
            history.currentTime = sys.time;

            // now handle the previous sector state for undo history
            const sec = clone(storedSec);
            delete sec.adjacent;
            delete sec.centroid;
            delete sec.points; // these are the vertices of a sector's perimeter

            const curSector = this.getSector(sec.id);
            storedSec.owner = curSector.owner;
            storedSec.division = curSector.division;

            /**
             * We bundle the system and sector updates into one update record for simplicity.
             * Before, we had them separated, but this doesn't make sense as taking or losing a system always
             * updates the sector's balance of control. It might also sometimes change its
             * owner. More importantly, having them separate means the replay viewer needs to understand when
             * these transitions happen; this unnecessarily pushes game logic into the viewer.
             *
             * Note: This means the replay format has changed. Older formats can still be forwards-compatible.
             */
            const record = {system:sys, sector:clone(storedSec)};
            const undoR = {system:u, sector:sec};

            // Build the forwards/backwards snapshots
            history.undo.push(undoR);
            history.snapshots.push(record);

            this.saveHistoryToDisk(history);
        }
    }

    getSector(sector_id) {
        return window.gamestate.game.galaxy.sectors[sector_id];
    }

    /**
     * Should NOT need to call this function manually.
     *
     * Synchronous write to disk.
     * @param history   The history JSON to write to disk.
     */
    saveHistoryToDisk(history) {
        fs.writeFileSync(this.#getFilePathForHistory(history.instance), JSON.stringify(history), err => {
            if(err) {
                window.granite.debug("[CRITICAL] FAILED TO SAVE HISTORY instance '" + history.instance + "': " + err, window.granite.levels.ERROR);
            }
        });
    }

    #getFilePathForHistory(instance) {
        return this.#rootDir + instance + "/history.json";
    }

    #getById(list, id) {
        let res = null;
        list.forEach(e => {
            if(e.id === id)
                res = e;
        });

        return res;
    }
}