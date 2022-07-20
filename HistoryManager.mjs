import fs from "fs";
import {DateTime} from "luxon";
import clone from "./clone.js";

export const LATEST_HISTORY_VESRION = 1;
export const DUMMY_ALPHA_VERSION = -2;
export const DUMMY_BETA_VERSION = -1;

export class HistoryManager {

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

                history = Object.assign(new History, JSON.parse(fs.readFileSync(file, 'utf8')));
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
        let history = new History(instance, galaxy);
        const historyData = {
            start:DateTime.now().toISO(), base:clone(galaxy),
            current:clone(galaxy), snapshots: [], undo: [], instance:instance,
            currentTime:DateTime.now().toISO()
        }
        this.#loadedGalaxies[instance] = history;

        fs.mkdir(this.#rootDir + instance, err => {
            if(err) {
                this.#fatal = true;
                window.granite.debug("Failed to create replay dir for " + isntance + ": " + err, window.granite.levels.ERROR);
            }
            else {
                fs.writeFile(file, JSON.stringify(history), err => {
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

export class History {

    // Changes to the field members of this class should always mean an update to this version number
    VERSION = null;

    // What real world time did this History object first start recording?
    start = "";

    // To avoid duplication, this is the base data that will never change within a game, such as coordinates,
    // names, sector boundaries, etc.
    base = {};

    // The current state of the galaxy, depending on where in the snapshot/undo history we are.
    current = {};

    // Snapshots of changes to apply to the `current` galactic state that are forwards in time.
    snapshots = [];

    // Snapshots of changes to apply to the `current` galactic state that are backwards in time.
    undo = [];

    // Unique, incrementally increasing integer ID of the game.
    instance = -1;

    // What point in real world time is the `current` galactic state.
    currentTimestamp = null;

    // Slow = Legacy, Fast = Flash.
    gameType = "slow";

    constructor(instance, galaxy = null) {

        // If galaxy isn't null, then we need to construct a new history object.
        if(galaxy !== null) {
            this.start = DateTime.now().toISO();
            this.base = clone(galaxy);
            this.current = clone(galaxy);
            this.snapshots = [];
            this.undo = [];
            this.instance = instance;
            this.currentTimestamp = DateTime.now().toISO();
        }

        this.VERSION = LATEST_HISTORY_VESRION;
    }

    getVersion() {
        return this.VERSION;
    }
}

export class HistoryVersionUpgrader {

    shouldUpgradeHistory(h) {
        let hist = this.#convertHistoryToObj(h);
        return !hist.VERSION || hist.VERSION !== LATEST_HISTORY_VESRION;
    }

    isAlphaVersion(h) {
        let hist = this.#convertHistoryToObj(h);
        return false;
    }

    isBetaVersion(h) {
        try {
            let hist = this.#convertHistoryToObj(h);

            // Beta versions don't have the system and sector updates combined into a single snapshot record.
            // Thus, if we detect the absence of the `system` property, we know they aren't bundled together
            // and this must be an old version.
            return !hist.VERSION && hist.snapshots && hist.snapshots.length > 0 && !hist.snapshots[0].system;
        }
        catch(err) {
            return false;
        }
    }

    detectVersion(h) {
        try {
            let hist = this.#convertHistoryToObj(h);
            if(this.isAlphaVersion(hist)) {
                return DUMMY_ALPHA_VERSION;
            } else if(this.isBetaVersion(hist)) {
                return DUMMY_BETA_VERSION;
            }

            try {
                return hist.VERSION;
            } catch(err) {
                return false;
            }
        }
        catch(err) {
            return false;
        }
    }

    upgradeHistoryFile(json) {

        let historyObj = JSON.parse(json);

        let detectedVersion = this.detectVersion(historyObj);

        // Creating direct version upgrades over time can be cumbersome, so instead we allow for incremental
        // upgrades over time, as upgrading from A -> B is easy to understand, but A -> D means retroactively
        // understanding how to upgrade from A -> D, when we already have code to upgrade from A -> B, B-> C, and then
        // C -> D
        while(detectedVersion !== LATEST_HISTORY_VESRION) {
            switch(detectedVersion) {
                case DUMMY_ALPHA_VERSION: this.upgradeAlpha(historyObj); break;
                case DUMMY_BETA_VERSION: this.upgradeBeta(historyObj); break;
                default: throw "Unable to upgrade history file: unknown version: " + detectedVersion;
            }

            detectedVersion = this.detectVersion(historyObj);
        }
    }

    upgradeAlpha(json) {

    }

    upgradeBeta(json) {

    }

    /**
     * This does NOT convert the given data into a `History` class instance, it just converts it into
     * a JSON object so its fields can be queried.
     *
     * If given a JSON object, will return the same object.
     *
     * @param hist  Entity to convert into a JSON object if not already
     */
    #convertHistoryToObj(hist) {
        if(typeof hist === "object")
            return hist;
        return JSON.parse(hist);
    }
}