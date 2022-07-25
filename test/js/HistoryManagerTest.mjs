import assert from 'assert';
import {HistoryManager, History, HistoryVersionUpgrader, DUMMY_BETA_VERSION} from "../../HistoryManager.mjs";
import fs from "fs";
import structuredClone from "realistic-structured-clone";
import {DateTime} from "luxon";

const FACTION_ARK = "ark";
const FACTION_TET = "tet";

const SIMPLE_OWNER = "Granite";
const SIMPLE_SYSTEM_FLIP_TIME = "2022-03-24T10:00:00.000-04:00";
const GAME_START_TIME = "2022-02-01T1:00:00.000-04:00";

describe("HistoryManager", function() {

    // HistoryManager instance under test
    let man = undefined;

    // HistoryVersionUpgrader instance under test
    let histUp = undefined;

    const testRootDir = "test/snapshots/";

    // Does not exist on the filesystem
    const MISSING_INSTANCE = 11;

    // Contains the bare minimum to count as a history instance.
    const EMPTY_INSTANCE = 10;
    const EMPTY_INSTANCE_PATH = testRootDir + EMPTY_INSTANCE + "/history.json";
    const EMPTY_HISTORY = new History(EMPTY_INSTANCE);
    EMPTY_HISTORY.start = "2022-03-24T10:01:50.085-04:00";
    EMPTY_HISTORY.currentTimestamp = "2022-03-24T10:01:50.085-04:00";

    // Creates a simple starting history file with one system in one sector
    const SIMPLE_INSTANCE = 20;
    const SIMPLE_INSTANCE_PATH = testRootDir + SIMPLE_INSTANCE + "/history.json";
    const SIMPLE_SECTOR = {
        "id": 0,
        "name": "simple sector",
        "owner": null,
        "division": [{"faction": null, points: 1}],
    };
    const SIMPLE_SYSTEM = {
        "id": 1,
        "name": "system name",
        "owner": null,
        "sector_id": 0,
        "status": "uninhabited"
    };
    const SIMPLE_HISTORY = new History(
        SIMPLE_INSTANCE, {stellar_systems: [SIMPLE_SYSTEM], sectors: [SIMPLE_SECTOR]}
    );
    SIMPLE_HISTORY.start = "2022-03-24T10:01:50.085-04:00";
    SIMPLE_HISTORY.currentTimestamp = "2022-03-24T10:01:50.085-04:00";

    const EMPTY_BETA_HISTORY = {
        snapshots: [{}]
    }

    beforeEach(function() {

        fs.writeFileSync(EMPTY_INSTANCE_PATH, JSON.stringify(EMPTY_HISTORY), err => {
            if(err) {
                throw err;
            }
        });

        fs.writeFileSync(SIMPLE_INSTANCE_PATH, JSON.stringify(SIMPLE_HISTORY), err => {
            if(err) {
                throw err;
            }
        });

        man = new HistoryManager(testRootDir);
        histUp = new HistoryVersionUpgrader();
    });

    describe("#HistoryVersionUpgrader", function() {
        describe("versionTesting", function() {
            it("given empty detect no version", function() {
                let emptyJson = JSON.stringify({});
                assert(!histUp.isAlphaVersion(emptyJson));
                assert(!histUp.isBetaVersion(emptyJson));
                assert(!histUp.detectVersion(emptyJson));
            });

            it("given beta version detect beta", function() {
                let emptyBetaHistory = JSON.stringify(EMPTY_BETA_HISTORY);
                assert(!histUp.isAlphaVersion(emptyBetaHistory));
                assert(histUp.isBetaVersion(emptyBetaHistory));
                assert.equal(histUp.detectVersion(emptyBetaHistory), DUMMY_BETA_VERSION, "Should detect Beta");
            });

            it("detect version 1", function() {
                let simpleJson = JSON.stringify(SIMPLE_HISTORY);
                assert(!histUp.isAlphaVersion(simpleJson));
                assert(!histUp.isBetaVersion(simpleJson));
                assert.equal(histUp.detectVersion(simpleJson), 1, "Should detect version 1");
            });

            it("should return true for upgrade when given empty beta", function() {
                let emptyBetaHistory = JSON.stringify(EMPTY_BETA_HISTORY);
                assert(histUp.shouldUpgradeHistory(emptyBetaHistory));
            });

            it("should return true for upgrade when given simple beta", function() {
                let simpleBetaHistory = JSON.stringify(createSimpleBetaHistory());
                assert(histUp.shouldUpgradeHistory(simpleBetaHistory));
            });

            it("should return true for upgrade when given version 0.5", function() {
                let version05History = JSON.stringify({VERSION: 0.5});
                assert(histUp.shouldUpgradeHistory(version05History));
            });
        });

        describe("#upgradeHistoryFile", function() {
            it("should upgrade beta to version 1", function() {

                let historyData = JSON.stringify(createSimpleBetaHistory());
                let history = histUp.upgradeHistoryFile(historyData);

                assert(history, "Expected history to be an object");
                assert.equal(history.VERSION, 1, "Expected VERSION to be 1");

                assert.equal(history.snapshots.length, 1, "Expected a single snap");
                // assert.equal(history.undo.length, 1, "Expected a single undo snap");

                let snap = history.snapshots[0];
                assert(snap.system, "Expected to see a system object inside the snap");
                assert(snap.sector, "Expected to see a sector object inside the snap");
            });
        });
    });

    describe("HistoryManager", function() {

        describe("constructor", function() {
            const CONSTRUCT_TEST_DIR = "test/constuctor";

            beforeEach(function() {
                if(fs.existsSync(CONSTRUCT_TEST_DIR))
                    fs.rmdirSync(CONSTRUCT_TEST_DIR);
            });

            it("should create dir if not exist", async function() {
                let man = new HistoryManager(CONSTRUCT_TEST_DIR);

                // wait one second for the dir to get created
                await new Promise(r => setTimeout(r, 1000));
                assert(fs.existsSync(CONSTRUCT_TEST_DIR), "Expected the constructor to create the Dir");
            });
        });

        describe("#getHistory", function() {

            it("should load history from disk", function() {
                const history = man.getHistory(EMPTY_INSTANCE);
                assert.notEqual(history, null, "Should not be null or undefined.");
                assert.deepStrictEqual(history, EMPTY_HISTORY);
            });

            it("should return history that was loaded previously", function() {
                const history = man.getHistory(EMPTY_INSTANCE);
                assert.notEqual(history, null, "Should not be null or undefined.");
                assert.deepStrictEqual(history, EMPTY_HISTORY);

                const historyAgain = man.getHistory(EMPTY_INSTANCE);
                assert.notEqual(historyAgain, null, "Should not be null or undefined.");
                assert.deepStrictEqual(historyAgain, EMPTY_HISTORY);
            });

            it("should throw an exception if no history", function() {
                assert.throws(
                    () => man.getHistory(MISSING_INSTANCE),
                    /Failed to load history for 11. Cause: Could not find 'test\/snapshots\/11\/history.json'/
                );
            });

            it("testHistoryJsonConversionToObjectInstance", () => {
                let h = new History(123, {stellar_systems: [SIMPLE_SYSTEM], sectors: [SIMPLE_SECTOR]});
                fs.writeFileSync(testRootDir + 123 + "/history.json", JSON.stringify(h), err => {
                    if(err) {
                        throw err;
                    }
                });

                let data = readAndParse(testRootDir + 123 + "/history.json");
                let historyObj = Object.assign(new History, data);
                assert.equal(historyObj.getVersion(), 1, "Failed version match");
            });
        });

        describe("#applySystemUpdate", function() {
            it("should throw an exception if system not in current", function() {
                assert.throws(
                    () => man.applySystemUpdate(SIMPLE_SYSTEM, EMPTY_INSTANCE),
                    /Null system ID: 1 from instance 10/
                );
            });

            it("should update owner when it changes", function() {
                const newSys = structuredClone(SIMPLE_SYSTEM);
                newSys.owner = "new owner";

                const simpleHistory = createSimpleHistory();
                mockGetSector(man, simpleHistory);

                man.applySystemUpdate(newSys, SIMPLE_INSTANCE);
                const res = readAndParse(SIMPLE_INSTANCE_PATH);
                assertSnapshotLengths(res, 1, 1);

                assert.strictEqual(res.snapshots[0].system.owner, newSys.owner, "Owner should be new one");

                assert.strictEqual(res.undo[0].system.owner, SIMPLE_SYSTEM.owner, "Owner should be new " +
                    "previous");

                assert.strictEqual(res.current.stellar_systems[0].owner, newSys.owner,
                    "Current system state should reflect changes.");
                assert.strictEqual(res.base.stellar_systems[0].owner, null,
                    "Base system state should still be null.");
                assert.strictEqual(res.current.sectors[0].owner, FACTION_ARK,
                    "Current sector state should reflect changes.");
                assert.strictEqual(res.base.sectors[0].owner, null,
                    "Base sector state should still be null.");

                assert(res.snapshots[0].sector, "Expected a Sector object");
                assert(res.snapshots[0].sector.division, "Expected a Division object");
                assert(res.snapshots[0].sector.owner, "Expected an owner field");

                assert(res.snapshots[0].time, "Expected a time for when this update happened");
                const resTime = DateTime.fromISO(res.snapshots[0].time);
                assert(Math.abs(resTime.toMillis() - DateTime.now().toMillis()) < 100, "Expected " +
                    "update to be recent");

            });

            it("should not update with no changes", function() {
                man.applySystemUpdate(SIMPLE_SYSTEM, SIMPLE_INSTANCE);
                const res = readAndParse(SIMPLE_INSTANCE_PATH);
                assert.notEqual(res, null, "Should not be null.");
                assert.equal(res.snapshots.length, 0, "Should not have a snap record.");
                assert.equal(res.undo.length, 0, "Should not have an undo record.");

                assert.strictEqual(res.current.stellar_systems[0].owner, null,
                    "Current state should still be null for owner.");
                assert.strictEqual(res.base.stellar_systems[0].owner, null,
                    "Base state should still be null.");
            });

            it("should not write unneeded information", function() {
                const newSys = structuredClone(SIMPLE_SYSTEM);
                newSys.position = "not needed";
                newSys.score = "not needed";
                newSys.receivedAt = "not needed";
                newSys.owner = "new owner";

                mockGetSector(man, SIMPLE_HISTORY);

                man.applySystemUpdate(newSys, SIMPLE_INSTANCE);
                const res = readAndParse(SIMPLE_INSTANCE_PATH);
                assertSnapshotLengths(res, 1, 1);

                let snap = res.snapshots[0];
                let usnap = res.undo[0];

                assert.strictEqual(snap.system.owner, newSys.owner, "Owner should be new one");
                assert.strictEqual(usnap.system.owner, SIMPLE_SYSTEM.owner, "Owner should be new previous");

                assert.equal(res.current.stellar_systems[0].position, null, "Shouldn't have this.");
                assert.equal(res.current.stellar_systems[0].score, null, "Shouldn't have this.");
                assert.equal(res.current.stellar_systems[0].receivedAt, null, "Shouldn't have this.");
                assert.equal(snap.system.position, null, "Shouldn't have this.");
                assert.equal(snap.system.score, null, "Shouldn't have this.");
                assert.equal(snap.system.receivedAt, null, "Shouldn't have this.");
                assert.equal(usnap.position, null, "Shouldn't have this.");
                assert.equal(usnap.score, null, "Shouldn't have this.");
                assert.equal(usnap.receivedAt, null, "Shouldn't have this.");

                assert.strictEqual(res.current.stellar_systems[0].owner, newSys.owner,
                    "Current state should reflect changes.");
                assert.strictEqual(res.base.stellar_systems[0].owner, null,
                    "Base state should still be null.");
            });
        });
    });
});

/**
 * The `getSector` of HistoryManager normally calls the global `window` object to retrieve the current
 * actual state of the galaxy for the sector information. We need to mock it as the global `window`
 * wouldn't otherwise be available.
 */
function mockGetSector(man, source) {
    man.getSector = function(id) {
        return source.current.sectors[id];
    }
}

function assertSnapshotLengths(history, snapshotsLen, undoLen) {
    assert.notEqual(history, null, "History shouldn't be null.");
    assert.notEqual(history, {}, "History shouldn't be an empty object.");
    assert.equal(history.snapshots.length, snapshotsLen, "Should have a snap record.");
    assert.equal(history.undo.length, undoLen, "Should have an undo record.");
}

function readAndParse(file) {
    const res = fs.readFileSync(file, 'utf8');
    assert.notEqual(res, null, "File shouldn't be empty");
    return JSON.parse(res);
}

function createSimpleBetaHistory() {
    const sector = {
        "id": 0,
        "name": "sector",
        "owner": null,
        "division": [{"faction": null, points: 1}],
    };
    const system = {
        "id": 1,
        "name": "system name",
        "owner": null,
        "sector_id": 0,
        "status": "uninhabited"
    };

    const systemUpdate = {
        type: "system",
        owner: "Granite",
        faction: "ark",
        status: "inhabited",
        id: system.id,
        sector_id: sector.id,
        time: 1,
    }

    const sectorUpdate = {
        type: "sector",
        owner: "ark",
        id: sector.id,
        time: 1,
    }

    const undoSystem = {
        type: "system",
        owner: null,
        faction: null,
        status: "uninhabited",
        id: system.id,
        sector_id: sector.id,
        time: 1,
    }

    const undoSector = {
        type: "sector",
        owner: null,
        id: sector.id,
        time: 1,
    }

    const snapshots = [systemUpdate, sectorUpdate];
    const undo = [undoSystem, undoSector];

    return {
        galaxy: {stellar_systems: [system], sectors: [sector]},
        snapshots: snapshots,
        undo: undo,
        start: GAME_START_TIME,
        currentTimestamp: "2022-03-24T10:00:00.000-04:00"
    }
}

function createSimpleHistory() {

    const baseSector = {
        "id": 0,
        "name": "simple sector",
        "owner": null,
        "division": [{"faction": null, points: 1}],
    };
    const baseSystem = {
        "id": 1,
        "name": "system name",
        "owner": null,
        "sector_id": 0,
        "status": "uninhabited"
    };

    const sector = {
        "id": 0,
        "name": "simple sector",
        "owner": FACTION_ARK,
        "division": [{"faction": FACTION_ARK, points: 1}],
    };
    const system = {
        "id": 1,
        "name": "system name",
        "owner": SIMPLE_OWNER,
        "sector_id": 0,
        "status": "uninhabited"
    };

    const systemUpdate = {
        owner: SIMPLE_OWNER,
        faction: FACTION_ARK,
        status: "inhabited",
        id: system.id,
        sector_id: sector.id,
    }

    const sectorUpdate = {
        owner: FACTION_ARK,
        id: sector.id,
        division: [{"faction": FACTION_ARK, points: 1}],
    }

    const undoSystem = {
        owner: null,
        faction: null,
        status: "uninhabited",
        id: system.id,
        sector_id: sector.id,
    }

    const undoSector = {
        owner: null,
        id: sector.id,
        division: [{"faction": null, points: 1}],
    }

    const snapshots = [{time: SIMPLE_SYSTEM_FLIP_TIME, system: systemUpdate, sector: sectorUpdate}];
    const undo = [{time: SIMPLE_SYSTEM_FLIP_TIME, system: undoSystem, sector: undoSector}];

    return {
        galaxy: {stellar_systems: [baseSystem], sectors: [baseSector]},
        current: {stellar_systems: [system], sectors: [sector]},
        snapshots: snapshots,
        undo: undo,
        start: GAME_START_TIME,
        currentTimestamp: SIMPLE_SYSTEM_FLIP_TIME
    }
}